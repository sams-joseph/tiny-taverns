import type { PropsWithChildren, ReactNode } from "react";
import { HostedSessionScope } from "../../src/auth/AuthProvider";
import type { HostedSession } from "../../src/auth/hostedSession";

/**
 * The layout suite's stand-in for `AuthProvider`: a signed-in session with no
 * vendor behind it, so the suite needs no Clerk keys and no network.
 *
 * `stubApi()` swaps it in for `main.tsx`'s import in the browser bundle, and
 * nowhere else: every other module, `HostedSessionScope` included, is the real
 * app's. `configured: false` keeps Clerk's own chrome out, as it is in the
 * Vitest suite's `TEST_SESSION`; the stub API answers whatever bearer comes.
 * Signing in through Clerk for real is the authenticated suite's (`e2e/auth/`).
 */
const session: HostedSession = {
  configured: false,
  signedIn: true,
  loading: false,
  fetchToken: () => Promise.resolve("e2e-session"),
};

export function AuthProvider({ children }: PropsWithChildren): ReactNode {
  return <HostedSessionScope session={session}>{children}</HostedSessionScope>;
}
