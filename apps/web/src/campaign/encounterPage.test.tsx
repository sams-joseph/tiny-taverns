import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { apiUrl } from "../api/client";
import { DRAWING_POLL_MS } from "../hob/drawingPolling";
import { renderAt } from "../test/renderRoute";
import {
  battleMap,
  campaign,
  campaignId,
  encounter,
  encounterId,
  installMemoryStorage,
  installStubServer,
  liveRun,
  renderEncounters,
  sessionId,
} from "./campaign.fixtures";

/**
 * One encounter's page: reached from its card, its map drawn with the grid
 * where the map says it sits, re-read while Hob is drawing, and refused to
 * anybody but the table's creator.
 */

const server = installStubServer();
installMemoryStorage();

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
  globalThis.history.replaceState(null, "", "/");
});
afterEach(() => cleanup());

const mapPath = `/campaigns/${campaignId}/encounters/${encounterId}/map`;
const pagePath = `/campaigns/${campaignId}/encounters/${encounterId}`;

/** A picture Hob drew, as the creator's map read signs it. */
const drawnMap = {
  cardUrl: "/battle-map-images/2b1f2a1e-0000-4000-8000-000000000b01/card?e=1&s=c",
  fullUrl: "/battle-map-images/2b1f2a1e-0000-4000-8000-000000000b01/full?e=1&s=f",
  width: 1536,
  height: 1024,
};

const mapWith = (over: object) => ({ status: 200, body: { ...battleMap, ...over } });

const board = () => document.querySelector("[data-slot=battle-map]");
const lines = (kind: "column" | "row") =>
  document.querySelectorAll(`[data-slot=battle-map-grid] [data-line=${kind}]`);

describe("an encounter's page", () => {
  it("opens from anywhere on the encounter's card", async () => {
    await renderEncounters();
    const link = await screen.findByRole("link", { name: "Ambush in the reeds" });
    expect(link).toHaveAttribute("data-card-link");

    await userEvent.click(link);

    await waitFor(() => expect(globalThis.location.pathname).toBe(pagePath));
    await screen.findByRole("heading", { name: "Battle map" });
    expect(board()).not.toBeNull();
    expect(screen.getByRole("link", { name: "All encounters" })).toBeInTheDocument();
  });

  it("keeps the card's pencil a button that does not navigate", async () => {
    await renderEncounters();
    await userEvent.click(await screen.findByRole("button", { name: "Edit Ambush in the reeds" }));
    await screen.findByRole("dialog");
    expect(globalThis.location.pathname).toBe(`/campaigns/${campaignId}/encounters`);
  });

  it("lays a line at every square's edge over the blank board", async () => {
    await renderAt(pagePath);
    await screen.findByRole("heading", { name: "Battle map" });
    // 24 × 16 squares: 25 edges across, 17 down.
    expect(lines("column")).toHaveLength(25);
    expect(lines("row")).toHaveLength(17);
    const svg = document.querySelector("[data-slot=battle-map-grid]");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 1536 1024");
    expect(screen.getByText("24 × 16 squares · 5 ft each · 120 × 80 ft")).toBeInTheDocument();
    expect(
      screen.getByText("Hob drew no picture of this place, so the board is a blank grid."),
    ).toBeInTheDocument();
    expect(screen.getByText("A boardwalk over black water")).toBeInTheDocument();
  });

  it("draws the grid over Hob's picture in the picture's own pixels", async () => {
    server.routes.set(
      `GET ${mapPath}`,
      mapWith({
        image: drawnMap,
        columns: 20,
        rows: 13,
        alignment: { cellPx: 76.8, offsetXPx: 0, offsetYPx: 12 },
      }),
    );
    await renderAt(pagePath);
    await screen.findByRole("heading", { name: "Battle map" });

    const img = board()?.querySelector("img");
    expect(img?.getAttribute("src")).toBe(apiUrl(drawnMap.fullUrl));
    expect(img?.getAttribute("srcset")).toContain(`${apiUrl(drawnMap.cardUrl)} 768w`);
    expect(lines("column")).toHaveLength(21);
    expect(lines("row")).toHaveLength(14);
    expect(document.querySelector("[data-slot=battle-map-grid]")?.getAttribute("viewBox")).toBe(
      "0 0 1536 1024",
    );
    // The last column's edge is the picture's right edge; the rows start 12 px down.
    expect(lines("column")[20]?.getAttribute("x1")).toBe("1536");
    expect(lines("row")[0]?.getAttribute("y1")).toBe("12");
    expect(screen.queryByText(/Hob drew no picture/)).toBeNull();
  });

  it("draws no lines when the grid is switched off, and says so", async () => {
    server.routes.set(`GET ${mapPath}`, mapWith({ grid: "none" }));
    await renderAt(pagePath);
    await screen.findByRole("heading", { name: "Battle map" });
    expect(board()).not.toBeNull();
    expect(document.querySelector("[data-slot=battle-map-grid]")).toBeNull();
    expect(screen.getByText(/grid lines hidden/)).toBeInTheDocument();
  });

  it("says Hob is drawing, re-reads the map until the picture lands, then stops", async () => {
    server.routes.set(`GET ${mapPath}`, mapWith({ imagePending: true }));
    await renderAt(pagePath);
    expect(await screen.findByText("Hob is drawing…")).toHaveAttribute("role", "status");
    expect(screen.queryByText(/Hob drew no picture/)).toBeNull();

    server.routes.set(`GET ${mapPath}`, mapWith({ image: drawnMap }));
    await waitFor(() => expect(board()?.querySelector("img")).toBeTruthy(), {
      timeout: 15_000,
    });
    expect(screen.queryByText("Hob is drawing…")).toBeNull();

    const mapReads = () => server.calls.filter((call) => call.pathname === mapPath).length;
    const settled = mapReads();
    expect(settled).toBeGreaterThanOrEqual(2);
    // More than a whole period with nothing pending: no further read.
    await new Promise((resolve) => setTimeout(resolve, DRAWING_POLL_MS * 1.5));
    expect(mapReads()).toBe(settled);
  }, 30_000);

  it("shows the roster and the notes attached to it", async () => {
    await renderAt(pagePath);
    await screen.findByRole("heading", { name: "Roster" });
    const roster = screen.getByRole("heading", { name: "Roster" }).closest("[data-slot=card]");
    expect(within(roster as HTMLElement).getByText("Goblin Boss")).toBeInTheDocument();
    expect(within(roster as HTMLElement).getByText("×6")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByText("Read aloud at the water")).toBeInTheDocument();
  });

  it("edits the encounter in its own dialog", async () => {
    await renderAt(pagePath);
    await screen.findByRole("heading", { name: "Battle map" });
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/What the place looks like/)).toHaveValue(
      "A boardwalk over black water",
    );
  });

  it("makes Run the one primary, and says when a fight is already on the table", async () => {
    await renderAt(pagePath);
    await screen.findByRole("heading", { name: "Battle map" });
    const primaries = () =>
      [...document.querySelectorAll('[data-slot="button"]')].filter((button) =>
        button.classList.contains("bg-accent"),
      );
    await waitFor(() => expect(primaries().map((button) => button.textContent)).toEqual(["Run"]));
    cleanup();

    server.routes.set(`GET /campaigns/${campaignId}/sessions/${sessionId}/runs`, {
      status: 200,
      body: [liveRun],
    });
    await renderAt(pagePath);
    await screen.findByText("On the table now");
    await waitFor(() =>
      expect(primaries().map((button) => button.textContent)).toEqual(["Back to the fight"]),
    );
  });

  it("refuses a player, even at a table where the encounter is shared", async () => {
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [{ campaign, relation: "player", sharedWorld: null, joinedAt: campaign.createdAt }],
    });
    // A shared encounter is a row a player may read — but its map is not.
    server.routes.set(`GET /campaigns/${campaignId}/encounters/${encounterId}`, {
      status: 200,
      body: { ...encounter, visibility: "shared" },
    });
    server.routes.set(`GET ${mapPath}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "battle map", id: encounterId },
    });
    await renderAt(pagePath);

    expect(await screen.findByText("Not here")).toBeInTheDocument();
    expect(board()).toBeNull();
    expect(screen.queryByRole("heading", { name: "Battle map" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("falls back to the list from an id it could not read", async () => {
    await renderAt(`/campaigns/${campaignId}/encounters/not-a-uuid`);
    expect(await screen.findByRole("link", { name: "Ambush in the reeds" })).toBeInTheDocument();
  });
});
