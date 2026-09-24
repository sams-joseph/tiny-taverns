import type { RouterHistory } from "@tanstack/react-router";

/**
 * Gives hosted authentication the same history the application uses.
 *
 * Clerk falls back to calling `window.history` itself when these callbacks are
 * not supplied. That updates the address bar without telling TanStack Router,
 * which only hears its own history's pushes and the browser's `popstate`, so
 * the router would not match the destination: the session becomes
 * authenticated, the root gate opens, and its outlet has no current child until
 * a page reload rebuilds the matches.
 *
 * Keeping the adapter about history rather than about Clerk makes the
 * important part independently testable: a destination such as `/worlds` must
 * reach the address bar through the router's own history.
 */
export const hostedAuthNavigation = (
  history: Pick<RouterHistory, "push" | "replace">,
): {
  readonly routerPush: (to: string) => void;
  readonly routerReplace: (to: string) => void;
} => ({
  routerPush: (to) => history.push(to),
  routerReplace: (to) => history.replace(to),
});
