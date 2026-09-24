import { createBrowserHistory } from "@tanstack/react-router";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { hostedAuthNavigation } from "./navigation";

describe("hosted authentication navigation", () => {
  beforeEach(() => {
    globalThis.history.replaceState(null, "", "/library");
  });

  it("replaces through the application's history after sign-in", async () => {
    const navigation = hostedAuthNavigation(createBrowserHistory());

    navigation.routerReplace("/");

    await waitFor(() => expect(globalThis.location.pathname).toBe("/"));
  });

  it("preserves push navigation in the application's history", async () => {
    const history = createBrowserHistory();
    const heard: Array<string> = [];
    history.subscribe(({ location }) => heard.push(location.pathname));
    const navigation = hostedAuthNavigation(history);

    navigation.routerPush("/worlds");

    await waitFor(() => expect(globalThis.location.pathname).toBe("/worlds"));
    // What the router matches on: a push its own history announced, which a
    // bare `window.history.pushState` would not have been.
    expect(heard).toContain("/worlds");
  });
});
