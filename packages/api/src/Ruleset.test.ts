import { describe, expect, it } from "vitest";
import type { Ability } from "./Creature.js";
import {
  CLASS_KEYS,
  CLASSES,
  classFor,
  modifierOf,
  seedFor,
  SPECIES,
  SPECIES_KEYS,
  speciesFor,
  STARTING_LEVEL,
} from "./Ruleset.js";

/**
 * The seed, and the four things about it that are wrong *silently*.
 *
 * Every assertion below renders plausibly when it fails: a hit die read off the
 * wrong class is still a number, an unarmoured armour class that forgot a
 * barbarian's constitution is still an armour class, and a free-text label
 * quietly resolved to the nearest entry is still a character sheet. None of it
 * throws, so none of it is visible without a test that names the number.
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

describe("the vocabularies", () => {
  it("are the 2024 Player's Handbook's twelve and ten", () => {
    expect(CLASS_KEYS).toHaveLength(12);
    expect(SPECIES_KEYS).toHaveLength(10);
    expect(CLASS_KEYS).toContain("Barbarian");
    expect(CLASS_KEYS).toContain("Wizard");
    expect(SPECIES_KEYS).toContain("Orc");
    // 2014's, and deliberately absent — the cost of picking one ruleset.
    expect(SPECIES_KEYS).not.toContain("Half-Orc");
    expect(SPECIES_KEYS).not.toContain("Wood Elf");
  });

  it("carries a hit die for every class", () => {
    for (const key of CLASS_KEYS) {
      const entry = CLASSES.get(key);
      expect(entry?.hitDie).toBeGreaterThanOrEqual(6);
      expect(entry?.hitDie).toBeLessThanOrEqual(12);
    }
  });

  it("gives the two unarmoured-defence classes a second modifier and nobody else", () => {
    const extra = CLASS_KEYS.filter((key) => (CLASSES.get(key)?.unarmouredAc.length ?? 0) > 1);
    expect(extra).toEqual(["Barbarian", "Monk"]);
    expect(CLASSES.get("Barbarian")?.unarmouredAc).toEqual(["DEX", "CON"]);
    expect(CLASSES.get("Monk")?.unarmouredAc).toEqual(["DEX", "WIS"]);
  });

  it("gives exactly one species any effect on these three values", () => {
    const moving = SPECIES_KEYS.filter((key) => (SPECIES.get(key)?.hpPerLevel ?? 0) !== 0);
    expect(moving).toEqual(["Dwarf"]);
  });
});

describe("reading a stored label back", () => {
  it("matches the vocabulary's own label, whatever its casing", () => {
    expect(classFor("Druid")?.hitDie).toBe(8);
    expect(classFor("druid")?.hitDie).toBe(8);
    expect(classFor("  DRUID ")?.hitDie).toBe(8);
    expect(speciesFor("dwarf")?.hpPerLevel).toBe(1);
  });

  it("resolves an unmatched free-text label to nothing rather than to the nearest one", () => {
    // The three shapes live data actually holds: a descriptor typed as a class,
    // a 2014 species, and a table's own homebrew.
    expect(classFor("Circle of the Moon Druid")).toBeUndefined();
    expect(speciesFor("Half-orc")).toBeUndefined();
    expect(classFor("Blood Hunter")).toBeUndefined();
    expect(classFor("")).toBeUndefined();
    expect(classFor(null)).toBeUndefined();
  });
});

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
    expect(seedFor({ className: "Wizard", species: "Human", abilities: NONE }).level).toBe(
      STARTING_LEVEL,
    );
    expect(seedFor({ className: null, species: null, abilities: CON_HEAVY }).level).toBe(1);
  });

  it("takes hit points from the class hit die plus the constitution modifier", () => {
    // d8 + 2.
    expect(seedFor({ className: "Druid", species: "Elf", abilities: CON_HEAVY }).hpMax).toBe(10);
    // d12 + 2 — the biggest die in the book.
    expect(seedFor({ className: "Barbarian", species: "Orc", abilities: CON_HEAVY }).hpMax).toBe(
      14,
    );
    // d6 + 2 — the smallest, and the one a player is most likely to query.
    expect(seedFor({ className: "Wizard", species: "Human", abilities: CON_HEAVY }).hpMax).toBe(8);
    // d10 + 2.
    expect(seedFor({ className: "Paladin", species: "Aasimar", abilities: CON_HEAVY }).hpMax).toBe(
      12,
    );
  });

  it("adds a dwarf's extra hit point, and nobody else's", () => {
    expect(seedFor({ className: "Cleric", species: "Dwarf", abilities: CON_HEAVY }).hpMax).toBe(11);
    expect(seedFor({ className: "Cleric", species: "Gnome", abilities: CON_HEAVY }).hpMax).toBe(10);
  });

  it("takes armour class from the dexterity modifier and nothing worn", () => {
    expect(seedFor({ className: "Rogue", species: "Halfling", abilities: CON_HEAVY }).ac).toBe(12);
  });

  it("adds the second modifier for the two unarmoured-defence classes", () => {
    // 10 + DEX 2 + CON 2.
    expect(seedFor({ className: "Barbarian", species: "Orc", abilities: CON_HEAVY }).ac).toBe(14);
    // 10 + DEX 2 + WIS 1.
    expect(seedFor({ className: "Monk", species: "Human", abilities: CON_HEAVY }).ac).toBe(13);
  });

  it("seeds a character with no abilities set yet from the die alone", () => {
    // The manual create form asks for no scores, so this is what every
    // hand-filled character starts on: the die, and a bare 10.
    expect(seedFor({ className: "Druid", species: "Elf", abilities: NONE })).toEqual({
      level: 1,
      ac: 10,
      hpMax: 8,
    });
    // Including the two that would otherwise add a second zero.
    expect(seedFor({ className: "Barbarian", species: "Dwarf", abilities: NONE })).toEqual({
      level: 1,
      ac: 10,
      hpMax: 13,
    });
  });

  it("offers no hit points at all for a class the vocabulary does not know", () => {
    // Reachable only from a label that predates the vocabulary. There is no hit
    // die to read, and a default would be a number nobody chose — so the field
    // is absent rather than guessed, and the armour class still seeds.
    const seed = seedFor({
      className: "Circle of the Moon Druid",
      species: "Half-orc",
      abilities: CON_HEAVY,
    });
    expect(seed.hpMax).toBeUndefined();
    expect(seed).toEqual({ level: 1, ac: 12 });
  });

  it("floors hit points at 1", () => {
    const frail: ReadonlyArray<Ability> = [cell("CON", 4, "-3")];
    expect(seedFor({ className: "Wizard", species: "Human", abilities: frail }).hpMax).toBe(3);
    const dying: ReadonlyArray<Ability> = [cell("CON", 1, "-9")];
    expect(seedFor({ className: "Wizard", species: "Human", abilities: dying }).hpMax).toBe(1);
  });

  it("does not move when a score changes afterwards — because nothing calls it again", () => {
    // The captain's second decision, stated as the property it actually is:
    // seeding is a function of its inputs, and the *only* protection against a
    // recomputed value is that no reader of a character ever calls this. What
    // this pins is the shape that makes that possible — a seed is a value, not
    // a rule the row carries.
    const before = seedFor({ className: "Fighter", species: "Human", abilities: NONE });
    const after = seedFor({ className: "Fighter", species: "Human", abilities: CON_HEAVY });
    expect(before.hpMax).toBe(10);
    expect(after.hpMax).toBe(12);
    // Two different answers from two different inputs, and a character holds
    // whichever one it was created with. Nothing on `Character` derives either.
    expect(before).not.toEqual(after);
  });
});
