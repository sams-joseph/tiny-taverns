import { Schema } from "effect";
import type { Ability } from "./Creature.js";

/**
 * The rules vocabulary a character is **created** from — twelve classes, ten
 * species, and the three numbers they seed.
 *
 * ### The ruleset is the 2024 Player's Handbook, and one ruleset only
 *
 * Stated once, here, and everything below is read against it. For hit points,
 * armour class and level the 2014 and 2024 rules barely differ, so the choice is
 * made on shape rather than on arithmetic: **2024 species carry no ability score
 * increases and no subraces.** A species is therefore one word rather than a
 * tree, which is what makes this a flat picker instead of a two-step one, and
 * what keeps a species' effect on these three values down to a single line.
 *
 * The visible cost is real and is stated rather than hidden: *"Half-orc"* and
 * *"Wood elf"* are 2014's and are not entries here (2024 has `Orc` and `Elf`).
 * A character already carrying one keeps it — see the next section — and a new
 * one picks `Elf` and edits the label afterwards on their sheet, where both
 * fields are ordinary free text.
 *
 * ### What is structured, and what deliberately is not
 *
 * The captain's decision of 2026-08-26 is *structured class and species
 * vocabularies, not free text*, and it is applied **at every point a new value
 * is chosen and at none where an old one has to survive**:
 *
 * | where                                      | closed?                                   |
 * | ------------------------------------------ | ----------------------------------------- |
 * | the player's create form's two pickers      | **yes** — the vocabulary and nothing else |
 * | `proposeCharacter`'s two parameters         | **yes** — `ClassKey` / `SpeciesKey`       |
 * | `character.class_name` / `character.species` | no — they are what they always were      |
 * | `CharacterOwnUpdate`, `CharacterUpdate`     | no — open, and that is the escape hatch   |
 *
 * **There is no migration and no new column, and that is the answer to the
 * existing free-text data rather than an omission.** A stored value is the
 * vocabulary's own label, so the link from a row back to an entry is the label
 * itself ({@link classFor}, {@link speciesFor}) — a stored key beside it would
 * be a second answer to a question the label already answers, and the two would
 * disagree the first time somebody edited one. A row carrying
 * `"Circle of the Moon Druid"` resolves to no entry, is never rewritten, renders
 * exactly as it did, and is one ordinary edit away from a label that does
 * resolve. Nothing anywhere refuses a value it used to accept.
 *
 * ### Seed, never recompute
 *
 * The captain's second decision, and it is the one this module is shaped
 * around: {@link seedFor} is called **once, when a character is made**, and its
 * three answers become ordinary editable columns. Nothing recomputes them when
 * a score, a class or a species later changes, because in real play they drift
 * from the formula immediately — magic armour, a feat, a shield, a subclass at
 * level 3 — and a locked derived number would be wrong within a session. There
 * is deliberately no hook, no trigger and no generated column here;
 * `descriptor` is the product's one derived character value and it stays the
 * only one.
 */

/** The six ability labels, in the order every sheet in the product draws them. */
export const AbilityKey = Schema.Literals(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
export type AbilityKey = typeof AbilityKey.Type;

/**
 * The same six as a value.
 *
 * **One list, three readers**: `apps/server/src/assistant/toolkit.ts` publishes
 * it to the model as a tool parameter's vocabulary, `apps/web/src/characters/abilities.ts`
 * draws the six cells from it, and {@link seedFor} looks two of them up. It used
 * to be written out in each of those places, which is two chances for a seventh
 * cell or a reordering to reach one and not the others.
 */
export const ABILITY_KEYS: ReadonlyArray<AbilityKey> = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

/** `+4`, `-1`, `+0` — pre-signed, the way every number on a sheet is stored. */
export const signed = (value: number): string => (value < 0 ? String(value) : `+${String(value)}`);

/** The one implementation of the ability modifier: `⌊(score − 10) / 2⌋`, signed. */
export const modifierFor = (score: number): string => signed(Math.floor((score - 10) / 2));

/** The twelve classes of the 2024 Player's Handbook. */
export const ClassKey = Schema.Literals([
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
]);
export type ClassKey = typeof ClassKey.Type;

/** The ten species of the 2024 Player's Handbook. */
export const SpeciesKey = Schema.Literals([
  "Aasimar",
  "Dragonborn",
  "Dwarf",
  "Elf",
  "Gnome",
  "Goliath",
  "Halfling",
  "Human",
  "Orc",
  "Tiefling",
]);
export type SpeciesKey = typeof SpeciesKey.Type;

/**
 * A class, as **only the parts that reach one of the three seeded values.**
 *
 * Not a class description: there is no spell list here, no proficiency list, no
 * subclass level and no saving throws, because holding a character does not make
 * this a character builder — *"the whole of a builder is a different product,
 * and the first thing it owes anyone is errata"* (`Character.ts`). Two fields is
 * the whole of what a seed can read, so two fields is what an entry carries.
 */
export interface ClassEntry {
  readonly key: ClassKey;
  /**
   * `8` for a d8. Level-1 hit points are the **maximum** of this plus the
   * constitution modifier, which is the 2024 rule verbatim.
   */
  readonly hitDie: number;
  /**
   * Which ability modifiers are added to 10 when nothing is worn.
   *
   * `["DEX"]` for ten of the twelve. The two exceptions are the whole reason
   * this is a list rather than a boolean: **Barbarian** is Unarmoured Defense at
   * `10 + DEX + CON` and **Monk** is at `10 + DEX + WIS`, so a barbarian who
   * rolled well seeds a genuinely different number from a fighter with the same
   * dexterity, and a formula that assumed `10 + DEX` would be quietly wrong for
   * exactly the two players most likely to notice.
   */
  readonly unarmouredAc: ReadonlyArray<AbilityKey>;
}

const DEX_ONLY: ReadonlyArray<AbilityKey> = ["DEX"];

/**
 * The twelve, keyed by their own label.
 *
 * A `ReadonlyMap` rather than a record so the key type is the literal union and
 * a lookup by an arbitrary string is a miss rather than a compile error — which
 * is what {@link classFor} needs, because the strings it is handed come from a
 * column that has held free text since `0012`.
 */
export const CLASSES: ReadonlyMap<ClassKey, ClassEntry> = new Map(
  (
    [
      ["Barbarian", 12, ["DEX", "CON"]],
      ["Bard", 8, DEX_ONLY],
      ["Cleric", 8, DEX_ONLY],
      ["Druid", 8, DEX_ONLY],
      ["Fighter", 10, DEX_ONLY],
      ["Monk", 8, ["DEX", "WIS"]],
      ["Paladin", 10, DEX_ONLY],
      ["Ranger", 10, DEX_ONLY],
      ["Rogue", 8, DEX_ONLY],
      ["Sorcerer", 6, DEX_ONLY],
      ["Warlock", 8, DEX_ONLY],
      ["Wizard", 6, DEX_ONLY],
    ] as ReadonlyArray<readonly [ClassKey, number, ReadonlyArray<AbilityKey>]>
  ).map(([key, hitDie, unarmouredAc]) => [key, { key, hitDie, unarmouredAc }]),
);

/** The twelve in the order a picker draws them — alphabetical, as the book prints them. */
export const CLASS_KEYS: ReadonlyArray<ClassKey> = [...CLASSES.keys()];

/**
 * A species, as **only the parts that reach one of the three seeded values** —
 * and for nine of the ten that is nothing at all.
 *
 * That is the 2024 ruleset showing through rather than a thin model: species
 * there carry no ability score increases (those moved to background) and no
 * subraces, so among the ten in the Player's Handbook exactly one touches hit
 * points, armour class or level. **Dwarf** does, through Dwarven Toughness. The
 * other nine are entries because the picker needs them, not because they change
 * a number, and inventing an axis for them would be the stubbed field this
 * product refuses everywhere else.
 */
export interface SpeciesEntry {
  readonly key: SpeciesKey;
  /**
   * Extra hit points **per level**, so `1` for a dwarf and `0` for everyone
   * else. Per level rather than flat because that is what Dwarven Toughness
   * says, and because a seed at level 1 that quietly meant *flat* would be
   * wrong the first time somebody seeded a level this vocabulary does not yet
   * seed.
   */
  readonly hpPerLevel: number;
}

export const SPECIES: ReadonlyMap<SpeciesKey, SpeciesEntry> = new Map(
  (
    [
      ["Aasimar", 0],
      ["Dragonborn", 0],
      // Dwarven Toughness: "Your Hit Point maximum increases by 1, and it
      // increases by 1 again whenever you gain a level."
      ["Dwarf", 1],
      ["Elf", 0],
      ["Gnome", 0],
      ["Goliath", 0],
      ["Halfling", 0],
      ["Human", 0],
      ["Orc", 0],
      ["Tiefling", 0],
    ] as ReadonlyArray<readonly [SpeciesKey, number]>
  ).map(([key, hpPerLevel]) => [key, { key, hpPerLevel }]),
);

export const SPECIES_KEYS: ReadonlyArray<SpeciesKey> = [...SPECIES.keys()];

/**
 * A stored label, read back as a vocabulary entry — **case-insensitively, and
 * on the label alone.**
 *
 * This is the whole of the link between a `character` row and this module, and
 * it is deliberately the only one. A row written before the vocabulary existed
 * carries whatever its DM typed: `"druid"` and `"Druid"` are one class and
 * resolve; `"Circle of the Moon Druid"`, `"Half-orc"` and `"Blood Hunter"`
 * resolve to nothing, keep their text, and are what an unmatched value has
 * always been — a label with no rule behind it.
 *
 * **No fuzzy matching, and that is a decision.** A prefix or a contains rule
 * would read `"Circle of the Moon Druid"` as a druid and `"Half-orc"` as an
 * orc, which is a guess written into a number somebody reads out at the table.
 * The seed is only ever offered where the value came from a picker, so tolerance
 * here would buy nothing and could only ever be wrong.
 */
export const classFor = (label: string | null | undefined): ClassEntry | undefined => {
  const wanted = (label ?? "").trim().toLowerCase();
  if (wanted === "") return undefined;
  for (const entry of CLASSES.values()) {
    if (entry.key.toLowerCase() === wanted) return entry;
  }
  return undefined;
};

/** {@link classFor}'s twin, and the same rules apply to it. */
export const speciesFor = (label: string | null | undefined): SpeciesEntry | undefined => {
  const wanted = (label ?? "").trim().toLowerCase();
  if (wanted === "") return undefined;
  for (const entry of SPECIES.values()) {
    if (entry.key.toLowerCase() === wanted) return entry;
  }
  return undefined;
};

/**
 * The level every character starts at.
 *
 * The captain's third decision, and the reason it is a constant rather than an
 * argument: **a level is chosen in 5e, not calculated.** Nothing derives it and
 * nothing here ever will; what this constant buys is that the create form's
 * default and the accept path's value are one number rather than two that could
 * drift.
 */
export const STARTING_LEVEL = 1;

/**
 * An ability modifier, read out of the sheet document as it was written.
 *
 * **`Ability.modifier` is the source and `Ability.score` is not**, which is the
 * one thing about trap 2 worth writing down. Both are `NonEmptyString` because
 * *"the document keeps what was written"* (`Creature.ts`), and every writer in
 * the product — the sheet's abilities editor, and `proposeCharacter`'s
 * `abilitiesFrom` — writes the pair in one object literal precisely so they
 * cannot disagree. Reading the score and recomputing would be a second
 * implementation of a rule that already has one, and it would silently overrule
 * a player who typed a modifier their table plays with.
 *
 * A cell that is absent, or whose modifier is not an integer, reads as `0` —
 * *nobody has said*, which for a character being created is the ordinary case
 * rather than the broken one. **`Ability` is not restructured and must not be**:
 * its blast radius is the whole bestiary.
 */
export const modifierOf = (abilities: ReadonlyArray<Ability>, key: AbilityKey): number => {
  const cell = abilities.find((ability) => ability.label.trim().toUpperCase() === key);
  if (cell === undefined) return 0;
  const value = Number(cell.modifier.trim());
  return Number.isInteger(value) ? value : 0;
};

/** What a character is created with. Every one of the three is editable afterwards. */
export interface CharacterSeed {
  /** Always {@link STARTING_LEVEL}. */
  readonly level: number;
  /**
   * The unarmoured base, and nothing more — `10 + DEX`, or the two classes that
   * add a second modifier to it.
   *
   * **Armour is not read and must not be**, which is the honest half of this
   * number. Anything a character actually wears lives in `sheet.inventory` as
   * free-text lines a player typed, and parsing *"Studded leather, +1"* into an
   * armour class is a guess dressed as arithmetic. So this is a starting point
   * the player edits the moment they buy a shield, and every surface that draws
   * it says so.
   */
  readonly ac: number;
  /**
   * The class hit die at its maximum, plus the constitution modifier, plus the
   * species' own per-level hit points — the 2024 level-1 rule.
   *
   * **Absent when the class is not one this vocabulary knows**, because there is
   * then no hit die to read and a default would be a number nobody chose. That
   * is reachable only from an existing free-text label; every path that creates
   * a character picks from {@link CLASS_KEYS}.
   */
  readonly hpMax?: number;
}

/**
 * The seed — **one implementation, called from both create paths.**
 *
 * `apps/web/src/characters/create.ts` calls it when the player picks a class or
 * a species, so the two numbers appear in the form's own boxes and are edited
 * before anything is sent; `apps/server/src/assistant/toolkit.ts` calls it when
 * Hob drafts one, so the card and the row it becomes carry the same numbers for
 * the reason `HobProposal.sheet` is resolved at proposal time. Two copies of
 * this arithmetic would be two answers to *"what does a level-1 druid start
 * on"*, and they would differ on the day somebody fixed one of them.
 *
 * Hit points are floored at 1: a d6 class with a −3 constitution is 3, and the
 * clamp only ever fires for a modifier a player typed by hand.
 */
export const seedFor = (input: {
  readonly className: string | null | undefined;
  readonly species: string | null | undefined;
  readonly abilities: ReadonlyArray<Ability>;
}): CharacterSeed => {
  const entry = classFor(input.className);
  const species = speciesFor(input.species);
  const level = STARTING_LEVEL;

  const acFrom = entry?.unarmouredAc ?? DEX_ONLY;
  const ac = acFrom.reduce((total, key) => total + modifierOf(input.abilities, key), 10);

  if (entry === undefined) return { level, ac };

  const hp = entry.hitDie + modifierOf(input.abilities, "CON") + (species?.hpPerLevel ?? 0) * level;
  return { level, ac, hpMax: Math.max(1, hp) };
};
