import { Schema } from "effect";
import type { Ability } from "./Creature.js";

/**
 * The **arithmetic** a character is created from, and nothing else.
 *
 * ### What this module is, after the vocabulary left it
 *
 * It used to hold the twelve classes and the ten species as module-level maps,
 * because there was one ruleset and it was the same at every table. A campaign
 * can have its own classes and species now (`CharacterOption.ts`), so a
 * vocabulary is a **read** rather than a constant — and what is left here is the
 * part that has one right answer wherever it is asked:
 *
 * | stays here                                      | why                                        |
 * | ----------------------------------------------- | ------------------------------------------ |
 * | {@link AbilityKey}, {@link ABILITY_KEYS}         | the ruleset's *frame*, not its content     |
 * | {@link signed}, {@link modifierFor}, {@link modifierOf} | arithmetic with one right answer   |
 * | {@link STARTING_LEVEL}                           | a constant, not a vocabulary               |
 * | {@link ClassEntry}, {@link SpeciesEntry}         | the shape a document decodes to            |
 * | {@link seedFor}                                  | one implementation, both create paths      |
 *
 * The six ability keys stay because they are the ruleset's frame rather than
 * its content: a 5e-shaped game has six abilities the way it has a d20, and no
 * amount of homebrew makes a seventh. That is the line — some vocabularies are
 * the *frame*, and those live in code.
 *
 * **The twelve and the ten moved to `apps/server/src/ruleset/systemOptions.ts`,
 * which is the bundle the seeder writes** — so there is still exactly one
 * answer to *what is a druid*, and it is now a row rather than a map. There is
 * deliberately **no fallback map here**: a second copy in code would be a second
 * answer, and it would be the one that never gets edited.
 *
 * ### Seed, never recompute
 *
 * The captain's decision, and it is the one this module is shaped around:
 * {@link seedFor} is called **once, when a character is made**, and its three
 * answers become ordinary editable columns. Nothing recomputes them when a
 * score, a class or a species later changes, because in real play they drift
 * from the formula immediately — magic armour, a feat, a shield, a subclass at
 * level 3 — and a locked derived number would be wrong within a session.
 *
 * **Homebrew does not weaken that; it strengthens it.** A DM who edits a
 * campaign's class afterwards changes what the *next* character is made from
 * and nothing else. There is no recompute-all-sheets and there must not be one:
 * it would overwrite `ac` and `hpMax` values players typed by hand, with no way
 * to tell an intentional number from a stale seed.
 */

/** The six ability labels, in the order every sheet in the product draws them. */
export const AbilityKey = Schema.Literals(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
export type AbilityKey = typeof AbilityKey.Type;

/**
 * The same six as a value.
 *
 * **One list, four readers**: `apps/server/src/assistant/toolkit.ts` publishes
 * it to the model as a tool parameter's vocabulary, `apps/web/src/characters/abilities.ts`
 * draws the six cells from it, the unarmoured-armour-class editor on a class
 * offers them as toggles, and {@link seedFor} looks two of them up. It used to
 * be written out in each of those places, which is two chances for a seventh
 * cell or a reordering to reach one and not the others.
 */
export const ABILITY_KEYS: ReadonlyArray<AbilityKey> = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

/** `+4`, `-1`, `+0` — pre-signed, the way every number on a sheet is stored. */
export const signed = (value: number): string => (value < 0 ? String(value) : `+${String(value)}`);

/** The one implementation of the ability modifier: `⌊(score − 10) / 2⌋`, signed. */
export const modifierFor = (score: number): string => signed(Math.floor((score - 10) / 2));

/**
 * A class, as **only the parts that reach one of the three seeded values.**
 *
 * The shape {@link seedFor} reads, and the shape `CharacterOption.ts`'s
 * `ClassBody` decodes to — structurally, rather than by one importing the
 * other. Keeping it an interface here is what lets this module stay free of the
 * wire schemas while the seed still has a name for what it is handed; a
 * `ClassBody` is assignable to it, extras and all.
 *
 * There is no `key` on it any more. There was, back when a class *was* one of
 * twelve literals; a campaign's class is a row with a name, and the name lives
 * on the row rather than inside the document.
 */
export interface ClassEntry {
  /**
   * `8` for a d8. Level-1 hit points are the **maximum** of this plus the
   * constitution modifier, which is the 2024 rule verbatim.
   */
  readonly hitDie: number;
  /**
   * Which ability modifiers are added to 10 when nothing is worn.
   *
   * `["DEX"]` for ten of the twelve bundled classes. The two exceptions are the
   * whole reason this is a list rather than a boolean: **Barbarian** is
   * Unarmoured Defense at `10 + DEX + CON` and **Monk** is at `10 + DEX + WIS`,
   * so a barbarian who rolled well seeds a genuinely different number from a
   * fighter with the same dexterity, and a formula that assumed `10 + DEX`
   * would be quietly wrong for exactly the two players most likely to notice.
   */
  readonly unarmouredAc: ReadonlyArray<AbilityKey>;
}

/**
 * A species, as **only the parts that reach one of the three seeded values** —
 * and for nine of the ten bundled species that is nothing at all.
 *
 * That is the 2024 ruleset showing through rather than a thin model: species
 * there carry no ability score increases (those moved to background) and no
 * subraces, so among the ten in the Player's Handbook exactly one touches hit
 * points, armour class or level. **Dwarf** does, through Dwarven Toughness.
 */
export interface SpeciesEntry {
  /**
   * Extra hit points **per level**, so `1` for a dwarf and `0` for everyone
   * else. Per level rather than flat because that is what Dwarven Toughness
   * says, and because a seed at level 1 that quietly meant *flat* would be
   * wrong the first time somebody seeded a level this does not yet seed.
   */
  readonly hpPerLevel: number;
}

/** What an unarmoured armour class falls back to when no class is picked. */
const DEX_ONLY: ReadonlyArray<AbilityKey> = ["DEX"];

/**
 * The level every character starts at.
 *
 * The captain's decision, and the reason it is a constant rather than an
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
   * The unarmoured base, and nothing more — `10 + DEX`, or a class that adds
   * further modifiers to it.
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
   * **Absent when no class was picked**, because there is then no hit die to
   * read and a default would be a number nobody chose. That is reachable from
   * an existing free-text label, and from a form where the picker has not been
   * touched yet.
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
 * ### It takes entries, not labels — and that is what homebrew cost it
 *
 * It used to take `{ className, species }` as strings and look them up in this
 * module's own maps. There is no global map any more, so the caller resolves
 * the labels against **its own** vocabulary and hands over what it found: the
 * create form has the row the picker was built from, and Hob's handler has the
 * entry it drafted against. `undefined` is the ordinary *nobody has picked one*
 * — and, for an existing free-text label, *this campaign has no such class*,
 * which is the same answer `classFor` used to give and is deliberately not a
 * near miss (`optionNamed` refuses fuzzy matching for the reasons written
 * there).
 *
 * Hit points are floored at 1: a d6 class with a −3 constitution is 3, and the
 * clamp only ever fires for a modifier a player typed by hand.
 */
export const seedFor = (input: {
  /** The class this character is being made from, or `undefined` for none. */
  readonly classEntry: ClassEntry | undefined;
  readonly speciesEntry: SpeciesEntry | undefined;
  readonly abilities: ReadonlyArray<Ability>;
}): CharacterSeed => {
  const { classEntry, speciesEntry } = input;
  const level = STARTING_LEVEL;

  const acFrom = classEntry?.unarmouredAc ?? DEX_ONLY;
  const ac = acFrom.reduce((total, key) => total + modifierOf(input.abilities, key), 10);

  if (classEntry === undefined) return { level, ac };

  const hp =
    classEntry.hitDie +
    modifierOf(input.abilities, "CON") +
    (speciesEntry?.hpPerLevel ?? 0) * level;
  return { level, ac, hpMax: Math.max(1, hp) };
};
