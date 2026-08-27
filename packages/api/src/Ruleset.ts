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
 * | {@link ClassEntry}, {@link SpeciesEntry}, {@link BackgroundEntry} | the shapes a document decodes to |
 * | {@link seedFor}                                  | one implementation, both create paths      |
 *
 * The six ability keys stay because they are the ruleset's frame rather than
 * its content: a 5e-shaped game has six abilities the way it has a d20, and no
 * amount of homebrew makes a seventh. That is the line — some vocabularies are
 * the *frame*, and those live in code.
 *
 * **The twelve, the ten and the sixteen moved to
 * `apps/server/src/ruleset/systemOptions.ts`, which is the bundle the seeder
 * writes** — so there is still exactly one
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

/**
 * One ability score a background raises, and by how much.
 *
 * `{ ability: "CON", amount: 2 }`. A **list** of these rather than six numbers
 * keyed by ability, for `ClassEntry.unarmouredAc`'s reason one level on: what
 * a background says is *"+2 Constitution and +1 Wisdom"*, which is two things,
 * and a record with four zeroes in it says four things nobody wrote.
 *
 * A schema here rather than an interface, unlike {@link ClassEntry} and its
 * `ClassBody` — because it is the same shape on both sides and there is nothing
 * for a document to add to it. `AbilityKey` is already a schema in this module
 * for the same reason: it is the ruleset's frame, and a frame has one spelling.
 *
 * **An increase, as the name says, so the amount is at least 1.** A row saying
 * `+0` is a row that says nothing, which the editor simply does not write. A
 * background that *lowers* a score is not expressible and deliberately so:
 * nothing in the 2024 ruleset does it, and a table that wants one has a player
 * type the lower score — a number they can see rather than one applied behind
 * them.
 */
export const AbilityIncrease = Schema.Struct({
  ability: AbilityKey,
  amount: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 })),
});
export type AbilityIncrease = typeof AbilityIncrease.Type;

/**
 * A background, as **only the part that reaches one of the seeded values** —
 * and it is the only one of the three entries that reaches them *through the
 * ability scores* rather than past them.
 *
 * That is why the background was not slice 1. A class carries a hit die and a
 * species carries hit points per level, and both are read straight into a
 * number; the 2024 ruleset moved the ability score increases off the species
 * and onto the background, so a background moves the six cells first and the
 * armour class and the hit points follow from the cells. {@link seedFor}
 * therefore applies it **before** it reads a modifier, and hands the moved
 * cells back — see {@link CharacterSeed.abilities}.
 *
 * **Empty is the ordinary state, not a stub.** The bundled sixteen ship with
 * no increases at all: this project ships what it writes, and a background's
 * mechanical grants are named out by the bundle-licensing decision in
 * `AGENTS.md` § "The bundle carries no third-party prose". A table that plays
 * those grants writes its own background on the Rules screen, where the numbers
 * are the DM's own — which is the same route a homebrew class already takes.
 */
export interface BackgroundEntry {
  readonly abilityIncreases: ReadonlyArray<AbilityIncrease>;
}

/**
 * What a background grants, in one line — `"+2 CON, +1 WIS"`, or `""` when it
 * grants nothing.
 *
 * Here rather than on either screen because **two surfaces render it**: the
 * Rules card, which is where a DM checks what they wrote, and the create form,
 * which is where a player finds out that two numbers below the picker moved
 * without them typing anything. Two spellings of it would disagree about the
 * sign first, which is the half that matters.
 */
export const increasesLine = (increases: ReadonlyArray<AbilityIncrease>): string =>
  increases.map((increase) => `${signed(increase.amount)} ${increase.ability}`).join(", ");

/**
 * The six cells with a background's increases applied — **the one place that
 * arithmetic happens.**
 *
 * Three rules, and each of them is a refusal to invent:
 *
 * - **A cell that is not there is not created.** A player who filled in four of
 *   the six and picked a background that raises constitution has not said what
 *   their constitution is, and writing `12` would be inventing a base of 10 and
 *   presenting it as something they typed. `modifierOf` already reads a missing
 *   cell as `0`, so the seed's numbers are unchanged either way — what is
 *   avoided is a *document* that claims six scores when four were given.
 * - **A cell whose score is not a whole number is left exactly as written.**
 *   `Ability.score` is a `NonEmptyString` because *"the document keeps what was
 *   written"*, so `"12 (base 10)"` is expressible and is not arithmetic's to
 *   touch.
 * - **The modifier is rewritten in the same object literal as the score**, the
 *   rule every writer of an `Ability` in the product follows: the one thing the
 *   document cannot survive is the two disagreeing.
 *
 * Two increases naming one ability **add up**, which is what a list of
 * increases means. No shipped editor can produce that — the form offers each
 * ability once — so it is a reading rather than a feature.
 */
const withIncreases = (
  abilities: ReadonlyArray<Ability>,
  entry: BackgroundEntry | undefined,
): ReadonlyArray<Ability> => {
  const increases = entry?.abilityIncreases ?? [];
  if (increases.length === 0) return abilities;
  const by = new Map<string, number>();
  for (const increase of increases) {
    by.set(increase.ability, (by.get(increase.ability) ?? 0) + increase.amount);
  }
  return abilities.map((ability) => {
    const amount = by.get(ability.label.trim().toUpperCase());
    if (amount === undefined || amount === 0) return ability;
    const score = Number(ability.score.trim());
    if (!Number.isInteger(score)) return ability;
    const raised = score + amount;
    return { ...ability, score: String(raised), modifier: modifierFor(raised) };
  });
};

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

/** What a character is created with. Every one of these is editable afterwards. */
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
  /**
   * The six cells **as they should be written down** — the ones handed in, with
   * the background's ability score increases applied.
   *
   * It is an output rather than a passthrough, and that is the whole of what
   * the background cost this function. The 2024 ruleset puts the ability score
   * increases on the background, so the cells a character is created with are
   * not the cells the player typed — and both callers write a `sheet` as well
   * as three numbers. Returning them here is what makes *"the cells the seed
   * read are the cells that get written"* a property of the shape rather than a
   * rule each caller has to remember: there is no way to take the armour class
   * from this seed and the scores from somewhere else without noticing.
   *
   * Unchanged when no background was picked, or when it grants nothing — which
   * is every bundled background and every character made before this existed.
   */
  readonly abilities: ReadonlyArray<Ability>;
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
 * ### Three entries now, and the third one is a different shape
 *
 * A class and a species are read *into* a number — the hit die, the hit points
 * per level. The **background** is read into the ability scores, because the
 * 2024 ruleset moved the ability score increases off the species and onto it.
 * So it is applied first, everything else reads the raised cells, and the
 * raised cells come back on {@link CharacterSeed.abilities} for the caller to
 * write down. That is the only structural change the background made here.
 *
 * **It is still called once, at creation, and nothing recomputes.** A player
 * who changes their background afterwards changes a line of prose in
 * `sheet.identity`; their scores, armour class and hit points stay exactly
 * where they were, the same answer editing a class label already gives.
 *
 * Hit points are floored at 1: a d6 class with a −3 constitution is 3, and the
 * clamp only ever fires for a modifier a player typed by hand.
 */
export const seedFor = (input: {
  /** The class this character is being made from, or `undefined` for none. */
  readonly classEntry: ClassEntry | undefined;
  readonly speciesEntry: SpeciesEntry | undefined;
  /**
   * The background, or `undefined` for none — **the entry that moves the scores
   * rather than reading them.**
   *
   * It is applied first, so everything below reads the raised cells: a
   * background that raises constitution raises the hit points, and one that
   * raises dexterity raises the armour class, exactly as it would if the player
   * had typed the higher number themselves.
   */
  readonly backgroundEntry: BackgroundEntry | undefined;
  /** The cells as they were typed or ranked — *before* any background. */
  readonly abilities: ReadonlyArray<Ability>;
}): CharacterSeed => {
  const { classEntry, speciesEntry } = input;
  const level = STARTING_LEVEL;
  // First, and once. Every read below is of these cells, and these are the
  // cells that get written down — see `CharacterSeed.abilities`.
  const abilities = withIncreases(input.abilities, input.backgroundEntry);

  const acFrom = classEntry?.unarmouredAc ?? DEX_ONLY;
  const ac = acFrom.reduce((total, key) => total + modifierOf(abilities, key), 10);

  if (classEntry === undefined) return { level, ac, abilities };

  const hp =
    classEntry.hitDie + modifierOf(abilities, "CON") + (speciesEntry?.hpPerLevel ?? 0) * level;
  return { level, ac, hpMax: Math.max(1, hp), abilities };
};
