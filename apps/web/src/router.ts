import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Where you are, in the URL — TanStack Router over the browser's own history.
 *
 * The route table is `routes/`, one file per route, and `routeTree.gen.ts` is
 * what the router plugin in `vite.config.ts` writes from it on every Vite start
 * (dev, build, Vitest, Playwright). The generated tree is committed because
 * `tsc` needs it; CI fails a branch whose tree is stale.
 *
 * ### Every route is a real path
 *
 * `/campaigns/<id>/…`, `/characters/<id>`, `/join/<token>`: the route is the
 * path, and a `#fragment` is only ever an in-page anchor. The app ran on a hash
 * history until the maintainer decided on 2026-09-23 that the URL should be
 * clean. The hash's one real argument was the invitation token — a browser
 * never sends a fragment, so `#/join/<token>` kept it out of access logs — and
 * that trade was accepted knowingly: an invitation is single-use, so the token
 * a log records is spent once it is redeemed.
 *
 * **A real path needs the host to answer it.** Every path that is not a file
 * has to be served `index.html`, or a reload on `/campaigns/<id>` is a 404.
 * Vite's dev server and `vite preview` do that already; a static host needs a
 * rewrite rule, which `README.md` names. The app may be served under a
 * subpath: the router's `basepath` is Vite's `base`, so the two are set in one
 * place (`vite.config.ts`) and cannot disagree.
 *
 * A bad id in a path is a bad link rather than a crash; `routes/-params.ts`
 * says how.
 *
 * ### The one router, on the browser history (TanStack's default)
 *
 * `basepath` is Vite's `base` (`import.meta.env.BASE_URL`), so a build served
 * under a subpath routes and links under it without a second setting.
 *
 * `scrollRestoration` restores the scroll on back and forward, and scrolls to
 * the element a `Link`'s `hash` names.
 */
export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
  scrollRestoration: true,
  defaultPreload: false,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
