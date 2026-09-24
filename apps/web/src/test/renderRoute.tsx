import { RegistryProvider } from "@effect/atom-react";
import { createBrowserHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { HostedSessionScope } from "../auth/AuthProvider";
import { routeTree } from "../routes";
import { TEST_SESSION } from "./session";

/**
 * Whether the visitor is signed in — which since the signed-out gate landed
 * decides *which page the app is*, not merely whether a request is answered.
 *
 * `"signed-in"` is the default because that is what a screen test means: *the
 * app, as somebody who is entitled to be in it sees it*. It wraps the route in
 * `TEST_SESSION`, outside any `wrap` the test passes, so a test's own
 * `HostedSessionScope` is the inner one and wins. `"none"` is for the tests
 * that are about the gate itself, and for the join page, which is designed to
 * render with nobody signed in.
 */
export type TestCredential = "signed-in" | "none";

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
 * **The real browser history, not a memory history**, because half of what
 * these tests assert is an `href` or the address bar after a navigation, and
 * the browser history is what the product runs on. The URL is set first
 * because that is where a browser history reads its initial location from.
 *
 * **A fresh `RegistryProvider` per render, and this one is a trap rather than a
 * tidiness.** `@effect/atom-react`'s `RegistryContext` defaults to a
 * *module-level* standalone registry, so atoms read with no provider above them
 * share one cache — across every test in a file, and across files in one
 * worker. It is the same shape as the `FetchHttpClient.Fetch`
 * `Context.Reference` memoisation this repo already documents, arriving by a
 * new door, and it fails the same way: **silently, and green**, because the
 * second test passes on the first test's data. `Atom.family` memoises atoms
 * globally by key, which is what makes the leak reach across files — the *atom*
 * is shared on purpose; the registry holding its value must not be.
 *
 * It is also the composition `main.tsx` renders, so this is the real tree
 * rather than a harness of its own.
 */
export const renderAt = async (
  path: string,
  wrap?: (children: ReactNode) => ReactNode,
  credential: TestCredential = "signed-in",
): Promise<void> => {
  globalThis.history.replaceState(null, "", path);
  const router = createRouter({
    routeTree,
    history: createBrowserHistory(),
    basepath: import.meta.env.BASE_URL,
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
  const tree = (
    <RegistryProvider>
      <RouterProvider router={router} />
    </RegistryProvider>
  );
  const wrapped = wrap === undefined ? tree : wrap(tree);
  render(
    credential === "signed-in" ? (
      <HostedSessionScope session={TEST_SESSION}>{wrapped}</HostedSessionScope>
    ) : (
      <>{wrapped}</>
    ),
  );
};
