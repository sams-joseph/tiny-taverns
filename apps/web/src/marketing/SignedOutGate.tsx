import { Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCredentialPresence } from "../auth/credential";
import { MarketingScreen } from "./MarketingScreen";

/**
 * The homepage is the signed-out view of the app, and this is where that is
 * decided — the root route's component, so it sits above every match and there
 * is no screen that can forget it.
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
 * allowed to have. So `useCredentialPresence` has an `unknown` state and this
 * renders **neither page** while it holds: an empty page-coloured frame, which
 * is the same choice Clerk's own `Show` makes and for the same reason. It
 * cannot hang: a provider that has loaded has answered.
 *
 * ### One route is exempt, and it is a security property
 *
 * **`/join/$token` must render signed out.** It is the first screen a stranger
 * sees of this product: it previews an invitation *before* there is anybody to
 * accept it as, which is the whole point of it (see `join/JoinScreen.tsx`).
 * Swallowing it behind this gate would break the one flow that is designed to
 * run with no account, and would do it silently — the marketing page renders
 * perfectly well over an invitation.
 *
 * The exemption is checked **before** the credential is, so the invitation
 * never waits on a vendor: it opens at once whatever Clerk is doing.
 */
export function SignedOutGate(): ReactNode {
  const matchRoute = useMatchRoute();
  const presence = useCredentialPresence();

  // `useMatchRoute` is typed against the route tree, so a path that stops
  // existing fails to compile here rather than silently never matching — which
  // for the join route would be a regression nothing else would catch.
  if (matchRoute({ to: "/join/$token" }) !== false) return <Outlet />;

  if (presence === "unknown") {
    // Deliberately empty, and deliberately not a spinner: this is a frame or
    // two on a warm cache, and something that flickers into view and out again
    // is worse than nothing at all. The page colour is what stops it flashing
    // white between the two real answers.
    return <div aria-hidden="true" className="min-h-screen bg-surface-page" />;
  }

  return presence === "absent" ? <MarketingScreen /> : <Outlet />;
}
