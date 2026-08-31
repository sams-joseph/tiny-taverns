import { describe, expect, it } from "vitest";
import type { Ability } from "./Creature.js";
import {
  bonusesLine,
  modifierOf,
  seedFor,
  STARTING_LEVEL,
  type AbilityBonus,
  type BackgroundEntry,
  type ClassEntry,
  type RaceEntry,
  type SubraceEntry,
} from "./Ruleset.js";

/** A cell as the sheet stores it — both halves written, both as strings. */
const cell = (label: string, score: number, modifier: string): Ability => ({
  label,
  score: String(score),
  modifier,
});

const NONE: ReadonlyArray<Ability> = [];

const CON_HEAVY: ReadonlyArray<Ability> = [
  cell("STR", 12, "+1"),
  cell("DEX", 14, "+2"),
  cell("CON", 15, "+2"),
  cell("INT", 10, "+0"),
  cell("WIS", 13, "+1"),
  cell("CHA", 8, "-1"),
];

const DRUID: ClassEntry = { hitDie: 8, unarmouredAc: ["DEX"] };
const BARBARIAN: ClassEntry = { hitDie: 12, unarmouredAc: ["DEX", "CON"] };
const MONK: ClassEntry = { hitDie: 8, unarmouredAc: ["DEX", "WIS"] };
const WIZARD: ClassEntry = { hitDie: 6, unarmouredAc: ["DEX"] };
const PALADIN: ClassEntry = { hitDie: 10, unarmouredAc: ["DEX"] };
const ROGUE: ClassEntry = { hitDie: 8, unarmouredAc: ["DEX"] };
const BLOODSWORN: ClassEntry = { hitDie: 10, unarmouredAc: ["DEX", "CON"] };

const race = (
  abilityBonuses: ReadonlyArray<AbilityBonus>,
  extra: Partial<RaceEntry> = {},
): RaceEntry => ({
  speed: 30,
  size: "Medium",
  abilityBonuses,
  hpPerLevel: 0,
  subraces: [],
  ...extra,
});

const ELF = race([{ ability: "DEX", amount: 2 }]);
const HUMAN = race([
  { ability: "STR", amount: 1 },
  { ability: "DEX", amount: 1 },
  { ability: "CON", amount: 1 },
  { ability: "INT", amount: 1 },
  { ability: "WIS", amount: 1 },
  { ability: "CHA", amount: 1 },
]);
const HILL_DWARF: SubraceEntry = {
  name: "Hill Dwarf",
  abilityBonuses: [{ ability: "WIS", amount: 1 }],
  hpPerLevel: 1,
};
const DWARF = race([{ ability: "CON", amount: 2 }], {
  speed: 25,
  subraces: [HILL_DWARF],
});
const HALF_ELF = race([{ ability: "CHA", amount: 2 }], {
  abilityBonusChoice: {
    choose: 2,
    bonuses: [
      { ability: "STR", amount: 1 },
      { ability: "DEX", amount: 1 },
      { ability: "CON", amount: 1 },
      { ability: "INT", amount: 1 },
      { ability: "WIS", amount: 1 },
    ],
  },
});

const NO_RACE = race([]);
const NO_BACKGROUND: BackgroundEntry = {};
const SAILOR: BackgroundEntry = { proficiencies: ["Athletics"] } as BackgroundEntry;

describe("an ability modifier", () => {
  it("is read from what the document stored, not recomputed from the score", () => {
    expect(modifierOf([cell("CON", 8, "+3")], "CON")).toBe(3);
  });

  it("reads a missing or unparseable cell as nobody having said", () => {
    expect(modifierOf(NONE, "CON")).toBe(0);
    expect(modifierOf([{ label: "CON", score: "14", modifier: "—" }], "CON")).toBe(0);
  });
});

describe("the seed", () => {
  const scoreOf = (seed: ReturnType<typeof seedFor>, label: string) =>
    seed.abilities.find((ability) => ability.label === label);

  it("is level 1, whatever else it is", () => {
    expect(
      seedFor({
        classEntry: WIZARD,
        raceEntry: ELF,
        subraceEntry: undefined,
        backgroundEntry: NO_BACKGROUND,
        abilities: NONE,
      }).level,
    ).toBe(STARTING_LEVEL);
    expect(
      seedFor({
        classEntry: undefined,
        raceEntry: undefined,
        subraceEntry: undefined,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }).level,
    ).toBe(1);
  });

  it("takes hit points from the class hit die plus the constitution modifier", () => {
    expect(
      seedFor({
        classEntry: DRUID,
        raceEntry: NO_RACE,
        subraceEntry: undefined,
        abilities: CON_HEAVY,
      }).hpMax,
    ).toBe(10);
    expect(
      seedFor({
        classEntry: BARBARIAN,
        raceEntry: NO_RACE,
        subraceEntry: undefined,
        abilities: CON_HEAVY,
      }).hpMax,
    ).toBe(14);
    expect(
      seedFor({
        classEntry: WIZARD,
        raceEntry: NO_RACE,
        subraceEntry: undefined,
        abilities: CON_HEAVY,
      }).hpMax,
    ).toBe(8);
    expect(
      seedFor({
        classEntry: PALADIN,
        raceEntry: NO_RACE,
        subraceEntry: undefined,
        abilities: CON_HEAVY,
      }).hpMax,
    ).toBe(12);
  });

  it("applies race bonuses before hit points and armour class are computed", () => {
    const seed = seedFor({
      classEntry: DRUID,
      raceEntry: ELF,
      subraceEntry: undefined,
      abilities: CON_HEAVY,
    });

    expect(scoreOf(seed, "DEX")).toEqual({ label: "DEX", score: "16", modifier: "+3" });
    expect(seed.ac).toBe(13);
    expect(seed.hpMax).toBe(10);
    expect(seed.appliedBonuses).toEqual([{ ability: "DEX", amount: 2 }]);
  });

  it("applies a contained subrace's bonus and hit point rule", () => {
    const seed = seedFor({
      classEntry: DRUID,
      raceEntry: DWARF,
      subraceEntry: HILL_DWARF,
      abilities: CON_HEAVY,
    });

    expect(scoreOf(seed, "CON")).toEqual({ label: "CON", score: "17", modifier: "+3" });
    expect(scoreOf(seed, "WIS")).toEqual({ label: "WIS", score: "14", modifier: "+2" });
    expect(seed.hpMax).toBe(12);
    expect(seed.appliedBonuses).toEqual([
      { ability: "CON", amount: 2 },
      { ability: "WIS", amount: 1 },
    ]);
  });

  it("applies explicit source-defined race bonus choices", () => {
    const seed = seedFor({
      classEntry: BARBARIAN,
      raceEntry: HALF_ELF,
      subraceEntry: undefined,
      raceBonusChoices: [
        { ability: "DEX", amount: 1 },
        { ability: "CON", amount: 1 },
      ],
      abilities: CON_HEAVY,
    });

    expect(scoreOf(seed, "CHA")).toEqual({ label: "CHA", score: "10", modifier: "+0" });
    expect(scoreOf(seed, "DEX")).toEqual({ label: "DEX", score: "15", modifier: "+2" });
    expect(scoreOf(seed, "CON")).toEqual({ label: "CON", score: "16", modifier: "+3" });
    expect(seed.hpMax).toBe(15);
    expect(seed.ac).toBe(15);
    expect(seed.appliedBonuses).toEqual([
      { ability: "CHA", amount: 2 },
      { ability: "DEX", amount: 1 },
      { ability: "CON", amount: 1 },
    ]);
  });

  it("takes armour class from the dexterity modifier and nothing worn", () => {
    expect(
      seedFor({
        classEntry: ROGUE,
        raceEntry: NO_RACE,
        subraceEntry: undefined,
        abilities: CON_HEAVY,
      }).ac,
    ).toBe(12);
  });

  it("adds the second modifier for a class whose unarmoured defence names one", () => {
    expect(
      seedFor({
        classEntry: BARBARIAN,
        raceEntry: NO_RACE,
        subraceEntry: undefined,
        abilities: CON_HEAVY,
      }).ac,
    ).toBe(14);
    expect(
      seedFor({
        classEntry: MONK,
        raceEntry: NO_RACE,
        subraceEntry: undefined,
        abilities: CON_HEAVY,
      }).ac,
    ).toBe(13);
  });

  it("cannot tell a campaign's own class from a bundled one", () => {
    expect(
      seedFor({
        classEntry: BLOODSWORN,
        raceEntry: NO_RACE,
        subraceEntry: undefined,
        abilities: CON_HEAVY,
      }),
    ).toEqual({
      level: 1,
      ac: 14,
      hpMax: 12,
      abilities: CON_HEAVY,
      appliedBonuses: [],
    });
  });

  it("seeds a character with no abilities set yet from the die alone", () => {
    expect(
      seedFor({ classEntry: DRUID, raceEntry: ELF, subraceEntry: undefined, abilities: NONE }),
    ).toEqual({
      level: 1,
      ac: 10,
      hpMax: 8,
      abilities: NONE,
      appliedBonuses: [{ ability: "DEX", amount: 2 }],
    });
    expect(
      seedFor({
        classEntry: BARBARIAN,
        raceEntry: DWARF,
        subraceEntry: HILL_DWARF,
        abilities: NONE,
      }),
    ).toEqual({
      level: 1,
      ac: 10,
      hpMax: 13,
      abilities: NONE,
      appliedBonuses: [
        { ability: "CON", amount: 2 },
        { ability: "WIS", amount: 1 },
      ],
    });
  });

  it("offers no hit points at all when no class was picked", () => {
    const seed = seedFor({
      classEntry: undefined,
      raceEntry: ELF,
      subraceEntry: undefined,
      abilities: CON_HEAVY,
    });
    expect(seed.hpMax).toBeUndefined();
    expect(seed.ac).toBe(13);
  });

  it("floors hit points at 1", () => {
    const frail: ReadonlyArray<Ability> = [cell("CON", 4, "-3")];
    expect(
      seedFor({ classEntry: WIZARD, raceEntry: NO_RACE, subraceEntry: undefined, abilities: frail })
        .hpMax,
    ).toBe(3);
    const dying: ReadonlyArray<Ability> = [cell("CON", 1, "-9")];
    expect(
      seedFor({ classEntry: WIZARD, raceEntry: NO_RACE, subraceEntry: undefined, abilities: dying })
        .hpMax,
    ).toBe(1);
  });

  it("does not move when a score changes afterwards — because nothing calls it again", () => {
    const before = seedFor({
      classEntry: PALADIN,
      raceEntry: NO_RACE,
      subraceEntry: undefined,
      abilities: NONE,
    });
    const after = seedFor({
      classEntry: PALADIN,
      raceEntry: NO_RACE,
      subraceEntry: undefined,
      abilities: CON_HEAVY,
    });
    expect(before.hpMax).toBe(10);
    expect(after.hpMax).toBe(12);
    expect(before).not.toEqual(after);
  });

  it("leaves 2014 backgrounds out of the arithmetic", () => {
    const without = seedFor({
      classEntry: BARBARIAN,
      raceEntry: HUMAN,
      subraceEntry: undefined,
      backgroundEntry: undefined,
      abilities: CON_HEAVY,
    });
    const withBackground = seedFor({
      classEntry: BARBARIAN,
      raceEntry: HUMAN,
      subraceEntry: undefined,
      backgroundEntry: SAILOR,
      abilities: CON_HEAVY,
    });

    expect(withBackground).toEqual(without);
  });

  it("does not invent a cell nobody typed", () => {
    const seed = seedFor({
      classEntry: DRUID,
      raceEntry: DWARF,
      subraceEntry: HILL_DWARF,
      abilities: [cell("DEX", 14, "+2")],
    });
    expect(seed.abilities).toEqual([{ label: "DEX", score: "14", modifier: "+2" }]);
    expect(seed.hpMax).toBe(9);
  });

  it("leaves a score that is not a whole number exactly as it was written", () => {
    const odd: ReadonlyArray<Ability> = [{ label: "CON", score: "15 (base 13)", modifier: "+2" }];
    const seed = seedFor({
      classEntry: DRUID,
      raceEntry: DWARF,
      subraceEntry: HILL_DWARF,
      abilities: odd,
    });
    expect(seed.abilities).toEqual(odd);
  });

  it("adds two bonuses naming one ability, which is what a list of them means", () => {
    const seed = seedFor({
      classEntry: undefined,
      raceEntry: race([{ ability: "CON", amount: 2 }]),
      subraceEntry: { name: "Stout", abilityBonuses: [{ ability: "CON", amount: 1 }] },
      abilities: [cell("CON", 10, "+0")],
    });
    expect(scoreOf(seed, "CON")?.score).toBe("13");
  });
});

describe("what ability bonuses grant, in words", () => {
  it("is pre-signed and in the order it was written", () => {
    expect(
      bonusesLine([
        { ability: "CON", amount: 2 },
        { ability: "WIS", amount: 1 },
      ]),
    ).toBe("+2 CON, +1 WIS");
  });

  it("is empty for no bonuses, so a caller can say so itself", () => {
    expect(bonusesLine([])).toBe("");
  });
});
