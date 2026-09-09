import { createHashHistory } from "@tanstack/react-router";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { hostedAuthNavigation } from "./navigation";

describe("hosted authentication navigation", () => {
  beforeEach(() => {
    globalThis.location.hash = "#/gallery";
  });

  it("replaces through the application's hash history after sign-in", async () => {
    const navigation = hostedAuthNavigation(createHashHistory());

    navigation.routerReplace("/");

    await waitFor(() => expect(globalThis.location.hash).toBe("#/"));
  });

  it("preserves push navigation in the hash history", async () => {
    const navigation = hostedAuthNavigation(createHashHistory());

    navigation.routerPush("/worlds");

    await waitFor(() => expect(globalThis.location.hash).toBe("#/worlds"));
  });
});
