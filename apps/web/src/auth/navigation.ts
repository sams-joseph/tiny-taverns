import type { RouterHistory } from "@tanstack/react-router";

/**
 * Gives hosted authentication the same history the application uses.
 *
 * Clerk falls back to the browser history API when these callbacks are not
 * supplied. This application deliberately uses a hash history, so that
 * fallback can update the address bar without causing TanStack Router to
 * match the destination. The session then becomes authenticated, the root
 * gate opens, and its outlet has no current child until a page reload rebuilds
 * the matches.
 *
 * Keeping the adapter about history rather than about Clerk makes the
 * important part independently testable: a destination such as `/` must
 * become `#/` and notify the hash router.
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
