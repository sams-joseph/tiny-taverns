import { describe, expect, it } from "vitest";
import type { Ability } from "./Creature.js";
import {
  increasesLine,
  modifierOf,
  seedFor,
  STARTING_LEVEL,
  type BackgroundEntry,
  type ClassEntry,
} from "./Ruleset.js";

/**
 * The seed, and the things about it that are wrong *silently*.
 *
 * Every assertion below renders plausibly when it fails: a hit die read off the
 * wrong class is still a number, an unarmoured armour class that forgot a
 * barbarian's constitution is still an armour class, and a class this campaign
 * does not have quietly resolved to the nearest one is still a character sheet.
 * None of it throws, so none of it is visible without a test that names the
 * number.
 *
 * **The vocabulary is no longer in this module and neither is its test.** The
 * twelve and the ten are rows now — the bundle, seeded by
 * `apps/server/src/ruleset/import.ts` — and what they carry, plus the fact that
 * a campaign's own classes seed the same way, is pinned by
 * `apps/server/test/options.test.ts` against a real database. What is left here
 * is the arithmetic, which is the part with one right answer wherever it is
 * asked.
 */

/** A cell as the sheet stores it — both halves written, both as strings. */
const cell = (label: string, score: number, modifier: string): Ability => ({
  label,
  score: String(score),
  modifier,
});

/** Nobody has typed a score yet, which is a brand new character exactly. */
const NONE: ReadonlyArray<Ability> = [];

/** The standard array as `proposeCharacter` assigns it for a CON-first draft. */
const CON_HEAVY: ReadonlyArray<Ability> = [
  cell("STR", 12, "+1"),
  cell("DEX", 14, "+2"),
  cell("CON", 15, "+2"),
  cell("INT", 10, "+0"),
  cell("WIS", 13, "+1"),
  cell("CHA", 8, "-1"),
];

/**
 * The bundled entries the assertions below name, written out here rather than
 * imported.
 *
 * A test that imported the bundle would be asserting that the bundle is what it
 * is; what these pin is the *arithmetic over an entry*, which is why they are
 * literals. The last one is the point of the whole slice: a homebrew class is
 * an entry like any other, and the seed cannot tell it from a bundled one.
 */
const DRUID: ClassEntry = { hitDie: 8, unarmouredAc: ["DEX"] };
const BARBARIAN: ClassEntry = { hitDie: 12, unarmouredAc: ["DEX", "CON"] };
const MONK: ClassEntry = { hitDie: 8, unarmouredAc: ["DEX", "WIS"] };
const WIZARD: ClassEntry = { hitDie: 6, unarmouredAc: ["DEX"] };
const PALADIN: ClassEntry = { hitDie: 10, unarmouredAc: ["DEX"] };
const ROGUE: ClassEntry = { hitDie: 8, unarmouredAc: ["DEX"] };
/** *Bloodsworn, d10, unarmoured AC DEX + CON* — a table's own. */
const BLOODSWORN: ClassEntry = { hitDie: 10, unarmouredAc: ["DEX", "CON"] };

const DWARF = { hpPerLevel: 1 };
const ELF = { hpPerLevel: 0 };

/**
 * A background that grants nothing — **which is all sixteen bundled ones**, by
 * the bundle-licensing decision, so it is the ordinary case rather than an edge
 * one and belongs beside `ELF`.
 */
const NO_BACKGROUND: BackgroundEntry = { abilityIncreases: [] };

/** *+2 CON, +1 WIS* — a background a DM wrote, which is where grants come from. */
const SALT_RUNNER: BackgroundEntry = {
  abilityIncreases: [
    { ability: "CON", amount: 2 },
    { ability: "WIS", amount: 1 },
  ],
};

describe("an ability modifier", () => {
  it("is read from what the document stored, not recomputed from the score", () => {
    // A cell whose two halves disagree is not something any writer in the
    // product can produce — both are written in one object literal — but if one
    // ever arrives, the modifier is the number the player reads at the table.
    expect(modifierOf([cell("CON", 8, "+3")], "CON")).toBe(3);
  });

  it("reads a missing or unparseable cell as nobody having said", () => {
    expect(modifierOf(NONE, "CON")).toBe(0);
    expect(modifierOf([{ label: "CON", score: "14", modifier: "—" }], "CON")).toBe(0);
  });
});

describe("the seed", () => {
  it("is level 1, whatever else it is", () => {
    expect(
      seedFor({
        classEntry: WIZARD,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: NONE,
      }).level,
    ).toBe(STARTING_LEVEL);
    expect(
      seedFor({
        classEntry: undefined,
        speciesEntry: undefined,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }).level,
    ).toBe(1);
  });

  it("takes hit points from the class hit die plus the constitution modifier", () => {
    // d8 + 2.
    expect(
      seedFor({
        classEntry: DRUID,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }).hpMax,
    ).toBe(10);
    // d12 + 2 — the biggest die in the book.
    expect(
      seedFor({
        classEntry: BARBARIAN,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }).hpMax,
    ).toBe(14);
    // d6 + 2 — the smallest, and the one a player is most likely to query.
    expect(
      seedFor({
        classEntry: WIZARD,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }).hpMax,
    ).toBe(8);
    // d10 + 2.
    expect(
      seedFor({
        classEntry: PALADIN,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }).hpMax,
    ).toBe(12);
  });

  it("adds a dwarf's extra hit point, and nobody else's", () => {
    expect(
      seedFor({
        classEntry: DRUID,
        speciesEntry: DWARF,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }).hpMax,
    ).toBe(11);
    expect(
      seedFor({
        classEntry: DRUID,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }).hpMax,
    ).toBe(10);
  });

  it("takes armour class from the dexterity modifier and nothing worn", () => {
    expect(
      seedFor({
        classEntry: ROGUE,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }).ac,
    ).toBe(12);
  });

  it("adds the second modifier for a class whose unarmoured defence names one", () => {
    // 10 + DEX 2 + CON 2.
    expect(
      seedFor({
        classEntry: BARBARIAN,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }).ac,
    ).toBe(14);
    // 10 + DEX 2 + WIS 1.
    expect(
      seedFor({
        classEntry: MONK,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }).ac,
    ).toBe(13);
  });

  it("cannot tell a campaign's own class from a bundled one", () => {
    // **The acceptance arithmetic of the homebrew slice**, as a unit: a d10
    // class whose unarmoured defence adds constitution, at CON +2, is 12 hit
    // points and armour class 14. Nothing in the seed knows or asks where the
    // entry came from — which is what makes a homebrew class work at all, and
    // is why the *only* thing the create form had to learn was where to read
    // the vocabulary from.
    expect(
      seedFor({
        classEntry: BLOODSWORN,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: CON_HEAVY,
      }),
    ).toEqual({
      level: 1,
      ac: 14,
      hpMax: 12,
      abilities: CON_HEAVY,
    });
  });

  it("seeds a character with no abilities set yet from the die alone", () => {
    // A player may skip the scores, so this is what a hand-filled character
    // starts on when they do: the die, and a bare 10.
    expect(
      seedFor({
        classEntry: DRUID,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: NONE,
      }),
    ).toEqual({
      level: 1,
      ac: 10,
      hpMax: 8,
      abilities: NONE,
    });
    // Including a class that would otherwise add a second zero.
    expect(
      seedFor({
        classEntry: BARBARIAN,
        speciesEntry: DWARF,
        backgroundEntry: NO_BACKGROUND,
        abilities: NONE,
      }),
    ).toEqual({
      level: 1,
      ac: 10,
      hpMax: 13,
      abilities: NONE,
    });
  });

  it("offers no hit points at all when no class was picked", () => {
    // Reachable two ways: a form where the picker has not been touched, and an
    // existing free-text label this campaign has no option for. There is no hit
    // die to read, and a default would be a number nobody chose — so the field
    // is absent rather than guessed, and the armour class still seeds.
    const seed = seedFor({
      classEntry: undefined,
      speciesEntry: undefined,
      backgroundEntry: NO_BACKGROUND,
      abilities: CON_HEAVY,
    });
    expect(seed.hpMax).toBeUndefined();
    expect(seed).toEqual({ level: 1, ac: 12, abilities: CON_HEAVY });
  });

  it("floors hit points at 1", () => {
    const frail: ReadonlyArray<Ability> = [cell("CON", 4, "-3")];
    expect(
      seedFor({
        classEntry: WIZARD,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: frail,
      }).hpMax,
    ).toBe(3);
    const dying: ReadonlyArray<Ability> = [cell("CON", 1, "-9")];
    expect(
      seedFor({
        classEntry: WIZARD,
        speciesEntry: ELF,
        backgroundEntry: NO_BACKGROUND,
        abilities: dying,
      }).hpMax,
    ).toBe(1);
  });

  it("does not move when a score changes afterwards — because nothing calls it again", () => {
    // The captain's decision, stated as the property it actually is: seeding is
    // a function of its inputs, and the *only* protection against a recomputed
    // value is that no reader of a character ever calls this. What this pins is
    // the shape that makes that possible — a seed is a value, not a rule the
    // row carries.
    //
    // **Homebrew adds a second hop with the same property.** A DM who edits a
    // campaign's class changes what the next character is made from, and
    // nothing calls this for a character that already exists. There is no
    // recompute-all-sheets and there must not be one.
    const before = seedFor({
      classEntry: PALADIN,
      speciesEntry: ELF,
      backgroundEntry: NO_BACKGROUND,
      abilities: NONE,
    });
    const after = seedFor({
      classEntry: PALADIN,
      speciesEntry: ELF,
      backgroundEntry: NO_BACKGROUND,
      abilities: CON_HEAVY,
    });
    expect(before.hpMax).toBe(10);
    expect(after.hpMax).toBe(12);
    // Two different answers from two different inputs, and a character holds
    // whichever one it was created with. Nothing on `Character` derives either.
    expect(before).not.toEqual(after);
  });
});

/**
 * **The background, which is the one entry that moves the six cells.**
 *
 * Its own block because it is a different shape from the other two and the
 * difference is the whole reason it was a slice of its own: a class carries a
 * hit die and a species carries hit points per level, and both are read
 * straight into a number — a background raises the *ability scores*, and the
 * armour class and the hit points follow from the raised ones. Everything here
 * fails plausibly: a modifier that did not follow its score is still a
 * modifier, and hit points seeded from an unraised constitution are still hit
 * points.
 */
describe("what a background does to the seed", () => {
  /** The cell for one ability, out of a seed's own answer. */
  const scoreOf = (seed: ReturnType<typeof seedFor>, label: string) =>
    seed.abilities.find((ability) => ability.label === label);

  it("hands back the cells it read, so nothing can write a different six", () => {
    // The property the return value exists for. Both create paths write a
    // `sheet` as well as three numbers, and if the cells came from anywhere but
    // here the sheet would say `CON 15` while the hit points were worked out
    // from 13 — or the other way round, which is worse because it looks right.
    const seed = seedFor({
      classEntry: DRUID,
      speciesEntry: ELF,
      backgroundEntry: SALT_RUNNER,
      abilities: CON_HEAVY,
    });

    expect(scoreOf(seed, "CON")).toEqual({ label: "CON", score: "17", modifier: "+3" });
    expect(scoreOf(seed, "WIS")).toEqual({ label: "WIS", score: "14", modifier: "+2" });
    // d8 at CON +3 rather than the +2 the player typed.
    expect(seed.hpMax).toBe(11);
  });

  it("raises the armour class when it raises dexterity, and only then", () => {
    const nimble = seedFor({
      classEntry: DRUID,
      speciesEntry: ELF,
      backgroundEntry: { abilityIncreases: [{ ability: "DEX", amount: 2 }] },
      abilities: CON_HEAVY,
    });
    // DEX 14 → 16, so `10 + 3` rather than `10 + 2`.
    expect(nimble.ac).toBe(13);
    // And the constitution one above does not touch it.
    expect(
      seedFor({
        classEntry: DRUID,
        speciesEntry: ELF,
        backgroundEntry: SALT_RUNNER,
        abilities: CON_HEAVY,
      }).ac,
    ).toBe(12);
  });

  it("rewrites the modifier in the same breath as the score", () => {
    // `Ability.score` and `Ability.modifier` are both stored strings, so the
    // one thing the document cannot survive is the two disagreeing — and a
    // stale modifier is what every reader in the product would then use.
    const seed = seedFor({
      classEntry: undefined,
      speciesEntry: undefined,
      backgroundEntry: { abilityIncreases: [{ ability: "STR", amount: 1 }] },
      abilities: [cell("STR", 11, "+0")],
    });
    expect(seed.abilities).toEqual([{ label: "STR", score: "12", modifier: "+1" }]);
  });

  it("does not invent a cell nobody typed", () => {
    // A player who filled in four of the six has not said what their
    // constitution is, and writing `12` would be inventing a base of 10 and
    // presenting it as something they typed. The seed's *numbers* are unchanged
    // either way, because a missing cell already reads as `+0`.
    const seed = seedFor({
      classEntry: DRUID,
      speciesEntry: ELF,
      backgroundEntry: SALT_RUNNER,
      abilities: [cell("DEX", 14, "+2")],
    });
    expect(seed.abilities).toEqual([{ label: "DEX", score: "14", modifier: "+2" }]);
    expect(seed.hpMax).toBe(8);
  });

  it("leaves a score that is not a whole number exactly as it was written", () => {
    // `Ability.score` is a `NonEmptyString` because the document keeps what was
    // written, so `"12 (base 10)"` is expressible and is not arithmetic's to
    // touch.
    const odd: ReadonlyArray<Ability> = [{ label: "CON", score: "15 (base 13)", modifier: "+2" }];
    const seed = seedFor({
      classEntry: DRUID,
      speciesEntry: ELF,
      backgroundEntry: SALT_RUNNER,
      abilities: odd,
    });
    expect(seed.abilities).toEqual(odd);
  });

  it("adds two increases naming one ability, which is what a list of them means", () => {
    // Not reachable from any shipped editor — the form offers each ability once
    // — so this is a reading rather than a feature, and it is written down so
    // the next reader does not have to guess.
    const seed = seedFor({
      classEntry: undefined,
      speciesEntry: undefined,
      backgroundEntry: {
        abilityIncreases: [
          { ability: "CON", amount: 2 },
          { ability: "CON", amount: 1 },
        ],
      },
      abilities: [cell("CON", 10, "+0")],
    });
    expect(scoreOf(seed, "CON")?.score).toBe("13");
  });

  it("changes nothing at all for a bundled background, which is all sixteen of them", () => {
    // The bundle ships names and no grants, by the bundle-licensing decision,
    // so this is the ordinary path rather than the empty one — and it is the
    // reason nothing about an existing character moved when this shipped.
    const without = seedFor({
      classEntry: BARBARIAN,
      speciesEntry: DWARF,
      backgroundEntry: undefined,
      abilities: CON_HEAVY,
    });
    const bundled = seedFor({
      classEntry: BARBARIAN,
      speciesEntry: DWARF,
      backgroundEntry: NO_BACKGROUND,
      abilities: CON_HEAVY,
    });
    expect(bundled).toEqual(without);
    expect(bundled.abilities).toEqual(CON_HEAVY);
  });
});

describe("what a background grants, in words", () => {
  it("is pre-signed and in the order it was written", () => {
    expect(increasesLine(SALT_RUNNER.abilityIncreases)).toBe("+2 CON, +1 WIS");
  });

  it("is empty for a background that grants nothing, so a caller can say so itself", () => {
    // `""` rather than a sentence, because the two surfaces that render this
    // say different things about it: the Rules card says *no ability score
    // increases written down* and the create form says nothing at all.
    expect(increasesLine([])).toBe("");
  });
});
