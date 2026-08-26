import { describe, expect, it } from "vitest";
import type { Ability } from "./Creature.js";
import { modifierOf, seedFor, STARTING_LEVEL, type ClassEntry } from "./Ruleset.js";

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
    expect(seedFor({ classEntry: WIZARD, speciesEntry: ELF, abilities: NONE }).level).toBe(
      STARTING_LEVEL,
    );
    expect(
      seedFor({ classEntry: undefined, speciesEntry: undefined, abilities: CON_HEAVY }).level,
    ).toBe(1);
  });

  it("takes hit points from the class hit die plus the constitution modifier", () => {
    // d8 + 2.
    expect(seedFor({ classEntry: DRUID, speciesEntry: ELF, abilities: CON_HEAVY }).hpMax).toBe(10);
    // d12 + 2 — the biggest die in the book.
    expect(seedFor({ classEntry: BARBARIAN, speciesEntry: ELF, abilities: CON_HEAVY }).hpMax).toBe(
      14,
    );
    // d6 + 2 — the smallest, and the one a player is most likely to query.
    expect(seedFor({ classEntry: WIZARD, speciesEntry: ELF, abilities: CON_HEAVY }).hpMax).toBe(8);
    // d10 + 2.
    expect(seedFor({ classEntry: PALADIN, speciesEntry: ELF, abilities: CON_HEAVY }).hpMax).toBe(
      12,
    );
  });

  it("adds a dwarf's extra hit point, and nobody else's", () => {
    expect(seedFor({ classEntry: DRUID, speciesEntry: DWARF, abilities: CON_HEAVY }).hpMax).toBe(
      11,
    );
    expect(seedFor({ classEntry: DRUID, speciesEntry: ELF, abilities: CON_HEAVY }).hpMax).toBe(10);
  });

  it("takes armour class from the dexterity modifier and nothing worn", () => {
    expect(seedFor({ classEntry: ROGUE, speciesEntry: ELF, abilities: CON_HEAVY }).ac).toBe(12);
  });

  it("adds the second modifier for a class whose unarmoured defence names one", () => {
    // 10 + DEX 2 + CON 2.
    expect(seedFor({ classEntry: BARBARIAN, speciesEntry: ELF, abilities: CON_HEAVY }).ac).toBe(14);
    // 10 + DEX 2 + WIS 1.
    expect(seedFor({ classEntry: MONK, speciesEntry: ELF, abilities: CON_HEAVY }).ac).toBe(13);
  });

  it("cannot tell a campaign's own class from a bundled one", () => {
    // **The acceptance arithmetic of the homebrew slice**, as a unit: a d10
    // class whose unarmoured defence adds constitution, at CON +2, is 12 hit
    // points and armour class 14. Nothing in the seed knows or asks where the
    // entry came from — which is what makes a homebrew class work at all, and
    // is why the *only* thing the create form had to learn was where to read
    // the vocabulary from.
    expect(seedFor({ classEntry: BLOODSWORN, speciesEntry: ELF, abilities: CON_HEAVY })).toEqual({
      level: 1,
      ac: 14,
      hpMax: 12,
    });
  });

  it("seeds a character with no abilities set yet from the die alone", () => {
    // A player may skip the scores, so this is what a hand-filled character
    // starts on when they do: the die, and a bare 10.
    expect(seedFor({ classEntry: DRUID, speciesEntry: ELF, abilities: NONE })).toEqual({
      level: 1,
      ac: 10,
      hpMax: 8,
    });
    // Including a class that would otherwise add a second zero.
    expect(seedFor({ classEntry: BARBARIAN, speciesEntry: DWARF, abilities: NONE })).toEqual({
      level: 1,
      ac: 10,
      hpMax: 13,
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
      abilities: CON_HEAVY,
    });
    expect(seed.hpMax).toBeUndefined();
    expect(seed).toEqual({ level: 1, ac: 12 });
  });

  it("floors hit points at 1", () => {
    const frail: ReadonlyArray<Ability> = [cell("CON", 4, "-3")];
    expect(seedFor({ classEntry: WIZARD, speciesEntry: ELF, abilities: frail }).hpMax).toBe(3);
    const dying: ReadonlyArray<Ability> = [cell("CON", 1, "-9")];
    expect(seedFor({ classEntry: WIZARD, speciesEntry: ELF, abilities: dying }).hpMax).toBe(1);
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
    const before = seedFor({ classEntry: PALADIN, speciesEntry: ELF, abilities: NONE });
    const after = seedFor({ classEntry: PALADIN, speciesEntry: ELF, abilities: CON_HEAVY });
    expect(before.hpMax).toBe(10);
    expect(after.hpMax).toBe(12);
    // Two different answers from two different inputs, and a character holds
    // whichever one it was created with. Nothing on `Character` derives either.
    expect(before).not.toEqual(after);
  });
});
