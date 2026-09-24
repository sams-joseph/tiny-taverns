import type { HostedSession } from "../auth/hostedSession";

/** The bearer the stand-in session sends, for a test that asserts the header. */
export const TEST_SESSION_TOKEN = "a-test-token";

/**
 * A signed-in session with no vendor behind it: what a screen test means by
 * *somebody entitled to be in the app*.
 *
 * `configured: false` because no `ClerkProvider` is mounted in jsdom, so the
 * vendor's chrome (`SignInSurface`, `StartCta`) must stay out; `signedIn: true`
 * so the signed-out gate shows the app and every request carries a bearer.
 * `renderAt` wraps every route in it by default; a test that wants a different
 * session wraps its own `HostedSessionScope` inside, and the inner one wins.
 */
export const TEST_SESSION: HostedSession = {
  configured: false,
  signedIn: true,
  loading: false,
  fetchToken: () => Promise.resolve(TEST_SESSION_TOKEN),
};
