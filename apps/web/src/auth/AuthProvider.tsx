import { ClerkProvider, useAuth } from "@clerk/react";
import { useMemo, type PropsWithChildren, type ReactNode } from "react";
import { publishableKey } from "./config";
import { HostedSessionContext, type HostedSession } from "./hostedSession";

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

  return <HostedSessionContext value={session}>{children}</HostedSessionContext>;
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
