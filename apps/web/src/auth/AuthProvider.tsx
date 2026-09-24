import { ClerkProvider, useAuth } from "@clerk/react";
import { useEffect, useMemo, type PropsWithChildren, type ReactNode } from "react";
import { ClerkRequired } from "./ClerkRequired";
import { publishableKey } from "./config";
import { forgetHostedSession, publishHostedSession } from "./credential";
import { HostedSessionContext, type HostedSession } from "./hostedSession";
import { hostedAuthNavigation } from "./navigation";
import { router } from "../routes";

const navigation = hostedAuthNavigation(router.history);

/**
 * Publishes a hosted session to the app: into React through the context, and
 * out of it through `publishHostedSession` for the atom client layer.
 *
 * **Split out from the bridge below so the composition is testable without the
 * vendor.** The bridge is Clerk's `useAuth()` and cannot be mounted in jsdom; a
 * test gives this a `HostedSession` of its own (`test/session.ts`), and so does
 * the layout suite's stand-in (`e2e/stub/StubAuthProvider.tsx`). Every consumer,
 * including the signed-out gate, is then looking at exactly the tree the app
 * builds rather than at one wired by hand.
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

  return <HostedSessionContext value={session}>{children}</HostedSessionContext>;
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
 * Mounts the hosted identity provider, which the app cannot run without.
 *
 * Clerk is a prerequisite: the browser signs in through it and has no other
 * credential. With no publishable key the app is `ClerkRequired`, a notice
 * saying what to configure, rather than a sign-in that cannot open. (Machine
 * tokens still authenticate on the server, for its tests and scripts; no
 * browser path uses one.)
 *
 * The branch is taken on an environment variable inlined at build time, so it
 * cannot flip between renders and the hook order below it is stable.
 */
export function AuthProvider({ children }: PropsWithChildren): ReactNode {
  const key = publishableKey();

  if (key === undefined) {
    return <ClerkRequired />;
  }

  return (
    <ClerkProvider publishableKey={key} {...navigation}>
      <HostedSessionBridge>{children}</HostedSessionBridge>
    </ClerkProvider>
  );
}
