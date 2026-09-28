import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import {
  campaignId,
  cazrilSheet,
  hempRope,
  installStubServer,
  npcId,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";

/**
 * **An NPC's sheet is edited by the character sheet's own section editors** —
 * the abilities, skills, spells and gear dialogs — through the NPC's target:
 * each save is a PATCH of the whole document to the creator's
 * `…/npcs/:npcId/sheet`, with the version it read and no identity column, so
 * the server keeps the document as sent. The spell picker reads the NPC's
 * spell list (`…/sheet/spells`), never a character's. The sheet edits but
 * does not play: nothing on it rolls or spends.
 */

const server = installStubServer();
const sheetPath = `/campaigns/${campaignId}/npcs/${npcId}/sheet`;
const spellsPath = `${sheetPath}/spells`;

const LONGSWORD_ID = "2b1f2a1e-0000-4000-8000-0000000e0101";
const SHIELD_ID = "2b1f2a1e-0000-4000-8000-00000000f1ee";

const longswordRow = {
  ...hempRope,
  id: LONGSWORD_ID,
  name: "Longsword",
  sourceKey: "longsword",
  categoryIndex: "weapon",
  categoryName: "Weapon",
  costQuantity: 15,
  costGp: 15,
  weight: 3,
  gearCategoryIndex: null,
  gearCategoryName: null,
  weaponCategory: "Martial",
  weaponRange: "Melee",
  categoryRange: "Martial Melee",
  damageDice: "1d8",
  damageTypeIndex: "slashing",
  damageTypeName: "Slashing",
  twoHandedDamageDice: "1d10",
  rangeNormal: 5,
  propertyIndexes: ["versatile"],
  propertyNames: ["Versatile"],
  equipment: {
    equipmentCategory: { index: "weapon", name: "Weapon" },
    cost: { quantity: 15, unit: "gp" },
  },
};

/** Cazril as a caster: one level-1 slot row, and nothing picked yet. */
const casterSheet = {
  ...cazrilSheet,
  className: "Paladin",
  descriptor: "Level 5 Human Paladin",
  sheet: {
    ...cazrilSheet.sheet,
    resources: [
      { id: "slot:1", name: "Level 1 slots", max: 2, used: 0, recharge: "long", derived: true },
    ],
    spellcasting: { ability: "CHA", save: "13", attack: "+5", known: [] },
  },
};

const shield = {
  id: SHIELD_ID,
  campaignId: null,
  accountId: null,
  derivedFrom: null,
  name: "Shield",
  level: 1,
  schoolIndex: "abjuration",
  schoolName: "Abjuration",
  ritual: false,
  concentration: false,
  castingTime: "1 reaction",
  range: "Self",
  duration: "1 round",
  classIndexes: ["paladin"],
  classNames: ["Paladin"],
  subclassIndexes: [],
  subclassNames: [],
  spell: {
    desc: ["An invisible barrier of magical force appears and protects you."],
    components: ["V", "S"],
    school: { index: "abjuration", name: "Abjuration" },
    classes: [{ index: "paladin", name: "Paladin" }],
    subclasses: [],
  },
  visibility: "shared",
  origin: "system",
  assistantTurnId: null,
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-01T10:00:00.000Z",
};

beforeEach(() => {
  server.reset();
  server.routes.set(`GET ${sheetPath}`, { status: 200, body: cazrilSheet });
  server.routes.set(`PATCH ${sheetPath}`, {
    status: 200,
    body: { ...cazrilSheet, version: 4 },
  });
  server.routes.set("GET /library/equipment", {
    status: 200,
    body: { items: [longswordRow], nextCursor: null },
  });
});
afterEach(() => cleanup());

const renderStats = async () => {
  await renderAt(`/campaigns/${campaignId}/cast/${npcId}#stats`, (screen) => (
    <HostedSessionScope session={TEST_SESSION}>{screen}</HostedSessionScope>
  ));
  return await screen.findByRole("region", { name: "Cazril's sheet" });
};

const patches = () =>
  server.calls
    .filter((call) => call.method === "PATCH" && call.pathname === sheetPath)
    .map((call) => JSON.parse(call.body) as Record<string, unknown>);

/** The one PATCH: the whole document at the version read, and no identity column. */
const savedSheet = async (): Promise<Record<string, unknown>> => {
  await waitFor(() => expect(patches()).toHaveLength(1));
  const body = patches()[0]!;
  expect(Object.keys(body).sort()).toEqual(["expectedVersion", "sheet"]);
  expect(body["expectedVersion"]).toBe(3);
  return body["sheet"] as Record<string, unknown>;
};

describe("the NPC's document", () => {
  it("offers the section editors, and nothing that rolls or spends", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: casterSheet });
    const document = await renderStats();

    expect(
      within(document)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim()),
    ).toEqual(["Edit abilities", "Edit skills", "Edit spells", "Add"]);
    // The slots draw as pips nobody presses, and no dice tray is kept.
    expect(within(document).getByText("2 of 2 left")).toBeInTheDocument();
    expect(within(document).queryByRole("button", { name: /spell slot/ })).toBeNull();
    expect(screen.queryByText(/Kept here/)).toBeNull();
    // The prompts speak about the NPC, and there is no player's half to write.
    expect(
      within(document).getByText("What they are proficient in, and what they add."),
    ).toBeInTheDocument();
    expect(
      within(document).getByText("A rope, a lantern, what they carry into a fight."),
    ).toBeInTheDocument();
    expect(within(document).queryByText("Story")).toBeNull();
    expect(within(document).queryByRole("button", { name: "Edit backstory" })).toBeNull();
  });
});

describe("editing an NPC's abilities", () => {
  it("sends the six cells in the whole document, and keeps what it did not draw", async () => {
    const document = await renderStats();
    await userEvent.click(within(document).getByRole("button", { name: "Edit abilities" }));
    const dialog = await screen.findByRole("dialog", { name: "Abilities" });
    const str = within(dialog).getByRole("spinbutton", { name: "STR score" });
    await userEvent.clear(str);
    await userEvent.type(str, "18");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save abilities" }));

    const sheet = await savedSheet();
    expect((sheet["abilities"] as ReadonlyArray<unknown>)[0]).toEqual({
      label: "STR",
      score: "18",
      modifier: "+4",
      save: "+6",
    });
    expect(sheet["traits"]).toEqual(cazrilSheet.sheet.traits);
    expect(sheet["actions"]).toEqual(cazrilSheet.sheet.actions);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("editing an NPC's skills", () => {
  it("marks a skill on the NPC's document", async () => {
    const document = await renderStats();
    await userEvent.click(within(document).getByRole("button", { name: "Edit skills" }));
    const dialog = await screen.findByRole("dialog", { name: "Skills" });
    expect(within(dialog).getByText(/Mark what they are proficient in/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("switch", { name: "Athletics" }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Athletics bonus" }), "+6");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save skills" }));

    const sheet = await savedSheet();
    expect(sheet["skills"]).toEqual([
      { name: "Athletics", ability: "STR", bonus: "+6", proficient: true },
    ]);
    expect(sheet["abilities"]).toEqual(cazrilSheet.sheet.abilities);
  });
});

describe("picking an NPC's spells", () => {
  it("reads the NPC's spell list and saves the pick with its action line", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: casterSheet });
    server.routes.set(`GET ${spellsPath}`, {
      status: 200,
      body: {
        npcId,
        className: "Paladin",
        level: 5,
        highestSlotLevel: 2,
        mode: "prepared",
        limits: { cantripsKnown: 0, prepared: 6 },
        spells: [{ list: "class", spell: shield }],
      },
    });
    const document = await renderStats();
    await userEvent.click(within(document).getByRole("button", { name: "Edit spells" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose spells" });
    expect(within(dialog).getByText(/leveled spells they have prepared/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Prepare Shield/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save spells" }));

    const sheet = (await savedSheet()) as {
      readonly spellcasting: { readonly known: ReadonlyArray<unknown> };
      readonly actions: ReadonlyArray<unknown>;
    };
    expect(sheet.spellcasting.known).toEqual([
      expect.objectContaining({ name: "Shield", spellId: SHIELD_ID, prepared: true }),
    ]);
    expect(sheet.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "atk:boathook" }),
        expect.objectContaining({ name: "Shield", spellId: SHIELD_ID, source: "spell" }),
      ]),
    );
    // The NPC's own list, and never a character's.
    expect(server.calls.some((call) => call.pathname === spellsPath)).toBe(true);
    expect(server.calls.some((call) => call.pathname.startsWith("/me/characters"))).toBe(false);
  });

  it("names the campaign's rules when they offer nothing to pick", async () => {
    server.routes.set(`GET ${sheetPath}`, { status: 200, body: casterSheet });
    server.routes.set(`GET ${spellsPath}`, {
      status: 200,
      body: {
        npcId,
        className: "Paladin",
        level: 1,
        highestSlotLevel: 0,
        mode: "none",
        limits: {},
        spells: [],
      },
    });
    const document = await renderStats();
    await userEvent.click(within(document).getByRole("button", { name: "Edit spells" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose spells" });
    expect(
      await within(dialog).findByText(
        "No spells are available for this class and level in this campaign’s rules.",
      ),
    ).toBeInTheDocument();
  });
});

describe("an NPC's gear", () => {
  it("picks a weapon from the catalogue and derives its attack on the NPC's document", async () => {
    const document = await renderStats();
    await userEvent.click(within(document).getByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog", { name: "What Cazril is carrying" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Pick from the catalogue" }));
    const list = await within(dialog).findByRole("list", { name: "Equipment to pick from" });
    await userEvent.click(within(list).getByRole("button", { name: "Add Longsword" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save gear" }));

    const sheet = (await savedSheet()) as {
      readonly inventory: ReadonlyArray<unknown>;
      readonly actions: ReadonlyArray<Record<string, unknown>>;
    };
    expect(sheet.inventory).toEqual([
      { name: "Longsword", weight: "3 lb", equipmentId: LONGSWORD_ID },
    ]);
    // The kit's own attack rule, off Cazril's STR +3.
    expect(sheet.actions.map((action) => action["id"])).toEqual(["atk:boathook", "atk:longsword"]);
    expect(sheet.actions[1]).toMatchObject({
      hit: "+3",
      dice: "1d8+3",
      source: "weapon",
      equipmentId: LONGSWORD_ID,
      derived: true,
    });
  });

  it("reads the rows the NPC's gear names, and draws a linked line's facts", async () => {
    server.routes.set(`GET ${sheetPath}`, {
      status: 200,
      body: {
        ...cazrilSheet,
        sheet: {
          ...cazrilSheet.sheet,
          inventory: [{ name: "Longsword", equipped: true, equipmentId: LONGSWORD_ID }],
        },
      },
    });
    const document = await renderStats();
    const reads = server.calls.filter((call) => call.pathname === "/library/equipment");
    expect(reads).toHaveLength(1);
    expect(new URLSearchParams(reads[0]!.search).getAll("ids")).toEqual([LONGSWORD_ID]);
    expect(within(document).getByText("Longsword")).toBeInTheDocument();
    expect(within(document).getAllByText(/1d8/).length).toBeGreaterThan(0);

    await userEvent.click(within(document).getByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog", { name: "What Cazril is carrying" });
    expect(within(dialog).getByText("Linked to Longsword")).toBeInTheDocument();
  });

  it("asks for no rows when nothing on the sheet is linked", async () => {
    await renderStats();
    expect(server.calls.some((call) => call.pathname === "/library/equipment")).toBe(false);
  });
});

describe("a sheet that moved on under an edit", () => {
  it("says so, and Reload reads it again and closes", async () => {
    server.routes.set(`PATCH ${sheetPath}`, {
      status: 409,
      body: {
        _tag: "Conflict",
        message: "the NPC's sheet moved on while you were editing (version 4, you read 3).",
      },
    });
    const document = await renderStats();
    await userEvent.click(within(document).getByRole("button", { name: "Edit skills" }));
    const dialog = await screen.findByRole("dialog", { name: "Skills" });
    await userEvent.click(within(dialog).getByRole("switch", { name: "Stealth" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save skills" }));
    expect(await within(dialog).findByText(/moved on while you were editing/)).toBeInTheDocument();

    const readsBefore = server.calls.filter(
      (call) => call.method === "GET" && call.pathname === sheetPath,
    ).length;
    await userEvent.click(within(dialog).getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(
        server.calls.filter((call) => call.method === "GET" && call.pathname === sheetPath).length,
      ).toBeGreaterThan(readsBefore),
    );
  });
});
