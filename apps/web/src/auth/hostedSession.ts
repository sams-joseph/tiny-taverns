import { createContext, use } from "react";

/**
 * What the rest of the app is allowed to know about a hosted sign-in.
 *
 * Deliberately vendor-free, and for the same reason `IdentityProvider` is on
 * the server: nothing below this line should be able to tell which vendor is
 * behind it. `AuthProvider` is the only file in `apps/web` that imports
 * `@clerk/react` for state, and `SignInSurface` and `StartCta` the only ones
 * that import it for chrome. Everything else talks to this shape.
 *
 * The states are distinct on purpose:
 *
 *  - `configured: false` — no vendor provider is mounted above. The running
 *    app never renders in this state (with no publishable key `AuthProvider`
 *    shows the setup message instead); it is what a component rendered with no
 *    provider sees — a screen in a test, or the layout suite's stand-in
 *    session — and it is why vendor chrome such as `SignInSurface` renders
 *    nothing there.
 *  - `configured: true, signedIn: false` — sign-in is available, nobody has.
 *  - `signedIn: true` — `fetchToken` can produce a credential.
 *
 * `loading` cuts across those: a configured provider answers *"is anybody
 * signed in?"* asynchronously, and until it has, `signedIn: false` means *"we
 * do not know yet"* rather than *"nobody is"*.
 */
export interface HostedSession {
  /** Whether a hosted identity provider is configured at all. */
  readonly configured: boolean;
  /** Whether someone is signed in through it right now. */
  readonly signedIn: boolean;
  /**
   * Whether the vendor is still deciding whether anybody is signed in.
   *
   * **This exists for the signed-out gate and nothing else** (see
   * `marketing/SignedOutGate.tsx`). Everything else in the app treats "not
   * signed in yet" and "not signed in" alike, because both mean the same thing
   * to a request: no credential. The gate cannot, because
   * it renders a whole different page for the two, and a `signedIn: false`
   * that has not settled would paint the marketing homepage over the app for
   * as long as the vendor's script takes to answer.
   *
   * `false` whenever `configured` is `false` — with no provider there is
   * nothing to wait for, and the answer is already known.
   */
  readonly loading: boolean;
  /**
   * A *fresh* session token, or `undefined` when there is none to be had.
   *
   * Called immediately before each API call, never cached by the caller.
   * Hosted session tokens are short-lived — Clerk's are 60 seconds — so a
   * token read once at mount and held in state works for under a minute and
   * then starts 401-ing, which is the exact bug this signature exists to make
   * awkward to write. The SDK does its own memoising and refresh behind this
   * call, so calling it per request is cheap.
   */
  readonly fetchToken: () => Promise<string | undefined>;
}

/**
 * The unconfigured session: no provider, nobody signed in, no token.
 *
 * This is the context default, which is what makes every consumer work when
 * it is rendered with no provider above it at all, as a screen in a test is.
 */
export const NO_HOSTED_SESSION: HostedSession = {
  configured: false,
  signedIn: false,
  loading: false,
  fetchToken: () => Promise.resolve(undefined),
};

export const HostedSessionContext = createContext<HostedSession>(NO_HOSTED_SESSION);

export const useHostedSession = (): HostedSession => use(HostedSessionContext);
