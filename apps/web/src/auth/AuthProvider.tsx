import { ClerkProvider, useAuth } from "@clerk/react";
import { useEffect, useMemo, type PropsWithChildren, type ReactNode } from "react";
import { publishableKey } from "./config";
import {
  forgetHostedSession,
  publishHostedSession,
  useSignOutForgetsMachineToken,
} from "./credential";
import { HostedSessionContext, type HostedSession } from "./hostedSession";

/**
 * Signing out forgets the pasted machine token as well.
 *
 * A component rather than a call in `HostedSessionScope` itself, because the
 * hook reads `HostedSessionContext` and the scope is the thing *providing* it —
 * called there it would read the context one level up, which is the
 * unconfigured default, and would then never do anything at all. Rendered as a
 * child it sees the session that was just published.
 */
function SignOutForgetsMachineToken(): null {
  useSignOutForgetsMachineToken();
  return null;
}

/**
 * Publishes a hosted session to the app, and hangs the rules that follow from
 * one off it.
 *
 * There is exactly one such rule today and it is the reported sign-out defect:
 * signing out has to forget the pasted machine token too, or the app never
 * returns to the marketing page. It hangs here rather than on a screen for the
 * reason `SignInSurface` hangs in the shell — a sign-out can happen from any
 * page, through the vendor's own account menu, and a rule each screen had to
 * remember to mount is one a new screen will forget.
 *
 * **Split out from the bridge below so the composition is testable without the
 * vendor.** The bridge is Clerk's `useAuth()` and cannot be mounted in jsdom;
 * this is the part worth asserting on, and a test gives it a `HostedSession` of
 * its own and flips it. Every consumer, including the signed-out gate, is then
 * looking at exactly the tree the app builds rather than at one a test wired by
 * hand.
 */
export function HostedSessionScope({
  session,
  children,
}: PropsWithChildren<{ readonly session: HostedSession }>): ReactNode {
  // Published *during render*, and that is the load-bearing part rather than a
  // shortcut. `api/atoms.ts` builds its client layer outside React and reads
  // the session through this slot; an atom's first read happens while a
  // component renders (`useSyncExternalStore`'s snapshot), so a publish in an
  // effect — layout or passive — runs after the subtree has already asked. It
  // is a derived value rather than state, so writing the same thing on every
  // render is idempotent and safe under `StrictMode`'s double render.
  publishHostedSession(session);
  useEffect(() => forgetHostedSession, []);

  return (
    <HostedSessionContext value={session}>
      <SignOutForgetsMachineToken />
      {children}
    </HostedSessionContext>
  );
}

/**
 * Bridges the vendor's hook onto the local `HostedSession` shape.
 *
 * Only ever mounted inside `ClerkProvider`, which is what lets it call
 * `useAuth()` unconditionally — the "is Clerk configured?" branch is taken one
 * level up, by mounting this component or not, so no hook is ever called
 * conditionally.
 */
function HostedSessionBridge({ children }: PropsWithChildren): ReactNode {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const session = useMemo<HostedSession>(
    () => ({
      configured: true,
      signedIn: isSignedIn === true,
      // Until the vendor has loaded, `isSignedIn` is `undefined` — which is
      // *unknown*, not *no*. Only the signed-out gate cares about the
      // difference, and it cares a great deal: see `HostedSession.loading`.
      loading: isLoaded !== true,
      fetchToken: async () => {
        try {
          // Core 3 changed this: `getToken()` *throws* `ClerkOfflineError`
          // when the browser is offline, where it used to resolve `null`.
          // Both mean the same thing here — no credential available — and
          // neither is a failure worth propagating into an API call that
          // will simply be made unauthenticated and answered 401.
          return (await getToken()) ?? undefined;
        } catch {
          return undefined;
        }
      },
    }),
    [isLoaded, isSignedIn, getToken],
  );

  return <HostedSessionScope session={session}>{children}</HostedSessionScope>;
}

/**
 * Mounts the hosted identity provider — but only when one is configured.
 *
 * The conditional is the load-bearing part, and it mirrors the server's
 * `IdentityProvider.disabled`. Clerk's own quickstart prints a hard
 * `throw new Error("Add your Clerk Publishable Key")` here; that single line
 * is the difference between an opt-in dependency and a mandatory one, and it
 * would make `pnpm -F web dev` fail for anyone who has never opened the Clerk
 * dashboard. With no key the app renders exactly as it did before any of this
 * existed, and every consumer falls through to `NO_HOSTED_SESSION`.
 *
 * The branch is taken on an environment variable inlined at build time, so it
 * cannot flip between renders and the hook order below it is stable.
 */
export function AuthProvider({ children }: PropsWithChildren): ReactNode {
  const key = publishableKey();

  if (key === undefined) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={key}>
      <HostedSessionBridge>{children}</HostedSessionBridge>
    </ClerkProvider>
  );
}
