import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";

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
 * Nothing here asks whether anyone is signed in. The root route's
 * `SignedOutGate` decides between the marketing page and the app, and every
 * screen loads through `api/atoms.ts`, whose client resolves the hosted
 * session's token per request.
 */
export function App() {
  return <RouterProvider router={router} />;
}
