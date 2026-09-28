import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cazrilSheet,
  cazrilSheetSummary,
  cazrilSource,
  coreOptions,
  goblin,
  installStubServer,
  page,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";

const server = installStubServer();

beforeEach(() => {
  server.reset();
});

afterEach(() => cleanup());

const sourcePath = `/library/npcs/${cazrilSource.id}`;
const sheetPath = `${sourcePath}/sheet`;
const sourceSheet = { ...cazrilSheet, npcId: cazrilSource.id };

const sheetCalls = (method: string) =>
  server.calls.filter((call) => call.method === method && call.pathname === sheetPath);

const renderPage = async () => {
  await renderAt(sourcePath);
  return await screen.findByText(/No stats yet|Level 5 Human Fighter/);
};

describe("LibraryNpcScreen", () => {
  it("draws under the Library's header with the NPCs shelf lit, and says there are no stats yet", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Library" })).toBeInTheDocument();
    expect(screen.getByText("Cazril · the ferryman at the crossing")).toBeInTheDocument();
    const shelves = screen.getByRole("navigation", { name: "Library shelves" });
    expect(within(shelves).getByRole("link", { name: "NPCs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "NPC sources" })).toHaveAttribute(
      "href",
      "/library/npcs",
    );

    expect(screen.getByText("No stats yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit stats" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.getByRole("button", { name: "Write one" })).toBeInTheDocument();
  });

  it("starts one from the owner's own bestiary, through the Library endpoint", async () => {
    server.routes.set(`GET /library/creatures`, { status: 200, body: page([goblin]) });
    server.routes.set(`PUT ${sheetPath}`, { status: 200, body: sourceSheet });
    await renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Start from a bestiary NPC" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Start Cazril’s stats from the bestiary",
    });
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Start from Goblin Boss" }),
    );
    // A Library original is in no campaign: the Library and the bundle, narrowed to humanoids.
    const list = server.calls.find(
      (call) => call.method === "GET" && call.pathname === "/library/creatures",
    );
    expect(new URLSearchParams(list?.search).getAll("types")).toEqual(["humanoid"]);
    expect(server.calls.some((call) => /^\/campaigns\//.test(call.pathname))).toBe(false);

    server.routes.set(`GET ${sheetPath}`, { status: 200, body: sourceSheet });
    await userEvent.click(within(dialog).getByRole("button", { name: "Start from Goblin Boss" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const [put] = sheetCalls("PUT");
    expect(JSON.parse(put!.body)).toMatchObject({ ac: 17, hpMax: 21, cr: "1" });
  });

  it("writes one through the owner's Library endpoint, never a campaign's", async () => {
    server.routes.set(`PUT ${sheetPath}`, { status: 200, body: sourceSheet });
    await renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Write one" }));
    const dialog = await screen.findByRole("dialog", { name: "Write Cazril’s stats" });
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "Level" }), "5");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Class" }), "Fighter");
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Race" }), "Human");
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "AC" }), "17");
    await userEvent.type(within(dialog).getByRole("spinbutton", { name: "Hit points" }), "44");

    server.routes.set(`GET ${sheetPath}`, { status: 200, body: sourceSheet });
    await userEvent.click(within(dialog).getByRole("button", { name: "Write stats" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const [put] = sheetCalls("PUT");
    expect(JSON.parse(put!.body)).toEqual({
      level: 5,
      race: "Human",
      subrace: null,
      className: "Fighter",
      ac: 17,
      hpMax: 44,
      cr: null,
      sheet: { abilities: [], traits: [] },
    });
    expect(server.calls.some((call) => call.pathname.startsWith("/campaigns/"))).toBe(false);
    expect(
      await screen.findByRole("heading", { name: "Level 5 Human Fighter" }),
    ).toBeInTheDocument();
  });

  it("starts one from a class and level over the core rules, through the owner's endpoint", async () => {
    server.routes.set("GET /library/options/core", { status: 200, body: coreOptions });
    server.routes.set(`PUT ${sheetPath}`, { status: 200, body: sourceSheet });
    await renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Start from class and level" }));
    const dialog = await screen.findByRole("dialog", { name: "Start Cazril from a class" });
    await userEvent.click(await within(dialog).findByRole("combobox", { name: "Class" }));
    // The core rules: the bundle's classes, and no campaign's own.
    expect(screen.queryByRole("option", { name: "Bloodsworn" })).toBeNull();
    await userEvent.click(await screen.findByRole("option", { name: "Fighter" }));
    const level = within(dialog).getByRole("spinbutton", { name: "Level" });
    await userEvent.clear(level);
    await userEvent.type(level, "3");

    server.routes.set(`GET ${sheetPath}`, { status: 200, body: sourceSheet });
    await userEvent.click(within(dialog).getByRole("button", { name: "Write stats" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const [put] = sheetCalls("PUT");
    expect(JSON.parse(put!.body)).toMatchObject({ level: 3, className: "Fighter", hpMax: 22 });
    expect(server.calls.some((call) => call.pathname.startsWith("/campaigns/"))).toBe(false);
  });

  it("draws a written sheet and edits its identity with the version it read", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: sourceSheet });
    server.routes.set(`PATCH ${sheetPath}`, {
      status: 200,
      body: { ...sourceSheet, ac: 18, version: 4 },
    });
    await renderPage();

    expect(screen.getByText("CR 3 · 700 XP")).toBeInTheDocument();
    const document = screen.getByRole("region", { name: "Cazril's sheet" });
    expect(within(document).getByText("Second Wind")).toBeInTheDocument();
    // The section editors, and nothing that rolls or spends.
    expect(
      within(document)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Abilities", "Skills", "Add"]);

    await userEvent.click(screen.getByRole("button", { name: "Edit stats" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Cazril’s stats" });
    const ac = within(dialog).getByRole("spinbutton", { name: "AC" });
    await userEvent.clear(ac);
    await userEvent.type(ac, "18");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const [patch] = sheetCalls("PATCH");
    expect(JSON.parse(patch!.body)).toEqual({ expectedVersion: 3, ac: 18 });
  });

  it("edits the document through the owner's Library endpoint, and picks spells from the core rules", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: sourceSheet });
    server.routes.set(`PATCH ${sheetPath}`, {
      status: 200,
      body: { ...sourceSheet, version: 4 },
    });
    const document = await (async () => {
      await renderPage();
      return screen.getByRole("region", { name: "Cazril's sheet" });
    })();

    await userEvent.click(within(document).getByRole("button", { name: "Edit skills" }));
    const dialog = await screen.findByRole("dialog", { name: "Skills" });
    await userEvent.click(within(dialog).getByRole("switch", { name: "Athletics" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save skills" }));
    await waitFor(() => expect(sheetCalls("PATCH")).toHaveLength(1));
    expect(JSON.parse(sheetCalls("PATCH")[0]!.body)).toEqual({
      expectedVersion: 3,
      sheet: {
        ...sourceSheet.sheet,
        skills: [{ name: "Athletics", ability: "STR", proficient: true }],
      },
    });
    // Nothing under a campaign's path.
    expect(server.calls.some((call) => call.pathname.startsWith("/campaigns"))).toBe(false);
  });

  it("reads an original's spell list from the core rules, under /library", async () => {
    server.routes.set(`GET ${sheetPath}`, {
      status: 200,
      body: {
        ...sourceSheet,
        sheet: {
          ...sourceSheet.sheet,
          spellcasting: { ability: "CHA", save: "13", attack: "+5", known: [] },
          resources: [
            {
              id: "slot:1",
              name: "Level 1 slots",
              max: 2,
              used: 0,
              recharge: "long",
              derived: true,
            },
          ],
        },
      },
    });
    server.routes.set(`GET ${sheetPath}/spells`, {
      status: 200,
      body: {
        npcId: cazrilSource.id,
        className: "Fighter",
        level: 5,
        highestSlotLevel: 1,
        mode: "none",
        limits: {},
        spells: [],
      },
    });
    await renderPage();
    const document = screen.getByRole("region", { name: "Cazril's sheet" });
    await userEvent.click(within(document).getByRole("button", { name: "Edit spells" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose spells" });
    expect(
      await within(dialog).findByText(
        "No spells are available for this class and level in the core rules.",
      ),
    ).toBeInTheDocument();
    expect(server.calls.some((call) => call.pathname === `${sheetPath}/spells`)).toBe(true);
  });

  it("removes the original's sheet once asked, and says a campaign copy keeps its own", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: sourceSheet });
    server.routes.set(`DELETE ${sheetPath}`, { status: 204, body: null });
    await renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove Cazril’s stats?" });
    expect(within(dialog).getByText(/stays in your Library/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/copy already in a campaign keeps its own/),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/cast/)).toBeNull();

    server.routes.set(`GET ${sheetPath}`, { status: 200, body: null });
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove stats" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sheetCalls("DELETE")).toHaveLength(1);
    expect(await screen.findByText("No stats yet")).toBeInTheDocument();
  });

  it("re-reads the shelf's card line after a write", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: sourceSheet });
    server.routes.set(`PATCH ${sheetPath}`, {
      status: 200,
      body: { ...sourceSheet, ac: 18, version: 4 },
    });
    await renderAt("/library/npcs");
    await screen.findByText("Cazril");
    const shelfReads = () =>
      server.calls.filter(
        (call) => call.method === "GET" && call.pathname === "/library/npcs/-/sheets",
      ).length;
    const before = shelfReads();

    await userEvent.click(screen.getByRole("link", { name: "Cazril" }));
    await screen.findByText("Level 5 Human Fighter");
    await userEvent.click(screen.getByRole("button", { name: "Edit stats" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Cazril’s stats" });
    const ac = within(dialog).getByRole("spinbutton", { name: "AC" });
    await userEvent.clear(ac);
    await userEvent.type(ac, "18");
    server.routes.set("GET /library/npcs/-/sheets", {
      status: 200,
      body: [{ ...cazrilSheetSummary, npcId: cazrilSource.id, ac: 18 }],
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(screen.getByRole("link", { name: "NPC sources" }));
    expect(
      await screen.findByText("Level 5 Human Fighter · AC 18 · HP 44 · CR 3"),
    ).toBeInTheDocument();
    expect(shelfReads()).toBeGreaterThan(before);
  });

  it("says an original it cannot reach is not here, the same for another account's as a missing one", async () => {
    server.routes.set(`GET ${sourcePath}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "npc", id: cazrilSource.id },
    });
    server.routes.set(`GET ${sheetPath}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "npc", id: cazrilSource.id },
    });
    await renderAt(sourcePath);

    expect(await screen.findByText("Not here")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Write one" })).toBeNull();
  });

  it("falls back to the shelf on a half-typed link", async () => {
    await renderAt("/library/npcs/not-a-uuid");
    expect(await screen.findByText("Cazril")).toBeInTheDocument();
    expect(screen.getByText("1 NPC source")).toBeInTheDocument();
  });
});
