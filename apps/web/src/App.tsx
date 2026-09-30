import { RouterProvider, type AnyRouter } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { presenceOf } from "./auth/credential";
import { useHostedSession } from "./auth/hostedSession";
import { router } from "./router";

/**
 * A router that is asked again whenever who is signed in changes.
 *
 * The signed-out gate is the root route's `beforeLoad` (`routes/__root.tsx`),
 * which reads the published session rather than React, so the router does not
 * hear a sign-in, a sign-out or the vendor's first answer. This does, and
 * invalidates, which re-runs every `beforeLoad` and draws the new answer as an
 * ordinary re-render with no reload.
 *
 * Only a change invalidates: the router's own first load already asked. The
 * scope above this publishes during render, so by the time this effect runs
 * the slot holds what React holds.
 */
export function RoutedApp({ router }: { readonly router: AnyRouter }): ReactNode {
  const presence = presenceOf(useHostedSession());
  const gatedOn = useRef(presence);

  useEffect(() => {
    if (gatedOn.current === presence) return;
    gatedOn.current = presence;
    void router.invalidate();
  }, [router, presence]);

  return <RouterProvider router={router} />;
}

/**
 * The app is the router.
 *
 * There used to be a twelve-arm `switch` here over a hand-parsed hash, and
 * every screen it named took a `route` prop it then passed down to the shell.
 * All of that is the route files under `routes/` now, one per route: which
 * screen a URL is, which ids it carries, which of them are remounted rather
 * than re-rendered, and what a link that was never real falls back to. Read
 * `router.ts` first, including what a host has to do now that every route is a
 * real path.
 *
 * No screen asks whether anyone is signed in. The root route decides between
 * the marketing page and the app, and every screen loads through
 * `api/atoms.ts`, whose client resolves the hosted session's token per request.
 */
export function App(): ReactNode {
  return <RoutedApp router={router} />;
}
