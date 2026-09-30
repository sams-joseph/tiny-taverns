import { RegistryProvider } from "@effect/atom-react";
import { createBrowserHistory, createRouter } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { RoutedApp } from "../App";
import { HostedSessionScope } from "../auth/AuthProvider";
import { publishHostedSession, routerAuth } from "../auth/credential";
import { NO_HOSTED_SESSION, type HostedSession } from "../auth/hostedSession";
import { routeTree } from "../routeTree.gen";
import { TEST_SESSION } from "./session";

/**
 * Whether the visitor is signed in — which since the signed-out gate landed
 * decides *which page the app is*, not merely whether a request is answered.
 *
 * `"signed-in"` is the default because that is what a screen test means: *the
 * app, as somebody who is entitled to be in it sees it*. It wraps the route in
 * `TEST_SESSION`, outside any `wrap` the test passes, so a test's own
 * `HostedSessionScope` is the inner one and wins. `"none"` is nobody signed in,
 * for the homepage and the join page, which is designed to render with nobody
 * signed in. A `HostedSession` is for the tests about the gate itself.
 *
 * **The gate asks this, not a `wrap`'s scope, on the first load.** The root
 * route's `beforeLoad` reads the published session, and the router loads
 * before anything renders, so a test whose own scope starts in a different
 * state from this one would be gated on this one until the session next
 * changed. A test that changes the session names where it starts here.
 */
export type TestCredential = "signed-in" | "none" | HostedSession;

const sessionFor = (credential: TestCredential): HostedSession => {
  if (credential === "signed-in") return TEST_SESSION;
  if (credential === "none") return NO_HOSTED_SESSION;
  return credential;
};

/**
 * The claim the harness publishes before the first load. As deep as a claim
 * can be, so it takes the slot from any scope a previous render left mounted;
 * never mounted itself, so the render's own scope takes the slot straight back.
 */
const beforeRender = (session: HostedSession) => ({
  owner: "renderAt, before the first render",
  depth: Number.POSITIVE_INFINITY,
  session,
});

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
 * It is also the composition `main.tsx` renders, `RoutedApp` included, so this
 * is the real tree rather than a harness of its own.
 */
export const renderAt = async (
  path: string,
  wrap?: (children: ReactNode) => ReactNode,
  credential: TestCredential = "signed-in",
): Promise<void> => {
  globalThis.history.replaceState(null, "", path);
  const session = sessionFor(credential);
  publishHostedSession(beforeRender(session));
  const router = createRouter({
    routeTree,
    context: { auth: routerAuth },
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
      <RoutedApp router={router} />
    </RegistryProvider>
  );
  const wrapped = wrap === undefined ? tree : wrap(tree);
  render(<HostedSessionScope session={session}>{wrapped}</HostedSessionScope>);
};
