import type {
  AbilityKey,
  BackgroundEntry,
  ClassEntry,
  OptionKind,
  SpeciesEntry,
} from "@taverns/api";

/**
 * The bundled rules vocabulary: **the twelve classes, the ten species and the
 * sixteen backgrounds of the 2024 Player's Handbook, as names and numbers.**
 *
 * ### This is `packages/api/src/Ruleset.ts`'s `CLASSES` and `SPECIES`, moved
 *
 * Not copied — moved. There is exactly one answer in the product to *what is a
 * druid*, and it is here. A fallback map back in the contract package would be
 * a second one, and it would be the one nobody edits.
 *
 * What that move changed for a reader is **storage, not exposure**: those
 * twenty-two facts shipped in a TypeScript file that every client downloads
 * before this, and they ship as database rows after it. Nothing about them is
 * newly published, so this raises no licensing question that was not already
 * answered by shipping them at all.
 *
 * ### The sixteen backgrounds are names and nothing else, and that is a rule
 *
 * Every one of them carries `abilityIncreases: []`. In the 2024 ruleset a
 * background is the entity that grants ability score increases — which is
 * exactly what makes it worth being an entity — and **this bundle does not ship
 * those grants**, by the captain's bundle-licensing decision: *"No feature
 * text, no background mechanical grants, no spell or item descriptions"*
 * (`AGENTS.md` § "The bundle carries no third-party prose"). The conservative
 * reading of that sentence is the one taken here, because the whole point of
 * choosing it was that nothing depends on a belief about what a licence permits.
 *
 * So a bundled background is **vocabulary**: the word a player picks and the
 * word that lands in `sheet.identity.background`. A table that plays the book's
 * grants writes its own background on the Rules screen, where the numbers are
 * the DM's own — the same route a homebrew class already takes, and the route
 * the whole slice exists to open.
 *
 * `[]` rather than an absent key is `BackgroundBody`'s decision and is argued
 * there: the three documents are told apart by having one required key each, so
 * an all-optional body would swallow the other two. Both screens render it as
 * *"no ability score increases written down"*, which is what it means.
 *
 * ### Names and numbers, and no prose
 *
 * `systemCreatures.ts`'s discipline verbatim: **nothing is invented to fill a
 * gap.** There is no `summary` on any of these thirty-eight, because the
 * Player's Handbook's own sentence about a barbarian is the Player's Handbook's
 * and this project has not written its own. A `summary` is a field a *DM* fills
 * in on their own homebrew, and an empty one on a bundled row is missing data
 * rather than wrong data that reads as right.
 *
 * Feature text — Rage, Sneak Attack, a species' traits — is a genuinely
 * different question (it is somebody's expression rather than a number), and it
 * is **answered**: the bundle carries no third-party prose, so feature text
 * arrives here only if this project writes its own, which is a new decision
 * rather than something to slip in beside a hit die. See `AGENTS.md` § "The
 * bundle carries no third-party prose".
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
 * here is the seeder's own source and nothing else: these thirty-eight are what
 * a fresh campaign's vocabulary starts as, which is why Hob still offers every
 * one of them at a table whose DM has written no homebrew.
 */

/** One bundled option, as the seeder writes it. */
export interface SystemOption {
  readonly kind: OptionKind;
  /** Stable source identity within the Taverns starter bundle; not a display name. */
  readonly sourceIndex: string;
  readonly name: string;
  readonly body: ClassEntry | SpeciesEntry | BackgroundEntry;
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
 * The sixteen origins of the 2024 Player's Handbook, alphabetically.
 *
 * **Names, and only names.** See this module's own header: a background's
 * mechanical grants are the one thing the bundle-licensing decision names out
 * by title, so every one of these carries an empty grant and a DM who plays the
 * book's version writes it themselves.
 */
const BACKGROUND_NAMES = [
  "Acolyte",
  "Artisan",
  "Charlatan",
  "Criminal",
  "Entertainer",
  "Farmer",
  "Guard",
  "Guide",
  "Hermit",
  "Merchant",
  "Noble",
  "Sage",
  "Sailor",
  "Scribe",
  "Soldier",
  "Wayfarer",
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

/** {@link BundledClassName}'s third. */
type BundledBackgroundName = (typeof BACKGROUND_NAMES)[number];

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

/**
 * What each of the sixteen grants: **nothing**, sixteen times.
 *
 * Written out rather than generated from the tuple, and that is deliberate.
 * `Record<BundledBackgroundName, BackgroundEntry>` is exhaustive over the names
 * exactly as the other two tables are, so a seventeenth name is a compile error
 * until somebody says what it grants — which is the moment to notice that this
 * bundle does not ship grants and to decide what the new row is for. A
 * `BACKGROUND_NAMES.map(() => EMPTY)` would answer that question silently and
 * for ever.
 *
 * `NO_INCREASES` is one shared frozen value because sixteen separate `[]`
 * literals is sixteen places to accidentally type something into.
 */
const NO_INCREASES: BackgroundEntry = { abilityIncreases: [] };

const BACKGROUND_BODIES: Record<BundledBackgroundName, BackgroundEntry> = {
  Acolyte: NO_INCREASES,
  Artisan: NO_INCREASES,
  Charlatan: NO_INCREASES,
  Criminal: NO_INCREASES,
  Entertainer: NO_INCREASES,
  Farmer: NO_INCREASES,
  Guard: NO_INCREASES,
  Guide: NO_INCREASES,
  Hermit: NO_INCREASES,
  Merchant: NO_INCREASES,
  Noble: NO_INCREASES,
  Sage: NO_INCREASES,
  Sailor: NO_INCREASES,
  Scribe: NO_INCREASES,
  Soldier: NO_INCREASES,
  Wayfarer: NO_INCREASES,
};

/** The twelve, in the order a picker draws them — alphabetical, as the book prints them. */
export const SYSTEM_CLASSES: ReadonlyArray<{ readonly name: string } & ClassEntry> =
  CLASS_NAMES.map((name) => ({ name, ...CLASS_BODIES[name] }));

/** The ten, likewise. */
export const SYSTEM_SPECIES: ReadonlyArray<{ readonly name: string } & SpeciesEntry> =
  SPECIES_NAMES.map((name) => ({ name, ...SPECIES_BODIES[name] }));

/** The sixteen, likewise — each with an empty grant. */
export const SYSTEM_BACKGROUNDS: ReadonlyArray<{ readonly name: string } & BackgroundEntry> =
  BACKGROUND_NAMES.map((name) => ({ name, ...BACKGROUND_BODIES[name] }));

/** The thirty-eight, as rows. */
const CLASS_SOURCE_INDEXES: Record<BundledClassName, string> = {
  Barbarian: "barbarian",
  Bard: "bard",
  Cleric: "cleric",
  Druid: "druid",
  Fighter: "fighter",
  Monk: "monk",
  Paladin: "paladin",
  Ranger: "ranger",
  Rogue: "rogue",
  Sorcerer: "sorcerer",
  Warlock: "warlock",
  Wizard: "wizard",
};

const SPECIES_SOURCE_INDEXES: Record<BundledSpeciesName, string> = {
  Aasimar: "aasimar",
  Dragonborn: "dragonborn",
  Dwarf: "dwarf",
  Elf: "elf",
  Gnome: "gnome",
  Goliath: "goliath",
  Halfling: "halfling",
  Human: "human",
  Orc: "orc",
  Tiefling: "tiefling",
};

const BACKGROUND_SOURCE_INDEXES: Record<BundledBackgroundName, string> = {
  Acolyte: "acolyte",
  Artisan: "artisan",
  Charlatan: "charlatan",
  Criminal: "criminal",
  Entertainer: "entertainer",
  Farmer: "farmer",
  Guard: "guard",
  Guide: "guide",
  Hermit: "hermit",
  Merchant: "merchant",
  Noble: "noble",
  Sage: "sage",
  Sailor: "sailor",
  Scribe: "scribe",
  Soldier: "soldier",
  Wayfarer: "wayfarer",
};

export const SYSTEM_OPTIONS: ReadonlyArray<SystemOption> = [
  ...CLASS_NAMES.map((name) => ({
    kind: "class" as const,
    sourceIndex: CLASS_SOURCE_INDEXES[name],
    name,
    body: CLASS_BODIES[name],
  })),
  ...SPECIES_NAMES.map((name) => ({
    kind: "species" as const,
    sourceIndex: SPECIES_SOURCE_INDEXES[name],
    name,
    body: SPECIES_BODIES[name],
  })),
  ...BACKGROUND_NAMES.map((name) => ({
    kind: "background" as const,
    sourceIndex: BACKGROUND_SOURCE_INDEXES[name],
    name,
    body: BACKGROUND_BODIES[name],
  })),
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
