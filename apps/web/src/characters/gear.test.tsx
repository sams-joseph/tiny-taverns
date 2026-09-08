import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hempRope } from "../campaign/campaign.fixtures";
import {
  bodyOf,
  brannoc,
  brannocId,
  brannocSeatRef,
  installCharacterServer,
  ownedSorrel,
  renderSheet,
  savedAs,
} from "./characters.fixtures";

/**
 * **A character's gear is the equipment table's rows** — the captain's report
 * of 2026-09-08, held to the two surfaces this file drives:
 *
 * - the Gear section draws a linked line's row (what kind of thing it is, what
 *   it rolls or is worth, its weight from the row when none was typed), and an
 *   unlinked line exactly as it always did;
 * - the Gear dialog picks a row from the catalogue onto the sheet with its
 *   link, keeps the link through a rename, derives a picked weapon's attack
 *   through the kit's own rule, and retires that attack when the line goes.
 *
 * The fixtures are the character fixtures' Brannoc with his halberd line
 * linked to its row — the state every kit-written sheet is in — and two
 * `equipment` rows answered by `GET /library/equipment` whatever the query,
 * because the stub keys on the path: the sheet's `ids` read and the picker's
 * search both land on the same page.
 */

const HALBERD_ID = "2b1f2a1e-0000-4000-8000-0000000e0001";
const LONGSWORD_ID = "2b1f2a1e-0000-4000-8000-0000000e0101";

const halberdRow = {
  ...hempRope,
  id: HALBERD_ID,
  name: "Halberd",
  sourceKey: "halberd",
  categoryIndex: "weapon",
  categoryName: "Weapon",
  costQuantity: 20,
  costGp: 20,
  weight: 6,
  gearCategoryIndex: null,
  gearCategoryName: null,
  weaponCategory: "Martial",
  weaponRange: "Melee",
  categoryRange: "Martial Melee",
  damageDice: "1d10",
  damageTypeIndex: "slashing",
  damageTypeName: "Slashing",
  rangeNormal: 5,
  propertyIndexes: ["heavy", "reach", "two-handed"],
  propertyNames: ["Heavy", "Reach", "Two-Handed"],
  equipment: {
    equipmentCategory: { index: "weapon", name: "Weapon" },
    cost: { quantity: 20, unit: "gp" },
  },
};
const longswordRow = {
  ...halberdRow,
  id: LONGSWORD_ID,
  name: "Longsword",
  sourceKey: "longsword",
  costQuantity: 15,
  costGp: 15,
  weight: 3,
  damageDice: "1d8",
  twoHandedDamageDice: "1d10",
  propertyIndexes: ["versatile"],
  propertyNames: ["Versatile"],
};

/** Brannoc as the kit wrote him: the halberd line names its row, the token does not. */
const linkedBrannoc = {
  ...brannoc,
  sheet: {
    ...brannoc.sheet,
    inventory: [
      { name: "Halberd", quantity: 1, equipped: true, equipmentId: HALBERD_ID },
      { name: "Ferryman's token, unspent", quantity: 1, weight: "—", note: "From session 11" },
    ],
  },
};

const server = installCharacterServer();
const patchPath = `/me/characters/${brannocId}`;

beforeEach(() => {
  server.reset();
  server.routes.set("GET /me/characters", {
    status: 200,
    body: [{ character: linkedBrannoc, seats: [brannocSeatRef] }, ownedSorrel],
  });
  server.routes.set("GET /library/equipment", {
    status: 200,
    body: { items: [halberdRow, longswordRow], nextCursor: null },
  });
  server.routes.set(`PATCH ${patchPath}`, savedAs(linkedBrannoc));
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

/** The Gear section's own box — `DocumentSection` gives it the spine's anchor id. */
const gearSection = async () => {
  await screen.findByRole("heading", { name: "Gear & coin" });
  return within(document.getElementById("sheet-gear") as HTMLElement);
};

const sent = () =>
  bodyOf(server, "PATCH", patchPath) as
    | {
        sheet: {
          inventory: ReadonlyArray<Record<string, unknown>>;
          actions: ReadonlyArray<Record<string, unknown>>;
        };
      }
    | undefined;

describe("the gear section draws the row", () => {
  it("reads the linked rows in one request, by id, and draws the row's facts on the line", async () => {
    await renderSheet();
    const gear = await gearSection();

    // One `ids` read, the halberd's id in it, nothing else asked of the shelf.
    const reads = server.calls.filter(
      (call) => call.method === "GET" && call.pathname === "/library/equipment",
    );
    expect(reads).toHaveLength(1);
    expect(reads[0]?.search).toContain(`ids=${HALBERD_ID}`);

    // The linked line: the compact facts under the name, the row's weight
    // (nothing was typed), and a press that opens the full grid.
    expect(gear.getByText("Martial Melee · 1d10 slashing · 20 gp")).toBeTruthy();
    expect(gear.getByText("6 lb")).toBeTruthy();
    await userEvent.click(gear.getByRole("button", { name: "Show details for Halberd" }));
    expect(gear.getByText("Properties")).toBeTruthy();
    expect(gear.getByText("Heavy, Reach, Two-Handed")).toBeTruthy();
    expect(gear.getByText("Reach 10 ft.")).toBeTruthy();
    await userEvent.click(gear.getByRole("button", { name: "Hide details for Halberd" }));
    expect(gear.queryByText("Properties")).toBeNull();

    // The unlinked line: as it always was — its typed weight, no facts, no press.
    expect(gear.getByText("Ferryman's token, unspent")).toBeTruthy();
    expect(gear.getByText("—")).toBeTruthy();
    expect(gear.queryByRole("button", { name: /details for Ferryman's token/ })).toBeNull();
  });

  it("draws a line whose row is out of reach exactly as an unlinked one, and asks for nothing when nothing is linked", async () => {
    server.routes.set("GET /library/equipment", {
      status: 200,
      body: { items: [], nextCursor: null },
    });
    await renderSheet();
    const gear = await gearSection();
    expect(gear.getByText("Halberd")).toBeTruthy();
    expect(gear.queryByText(/Martial Melee/)).toBeNull();
    expect(gear.queryByRole("button", { name: /details for Halberd/ })).toBeNull();

    cleanup();
    document.body.replaceChildren();
    server.calls.length = 0;
    server.routes.set("GET /me/characters", {
      status: 200,
      body: [{ character: brannoc, seats: [brannocSeatRef] }, ownedSorrel],
    });
    await renderSheet();
    await gearSection();
    expect(server.calls.some((call) => call.pathname === "/library/equipment")).toBe(false);
  });
});

describe("picking gear from the catalogue", () => {
  const openGear = async () => {
    const gear = await gearSection();
    await userEvent.click(gear.getByRole("button", { name: /^Add$/ }));
    await screen.findByRole("button", { name: "Save gear" });
  };

  it("adds a linked line with the row's name and weight, and derives the weapon's attack", async () => {
    await renderSheet();
    await openGear();
    await userEvent.click(screen.getByRole("button", { name: "Pick from the catalogue" }));
    const list = await screen.findByRole("list", { name: "Equipment to pick from" });
    await userEvent.click(within(list).getByRole("button", { name: "Add Longsword" }));

    // The pick landed as a line, said to be linked, with the row's weight.
    const names = screen.getAllByRole("textbox", { name: "Item" }) as HTMLInputElement[];
    expect(names.map((box) => box.value)).toEqual([
      "Halberd",
      "Ferryman's token, unspent",
      "Longsword",
      "",
    ]);
    expect(screen.getAllByText("Linked to Longsword")).toHaveLength(1);
    expect(screen.getAllByText("Linked to Halberd")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Save gear" }));
    await waitFor(() => expect(sent()).toBeDefined());
    const sheet = sent()!.sheet;
    expect(sheet.inventory).toEqual([
      { name: "Halberd", quantity: 1, equipped: true, equipmentId: HALBERD_ID },
      { name: "Ferryman's token, unspent", quantity: 1, weight: "—", note: "From session 11" },
      { name: "Longsword", weight: "3 lb", equipmentId: LONGSWORD_ID },
    ]);
    // The halberd's attack is kept as written; the longsword's is derived
    // through the kit's own rule — STR +4 on this sheet, proficient with
    // martial weapons (`All armour`/`Shields`/`Orcish` say nothing, so the
    // bonus is the modifier alone), Attack ×2 read off the halberd's line.
    expect(sheet.actions.map((action) => action["id"])).toEqual([
      "atk:halberd",
      "feat:divine-smite",
      "feat:lay-on-hands",
      "atk:longsword",
    ]);
    expect(sheet.actions[3]).toEqual({
      id: "atk:longsword",
      name: "Longsword",
      cost: "action",
      hit: "+4",
      dice: "1d8+4",
      damageType: "Slashing",
      text: "Martial Melee · Versatile (1d10) · Attack ×2",
      source: "weapon",
      equipmentId: LONGSWORD_ID,
      derived: true,
    });
  });

  it("keeps the link when a linked line is renamed", async () => {
    await renderSheet();
    await openGear();
    const halberd = screen.getAllByRole("textbox", { name: "Item" })[0]!;
    await userEvent.clear(halberd);
    await userEvent.type(halberd, "Grandfather's halberd");
    await userEvent.click(screen.getByRole("button", { name: "Save gear" }));

    await waitFor(() => expect(sent()).toBeDefined());
    expect(sent()!.sheet.inventory[0]).toEqual({
      name: "Grandfather's halberd",
      quantity: 1,
      equipped: true,
      equipmentId: HALBERD_ID,
    });
    expect(sent()!.sheet.actions.map((action) => action["id"])).toContain("atk:halberd");
  });

  it("retires the derived attack when the linked line is removed", async () => {
    await renderSheet();
    await openGear();
    await userEvent.click(screen.getByRole("button", { name: "Remove item 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save gear" }));

    await waitFor(() => expect(sent()).toBeDefined());
    expect(sent()!.sheet.inventory.map((item) => item["name"])).toEqual([
      "Ferryman's token, unspent",
    ]);
    expect(sent()!.sheet.actions.map((action) => action["id"])).toEqual([
      "feat:divine-smite",
      "feat:lay-on-hands",
    ]);
  });
});
