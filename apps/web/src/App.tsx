import { RouterProvider } from "@tanstack/react-router";
import { router } from "./routes";

/**
 * The app is the router.
 *
 * There used to be a twelve-arm `switch` here over a hand-parsed hash, and
 * every screen it named took a `route` prop it then passed down to the shell.
 * All of that is `routes.tsx` now: which screen a URL is, which ids it carries,
 * which of them are remounted rather than re-rendered, and what a link that was
 * never real falls back to. Read that file's own notes — in particular why the
 * app is still on a hash history, which is a decision about an invitation token
 * rather than an inheritance.
 *
 * Nothing here asks whether anyone is signed in. Every screen loads through
 * `useApiResource`, which resolves whichever credential exists — hosted session
 * or pasted machine token — and renders the `unauthorized` notice when neither
 * does. That is what keeps `pnpm -F web dev` working for a developer who has
 * never opened the Clerk dashboard.
 */
export function App() {
  return <RouterProvider router={router} />;
}
