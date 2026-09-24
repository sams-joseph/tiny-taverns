import { act, cleanup, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAt } from "../test/renderRoute";
import { HostedSessionScope } from "./AuthProvider";
import { NO_HOSTED_SESSION, type HostedSession } from "./hostedSession";

/**
 * Signing out returns you to the marketing page, and signing in gives the app
 * back, with no reload in either direction.
 *
 * These render `HostedSessionScope` — the real composition `AuthProvider`
 * mounts inside `ClerkProvider` — with a `HostedSession` of the test's own, so
 * what is under test is the app's wiring rather than one assembled here. What
 * no test in jsdom can reach is Clerk's own `useAuth()`; the authenticated
 * Playwright suite (`e2e/auth/`) signs in through it for real.
 */

const session = (over: Partial<HostedSession>): HostedSession => ({
  ...NO_HOSTED_SESSION,
  ...over,
});

/**
 * A scope whose session a test can change, which is the only way a *transition*
 * can be expressed at all.
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

const at = (path: string, initial: HostedSession) =>
  renderAt(path, (tree) => <Vendor initial={initial}>{tree}</Vendor>, "none");

const marketing = () => screen.queryByRole("heading", { name: /Run the fight/ });
const appNav = () => screen.queryByRole("navigation", { name: "Sections" });

afterEach(cleanup);

describe("signing out", () => {
  it("lands on the marketing page", async () => {
    await at("/campaigns", session({ configured: true, signedIn: true }));

    expect(appNav()).toBeInTheDocument();
    expect(marketing()).toBeNull();

    await press("sign out");

    expect(marketing()).toBeInTheDocument();
    expect(appNav()).toBeNull();
  });

  it("lands there after the reload the vendor's sign-out makes", async () => {
    // Clerk navigates to its after-sign-out URL, a bare `/`, and the fresh app
    // waits for the vendor to answer before it draws either page.
    await at("/", session({ configured: true, loading: true }));
    expect(marketing()).toBeNull();
    expect(appNav()).toBeNull();

    await press("sign out");

    expect(marketing()).toBeInTheDocument();
    expect(appNav()).toBeNull();
  });

  it("gives the app back on signing in again", async () => {
    await at("/campaigns", session({ configured: true, signedIn: true }));
    await press("sign out");
    expect(marketing()).toBeInTheDocument();

    await press("sign in");

    expect(appNav()).toBeInTheDocument();
  });
});
