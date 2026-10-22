import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cryptLevelId } from "../levels/levels.fixtures";
import { renderAt } from "../test/renderRoute";
import {
  campaign,
  campaignId,
  encounter,
  encounterId,
  installStubServer,
  page,
  readAloud,
  liveRun,
  renderEncounters,
  sessionId,
  sketch,
} from "./campaign.fixtures";

/**
 * One encounter's page: reached from its card, its battle map the level it is
 * played on or the plain grid, and refused to anybody but the table's creator.
 */

const server = installStubServer();

beforeEach(() => {
  server.reset();
  globalThis.history.replaceState(null, "", "/");
});
afterEach(() => cleanup());

const rosterPath = `/campaigns/${campaignId}/encounters/${encounterId}/creatures`;
const pagePath = `/campaigns/${campaignId}/encounters/${encounterId}`;

/** The encounter on the crypt level of the creator's Library. */
const onTheCrypt = () =>
  server.routes.set(`GET /campaigns/${campaignId}/encounters`, {
    status: 200,
    body: page([{ ...encounter, levelId: cryptLevelId }, sketch]),
  });

describe("an encounter's page", () => {
  it("opens from the heading of the Encounters page's preview", async () => {
    await renderEncounters();
    const preview = await screen.findByRole("article", { name: "Ambush in the reeds" });
    const link = within(preview).getByRole("link", { name: "Ambush in the reeds" });

    await userEvent.click(link);

    await waitFor(() => expect(globalThis.location.pathname).toBe(pagePath));
    await screen.findByRole("heading", { name: "Battle map" });
    expect(screen.getByRole("link", { name: "All encounters" })).toBeInTheDocument();
  });

  it("keeps the preview's Edit apart from the page: it opens the builder", async () => {
    await renderEncounters();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await waitFor(() => expect(globalThis.location.pathname).toBe(`${pagePath}/edit`));
  });

  it("says a fight on an encounter with no level is played on the plain grid", async () => {
    await renderAt(pagePath);
    await screen.findByRole("heading", { name: "Battle map" });
    expect(screen.getByText("24 × 16 squares · 5 ft each · 120 × 80 ft")).toBeInTheDocument();
    expect(
      screen.getByText(/names no level, so a fight on it is played on a plain grid/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /The level/ })).toBeNull();
  });

  it("draws the encounter's level from above, describes it and opens it in the editor", async () => {
    onTheCrypt();
    await renderAt(pagePath);
    expect(
      await screen.findByRole("img", { name: "The level The Crypt, from above" }),
    ).toBeInTheDocument();
    expect(screen.getByText("The Crypt · 6 × 4 squares · 30 × 20 ft")).toBeInTheDocument();
    expect(screen.getByText("Damp stone under the chapel.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in the editor" })).toHaveAttribute(
      "href",
      `/library/levels/${cryptLevelId}`,
    );
  });

  it("shows the roster and the notes attached to it", async () => {
    await renderAt(pagePath);
    await screen.findByRole("heading", { name: "Roster" });
    const roster = screen.getByRole("heading", { name: "Roster" }).closest("[data-slot=card]");
    expect(within(roster as HTMLElement).getByText("Goblin Boss")).toBeInTheDocument();
    expect(within(roster as HTMLElement).getByText("×6")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByText("Read aloud at the water")).toBeInTheDocument();
    // Written in one place: the pencil opens the note on the Notes tab.
    expect(
      screen.getByRole("button", { name: "Edit Read aloud at the water in Notes" }),
    ).toHaveAttribute("href", `/campaigns/${campaignId}/notes?note=${readAloud.id}`);
  });

  it("edits the encounter in the encounter builder", async () => {
    await renderAt(pagePath);
    await screen.findByRole("heading", { name: "Battle map" });
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute(
      "href",
      `${pagePath}/edit`,
    );
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("Ambush in the reeds");
    // A saved encounter's place is its level's description, not a line here.
    expect(screen.queryByRole("textbox", { name: "Location" })).toBeNull();
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
    // A shared encounter is a row a player may read — but its roster is not.
    server.routes.set(`GET /campaigns/${campaignId}/encounters/${encounterId}`, {
      status: 200,
      body: { ...encounter, visibility: "shared" },
    });
    server.routes.set(`GET ${rosterPath}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "encounter", id: encounterId },
    });
    await renderAt(pagePath);

    expect(await screen.findByText("The DM's side of the screen")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Battle map" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Encounter actions" })).toBeNull();
  });

  it("falls back to the list from an id it could not read", async () => {
    await renderAt(`/campaigns/${campaignId}/encounters/not-a-uuid`);
    expect(await screen.findByRole("link", { name: "Ambush in the reeds" })).toBeInTheDocument();
  });
});

describe("deleting an encounter", () => {
  const deletePath = pagePath;
  const listPath = `/campaigns/${campaignId}/encounters`;
  const reads = (path: string) =>
    server.calls.filter((call) => call.method === "GET" && call.pathname === path).length;

  const openConfirmation = async () => {
    await renderAt(pagePath);
    await screen.findByRole("heading", { name: "Battle map" });
    await userEvent.click(screen.getByRole("button", { name: "Encounter actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete encounter" }));
    return screen.findByRole("dialog", { name: /Delete Ambush in the reeds/ });
  };

  it("says what goes and what stays, and cancelling writes nothing", async () => {
    const dialog = await openConfirmation();
    expect(within(dialog).getByText(/encounter and its creature list are deleted/)).toBeVisible();
    expect(within(dialog).getByText(/attached to it stays on the Notes tab/)).toBeVisible();
    expect(within(dialog).getByText(/fight on the table now keeps its/)).toBeVisible();

    await userEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);
    expect(globalThis.location.pathname).toBe(pagePath);
  });

  it("deletes, lands on the Encounters tab and re-reads the list and the notes", async () => {
    server.routes.set(`DELETE ${deletePath}`, { status: 204, body: undefined });
    const dialog = await openConfirmation();
    const listBefore = reads(listPath);
    const notesBefore = reads(`/campaigns/${campaignId}/notes`);

    await userEvent.click(within(dialog).getByRole("button", { name: "Delete encounter" }));

    await waitFor(() => expect(globalThis.location.pathname).toBe(listPath));
    expect(
      server.calls.filter((call) => call.method === "DELETE" && call.pathname === deletePath),
    ).toHaveLength(1);
    // The Encounters tab and the Overview's Next session both draw from this read.
    await waitFor(() => expect(reads(listPath)).toBeGreaterThan(listBefore));
    expect(reads(`/campaigns/${campaignId}/notes`)).toBeGreaterThan(notesBefore);
  });
});
