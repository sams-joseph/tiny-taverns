import type { Ability, Trait } from "./Creature.js";
import type {
  BackgroundBody,
  BackgroundOption,
  CharacterOption,
  ClassOption,
  OptionDetails,
  RaceOption,
} from "./CharacterOption.js";
import { isBackgroundOption, isClassOption, isRaceOption } from "./CharacterOption.js";
import { type AbilityKey, ABILITY_KEYS, signed } from "./Ruleset.js";

/**
 * What the picked class, race, subrace and background put on a fresh sheet —
 * the one implementation of "the corpora drive the starting sheet".
 *
 * ### Why this lives in `@taverns/api`
 *
 * The same reason `seedFor` does: **both creation paths call it**, the manual
 * form's `payloadFrom` (`apps/web/src/characters/create.ts`) and Hob's
 * `proposeCharacter` handler (`apps/server/src/assistant/toolkit.ts`). The
 * two paths have diverged on exactly this material before — the manual form
 * once seeded from a bare 10 while Hob's draft carried the standard array —
 * and a second implementation of "which racial traits does a Hill Dwarf get"
 * would part company first at the thing nobody looks at. Background grants
 * used to be two private copies of four little helpers, one per composer;
 * they are this module now.
 *
 * ### What it reads, and what that means for a label that resolves to nothing
 *
 * Everything comes off the resolved `CharacterOption` values — the prose
 * `body` the DM can author, and the FK-backed `details` the 2014 importer
 * fills (`optionDetailsFor`). A free-text race, a homebrew class with no
 * progression rows, or an unresolved background each contribute exactly what
 * they carry and nothing invented: no traits, no proficiency bonus, no
 * features. That is the same degradation an unmatched label has always had on
 * the seed arithmetic.
 *
 * ### What deliberately does not happen here
 *
 * - **No choices are made.** A `parent_feature_id` under a granted feature
 *   (*Fighting Style: Archery*) and a `rule_choice_group` are the player's to
 *   pick later; only the parent grant is written.
 * - **No saving-throw or skill *numbers* are derived without their sources.**
 *   `withSavingThrows` writes a save value only when both the modifier cell
 *   and the corpus-supplied proficiency bonus are in hand — the old rule was
 *   "never derive, the document does not model proficiency"; the progression
 *   corpus models it now, so the number is a read, not a guess.
 * - **Feats are not consulted.** No 2014 SRD feat applies at level 1 (Grappler
 *   is an ASI-level choice with a prerequisite), so a fresh sheet has nothing
 *   to read from that corpus.
 */
export interface SheetGrantSources {
  readonly classOption?: ClassOption | undefined;
  readonly raceOption?: RaceOption | undefined;
  /** Already resolved through `subraceNamed`; the campaign's own spelling. */
  readonly subraceName?: string | undefined;
  readonly backgroundOption?: BackgroundOption | undefined;
}

export interface SheetGrants {
  /** Level-1 class features, then race/subrace traits, then the background feature. */
  readonly traits: ReadonlyArray<Trait>;
  /** Armour, weapons, tools and languages — class, race and background grants, deduplicated. */
  readonly proficiencies: ReadonlyArray<string>;
  /** The class's proficient saving throws, as ability labels. */
  readonly savingThrows: ReadonlyArray<AbilityKey>;
  /** The level-1 proficiency bonus, when the class has progression rows. */
  readonly proficiencyBonus?: number;
  /** The background's starting equipment. */
  readonly inventory: ReadonlyArray<{ readonly name: string }>;
  /** The background's starting gold, when its source states one in gp. */
  readonly gold?: number;
  /** The race's walking speed, in feet. */
  readonly speed?: number;
  /** The class's hit die size — `10` for a d10. */
  readonly hitDie?: number;
}

const wanted = (label: string | undefined): string => (label ?? "").trim().toLowerCase();

/** Grants scoped to a subrace apply only when that subrace was picked. */
const forSubrace = <Row extends { readonly subraceName: string | null }>(
  rows: ReadonlyArray<Row>,
  subraceName: string | undefined,
): ReadonlyArray<Row> =>
  rows.filter(
    (row) =>
      row.subraceName === null || wanted(row.subraceName ?? undefined) === wanted(subraceName),
  );

const dedupe = (names: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const kept: Array<string> = [];
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    kept.push(name.trim());
  }
  return kept;
};

const prose = (lines: ReadonlyArray<string>): string => lines.join("\n\n");

/**
 * The class's proficiency list minus the entries that are not proficiencies:
 * `"Saving Throw: STR"` is written as a mark on the ability cell instead
 * (`withSavingThrows`), and `"Choose two skills from …"` is an instruction —
 * the pick lands in `sheet.skills` when it is made, not in this list.
 */
const classProficiencies = (option: ClassOption | undefined): ReadonlyArray<string> =>
  (option?.body.proficiencies ?? []).filter(
    (line) => !/^saving throw:/i.test(line.trim()) && !/^choose /i.test(line.trim()),
  );

const raceDetailNames = (
  details: OptionDetails | undefined,
  subraceName: string | undefined,
): ReadonlyArray<string> =>
  details === undefined
    ? []
    : [
        ...forSubrace(details.proficiencies, subraceName).map((grant) => grant.proficiency.name),
        ...forSubrace(details.languages, subraceName).map((grant) => grant.language.name),
      ];

const raceTraits = (
  option: RaceOption | undefined,
  subraceName: string | undefined,
): ReadonlyArray<Trait> =>
  option?.details === undefined
    ? []
    : forSubrace(option.details.traits, subraceName).map((grant) => ({
        name: grant.trait.name,
        text: prose(grant.trait.desc),
      }));

const classFeatures = (option: ClassOption | undefined): ReadonlyArray<Trait> =>
  (option?.details?.levelOneFeatures ?? []).map((feature) => ({
    name: feature.name,
    text: prose(feature.desc),
  }));

const backgroundFeature = (body: BackgroundBody | undefined): ReadonlyArray<Trait> =>
  body?.feature === undefined ? [] : [{ name: body.feature.name, text: body.feature.text }];

const savingThrowsOf = (option: ClassOption | undefined): ReadonlyArray<AbilityKey> =>
  (option?.body.savingThrows ?? [])
    .map((line) => line.trim().toUpperCase())
    .filter((line): line is AbilityKey => (ABILITY_KEYS as ReadonlyArray<string>).includes(line));

const goldPieces = (body: BackgroundBody | undefined): number | undefined => {
  const match = body?.gold?.trim().match(/^(\d+)\s*gp$/i);
  if (match?.[1] === undefined) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
};

export const sheetGrantsFor = (sources: SheetGrantSources): SheetGrants => {
  const classOption =
    sources.classOption !== undefined && isClassOption(sources.classOption)
      ? sources.classOption
      : undefined;
  const raceOption =
    sources.raceOption !== undefined && isRaceOption(sources.raceOption)
      ? sources.raceOption
      : undefined;
  const backgroundOption =
    sources.backgroundOption !== undefined && isBackgroundOption(sources.backgroundOption)
      ? sources.backgroundOption
      : undefined;
  const background = backgroundOption?.body;
  const proficiencyBonus = classOption?.details?.proficiencyBonus;
  const gold = goldPieces(background);

  return {
    traits: [
      ...classFeatures(classOption),
      ...raceTraits(raceOption, sources.subraceName),
      ...backgroundFeature(background),
    ],
    proficiencies: dedupe([
      ...classProficiencies(classOption),
      ...raceDetailNames(raceOption?.details, sources.subraceName),
      ...(background?.proficiencies ?? []),
      ...(background?.languages ?? []),
    ]),
    savingThrows: savingThrowsOf(classOption),
    ...(proficiencyBonus === undefined ? {} : { proficiencyBonus }),
    inventory: (background?.equipment ?? []).map((name) => ({ name })),
    ...(gold === undefined ? {} : { gold }),
    ...(raceOption === undefined ? {} : { speed: raceOption.body.speed }),
    ...(classOption === undefined ? {} : { hitDie: classOption.body.hitDie }),
  };
};

/**
 * Marks the class's proficient saving throws on the seeded ability cells.
 *
 * The save *value* is written only when both of its parts are reads rather
 * than guesses: the cell's own modifier, and the corpus-supplied proficiency
 * bonus. A class whose progression rows are absent still gets the mark —
 * `proficient` is the source's own statement — with no number beside it.
 */
export const withSavingThrows = (
  abilities: ReadonlyArray<Ability>,
  savingThrows: ReadonlyArray<AbilityKey>,
  proficiencyBonus?: number,
): ReadonlyArray<Ability> => {
  if (savingThrows.length === 0) return abilities;
  const marked = new Set<string>(savingThrows);
  return abilities.map((ability) => {
    if (!marked.has(ability.label.trim().toUpperCase())) return ability;
    const modifier = Number(ability.modifier.trim());
    const save =
      proficiencyBonus !== undefined && Number.isInteger(modifier)
        ? signed(modifier + proficiencyBonus)
        : undefined;
    return { ...ability, proficient: true, ...(save === undefined ? {} : { save }) };
  });
};

/**
 * The identity keys the corpora answer for a fresh level-1 sheet, in the
 * formats `SheetIdentity` documents: `"25 ft."`, `"+2"`, `"1/1 d10"`. Merged
 * by the composer with the keys only it knows (background, subclass).
 */
export const identityGrants = (
  grants: SheetGrants,
): { readonly speed?: string; readonly proficiency?: string; readonly hitDice?: string } => ({
  ...(grants.speed === undefined ? {} : { speed: `${String(grants.speed)} ft.` }),
  ...(grants.proficiencyBonus === undefined
    ? {}
    : { proficiency: signed(grants.proficiencyBonus) }),
  ...(grants.hitDie === undefined ? {} : { hitDice: `1/1 d${String(grants.hitDie)}` }),
});

/** The resolved option of a kind, told apart for `SheetGrantSources`. */
export const asClassOption = (option: CharacterOption | undefined): ClassOption | undefined =>
  option !== undefined && isClassOption(option) ? option : undefined;
export const asRaceOption = (option: CharacterOption | undefined): RaceOption | undefined =>
  option !== undefined && isRaceOption(option) ? option : undefined;
export const asBackgroundOption = (
  option: CharacterOption | undefined,
): BackgroundOption | undefined =>
  option !== undefined && isBackgroundOption(option) ? option : undefined;
