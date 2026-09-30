import { createRootRouteWithContext } from "@tanstack/react-router";
import type { RouterAuth } from "../auth/credential";
import { SignedOutGate } from "../marketing/SignedOutGate";

/** What every route is handed: where to ask who is signed in (`router.ts`). */
export interface RouterContext {
  readonly auth: RouterAuth;
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /**
     * Renders to a visitor nobody has signed in as, and never waits on the
     * vendor to find out. Declared by the route itself, so the exemption moves
     * with the file rather than living in a path the gate has to remember.
     */
    readonly rendersSignedOut?: true;
  }
}

/**
 * The root, which is the signed-out gate.
 *
 * **The marketing homepage is the signed-out view of the app**, so "is there a
 * credential?" is asked once, here, before any child route's `beforeLoad`,
 * loader or component, instead of by each screen. The answer is this route's
 * context, `presence`, which `SignedOutGate` draws and any child can read:
 *
 *  - `exempt`: a matched route declares `rendersSignedOut` (the invitation,
 *    `routes/_standalone/join/$token.tsx`). Checked **first**, so the
 *    invitation never waits on the vendor.
 *  - `unknown`: the vendor has not answered yet. Neither page is drawn.
 *  - `present`, `absent`: the app, or the homepage in place at whatever URL
 *    was asked for, so a deep link survives Clerk's modal sign-in.
 *
 * **It decides synchronously, from the published session, and must.** Awaiting
 * the vendor here makes the first load a Suspense fallback, and React holds the
 * reveal that follows for up to 300ms (`FALLBACK_THROTTLE_MS`): the signed-out
 * homepage arrived a visible beat after the answer did. So `unknown` is an
 * answer rather than a wait, and when the session flips `RoutedApp` in
 * `App.tsx` invalidates the router, which asks again.
 *
 * It redirects nowhere, by the maintainer's choice, and it is not an access
 * check: the server resolves the actor per request and answers "not yours" as
 * `NotFound`. A creator-only screen is `campaign/CreatorOnly.tsx`'s, in its
 * component, because the relation it needs is data the screen reads.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: ({ context, matches }) => ({
    presence: matches.some((match) => match.staticData.rendersSignedOut === true)
      ? ("exempt" as const)
      : context.auth.presence(),
  }),
  component: SignedOutGate,
});
