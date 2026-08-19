import { RegistryProvider } from "@effect/atom-react";
import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { readMachineToken, writeMachineToken } from "../auth/credential";
import { routeTree } from "../routes";
import { ensureStorage } from "./storage";

/**
 * Whether the visitor has a credential — which since the signed-out gate landed
 * decides *which page the app is*, not merely whether a request is answered.
 *
 * `"machine-token"` is the default because that is what a screen test means:
 * *the app, as somebody who is entitled to be in it sees it*. Without one the
 * root route renders the marketing homepage, which is the product's real
 * answer and would make every screen fixture assert against the wrong page.
 * `"none"` is for the tests that are about the gate itself, and for the join
 * page, which is designed to render with no credential at all.
 */
export type TestCredential = "machine-token" | "none";

/** The token `renderAt` pastes when a test does not paste one of its own. */
export const TEST_MACHINE_TOKEN = "a-test-token";

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
  credential: TestCredential = "machine-token",
): Promise<void> => {
  // A test that pasted its own token keeps it: `CampaignScreen.test.tsx` asserts
  // the exact bearer the fallback sends, and this would otherwise overwrite it.
  if (credential === "machine-token") {
    ensureStorage();
    if (readMachineToken() === "") writeMachineToken(TEST_MACHINE_TOKEN);
  }
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
  const tree = (
    <RegistryProvider>
      <RouterProvider router={router} />
    </RegistryProvider>
  );
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
