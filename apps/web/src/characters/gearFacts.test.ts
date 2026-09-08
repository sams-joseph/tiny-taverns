import { Equipment } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { hempRope } from "../campaign/campaign.fixtures";
import { compactGearLine, gearFacts, gearWeight } from "./gearFacts";

/**
 * What a linked gear line says about its row — every branch is plausible
 * English, so each column is pinned to the sentence it makes.
 */
// The fixture's stamps are `DateTime`s that reach the wire through JSON; the
// decoder wants the wire's strings.
const rowOf = (over: Record<string, unknown>): Equipment =>
  Schema.decodeUnknownSync(Equipment)(JSON.parse(JSON.stringify({ ...hempRope, ...over })));

const rope = rowOf({});
const longsword = rowOf({
  id: "2b1f2a1e-0000-4000-8000-0000000e0001",
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
});
const chainMail = rowOf({
  id: "2b1f2a1e-0000-4000-8000-0000000e0004",
  name: "Chain Mail",
  sourceKey: "chain-mail",
  categoryIndex: "armor",
  categoryName: "Armor",
  costQuantity: 75,
  costGp: 75,
  weight: 55,
  gearCategoryIndex: null,
  gearCategoryName: null,
  armorCategory: "Heavy",
  armorClassBase: 16,
  armorClassDexBonus: false,
  strengthMinimum: 13,
  stealthDisadvantage: true,
});
const shortbow = rowOf({
  ...longsword,
  id: "2b1f2a1e-0000-4000-8000-0000000e0005",
  name: "Shortbow",
  sourceKey: "shortbow",
  weaponCategory: "Simple",
  weaponRange: "Ranged",
  categoryRange: "Simple Ranged",
  damageDice: "1d6",
  damageTypeName: "Piercing",
  twoHandedDamageDice: null,
  rangeNormal: 80,
  rangeLong: 320,
  propertyNames: ["Ammunition", "Two-Handed"],
  weight: 2,
});

describe("compactGearLine", () => {
  it("says kind, the roll and the cost for a weapon", () => {
    expect(compactGearLine(longsword)).toBe(
      "Martial Melee · 1d8 slashing (1d10 two-handed) · 15 gp",
    );
  });
  it("says kind, the armour class and the cost for armour", () => {
    expect(compactGearLine(chainMail)).toBe("Heavy armour · AC 16 · 75 gp");
  });
  it("says the gear category and the cost for plain gear", () => {
    expect(compactGearLine(rope)).toBe("Standard Gear · 1 gp");
  });
});

describe("gearFacts", () => {
  it("lists everything a weapon's columns say, in a fixed order", () => {
    expect(gearFacts(shortbow)).toEqual([
      { label: "Category", value: "Simple Ranged" },
      { label: "Damage", value: "1d6 piercing" },
      { label: "Range", value: "80/320 ft." },
      { label: "Properties", value: "Ammunition, Two-Handed" },
      { label: "Cost", value: "15 gp" },
      { label: "Weight", value: "2 lb" },
    ]);
  });
  it("lists the armour's class, strength floor and stealth, and nothing a weapon has", () => {
    expect(gearFacts(chainMail)).toEqual([
      { label: "Category", value: "Heavy armour" },
      { label: "Armour class", value: "AC 16" },
      { label: "Strength", value: "13 minimum" },
      { label: "Stealth", value: "Disadvantage" },
      { label: "Cost", value: "75 gp" },
      { label: "Weight", value: "55 lb" },
    ]);
  });
  it("spells light armour's dexterity bonus, capped where the row caps it", () => {
    const leather = rowOf({
      ...chainMail,
      armorCategory: "Medium",
      armorClassBase: 14,
      armorClassDexBonus: true,
      armorClassMaxBonus: 2,
      strengthMinimum: null,
      stealthDisadvantage: null,
    });
    expect(gearFacts(leather)[1]).toEqual({ label: "Armour class", value: "AC 14 + DEX (max 2)" });
  });
});

describe("gearWeight", () => {
  it("prefers what was typed, falls back to the row, and says nothing otherwise", () => {
    expect(gearWeight({ name: "Rope", weight: "10 lb" }, rope)).toBe("10 lb");
    expect(gearWeight({ name: "Rope" }, rope)).toBe("10 lb");
    expect(gearWeight({ name: "Rope" }, undefined)).toBeUndefined();
    expect(gearWeight({ name: "Rope" }, rowOf({ weight: null }))).toBeUndefined();
  });
});
