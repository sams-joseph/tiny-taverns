import { act, cleanup, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAt } from "../test/renderRoute";
import { installMemoryStorage } from "../test/storage";
import { HostedSessionScope } from "./AuthProvider";
import { readMachineToken, useCredentialPresence, writeMachineToken } from "./credential";
import { NO_HOSTED_SESSION, type HostedSession } from "./hostedSession";

/**
 * The reported defect, as a test: **signing out did not return you to the
 * marketing page.**
 *
 * The cause was measured in a real browser before it was fixed, and the three
 * facts are worth keeping apart because collapsing them is how this comes back:
 *
 *  - **the trigger** — signing out of the hosted provider;
 *  - **the masking condition** — a machine token left in `localStorage`, which
 *    `useCredentialPresence` consults first and which nothing removed;
 *  - **the symptom** — the app stays on screen where the homepage was asked for.
 *
 * A private window never had the token, which is why it was the only path that
 * ever worked and why the fault looked like a hosted-session bug.
 *
 * These render `HostedSessionScope` — the real composition `AuthProvider`
 * mounts inside `ClerkProvider` — with a `HostedSession` of the test's own, so
 * what is under test is the app's wiring rather than one assembled here. What
 * no test in jsdom can reach is Clerk's own `useAuth()`, which is exactly why
 * the bridge around this scope is three lines and holds no rules.
 */

const TOKEN = "a-machine-token";

const session = (over: Partial<HostedSession>): HostedSession => ({
  ...NO_HOSTED_SESSION,
  ...over,
});

/** Reports what the gate would decide, without rendering a whole route. */
function Presence(): ReactNode {
  return <span data-testid="presence">{useCredentialPresence()}</span>;
}

const presence = () => screen.getByTestId("presence").textContent;

/**
 * A scope whose session a test can change, which is the only way a *transition*
 * — the thing the fix is keyed on — can be expressed at all. A steady state
 * proves nothing here: the whole hazard is that "signed out" and "has not
 * answered yet" look identical if you only ever look once.
 */
function Vendor({
  initial,
  children,
}: {
  readonly initial: HostedSession;
  readonly children?: ReactNode;
}): ReactNode {
  const [value, setValue] = useState(initial);
  return (
    <HostedSessionScope session={value}>
      <button type="button" onClick={() => setValue(session({ configured: true }))}>
        sign out
      </button>
      <button type="button" onClick={() => setValue(session({ configured: true, signedIn: true }))}>
        sign in
      </button>
      {children ?? <Presence />}
    </HostedSessionScope>
  );
}

const press = async (name: string): Promise<void> => {
  await act(async () => {
    screen.getByRole("button", { name }).click();
  });
};

const signOut = () => press("sign out");
const signIn = () => press("sign in");

/**
 * The app being built again — a reload, which is what a hosted sign-out
 * actually does on its way to the vendor's after-sign-out URL, and the move the
 * first fix could not survive.
 *
 * `cleanup()` then a fresh `render` is as close as jsdom gets: React state and
 * every ref are gone, and only what was written to storage is carried over.
 * That is exactly the line the fix has to sit on the durable side of.
 */
const reload = (initial: HostedSession): void => {
  cleanup();
  render(<Vendor initial={initial} />);
};

/**
 * Everything in storage other than the token itself — which is how the marker
 * being *spent* rather than left behind is asserted without this file having to
 * know what it is called.
 */
const leftovers = (): readonly string[] => {
  const store = window.localStorage;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const found = store.key(i);
    if (found !== null && found !== "taverns.token") keys.push(found);
  }
  return keys;
};

installMemoryStorage();

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

describe("signing out", () => {
  it("forgets the pasted machine token, so the credential really is gone", async () => {
    writeMachineToken(TOKEN);
    render(
      <Vendor initial={session({ configured: true, signedIn: true })}>
        <Presence />
      </Vendor>,
    );
    expect(presence()).toBe("present");

    await signOut();

    expect(readMachineToken()).toBe("");
    expect(presence()).toBe("absent");
  });

  it("leaves nothing behind under the key, rather than an empty string", async () => {
    writeMachineToken(TOKEN);
    render(
      <Vendor initial={session({ configured: true, signedIn: true })}>
        <Presence />
      </Vendor>,
    );

    await signOut();

    expect(window.localStorage.getItem("taverns.token")).toBeNull();
  });

  it("forgets a token pasted while signed in, not only one that predates the session", async () => {
    render(
      <Vendor initial={session({ configured: true, signedIn: true })}>
        <Presence />
      </Vendor>,
    );
    await act(async () => {
      writeMachineToken(TOKEN);
    });
    expect(presence()).toBe("present");

    await signOut();

    expect(readMachineToken()).toBe("");
  });

  it("is repeatable: signing in again is a session that can end again", async () => {
    writeMachineToken(TOKEN);
    render(
      <Vendor initial={session({ configured: true, signedIn: true })}>
        <Presence />
      </Vendor>,
    );

    await signOut();
    expect(presence()).toBe("absent");

    await signIn();
    await act(async () => {
      writeMachineToken(TOKEN);
    });
    await signOut();

    expect(readMachineToken()).toBe("");
  });
});

/**
 * **Property 1, and the regression this whole round exists for: the clear has
 * to survive the app being built again.**
 *
 * The first fix armed a `useRef` that started `false` on every mount. A hosted
 * sign-out navigates to the vendor's after-sign-out URL, so the page reloads
 * and the fresh instance never watches anybody sign in — the transition it was
 * waiting for cannot happen, and the token was never cleared. What the captain
 * saw was a bare `http://localhost:5173/` showing the app and *"No credential
 * yet"*, with `taverns.token` still in storage and reloading no help.
 *
 * Every test here fails against that fix and passes against this one, which is
 * the only thing that says the arming is genuinely durable rather than a ref
 * that happens to survive a particular test's `act`.
 */
describe("a sign-out that reloads the app", () => {
  it("still forgets the token, though the fresh instance watched nobody sign in", async () => {
    writeMachineToken(TOKEN);
    render(<Vendor initial={session({ configured: true, signedIn: true })} />);

    // The vendor takes the browser to `/`, and the app is built again.
    reload(session({ configured: true, loading: true }));
    await signOut();

    expect(readMachineToken()).toBe("");
    expect(presence()).toBe("absent");
  });

  it("forgets it even when the reload lands already settled on signed-out", () => {
    writeMachineToken(TOKEN);
    render(<Vendor initial={session({ configured: true, signedIn: true })} />);

    // A warm cache: the vendor answers before the first paint, so there is no
    // transition to watch even in principle — only the durable marker.
    reload(session({ configured: true }));

    expect(readMachineToken()).toBe("");
    expect(presence()).toBe("absent");
  });

  it("survives more than one reload between the session and the sign-out", async () => {
    writeMachineToken(TOKEN);
    render(<Vendor initial={session({ configured: true, signedIn: true })} />);

    // Reading, reloading, still signed in — the arming must not be a one-shot.
    reload(session({ configured: true, signedIn: true }));
    reload(session({ configured: true, loading: true }));
    await signIn();
    expect(readMachineToken()).toBe(TOKEN);

    reload(session({ configured: true, loading: true }));
    await signOut();

    expect(readMachineToken()).toBe("");
  });
});

/**
 * **Property 4, and the mirror of the bug above: the marker is spent, not left
 * behind.**
 *
 * Durable state is what buys property 1, and this is its cost. A marker that
 * outlived the sign-out it armed would eat the *next* token pasted, on the next
 * reload, for ever — the same defect wearing the other face. Disarming is part
 * of the same act as the clear for exactly this reason.
 */
describe("a token pasted after signing out", () => {
  it("survives the reloads that follow it", async () => {
    writeMachineToken(TOKEN);
    render(<Vendor initial={session({ configured: true, signedIn: true })} />);
    reload(session({ configured: true, loading: true }));
    await signOut();
    expect(readMachineToken()).toBe("");

    // The developer pastes theirs again, as the captain accepted they would.
    await act(async () => {
      writeMachineToken(TOKEN);
    });

    reload(session({ configured: true, loading: true }));
    await signOut();
    expect(readMachineToken()).toBe(TOKEN);

    reload(session({ configured: true }));
    expect(readMachineToken()).toBe(TOKEN);
    expect(presence()).toBe("present");
  });

  it("leaves nothing in storage for a later load to spend", async () => {
    writeMachineToken(TOKEN);
    render(<Vendor initial={session({ configured: true, signedIn: true })} />);
    expect(leftovers()).not.toEqual([]);

    reload(session({ configured: true, loading: true }));
    await signOut();

    expect(leftovers()).toEqual([]);
  });

  it("is armed again by signing in again, so the next sign-out still works", async () => {
    render(<Vendor initial={session({ configured: true, signedIn: true })} />);
    reload(session({ configured: true, loading: true }));
    await signOut();

    await act(async () => {
      writeMachineToken(TOKEN);
    });
    await signIn();

    reload(session({ configured: true, loading: true }));
    await signOut();

    expect(readMachineToken()).toBe("");
  });
});

/**
 * **Property 2, and the regression that would hurt most: nothing may fire on an
 * ordinary page load.**
 *
 * A configured provider reports "not signed in" while it is still deciding. A
 * clear written against that steady state would run on every page load, before
 * the vendor answered, and destroy the token of every developer who reloaded —
 * including those who never signed out at all. It would have passed a hand
 * test, because by the time you looked the vendor had answered.
 *
 * Durable arming does not relax that, and the last two here are the ones that
 * say so: they run with the marker **armed**, which is the state the first fix
 * could never be in on a fresh load and the state this hazard now lives in.
 */
describe("an ordinary page load", () => {
  it("keeps a stored token while a provider that has been signed in is deciding", async () => {
    writeMachineToken(TOKEN);
    render(<Vendor initial={session({ configured: true, signedIn: true })} />);

    reload(session({ configured: true, loading: true }));
    await act(async () => {});

    expect(readMachineToken()).toBe(TOKEN);
    expect(presence()).toBe("present");
  });

  it("keeps it when that provider settles on the session still being live", async () => {
    writeMachineToken(TOKEN);
    render(<Vendor initial={session({ configured: true, signedIn: true })} />);

    // The everyday reload of somebody who is signed in and stays signed in.
    reload(session({ configured: true, loading: true }));
    await signIn();

    expect(readMachineToken()).toBe(TOKEN);
    expect(presence()).toBe("present");
  });

  it("keeps a stored token while a configured provider is still deciding", () => {
    writeMachineToken(TOKEN);
    render(
      <Vendor initial={session({ configured: true, loading: true })}>
        <Presence />
      </Vendor>,
    );

    expect(readMachineToken()).toBe(TOKEN);
    expect(presence()).toBe("present");
  });

  it("keeps it once that provider settles on nobody being signed in", async () => {
    writeMachineToken(TOKEN);
    render(
      <Vendor initial={session({ configured: true, loading: true })}>
        <Presence />
      </Vendor>,
    );

    // The load resolving is not a sign-out: there was no session to leave.
    await signOut();

    expect(readMachineToken()).toBe(TOKEN);
    expect(presence()).toBe("present");
  });

  it("keeps it for a visitor who is signed in, which is the common case", () => {
    writeMachineToken(TOKEN);
    render(
      <Vendor initial={session({ configured: true, signedIn: true })}>
        <Presence />
      </Vendor>,
    );

    expect(readMachineToken()).toBe(TOKEN);
  });

  it("keeps it with no hosted sign-in configured at all", async () => {
    writeMachineToken(TOKEN);
    render(
      <Vendor initial={NO_HOSTED_SESSION}>
        <Presence />
      </Vendor>,
    );
    expect(presence()).toBe("present");

    // The unconfigured session reports `signedIn: false` for ever, so the state
    // a naive fix would clear on is the *only* state this build is ever in.
    // Nothing may happen here, whatever the app does around it.
    await signOut();

    expect(readMachineToken()).toBe(TOKEN);
    expect(presence()).toBe("present");
  });
});

/**
 * **Property 3: a build with no publishable key is untouched.**
 *
 * That is most development — hosted sign-in is opt-in here exactly as it is on
 * the server — so it is the case that must not regress, and it is stronger than
 * "nothing bad happens": the hook reaches storage at all only once `configured`
 * is true, so an unconfigured build neither arms the marker nor spends one.
 *
 * The second test is the one durable state made necessary. A marker can outlive
 * the key that wrote it — somebody comments theirs out for an afternoon — and a
 * clear that consulted it anyway would take the token of a developer whose app
 * has no vendor in it at all.
 */
describe("with no hosted sign-in configured", () => {
  it("writes nothing to storage, however long it runs", async () => {
    writeMachineToken(TOKEN);
    render(<Vendor initial={NO_HOSTED_SESSION} />);
    await act(async () => {});

    expect(leftovers()).toEqual([]);
  });

  it("spends no marker left behind by a build that had a key", async () => {
    writeMachineToken(TOKEN);
    render(<Vendor initial={session({ configured: true, signedIn: true })} />);
    expect(leftovers()).not.toEqual([]);

    // The key comes out of `apps/web/.env.local`, and the app is built again.
    reload(NO_HOSTED_SESSION);
    await act(async () => {});

    expect(readMachineToken()).toBe(TOKEN);
    expect(presence()).toBe("present");
  });
});

/**
 * The captain's path, through the real route tree: the app on screen, a
 * sign-out, then the homepage — with the token that used to mask it present
 * throughout the first half.
 */
describe("the captain's path", () => {
  const marketing = () => screen.queryByRole("heading", { name: /Run the fight/ });
  const appNav = () => screen.queryByRole("navigation", { name: "Sections" });

  it("lands on the marketing page after signing out", async () => {
    writeMachineToken(TOKEN);
    await renderAt(
      "/campaigns",
      (tree) => <Vendor initial={session({ configured: true, signedIn: true })}>{tree}</Vendor>,
      "none",
    );

    expect(appNav()).toBeInTheDocument();
    expect(marketing()).toBeNull();

    await signOut();

    expect(marketing()).toBeInTheDocument();
    expect(appNav()).toBeNull();
  });

  it("lands there after the sign-out that reloads, which is the reported one", async () => {
    writeMachineToken(TOKEN);
    await renderAt(
      "/campaigns",
      (tree) => <Vendor initial={session({ configured: true, signedIn: true })}>{tree}</Vendor>,
      "none",
    );
    expect(appNav()).toBeInTheDocument();

    // Clerk navigates to its after-sign-out URL — a bare `/`, which is the
    // address the captain reported the app still showing at.
    cleanup();
    await renderAt(
      "/",
      (tree) => <Vendor initial={session({ configured: true, loading: true })}>{tree}</Vendor>,
      "none",
    );
    await signOut();

    expect(marketing()).toBeInTheDocument();
    expect(appNav()).toBeNull();
    expect(readMachineToken()).toBe("");
  });

  it("gives the app back when a token is pasted again, with no reload", async () => {
    await renderAt(
      "/campaigns",
      (tree) => <Vendor initial={session({ configured: true, signedIn: true })}>{tree}</Vendor>,
      "none",
    );
    await signOut();
    expect(marketing()).toBeInTheDocument();

    await act(async () => {
      writeMachineToken(TOKEN);
    });

    expect(appNav()).toBeInTheDocument();
  });
});
