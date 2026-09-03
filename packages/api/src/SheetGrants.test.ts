import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  BackgroundOption,
  ClassOption,
  type OptionDetails,
  RaceOption,
} from "./CharacterOption.js";
import type { Ability } from "./Creature.js";
import type { KitEquipment, OptionClassLevel } from "./CharacterOption.js";
import { FEATURE_OVERLAY, RACIAL_TRAIT_OVERLAY } from "./ActionOverlay.js";
import {
  defaultKitPicks,
  identityGrants,
  kitLinesFor,
  sheetGrantsFor,
  withSavingThrows,
} from "./SheetGrants.js";

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

/**
 * The three worked examples of the actions plan (§3.6), with the numbers read
 * off the real corpus in a throwaway database: the weapon columns, the class
 * tables at the three levels, the feature source keys. Ability cells are the
 * standard array laid the way each class wants it, so a to-hit has a number to
 * read. Any change here should be re-derived from the rows, not adjusted.
 */
const cells = (
  scores: readonly [number, number, number, number, number, number],
): ReadonlyArray<Ability> =>
  (["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).map((label, index) => {
    const score = scores[index] ?? 10;
    const modifier = Math.floor((score - 10) / 2);
    return {
      label,
      score: String(score),
      modifier: modifier < 0 ? String(modifier) : `+${String(modifier)}`,
    };
  });

const equipmentOf = (
  name: string,
  facts: Omit<Partial<KitEquipment>, "index"> & { readonly index: string },
): KitEquipment => ({
  id: uuidOf(`e-${facts.index}`) as never,
  name,
  weaponCategory: null,
  weaponRange: null,
  categoryRange: null,
  armorCategory: null,
  damageDice: null,
  damageType: null,
  twoHandedDamageDice: null,
  rangeNormal: null,
  rangeLong: null,
  throwRangeNormal: null,
  throwRangeLong: null,
  properties: [],
  weight: null,
  gearCategoryIndex: null,
  toolCategory: null,
  ...facts,
});

const melee = (
  name: string,
  index: string,
  category: "Simple" | "Martial",
  damageDice: string,
  damageType: string,
  extra: Omit<Partial<KitEquipment>, "index"> = {},
) =>
  equipmentOf(name, {
    index,
    weaponCategory: category,
    weaponRange: "Melee",
    categoryRange: `${category} Melee`,
    damageDice,
    damageType,
    rangeNormal: 5,
    ...extra,
  });

// The real rows, as `equipment` holds them.
const LONGSWORD = melee("Longsword", "longsword", "Martial", "1d8", "Slashing", {
  twoHandedDamageDice: "1d10",
  properties: ["Versatile"],
  weight: 3,
});
const HANDAXE = melee("Handaxe", "handaxe", "Simple", "1d6", "Slashing", {
  throwRangeNormal: 20,
  throwRangeLong: 60,
  properties: ["Light", "Thrown", "Monk"],
  weight: 2,
});
const JAVELIN = melee("Javelin", "javelin", "Simple", "1d6", "Piercing", {
  throwRangeNormal: 30,
  throwRangeLong: 120,
  properties: ["Thrown", "Monk"],
  weight: 2,
});
const QUARTERSTAFF = melee("Quarterstaff", "quarterstaff", "Simple", "1d6", "Bludgeoning", {
  twoHandedDamageDice: "1d8",
  properties: ["Versatile", "Monk"],
  weight: 4,
});
const DAGGER = melee("Dagger", "dagger", "Simple", "1d4", "Piercing", {
  throwRangeNormal: 20,
  throwRangeLong: 60,
  properties: ["Finesse", "Light", "Thrown", "Monk"],
  weight: 1,
});
const LIGHT_CROSSBOW = equipmentOf("Crossbow, light", {
  index: "crossbow-light",
  weaponCategory: "Simple",
  weaponRange: "Ranged",
  categoryRange: "Simple Ranged",
  damageDice: "1d8",
  damageType: "Piercing",
  rangeNormal: 80,
  rangeLong: 320,
  properties: ["Ammunition", "Loading", "Two-Handed"],
  weight: 5,
});
const BOLTS = equipmentOf("Crossbow bolt", {
  index: "crossbow-bolt",
  gearCategoryIndex: "ammunition",
});
const CHAIN_MAIL = equipmentOf("Chain Mail", {
  index: "chain-mail",
  armorCategory: "Heavy",
  weight: 55,
});
const SHIELD = equipmentOf("Shield", { index: "shield", armorCategory: "Shield", weight: 6 });
const SPELLBOOK = equipmentOf("Spellbook", {
  index: "spellbook",
  gearCategoryIndex: "standard-gear",
});
const HOLY_SYMBOL = equipmentOf("Amulet", { index: "amulet", gearCategoryIndex: "holy-symbols" });

const counted = (row: KitEquipment, quantity = 1) => ({
  name: row.name,
  quantity,
  equipmentId: row.id,
});
const category = (index: string, name: string, quantity = 1) => ({
  name: `Any ${name.toLowerCase().replace(/s$/, "")}`,
  quantity,
  category: { index, name },
});
const side = (
  ...lines: ReadonlyArray<ReturnType<typeof counted> | ReturnType<typeof category>>
) => ({
  label: lines.map((line) => line.name).join(", "),
  lines,
});

const feature = (index: string, name: string) => ({
  id: uuidOf(`f-${index}`) as never,
  index,
  name,
});

const levelRow = (
  level: number,
  proficiencyBonus: number,
  features: ReadonlyArray<ReturnType<typeof feature>>,
  extra: Partial<OptionClassLevel> = {},
): OptionClassLevel => ({ level, proficiencyBonus, features, ...extra });

const FIGHTER: ClassOption = Schema.decodeUnknownSync(ClassOption)({
  ...optionBase,
  id: uuidOf("c-fighter") as never,
  kind: "class",
  name: "Fighter",
  body: {
    hitDie: 10,
    unarmouredAc: ["DEX"],
    proficiencies: [
      "All armor",
      "Shields",
      "Simple Weapons",
      "Martial Weapons",
      "Saving Throw: STR",
      "Saving Throw: CON",
    ],
    savingThrows: ["STR", "CON"],
    summary: "",
    startingKit: {
      fixed: [],
      choices: [
        {
          desc: "(a) chain mail or (b) leather armor, longbow, and 20 arrows",
          options: [side(counted(CHAIN_MAIL))],
        },
        {
          desc: "(a) a martial weapon and a shield or (b) two martial weapons",
          options: [
            side(category("martial-weapons", "Martial Weapons"), counted(SHIELD)),
            side(category("martial-weapons", "Martial Weapons", 2)),
          ],
        },
        {
          desc: "(a) a light crossbow and 20 bolts or (b) two handaxes",
          options: [side(counted(LIGHT_CROSSBOW), counted(BOLTS, 20)), side(counted(HANDAXE, 2))],
        },
      ],
    },
  },
  details: {
    ...emptyDetails,
    levelOneFeatures: [
      { ...feature("fighter-fighting-style", "Fighting Style"), desc: ["You adopt a style."] },
      { ...feature("second-wind", "Second Wind"), desc: ["You have a limited well of stamina."] },
    ],
    proficiencyBonus: 2,
    equipment: [BOLTS, CHAIN_MAIL, LIGHT_CROSSBOW, HANDAXE, LONGSWORD, SHIELD],
    classLevels: [
      levelRow(1, 2, [
        feature("fighter-fighting-style", "Fighting Style"),
        feature("second-wind", "Second Wind"),
      ]),
      levelRow(2, 2, [feature("action-surge-1-use", "Action Surge")], {
        classSpecific: { action_surges: 1 },
      }),
      levelRow(5, 3, [feature("extra-attack-1", "Extra Attack")], {
        classSpecific: { action_surges: 1, extra_attacks: 1 },
      }),
    ],
  },
});

const PALADIN: ClassOption = Schema.decodeUnknownSync(ClassOption)({
  ...optionBase,
  id: uuidOf("c-paladin") as never,
  kind: "class",
  name: "Paladin",
  body: {
    hitDie: 10,
    unarmouredAc: ["DEX"],
    spellcastingAbility: "CHA",
    proficiencies: [
      "All armor",
      "Shields",
      "Simple Weapons",
      "Martial Weapons",
      "Saving Throw: WIS",
      "Saving Throw: CHA",
    ],
    savingThrows: ["WIS", "CHA"],
    summary: "",
    startingKit: {
      fixed: [counted(CHAIN_MAIL)],
      choices: [
        {
          desc: "(a) a martial weapon and a shield or (b) two martial weapons",
          options: [
            side(category("martial-weapons", "Martial Weapons"), counted(SHIELD)),
            side(category("martial-weapons", "Martial Weapons", 2)),
          ],
        },
        {
          desc: "(a) five javelins or (b) any simple melee weapon",
          options: [side(counted(JAVELIN, 5)), side(category("simple-weapons", "Simple Weapons"))],
        },
        { desc: "holy symbol", options: [side(category("holy-symbols", "Holy Symbols"))] },
      ],
    },
  },
  details: {
    ...emptyDetails,
    levelOneFeatures: [
      {
        ...feature("divine-sense", "Divine Sense"),
        desc: ["The presence of strong evil registers on your senses."],
      },
      { ...feature("lay-on-hands", "Lay on Hands"), desc: ["Your blessed touch can heal wounds."] },
    ],
    proficiencyBonus: 2,
    equipment: [HOLY_SYMBOL, CHAIN_MAIL, JAVELIN, LONGSWORD, SHIELD],
    classLevels: [
      levelRow(
        1,
        2,
        [feature("divine-sense", "Divine Sense"), feature("lay-on-hands", "Lay on Hands")],
        { spellcasting: { slots: [] } },
      ),
      levelRow(
        2,
        2,
        [
          feature("divine-smite", "Divine Smite"),
          feature("paladin-fighting-style", "Fighting Style"),
          feature("spellcasting-paladin", "Spellcasting: Paladin"),
        ],
        { spellcasting: { slots: [2] } },
      ),
      levelRow(
        3,
        2,
        [
          feature("channel-divinity", "Channel Divinity"),
          feature("divine-health", "Divine Health"),
          feature("oath-spells", "Oath Spells"),
          feature("sacred-oath", "Sacred Oath"),
        ],
        { spellcasting: { slots: [3] } },
      ),
      levelRow(
        4,
        2,
        [feature("paladin-ability-score-improvement-1", "Ability Score Improvement")],
        { spellcasting: { slots: [3] } },
      ),
      levelRow(5, 3, [feature("paladin-extra-attack", "Extra Attack")], {
        spellcasting: { slots: [4, 2] },
      }),
    ],
  },
});

const WIZARD: ClassOption = Schema.decodeUnknownSync(ClassOption)({
  ...optionBase,
  id: uuidOf("c-wizard") as never,
  kind: "class",
  name: "Wizard",
  body: {
    hitDie: 6,
    unarmouredAc: ["DEX"],
    spellcastingAbility: "INT",
    proficiencies: [
      "Daggers",
      "Darts",
      "Slings",
      "Quarterstaffs",
      "Crossbows, light",
      "Saving Throw: INT",
      "Saving Throw: WIS",
    ],
    savingThrows: ["INT", "WIS"],
    summary: "",
    startingKit: {
      fixed: [counted(SPELLBOOK)],
      choices: [
        {
          desc: "(a) a quarterstaff or (b) a dagger",
          options: [side(counted(QUARTERSTAFF)), side(counted(DAGGER))],
        },
      ],
    },
  },
  details: {
    ...emptyDetails,
    levelOneFeatures: [
      {
        ...feature("arcane-recovery", "Arcane Recovery"),
        desc: ["You have learned to regain some of your magical energy."],
      },
      {
        ...feature("spellcasting-wizard", "Spellcasting: Wizard"),
        desc: ["As a student of arcane magic, you have a spellbook."],
      },
    ],
    proficiencyBonus: 2,
    equipment: [DAGGER, QUARTERSTAFF, SPELLBOOK],
    classLevels: [
      levelRow(
        1,
        2,
        [
          feature("arcane-recovery", "Arcane Recovery"),
          feature("spellcasting-wizard", "Spellcasting: Wizard"),
        ],
        {
          spellcasting: { cantripsKnown: 3, slots: [2] },
          classSpecific: { arcane_recovery_levels: 1 },
        },
      ),
      levelRow(2, 2, [feature("arcane-tradition", "Arcane Tradition")], {
        spellcasting: { cantripsKnown: 3, slots: [3] },
        classSpecific: { arcane_recovery_levels: 1 },
      }),
      levelRow(3, 2, [], {
        spellcasting: { cantripsKnown: 3, slots: [4, 2] },
        classSpecific: { arcane_recovery_levels: 2 },
      }),
    ],
  },
});

const HALF_ORC: RaceOption = Schema.decodeUnknownSync(RaceOption)({
  ...optionBase,
  id: uuidOf("r-half-orc") as never,
  kind: "race",
  name: "Half-Orc",
  body: {
    speed: 30,
    size: "Medium",
    abilityBonuses: [
      { ability: "STR", amount: 2 },
      { ability: "CON", amount: 1 },
    ],
    hpPerLevel: 0,
    traits: ["Relentless Endurance"],
    subraces: [],
    summary: "",
  },
  details: {
    ...emptyDetails,
    traits: [
      {
        trait: {
          id: uuidOf("t-relentless") as never,
          index: "relentless-endurance",
          name: "Relentless Endurance",
          parentTraitId: null,
          desc: [
            "When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead.",
          ],
        },
        ordinal: 0,
        subraceId: null,
        subraceName: null,
      },
    ],
  },
});

describe("the worked examples: a Fighter 1", () => {
  // STR 16, DEX 14, CON 15 — the array laid the fighter's way.
  const abilities = cells([16, 14, 15, 8, 12, 10]);
  const grants = sheetGrantsFor({
    classOption: FIGHTER,
    abilities,
    level: 1,
    // Chain mail; a longsword and a shield; the light crossbow.
    kitChoices: [
      { option: 0, picks: [] },
      { option: 0, picks: [LONGSWORD.id] },
      { option: 0, picks: [] },
    ],
  });

  it("carries the kit as picked, each line naming its equipment row", () => {
    expect(grants.inventory).toEqual([
      { name: "Chain Mail", equipmentId: CHAIN_MAIL.id },
      { name: "Longsword", equipmentId: LONGSWORD.id },
      { name: "Shield", equipmentId: SHIELD.id },
      { name: "Crossbow, light", equipmentId: LIGHT_CROSSBOW.id },
      { name: "Crossbow bolt", quantity: 20, equipmentId: BOLTS.id },
    ]);
  });

  it("derives a weapon attack per weapon: proficiency and the right ability applied", () => {
    expect(grants.actions).toEqual([
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
      {
        id: "atk:crossbow-light",
        name: "Crossbow, light",
        cost: "action",
        hit: "+4",
        dice: "1d8+2",
        damageType: "Piercing",
        range: "80/320 ft.",
        text: "Simple Ranged · Ammunition · Loading · Two-Handed",
        source: "weapon",
        equipmentId: LIGHT_CROSSBOW.id,
        derived: true,
      },
      {
        id: "feat:second-wind",
        name: "Second Wind",
        cost: "bonus",
        dice: "1d10+1",
        text: "Regain hit points",
        source: "feature",
        resource: "res:second-wind",
        featureId: uuidOf("f-second-wind"),
        derived: true,
      },
    ]);
  });

  it("writes the hit dice and Second Wind's one use, and no slots for a class that does not cast", () => {
    expect(grants.resources).toEqual([
      {
        id: "hit-dice",
        name: "Hit dice",
        used: 0,
        max: 1,
        recharge: "long",
        unit: "d10",
        derived: true,
      },
      {
        id: "res:second-wind",
        name: "Second Wind",
        used: 0,
        max: 1,
        recharge: "short",
        featureId: uuidOf("f-second-wind"),
        derived: true,
      },
    ]);
    expect(grants.spellcasting).toBeUndefined();
    expect(identityGrants(grants)).toEqual({ proficiency: "+2", hitDice: "1/1 d10" });
  });

  it("takes side (a) of every choice when nothing was picked, and leaves a category as a line", () => {
    const untouched = sheetGrantsFor({ classOption: FIGHTER, abilities });
    expect(untouched.inventory.map((line) => line.name)).toEqual([
      "Chain Mail",
      "Any martial weapon",
      "Shield",
      "Crossbow, light",
      "Crossbow bolt",
    ]);
    expect(untouched.inventory[1]).toEqual({ name: "Any martial weapon", note: "Your pick" });
    // The category line has no row behind it, so no attack claims a weapon nobody chose.
    expect(untouched.actions.map((action) => action.name)).toEqual([
      "Crossbow, light",
      "Second Wind",
    ]);
  });

  it("lists two handaxes once, thrown, at strength", () => {
    const handaxes = sheetGrantsFor({
      classOption: FIGHTER,
      abilities,
      kitChoices: [
        { option: 0, picks: [] },
        { option: 1, picks: [LONGSWORD.id] },
        { option: 1, picks: [] },
      ],
    });
    expect(
      handaxes.inventory.map(
        (line) => `${line.name}${line.quantity === undefined ? "" : ` ×${String(line.quantity)}`}`,
      ),
    ).toEqual(["Chain Mail", "Longsword", "Any martial weapon", "Handaxe ×2"]);
    const handaxe = handaxes.actions.find((action) => action.name === "Handaxe");
    expect(handaxe).toMatchObject({
      hit: "+5",
      dice: "1d6+3",
      range: "Thrown 20/60 ft.",
      damageType: "Slashing",
    });
    expect(handaxes.actions.filter((action) => action.name === "Handaxe")).toHaveLength(1);
  });

  it("refuses a pick from outside the category rather than inventing a weapon", () => {
    const lines = kitLinesFor(FIGHTER.body.startingKit, FIGHTER.details?.equipment ?? [], [
      { option: 0, picks: [] },
      { option: 0, picks: [HANDAXE.id] },
      { option: 0, picks: [] },
    ]);
    expect(lines.map((line) => line.name)).toEqual([
      "Chain Mail",
      "Any martial weapon",
      "Shield",
      "Crossbow, light",
      "Crossbow bolt",
    ]);
    expect(defaultKitPicks(FIGHTER.body.startingKit)).toEqual([
      { option: 0, picks: [] },
      { option: 0, picks: [] },
      { option: 0, picks: [] },
    ]);
  });
});

describe("the worked examples: a Paladin 5", () => {
  // STR 16, CHA 16, the rest as a paladin lays them.
  const abilities = cells([16, 10, 14, 8, 12, 16]);
  const grants = sheetGrantsFor({
    classOption: PALADIN,
    raceOption: HALF_ORC,
    abilities,
    level: 5,
    kitChoices: [
      { option: 0, picks: [LONGSWORD.id] },
      { option: 0, picks: [] },
      { option: 0, picks: [HOLY_SYMBOL.id] },
    ],
  });

  it("reads the class table at level 5: four first-level and two second-level slots, +3 proficiency", () => {
    expect(grants.proficiencyBonus).toBe(3);
    expect(grants.resources).toEqual([
      { id: "slot:1", name: "1st-level slots", used: 0, max: 4, recharge: "long", derived: true },
      { id: "slot:2", name: "2nd-level slots", used: 0, max: 2, recharge: "long", derived: true },
      {
        id: "hit-dice",
        name: "Hit dice",
        used: 0,
        max: 5,
        recharge: "long",
        unit: "d10",
        derived: true,
      },
      // Divine Sense: 1 + CHA; Lay on Hands: five times the level, in hit
      // points; Channel Divinity: the paladin's table does not count it, so
      // the overlay's one; Relentless Endurance off the race.
      {
        id: "res:divine-sense",
        name: "Divine Sense",
        used: 0,
        max: 4,
        recharge: "long",
        featureId: uuidOf("f-divine-sense"),
        derived: true,
      },
      {
        id: "res:lay-on-hands",
        name: "Lay on Hands",
        used: 0,
        max: 25,
        recharge: "long",
        unit: "hp",
        featureId: uuidOf("f-lay-on-hands"),
        derived: true,
      },
      {
        id: "res:channel-divinity",
        name: "Channel Divinity",
        used: 0,
        max: 1,
        recharge: "short",
        featureId: uuidOf("f-channel-divinity"),
        derived: true,
      },
      {
        id: "res:relentless-endurance",
        name: "Relentless Endurance",
        used: 0,
        max: 1,
        recharge: "long",
        racialTraitId: uuidOf("t-relentless"),
        derived: true,
      },
    ]);
  });

  it("works the casting numbers out of the imported ability", () => {
    expect(grants.spellcasting).toEqual({ ability: "CHA", save: "14", attack: "+6" });
    expect(identityGrants(grants)).toEqual({
      speed: "30 ft.",
      proficiency: "+3",
      hitDice: "5/5 d10",
    });
  });

  it("draws two attacks per Attack action on every weapon, and the features with a cost", () => {
    expect(
      grants.actions.map((action) => [
        action.name,
        action.cost ?? "—",
        action.hit ?? "",
        action.dice ?? "",
        action.resource ?? "",
      ]),
    ).toEqual([
      ["Longsword", "action", "+6", "1d8+3", ""],
      ["Javelin", "action", "+6", "1d6+3", ""],
      ["Divine Sense", "action", "", "", "res:divine-sense"],
      ["Lay on Hands", "action", "", "", "res:lay-on-hands"],
      ["Divine Smite", "—", "", "2d8", "slot:1"],
      ["Channel Divinity", "action", "", "", "res:channel-divinity"],
    ]);
    expect(grants.actions[0]?.text).toBe("Martial Melee · Versatile (1d10) · Attack ×2");
    expect(grants.actions[1]?.range).toBe("Thrown 30/120 ft.");
    expect(grants.actions[4]).toMatchObject({ damageType: "Radiant", source: "feature" });
  });

  it("grants the features above level 1 by name, with the prose the details carry at level 1 only", () => {
    expect(grants.traits.map((trait) => trait.name)).toEqual([
      "Divine Sense",
      "Lay on Hands",
      "Divine Smite",
      "Fighting Style",
      "Spellcasting: Paladin",
      "Channel Divinity",
      "Divine Health",
      "Oath Spells",
      "Sacred Oath",
      "Ability Score Improvement",
      "Extra Attack",
      "Relentless Endurance",
    ]);
    expect(grants.traits[0]?.text).not.toBe("");
    expect(grants.traits[2]?.text).toBe("");
  });

  it("carries the fixed chain mail, the picks and the javelins", () => {
    expect(grants.inventory).toEqual([
      { name: "Chain Mail", equipmentId: CHAIN_MAIL.id },
      { name: "Longsword", equipmentId: LONGSWORD.id },
      { name: "Shield", equipmentId: SHIELD.id },
      { name: "Javelin", quantity: 5, equipmentId: JAVELIN.id },
      { name: "Amulet", equipmentId: HOLY_SYMBOL.id },
    ]);
  });
});

describe("the worked examples: a Wizard 3", () => {
  const abilities = cells([8, 14, 13, 16, 12, 10]);
  const grants = sheetGrantsFor({ classOption: WIZARD, abilities, level: 3 });

  it("knows three cantrips and four and two slots, off Intelligence", () => {
    expect(grants.spellcasting).toEqual({
      ability: "INT",
      save: "13",
      attack: "+5",
      cantripsKnown: 3,
    });
    expect(grants.resources).toEqual([
      { id: "slot:1", name: "1st-level slots", used: 0, max: 4, recharge: "long", derived: true },
      { id: "slot:2", name: "2nd-level slots", used: 0, max: 2, recharge: "long", derived: true },
      {
        id: "hit-dice",
        name: "Hit dice",
        used: 0,
        max: 3,
        recharge: "long",
        unit: "d6",
        derived: true,
      },
      {
        id: "res:arcane-recovery",
        name: "Arcane Recovery",
        used: 0,
        max: 1,
        recharge: "dawn",
        featureId: uuidOf("f-arcane-recovery"),
        derived: true,
      },
    ]);
  });

  it("swings the quarterstaff at strength, proficient by the weapon's own name", () => {
    expect(grants.actions).toEqual([
      {
        id: "atk:quarterstaff",
        name: "Quarterstaff",
        cost: "action",
        hit: "+1",
        dice: "1d6-1",
        damageType: "Bludgeoning",
        text: "Simple Melee · Versatile (1d8) · Monk",
        source: "weapon",
        equipmentId: QUARTERSTAFF.id,
        derived: true,
      },
    ]);
  });

  it("uses the better of STR and DEX for a finesse dagger", () => {
    const dagger = sheetGrantsFor({
      classOption: WIZARD,
      abilities,
      level: 3,
      kitChoices: [{ option: 1, picks: [] }],
    });
    expect(dagger.actions[0]).toMatchObject({
      name: "Dagger",
      hit: "+4",
      dice: "1d4+2",
      range: "Thrown 20/60 ft.",
    });
  });

  it("marks a weapon the class is not proficient with at the bare modifier", () => {
    const untrained: ClassOption = { ...WIZARD, body: { ...WIZARD.body, proficiencies: [] } };
    const grantsUntrained = sheetGrantsFor({ classOption: untrained, abilities, level: 3 });
    expect(grantsUntrained.actions[0]?.hit).toBe("-1");
  });

  it("answers the highest row it has for a level past the table", () => {
    const deep = sheetGrantsFor({ classOption: WIZARD, abilities, level: 7 });
    expect(deep.proficiencyBonus).toBe(2);
    expect(deep.resources.find((resource) => resource.id === "hit-dice")?.max).toBe(7);
  });
});

describe("the overlay", () => {
  it("names only slugs the sheet can spell, and every entry with a resource has a recharge", () => {
    for (const [key, entry] of [
      ...Object.entries(FEATURE_OVERLAY),
      ...Object.entries(RACIAL_TRAIT_OVERLAY),
    ]) {
      expect(key).toMatch(/^[a-z0-9-]+$/);
      if (entry.resource !== undefined) {
        expect(entry.resource).toMatch(/^[a-z0-9-]+$/);
        expect(entry.recharge).toBeDefined();
        expect(entry.counter !== undefined || entry.max !== undefined).toBe(true);
      }
    }
  });
});
