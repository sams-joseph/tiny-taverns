import type { AbilityKey, ClassEntry, OptionKind, SpeciesEntry } from "@taverns/api";

/**
 * The bundled rules vocabulary: **the twelve classes and the ten species of the
 * 2024 Player's Handbook, as names and numbers.**
 *
 * ### This is `packages/api/src/Ruleset.ts`'s `CLASSES` and `SPECIES`, moved
 *
 * Not copied — moved. There is exactly one answer in the product to *what is a
 * druid*, and it is here. A fallback map back in the contract package would be
 * a second one, and it would be the one nobody edits.
 *
 * What that move changed for a reader is **storage, not exposure**: these
 * twenty-two facts shipped in a TypeScript file that every client downloads
 * before this, and they ship as database rows after it. Nothing about them is
 * newly published, so this raises no licensing question that was not already
 * answered by shipping them at all.
 *
 * ### Names and numbers, and no prose
 *
 * `systemCreatures.ts`'s discipline verbatim: **nothing is invented to fill a
 * gap.** There is no `summary` on any of these twenty-two, because the
 * Player's Handbook's own sentence about a barbarian is the Player's Handbook's
 * and this project has not written its own. A `summary` is a field a *DM* fills
 * in on their own homebrew, and an empty one on a bundled row is missing data
 * rather than wrong data that reads as right.
 *
 * Feature text — Rage, Sneak Attack, a species' traits — is a genuinely
 * different question (it is somebody's expression rather than a number), and it
 * is a decision for whoever answers the bundle's licensing rather than
 * something to slip in beside a hit die.
 *
 * ### It is no longer the vocabulary Hob drafts from
 *
 * It was, for one slice. `proposeCharacter` took the class and the species as
 * two `Schema.Literals` built from the tuples below, because the reliability
 * work established that a closed enum is what lets a grammar-compiling endpoint
 * hold a small model to a vocabulary — and a per-campaign vocabulary cannot be
 * a module-level literal.
 *
 * Slice 2 answered that by building the player's toolkit **per request**, over
 * `Options.list`, so Hob is now held to *the campaign's* words rather than to
 * these. See `src/assistant/toolkit.ts`'s `CharacterVocabulary`. What is left
 * here is the seeder's own source and nothing else: these twenty-two are what a
 * fresh campaign's vocabulary starts as, which is why Hob still offers every
 * one of them at a table whose DM has written no homebrew.
 */

/** One bundled option, as the seeder writes it. */
export interface SystemOption {
  readonly kind: OptionKind;
  readonly name: string;
  readonly body: ClassEntry | SpeciesEntry;
}

/**
 * ### Why each vocabulary is a name tuple beside a table of numbers
 *
 * Two structures rather than one array of objects, and it is a TypeScript
 * limitation turned into a guarantee rather than a preference.
 * `Schema.Literals` needs a **tuple** of string literals, and
 * `Array.prototype.map` widens a tuple to an array — so deriving the names from
 * a list of objects needs a cast that asserts a length the compiler cannot see,
 * which is exactly the kind of assertion this repository refuses.
 *
 * Written this way there is no cast anywhere: the tuple *is* the vocabulary
 * (membership and order), and `Record<Name, Entry>` is exhaustive over it — a
 * name with no numbers and a set of numbers with no name are both compile
 * errors. The two halves cannot drift, and the check is the compiler's rather
 * than a test's.
 */

const CLASS_NAMES = [
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
] as const;

const SPECIES_NAMES = [
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
] as const;

/**
 * One of the twelve, as a type — what makes {@link CLASS_BODIES} exhaustive.
 *
 * A plain union rather than a `Schema.Literals` since slice 2: it had a schema
 * because it *was* Hob's tool parameter, and that vocabulary is a campaign's
 * read now. Nothing outside this file names it.
 */
type BundledClassName = (typeof CLASS_NAMES)[number];

/** {@link BundledClassName}'s twin. */
type BundledSpeciesName = (typeof SPECIES_NAMES)[number];

const DEX_ONLY: ReadonlyArray<AbilityKey> = ["DEX"];

/**
 * The two numbers each of the twelve seeds.
 *
 * `unarmouredAc` is a list rather than a boolean for the two that are the whole
 * reason it is one: **Barbarian** is Unarmoured Defense at `10 + DEX + CON` and
 * **Monk** is at `10 + DEX + WIS`. A formula that assumed `10 + DEX` would be
 * quietly wrong for exactly the two players most likely to notice.
 */
const CLASS_BODIES: Record<BundledClassName, ClassEntry> = {
  Barbarian: { hitDie: 12, unarmouredAc: ["DEX", "CON"] },
  Bard: { hitDie: 8, unarmouredAc: DEX_ONLY },
  Cleric: { hitDie: 8, unarmouredAc: DEX_ONLY },
  Druid: { hitDie: 8, unarmouredAc: DEX_ONLY },
  Fighter: { hitDie: 10, unarmouredAc: DEX_ONLY },
  Monk: { hitDie: 8, unarmouredAc: ["DEX", "WIS"] },
  Paladin: { hitDie: 10, unarmouredAc: DEX_ONLY },
  Ranger: { hitDie: 10, unarmouredAc: DEX_ONLY },
  Rogue: { hitDie: 8, unarmouredAc: DEX_ONLY },
  Sorcerer: { hitDie: 6, unarmouredAc: DEX_ONLY },
  Warlock: { hitDie: 8, unarmouredAc: DEX_ONLY },
  Wizard: { hitDie: 6, unarmouredAc: DEX_ONLY },
};

/**
 * The one number a species may move, and the one species that moves it.
 *
 * That is the 2024 ruleset showing through rather than a thin model: species
 * there carry no ability score increases (those moved to background) and no
 * subraces. The other nine are rows because the picker needs them, not because
 * they change a number, and inventing an axis for them would be the stubbed
 * field this product refuses everywhere else.
 *
 * The visible cost is stated rather than hidden: *"Half-orc"* and *"Wood elf"*
 * are 2014's and are not here. A character already carrying one keeps it — the
 * label resolves to nothing, is never rewritten, and renders exactly as it did
 * — and a new one picks `Elf` and edits the label on their sheet. **A campaign
 * that wants a Wood Elf can now write one**, which is what this whole slice is
 * for.
 */
const SPECIES_BODIES: Record<BundledSpeciesName, SpeciesEntry> = {
  Aasimar: { hpPerLevel: 0 },
  Dragonborn: { hpPerLevel: 0 },
  // Dwarven Toughness: "Your Hit Point maximum increases by 1, and it increases
  // by 1 again whenever you gain a level."
  Dwarf: { hpPerLevel: 1 },
  Elf: { hpPerLevel: 0 },
  Gnome: { hpPerLevel: 0 },
  Goliath: { hpPerLevel: 0 },
  Halfling: { hpPerLevel: 0 },
  Human: { hpPerLevel: 0 },
  Orc: { hpPerLevel: 0 },
  Tiefling: { hpPerLevel: 0 },
};

/** The twelve, in the order a picker draws them — alphabetical, as the book prints them. */
export const SYSTEM_CLASSES: ReadonlyArray<{ readonly name: string } & ClassEntry> =
  CLASS_NAMES.map((name) => ({ name, ...CLASS_BODIES[name] }));

/** The ten, likewise. */
export const SYSTEM_SPECIES: ReadonlyArray<{ readonly name: string } & SpeciesEntry> =
  SPECIES_NAMES.map((name) => ({ name, ...SPECIES_BODIES[name] }));

/** The twenty-two, as rows. */
export const SYSTEM_OPTIONS: ReadonlyArray<SystemOption> = [
  ...CLASS_NAMES.map((name) => ({ kind: "class" as const, name, body: CLASS_BODIES[name] })),
  ...SPECIES_NAMES.map((name) => ({ kind: "species" as const, name, body: SPECIES_BODIES[name] })),
];

/**
 * **There is deliberately no label lookup here any more.**
 *
 * `bundledClass` and `bundledSpecies` were this module's answer to *what is a
 * druid* for Hob's one caller, and they left with the slice that made the
 * vocabulary a campaign's. The rule they implemented — case-insensitive, on the
 * label alone, no fuzzy matching, because a prefix rule reads
 * `"Circle of the Moon Druid"` as a druid and writes a guess into a number
 * somebody reads out at the table — is `optionNamed` in
 * `packages/api/src/CharacterOption.ts`, and is now the product's only one.
 *
 * A second lookup here would be the fallback map the report says not to build:
 * two answers to what a druid is, and the one nobody edits.
 */
