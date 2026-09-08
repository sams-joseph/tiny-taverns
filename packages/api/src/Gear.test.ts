import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { CharacterSheet } from "./Character.js";
import { Equipment } from "./Equipment.js";
import {
  gearLineFor,
  kitEquipmentOf,
  linkedEquipmentIds,
  sheetWithGear,
  weightLabel,
} from "./Gear.js";

/**
 * Gear after creation, held to the one claim that matters: a weapon picked
 * onto the sheet a month later gets the line the starting kit would have
 * written for it, through the same `weaponAttack`, and loses it again when the
 * gear goes — while everything the player typed by hand is left alone.
 */

const rowOf = (id: string, name: string, facts: Partial<Record<string, unknown>> = {}): Equipment =>
  Schema.decodeUnknownSync(Equipment)({
    id,
    campaignId: null,
    accountId: null,
    derivedFrom: null,
    name,
    sourceKey: name.toLowerCase().replace(/[^a-z]+/g, "-"),
    categoryIndex: "adventuring-gear",
    categoryName: "Adventuring Gear",
    costQuantity: 1,
    costUnit: "gp",
    costGp: 1,
    weight: null,
    gearCategoryIndex: null,
    gearCategoryName: null,
    armorCategory: null,
    weaponCategory: null,
    weaponRange: null,
    categoryRange: null,
    toolCategory: null,
    vehicleCategory: null,
    armorClassBase: null,
    armorClassDexBonus: null,
    armorClassMaxBonus: null,
    strengthMinimum: null,
    stealthDisadvantage: null,
    damageDice: null,
    damageTypeIndex: null,
    damageTypeName: null,
    twoHandedDamageDice: null,
    rangeNormal: null,
    rangeLong: null,
    throwRangeNormal: null,
    throwRangeLong: null,
    propertyIndexes: [],
    propertyNames: [],
    equipment: {
      equipmentCategory: { index: "adventuring-gear", name: "Adventuring Gear" },
      cost: { quantity: 1, unit: "gp" },
    },
    visibility: "shared",
    origin: "system",
    assistantTurnId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...facts,
  });

const LONGSWORD = rowOf("2b1f2a1e-0000-4000-8000-0000000e0101", "Longsword", {
  categoryIndex: "weapon",
  categoryName: "Weapon",
  costQuantity: 15,
  costGp: 15,
  weight: 3,
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
});
const SHORTBOW = rowOf("2b1f2a1e-0000-4000-8000-0000000e0102", "Shortbow", {
  categoryIndex: "weapon",
  categoryName: "Weapon",
  weight: 2,
  weaponCategory: "Simple",
  weaponRange: "Ranged",
  categoryRange: "Simple Ranged",
  damageDice: "1d6",
  damageTypeIndex: "piercing",
  damageTypeName: "Piercing",
  rangeNormal: 80,
  rangeLong: 320,
  propertyIndexes: ["ammunition", "two-handed"],
  propertyNames: ["Ammunition", "Two-Handed"],
});
const ROPE = rowOf("2b1f2a1e-0000-4000-8000-0000000e0103", "Rope, hempen (50 feet)", {
  weight: 10,
  gearCategoryIndex: "standard-gear",
  gearCategoryName: "Standard Gear",
});

const sheet: CharacterSheet = {
  notes: "",
  abilities: [
    { label: "STR", score: "16", modifier: "+3" },
    { label: "DEX", score: "14", modifier: "+2" },
    { label: "CON", score: "15", modifier: "+2" },
    { label: "INT", score: "8", modifier: "-1" },
    { label: "WIS", score: "12", modifier: "+1" },
    { label: "CHA", score: "10", modifier: "+0" },
  ],
  traits: [],
  identity: { proficiency: "+2" },
  proficiencies: ["Simple Weapons", "Martial Weapons"],
  inventory: [{ name: "Longsword", equipmentId: LONGSWORD.id }],
  actions: [
    {
      id: "atk:longsword",
      name: "Longsword",
      cost: "action",
      hit: "+5",
      dice: "1d8+3",
      damageType: "Slashing",
      text: "Martial Melee · Versatile (1d10)",
      source: "weapon",
      equipmentId: LONGSWORD.id,
      derived: true,
    },
    { id: "attack:improvised", name: "Thrown tankard", hit: "+3", dice: "1d4", source: "other" },
  ],
};

describe("kitEquipmentOf", () => {
  it("carries the weapon columns across under the kit's names", () => {
    expect(kitEquipmentOf(LONGSWORD)).toEqual({
      id: LONGSWORD.id,
      index: "longsword",
      name: "Longsword",
      weaponCategory: "Martial",
      weaponRange: "Melee",
      categoryRange: "Martial Melee",
      armorCategory: null,
      damageDice: "1d8",
      damageType: "Slashing",
      twoHandedDamageDice: "1d10",
      rangeNormal: 5,
      rangeLong: null,
      throwRangeNormal: null,
      throwRangeLong: null,
      properties: ["Versatile"],
      weight: 3,
      gearCategoryIndex: null,
      toolCategory: null,
    });
  });
});

describe("gearLineFor", () => {
  it("writes the name, the weight as the sheet spells it, and the link", () => {
    expect(gearLineFor(ROPE)).toEqual({
      name: "Rope, hempen (50 feet)",
      weight: "10 lb",
      equipmentId: ROPE.id,
    });
    expect(weightLabel(0.5)).toBe("1/2 lb");
  });

  it("writes no weight for a row that has none", () => {
    expect(gearLineFor(rowOf("2b1f2a1e-0000-4000-8000-0000000e0199", "Candle"))).toEqual({
      name: "Candle",
      equipmentId: "2b1f2a1e-0000-4000-8000-0000000e0199",
    });
  });
});

describe("linkedEquipmentIds", () => {
  it("lists each linked row once, sorted, and skips typed and severed lines", () => {
    expect(
      linkedEquipmentIds({
        ...sheet,
        inventory: [
          { name: "Rope", equipmentId: ROPE.id },
          { name: "Longsword", equipmentId: LONGSWORD.id },
          { name: "Longsword, spare", equipmentId: LONGSWORD.id },
          { name: "A stick" },
          { name: "Old shield", equipmentId: null },
        ],
      }),
    ).toEqual([LONGSWORD.id, ROPE.id]);
  });
});

describe("sheetWithGear", () => {
  it("derives a line for a weapon just picked, through the kit's own rule", () => {
    const next = sheetWithGear(
      sheet,
      [...(sheet.inventory ?? []), gearLineFor(SHORTBOW)],
      [kitEquipmentOf(LONGSWORD), kitEquipmentOf(SHORTBOW)],
    );
    expect(next.inventory).toHaveLength(2);
    expect(next.actions).toEqual([
      sheet.actions![0],
      sheet.actions![1],
      {
        id: "atk:shortbow",
        name: "Shortbow",
        cost: "action",
        // DEX +2, proficient with simple weapons: +4 to hit, 1d6+2.
        hit: "+4",
        dice: "1d6+2",
        damageType: "Piercing",
        range: "80/320 ft.",
        text: "Simple Ranged · Ammunition · Two-Handed",
        source: "weapon",
        equipmentId: SHORTBOW.id,
        derived: true,
      },
    ]);
  });

  it("retires the derived attack when its gear leaves the pack, and keeps a typed one", () => {
    const next = sheetWithGear(sheet, [{ name: "A stick" }], [kitEquipmentOf(LONGSWORD)]);
    expect(next.actions?.map((action) => action.id)).toEqual(["attack:improvised"]);
  });

  it("keeps an existing derived line as written rather than recomputing it", () => {
    const next = sheetWithGear(sheet, sheet.inventory ?? [], [kitEquipmentOf(LONGSWORD)]);
    expect(next.actions).toEqual(sheet.actions);
  });

  it("gives a non-weapon no line, and a linked row it cannot resolve nothing new", () => {
    const next = sheetWithGear(
      sheet,
      [
        ...(sheet.inventory ?? []),
        gearLineFor(ROPE),
        { name: "Mystery blade", equipmentId: "2b1f2a1e-0000-4000-8000-0000000e0999" as never },
      ],
      [kitEquipmentOf(LONGSWORD), kitEquipmentOf(ROPE)],
    );
    expect(next.actions?.map((action) => action.id)).toEqual([
      "atk:longsword",
      "attack:improvised",
    ]);
  });

  it("reads Extra Attack back off a line the kit wrote, so a picked weapon says ×2 too", () => {
    const withExtra: CharacterSheet = {
      ...sheet,
      actions: [{ ...sheet.actions![0]!, text: "Martial Melee · Versatile (1d10) · Attack ×2" }],
    };
    const next = sheetWithGear(
      withExtra,
      [...(withExtra.inventory ?? []), gearLineFor(SHORTBOW)],
      [kitEquipmentOf(SHORTBOW)],
    );
    expect(next.actions?.[1]?.text).toBe("Simple Ranged · Ammunition · Two-Handed · Attack ×2");
  });

  it("swings at the bare modifier when the sheet carries no proficiency bonus", () => {
    const bare: CharacterSheet = { ...sheet, identity: {}, actions: [] };
    const next = sheetWithGear(bare, [gearLineFor(SHORTBOW)], [kitEquipmentOf(SHORTBOW)]);
    expect(next.actions?.[0]?.hit).toBe("+2");
  });
});
