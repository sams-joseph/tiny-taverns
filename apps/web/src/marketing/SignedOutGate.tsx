import { Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCredentialPresence } from "../auth/credential";
import { MarketingScreen } from "./MarketingScreen";

/**
 * The homepage is the signed-out view of the app, and this is where that is
 * decided — the root route's component, so it sits above every match and there
 * is no screen that can forget it.
 *
 * ### The gate is "no credential of any kind", and that is the captain's own
 *
 * > *It shows when there is neither a hosted session nor a developer token.*
 *
 * Not "nobody is signed in through the hosted provider", which is the reading
 * that looks equivalent and is not. **Hosted sign-in is opt-in in this product
 * and is normally unconfigured in development** (`auth/AuthProvider.tsx`,
 * `env-file` in `AGENTS.md`), so a gate keyed on the hosted session alone would
 * show the marketing page to every developer instead of the app, every time.
 * `auth/credential.ts` already resolves both kinds for every request; this asks
 * that same file the same question one moment earlier.
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
 * cannot hang: with no provider configured there is nothing to wait for and the
 * answer is immediate, and a pasted machine token settles it without asking the
 * vendor at all.
 *
 * ### Two routes are exempt, and one of them is a security property
 *
 * **`/join/$token` must render signed out.** It is the first screen a stranger
 * sees of this product: it previews an invitation *before* there is anybody to
 * accept it as, which is the whole point of it (see `join/JoinScreen.tsx` and
 * the invitation section of `AGENTS.md`). Swallowing it behind this gate would
 * break the one flow that is designed to run with no account, and would do it
 * silently — the marketing page renders perfectly well over an invitation.
 *
 * **`/gallery` must too, and the reason is a circle.** It holds `ServerPanel`,
 * which is where a machine token is pasted, and a machine token is the *only*
 * credential a build with no publishable key has. Gated, a developer with
 * neither would see the marketing page, whose call to action points at the
 * Server panel, which is behind the marketing page. `StartCta.tsx` is the other
 * half of this and says so from its side.
 *
 * The exemption is checked **before** the credential is, so neither route ever
 * waits on a vendor: an invitation opens at once whatever Clerk is doing.
 */
export function SignedOutGate(): ReactNode {
  const matchRoute = useMatchRoute();
  const presence = useCredentialPresence();

  // `useMatchRoute` is typed against the route tree, so a path that stops
  // existing fails to compile here rather than silently never matching — which
  // for the join route would be a regression nothing else would catch.
  const exempt =
    matchRoute({ to: "/join/$token" }) !== false || matchRoute({ to: "/gallery" }) !== false;

  if (exempt) return <Outlet />;

  if (presence === "unknown") {
    // Deliberately empty, and deliberately not a spinner: this is a frame or
    // two on a warm cache, and something that flickers into view and out again
    // is worse than nothing at all. The page colour is what stops it flashing
    // white between the two real answers.
    return <div aria-hidden="true" className="min-h-screen bg-surface-page" />;
  }

  return presence === "absent" ? <MarketingScreen /> : <Outlet />;
}
