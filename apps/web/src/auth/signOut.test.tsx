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
  readonly children: ReactNode;
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
      {children}
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
 * **The regression that would hurt most, and the reason the fix is keyed on a
 * transition rather than on `signedIn` being false.**
 *
 * A configured provider reports "not signed in" while it is still deciding. A
 * clear written against that steady state would run on every page load, before
 * the vendor answered, and destroy the token of every developer who reloaded —
 * including those who never signed out at all. It would have passed a hand
 * test, because by the time you looked the vendor had answered.
 */
describe("an ordinary page load", () => {
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
