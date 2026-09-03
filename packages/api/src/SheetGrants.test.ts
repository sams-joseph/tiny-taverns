import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { Ability } from "./Creature.js";
import {
  BackgroundOption,
  ClassOption,
  type OptionDetails,
  RaceOption,
} from "./CharacterOption.js";
import { identityGrants, sheetGrantsFor, withSavingThrows } from "./SheetGrants.js";

/**
 * The one implementation of "the corpora drive the starting sheet", pinned at
 * the shapes both composers depend on. The worked examples are the 2014 SRD's
 * own rows so a change here reads against something real; the server-side
 * integration (real Postgres, real hydration) is
 * `apps/server/test/hob-character.test.ts`.
 */

/** Deterministic UUID-shaped ids, because every branded id schema checks the shape. */
const uuidOf = (seed: string): string => {
  const hex = [...seed].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16);
  return `${hex.padStart(8, "0")}-0000-4000-8000-000000000000`;
};

const provenance = {
  origin: "system",
  assistantTurnId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

const optionBase = {
  campaignId: null,
  accountId: null,
  derivedFrom: null,
  visibility: "shared",
  ...provenance,
} as const;

const emptyDetails: OptionDetails = {
  subraces: [],
  abilityBonuses: [],
  languages: [],
  proficiencies: [],
  traits: [],
  choices: [],
};

const trait = (name: string, desc: ReadonlyArray<string>, subraceName: string | null = null) => ({
  trait: { id: uuidOf(`t-${name}`) as never, index: null, name, parentTraitId: null, desc },
  ordinal: 0,
  subraceId: subraceName === null ? null : (uuidOf(`s-${subraceName}`) as never),
  subraceName,
});

const language = (name: string, subraceName: string | null = null) => ({
  language: {
    id: uuidOf(`l-${name}`) as never,
    index: name.toLowerCase(),
    name,
    type: "Standard",
    script: null,
    typicalSpeakers: [],
  },
  ordinal: 0,
  subraceId: subraceName === null ? null : (uuidOf(`s-${subraceName}`) as never),
  subraceName,
});

const proficiency = (name: string, subraceName: string | null = null) => ({
  proficiency: {
    id: uuidOf(`p-${name}`) as never,
    index: name.toLowerCase(),
    name,
    type: "Weapons",
    referenceFamily: null,
    referenceKey: null,
    skillId: null,
    abilityScoreId: null,
  },
  sourceTrait: null,
  ordinal: 0,
  subraceId: subraceName === null ? null : (uuidOf(`s-${subraceName}`) as never),
  subraceName,
});

const DRUID: ClassOption = Schema.decodeUnknownSync(ClassOption)({
  ...optionBase,
  id: "ff46cf2e-bf1a-5eae-a126-9bc5ea585307" as never,
  kind: "class",
  name: "Druid",
  body: {
    hitDie: 8,
    unarmouredAc: ["DEX"],
    proficiencies: [
      "Light Armor",
      "Herbalism Kit",
      "Saving Throw: INT",
      "Saving Throw: WIS",
      "Choose two from Arcana, Insight, Medicine, and Nature",
    ],
    savingThrows: ["INT", "WIS"],
    summary: "",
  },
  details: {
    ...emptyDetails,
    levelOneFeatures: [
      {
        id: "2c135718-a0e4-5643-8d53-7731495d3f86" as never,
        index: null,
        name: "Druidic",
        desc: ["You know Druidic."],
      },
      {
        id: "86f3cb6b-8976-5e2f-807a-c4f2e698cd6c" as never,
        index: null,
        name: "Spellcasting: Druid",
        desc: ["Drawing on the divine essence of nature itself."],
      },
    ],
    proficiencyBonus: 2,
  },
});

const DWARF: RaceOption = Schema.decodeUnknownSync(RaceOption)({
  ...optionBase,
  id: "58a2af80-1006-5bb9-92a2-2727f0fec72c" as never,
  kind: "race",
  name: "Dwarf",
  body: {
    speed: 25,
    size: "Medium",
    abilityBonuses: [{ ability: "CON", amount: 2 }],
    hpPerLevel: 0,
    traits: ["Darkvision", "Dwarven Resilience"],
    subraces: [
      {
        name: "Hill Dwarf",
        abilityBonuses: [{ ability: "WIS", amount: 1 }],
        traits: [],
        summary: "",
      },
    ],
    summary: "",
  },
  details: {
    ...emptyDetails,
    traits: [
      trait("Darkvision", ["You can see in dim light within 60 feet."]),
      trait("Dwarven Toughness", ["Your hit point maximum increases by 1."], "Hill Dwarf"),
    ],
    languages: [language("Common"), language("Dwarvish")],
    proficiencies: [proficiency("Battleaxes")],
  },
});

const ACOLYTE: BackgroundOption = Schema.decodeUnknownSync(BackgroundOption)({
  ...optionBase,
  id: "73a1b39f-1185-545e-ac97-1374128ea7d8" as never,
  kind: "background",
  name: "Acolyte",
  body: {
    proficiencies: ["Insight", "Religion"],
    languages: ["Choose 2 languages"],
    equipment: ["1 × Clothes, common", "1 × Pouch"],
    gold: "15 gp",
    feature: { name: "Shelter of the Faithful", text: "You command the respect of the faithful." },
    choices: [],
    summary: "",
  },
});

describe("sheetGrantsFor", () => {
  it("composes traits from all three sources: class features, race traits, background feature", () => {
    const grants = sheetGrantsFor({
      classOption: DRUID,
      raceOption: DWARF,
      backgroundOption: ACOLYTE,
    });
    expect(grants.traits.map((entry) => entry.name)).toEqual([
      "Druidic",
      "Spellcasting: Druid",
      "Darkvision",
      "Shelter of the Faithful",
    ]);
    // The trait's full text rides along, paragraphs joined the way the sheet
    // renders prose.
    expect(grants.traits[0]?.text).toBe("You know Druidic.");
  });

  it("scopes a subrace's grants to the subrace that was picked", () => {
    const without = sheetGrantsFor({ raceOption: DWARF });
    expect(without.traits.map((entry) => entry.name)).toEqual(["Darkvision"]);

    const withSubrace = sheetGrantsFor({ raceOption: DWARF, subraceName: "hill dwarf" });
    // Case-insensitive, like `optionNamed` — the label arrives as the model or
    // the form spelled it.
    expect(withSubrace.traits.map((entry) => entry.name)).toEqual([
      "Darkvision",
      "Dwarven Toughness",
    ]);
  });

  it("filters instruction lines out of the proficiency list and keeps the grants", () => {
    const grants = sheetGrantsFor({
      classOption: DRUID,
      raceOption: DWARF,
      backgroundOption: ACOLYTE,
    });
    expect(grants.proficiencies).toEqual([
      "Light Armor",
      "Herbalism Kit",
      "Battleaxes",
      "Common",
      "Dwarvish",
      "Insight",
      "Religion",
      "Choose 2 languages",
    ]);
    // The saving throws become marks on the cells, never list entries.
    expect(grants.proficiencies.some((line) => line.startsWith("Saving Throw"))).toBe(false);
    expect(grants.savingThrows).toEqual(["INT", "WIS"]);
  });

  it("answers the corpus-backed identity and seed facts", () => {
    const grants = sheetGrantsFor({ classOption: DRUID, raceOption: DWARF });
    expect(grants.proficiencyBonus).toBe(2);
    expect(grants.speed).toBe(25);
    expect(grants.hitDie).toBe(8);
    expect(identityGrants(grants)).toEqual({
      speed: "25 ft.",
      proficiency: "+2",
      hitDice: "1/1 d8",
    });
  });

  it("carries the background's kit and gold", () => {
    const grants = sheetGrantsFor({ backgroundOption: ACOLYTE });
    expect(grants.inventory).toEqual([{ name: "1 × Clothes, common" }, { name: "1 × Pouch" }]);
    expect(grants.gold).toBe(15);
  });

  it("grants nothing for labels that resolved to nothing — the free-text degrade", () => {
    const grants = sheetGrantsFor({});
    expect(grants.traits).toEqual([]);
    expect(grants.proficiencies).toEqual([]);
    expect(grants.savingThrows).toEqual([]);
    expect(grants.proficiencyBonus).toBeUndefined();
    expect(identityGrants(grants)).toEqual({});
  });

  it("survives a homebrew class with no progression rows", () => {
    const homebrew: ClassOption = {
      ...DRUID,
      name: "Bloodsworn",
      body: { ...DRUID.body, proficiencies: [], savingThrows: ["STR", "CON"] },
      details: undefined,
    };
    const grants = sheetGrantsFor({ classOption: homebrew });
    // The source's own saving throws still mark the cells; the bonus is
    // absent because no `class_level` row supplied one.
    expect(grants.savingThrows).toEqual(["STR", "CON"]);
    expect(grants.proficiencyBonus).toBeUndefined();
    expect(grants.traits).toEqual([]);
  });
});

describe("withSavingThrows", () => {
  const cells: ReadonlyArray<Ability> = [
    { label: "STR", score: "15", modifier: "+2" },
    { label: "CON", score: "14", modifier: "+2" },
    { label: "WIS", score: "8", modifier: "-1" },
  ];

  it("marks the class's saves and writes the number only when the bonus is a read", () => {
    const marked = withSavingThrows(cells, ["STR", "WIS"], 2);
    expect(marked).toEqual([
      { label: "STR", score: "15", modifier: "+2", proficient: true, save: "+4" },
      { label: "CON", score: "14", modifier: "+2" },
      { label: "WIS", score: "8", modifier: "-1", proficient: true, save: "+1" },
    ]);
  });

  it("marks without a number when the proficiency bonus is unknown", () => {
    const marked = withSavingThrows(cells, ["CON"]);
    expect(marked[1]).toEqual({ label: "CON", score: "14", modifier: "+2", proficient: true });
    expect(marked[1]).not.toHaveProperty("save");
  });

  it("leaves the cells alone when the class grants no saves", () => {
    expect(withSavingThrows(cells, [])).toBe(cells);
  });
});
