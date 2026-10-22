import { generateLevel, type LevelSpec } from "@taverns/api";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { campaignId, installStubServer } from "../campaign/campaign.fixtures";
import { sseFrames } from "../characters/characters.fixtures";
import { renderAt } from "../test/renderRoute";

/**
 * A level Hob proposed (`proposeLevel`), as its card draws it and as it is
 * kept: the preview laid out from the proposal's labels and seed, the rooms
 * it asked for, *Keep it* posting an empty accept, and *Open it* opening the
 * kept level in the editor. On both panels that offer one: a campaign
 * creator's and the account's own.
 */

const server = installStubServer();

const threadId = "3c2f2a1e-0000-4000-8000-00000000d001";
const turnId = "3c2f2a1e-0000-4000-8000-00000000d002";
const levelId = "3c2f2a1e-0000-4000-8000-00000000d003";
const stamp = "2026-10-21T20:00:00.000Z";

const spec: LevelSpec = {
  name: "The Sunken Shrine",
  description: "A drowned abbey under the marsh.",
  size: "small",
  rooms: [
    { purpose: "shrine", size: "large", label: "The Chapel" },
    { purpose: "cistern", size: "medium", label: null },
  ],
  connections: "doors",
  secrets: 1,
  mood: "firelit",
  seed: 4242,
};

const levelRow = {
  id: levelId,
  ...generateLevel(spec).level,
  version: 2,
  origin: "assistant",
  createdAt: stamp,
  updatedAt: stamp,
};

const SURFACES = [
  {
    name: "a campaign's creator panel",
    at: `/campaigns/${campaignId}`,
    hob: `/campaigns/${campaignId}/hob`,
    status: { available: true, model: "scripted-local", campaign: "The Salt Road" },
  },
  {
    name: "the account's own panel",
    at: "/characters",
    hob: "/me/hob",
    status: { available: true, model: "scripted-local" },
  },
] as const;

const serve = (surface: (typeof SURFACES)[number]) => {
  server.routes.set(`GET ${surface.hob}`, { status: 200, body: surface.status });
  server.routes.set(`GET ${surface.hob}/threads`, { status: 200, body: [] });
  server.routes.set(`POST ${surface.hob}/ask`, {
    status: 200,
    sse: sseFrames([
      { event: "began", data: { threadId, turnId } },
      { event: "delta", data: { text: "A drowned shrine." } },
      { event: "proposal", data: { turnId, proposal: { target: "level", ...spec } } },
      { event: "done", data: { reason: "stop" } },
    ]),
  });
  server.routes.set(`POST ${surface.hob}/threads/${threadId}/turns/${turnId}/accept`, {
    status: 200,
    body: { accepted: "level", level: levelRow },
  });
};

// jsdom has no 2D canvas; say so quietly, as a browser without one would.
beforeEach(() => {
  server.reset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const panel = () => screen.getByRole("region", { name: "Hob" });
const card = () => {
  const found = within(panel())
    .getByText("The Sunken Shrine")
    .closest<HTMLElement>("[data-slot=card]");
  if (found === null) throw new Error("no level card");
  return found;
};

for (const surface of SURFACES) {
  describe(surface.name, () => {
    it("draws the proposed level with its rooms, keeps it, and opens it in the editor", async () => {
      serve(surface);
      await renderAt(surface.at);
      await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));
      const composer = await within(panel()).findByRole("textbox", { name: "Ask Hob" });
      await userEvent.type(composer, "Build me a battle map of a sunken shrine.{Enter}");
      await within(panel()).findByText("The Sunken Shrine");

      const offered = within(card());
      expect(offered.getByText("Level")).toBeTruthy();
      expect(offered.getByText("Small board · 2 rooms · firelit")).toBeTruthy();
      expect(offered.getByText("A drowned abbey under the marsh.")).toBeTruthy();
      expect(offered.getByText("The Chapel (large shrine)")).toBeTruthy();
      expect(offered.getByText("Medium cistern")).toBeTruthy();
      // The preview is the generated board, at its own proportions.
      const preview = offered.getByRole("img", { name: "A preview of The Sunken Shrine" });
      expect([preview.getAttribute("width"), preview.getAttribute("height")]).toEqual([
        String(32 * 8),
        String(24 * 8),
      ]);
      // And it was drawn, on a 2D canvas.
      expect(
        vi
          .mocked(HTMLCanvasElement.prototype.getContext)
          .mock.calls.some(([kind]) => kind === "2d"),
      ).toBe(true);

      await userEvent.click(offered.getByRole("button", { name: "Keep it" }));
      await within(panel()).findByText("Saved");
      // The accept carries nothing: the server lays the level out from its own copy.
      expect(
        server.calls
          .filter((call) => call.method === "POST" && call.pathname.endsWith("/accept"))
          .map((call) => [call.pathname, call.body]),
      ).toEqual([[`${surface.hob}/threads/${threadId}/turns/${turnId}/accept`, "{}"]]);
      expect(within(card()).getByText("In your Library’s levels")).toBeTruthy();

      await userEvent.click(within(card()).getByRole("button", { name: "Open it" }));
      await waitFor(() => expect(window.location.pathname).toBe(`/library/levels/${levelId}`));
    });

    it("writes nothing when it is discarded", async () => {
      serve(surface);
      server.routes.set(`POST ${surface.hob}/threads/${threadId}/turns/${turnId}/discard`, {
        status: 204,
      });
      await renderAt(surface.at);
      await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));
      const composer = await within(panel()).findByRole("textbox", { name: "Ask Hob" });
      await userEvent.type(composer, "Build me a battle map of a sunken shrine.{Enter}");
      await within(panel()).findByText("The Sunken Shrine");

      await userEvent.click(within(card()).getByRole("button", { name: "Discard" }));
      await waitFor(() => expect(within(panel()).queryByText("The Sunken Shrine")).toBeNull());
      expect(
        server.calls.filter((call) => call.method === "POST" && call.pathname.endsWith("/accept")),
      ).toEqual([]);
    });
  });
}
