import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { routeTree } from "../routes";

/**
 * Render the app at a URL, rather than rendering a screen by hand.
 *
 * **A screen is no longer something you can mount on its own**, and that is the
 * point rather than a cost: it reads its ids from the router and composes a
 * shell that reads the mode from the router too, so a test that constructed
 * those by hand would be testing a wiring the product does not have. Naming the
 * URL instead makes each fixture say which link it is standing at, and every
 * one of them now exercises the real route table on the way in — the ids
 * decoded by the real `params.parse`, the fall-backs taken by the real tree.
 *
 * **A fresh router per render.** `createRouter` holds the location, the match
 * cache and the subscriber list; one shared between test files would carry a
 * previous test's URL into the next, and the failure would look like a screen
 * bug rather than a fixture one.
 *
 * **The real `createHashHistory`, not a memory history**, because half of what
 * these tests assert is an `href`, and only the hash history builds the `#/…`
 * the product actually renders. `window.location.hash` is set first because
 * that is where a hash history reads its initial location from.
 */
export const renderAt = async (
  path: string,
  wrap?: (children: ReactNode) => ReactNode,
): Promise<void> => {
  globalThis.location.hash = `#${path}`;
  const router = createRouter({
    routeTree,
    history: createHashHistory(),
    // Off in tests for the reason it is off in the app: nothing here has a
    // loader, so a preload would only be a second render nobody asked for.
    defaultPreload: false,
  });
  // **Awaited, and that is not ceremony.** `RouterProvider` resolves its first
  // match inside a `Suspense`, so a render with nothing awaited paints an empty
  // body — which reads in a failing test as "the screen drew nothing" rather
  // than "the router had not matched yet". Loading first makes the first paint
  // the screen.
  await router.load();
  const tree = <RouterProvider router={router} />;
  render(<>{wrap === undefined ? tree : wrap(tree)}</>);
};

/**
 * An `href` as this app renders one.
 *
 * `createHashHistory` builds a link as *the current path*, then the route in
 * the fragment — `/#/campaigns`, not `#/campaigns` — so a link stays correct
 * when the app is served from somewhere other than the root. The route is the
 * part these tests are about; this is here so the leading path does not have to
 * be repeated at every assertion.
 */
export const hashHref = (path: string): string => `/#${path}`;
