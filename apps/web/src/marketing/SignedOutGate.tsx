import { Outlet, useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MarketingScreen } from "./MarketingScreen";

/**
 * Draws the signed-out gate's answer: the root route's component, so it sits
 * above every match and there is no screen that can forget it.
 *
 * The answer is decided in the root route's `beforeLoad` (`routes/__root.tsx`),
 * which is where the exemption and the reasons are written down; this only
 * draws it.
 *
 * ### The gate is "nobody is signed in"
 *
 * Clerk is a prerequisite (`auth/AuthProvider.tsx`), so the hosted session is
 * the only credential a browser has, and `auth/credential.ts` answers the
 * question from it — the same file that resolves each request's bearer.
 *
 * ### The third answer, and why a boolean would have been a bug
 *
 * A configured hosted provider decides *"is anybody signed in?"* asynchronously,
 * and while it is deciding `signedIn` is `false`. Read as a boolean, that paints
 * the marketing homepage over the app on every load for every signed-in
 * visitor, for as long as the vendor's script takes — the flash this gate is not
 * allowed to have. So presence has an `unknown` state and this renders **neither
 * page** while it holds: an empty page-coloured frame, which is the same choice
 * Clerk's own `Show` makes and for the same reason. It cannot hang: a provider
 * that has loaded has answered, and `RoutedApp` re-runs the gate when it does.
 */
export function SignedOutGate(): ReactNode {
  const presence = useRouteContext({ from: "__root__", select: (context) => context.presence });

  if (presence === "unknown") {
    // Deliberately empty, and deliberately not a spinner: this is a frame or
    // two on a warm cache, and something that flickers into view and out again
    // is worse than nothing at all. The page colour is what stops it flashing
    // white between the two real answers.
    return <div aria-hidden="true" className="min-h-screen bg-surface-page" />;
  }

  return presence === "absent" ? <MarketingScreen /> : <Outlet />;
}
