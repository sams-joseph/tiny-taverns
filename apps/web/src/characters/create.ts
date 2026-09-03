import type {
  AbilityBonus,
  AbilityKey,
  CampaignMembership,
  CharacterOption,
  CharacterOwnCreate,
  CharacterSeed,
  CharacterSheet,
  RaceBody,
  SheetIdentity,
  SubraceBody,
} from "@taverns/api";
import {
  asBackgroundOption,
  asClassOption,
  asRaceOption,
  bonusesLine,
  emptyCharacterSheet,
  identityGrants,
  optionNamed,
  seedFor,
  sheetGrantsFor,
  STARTING_LEVEL,
  subraceNamed,
  withSavingThrows,
} from "@taverns/api";
import { abilitiesFrom, abilityDrafts, badScores, type AbilityDraft } from "./abilities";

export const MAX_AC = 40;
export const MAX_HP = 10_000;
export const MAX_LEVEL = 100;

/**
 * Every table this account is at, whichever side of it they sit — the
 * continuity decision made a creator a player too, so a character of your own
 * can go into a table you run exactly as into one you sit at. The old rule
 * filtered to `player` because a character used to be campaign-scoped and
 * DM-typed; neither is true any more.
 */
export const tablesForNewCharacter = (
  memberships: ReadonlyArray<CampaignMembership>,
): ReadonlyArray<CampaignMembership> => memberships;

const parseOptional = (raw: string): number | null | undefined =>
  raw.trim() === "" ? null : Number.isInteger(Number(raw)) ? Number(raw) : undefined;

const isWebUrl = (raw: string): boolean => /^https?:\/\//i.test(raw);

export interface CharacterDraft {
  readonly name: string;
  readonly playerName: string;
  readonly level: string;
  readonly race: string;
  readonly subrace: string;
  readonly raceBonusChoices: ReadonlyArray<AbilityKey>;
  readonly className: string;
  readonly background: string;
  readonly ac: string;
  readonly hpMax: string;
  readonly sheetUrl: string;
  readonly notes: string;
  readonly abilities: ReadonlyArray<AbilityDraft>;
}

export const emptyDraft: CharacterDraft = {
  name: "",
  playerName: "",
  level: String(STARTING_LEVEL),
  race: "",
  subrace: "",
  raceBonusChoices: [],
  className: "",
  background: "",
  ac: "",
  hpMax: "",
  sheetUrl: "",
  notes: "",
  abilities: abilityDrafts([]),
};

export type SeededField = "ac" | "hpMax";

export interface DraftProblems {
  readonly name?: string;
  readonly level?: string;
  readonly ac?: string;
  readonly hpMax?: string;
  readonly sheetUrl?: string;
  readonly abilities?: string;
}

export const problemsIn = (draft: CharacterDraft): DraftProblems => {
  const problems: {
    name?: string;
    level?: string;
    ac?: string;
    hpMax?: string;
    sheetUrl?: string;
    abilities?: string;
  } = {};
  const level = parseOptional(draft.level);
  const ac = parseOptional(draft.ac);
  const hpMax = parseOptional(draft.hpMax);

  if (draft.name.trim() === "") problems.name = "Give them a name.";
  if (level === undefined) problems.level = "A level is a whole number.";
  else if (level !== null && (level < 1 || level > MAX_LEVEL)) {
    problems.level = `Between 1 and ${String(MAX_LEVEL)}.`;
  }
  if (ac === undefined) problems.ac = "An armour class is a whole number.";
  else if (ac !== null && (ac < 0 || ac > MAX_AC)) problems.ac = `Between 0 and ${String(MAX_AC)}.`;
  if (hpMax === undefined) problems.hpMax = "Hit points are a whole number.";
  else if (hpMax !== null && (hpMax < 0 || hpMax > MAX_HP)) {
    problems.hpMax = `Between 0 and ${MAX_HP.toLocaleString("en")}.`;
  }
  if (draft.sheetUrl.trim() !== "" && !isWebUrl(draft.sheetUrl.trim())) {
    problems.sheetUrl = "A link starting http:// or https://.";
  }
  if (badScores(draft.abilities).length > 0) {
    problems.abilities = "An ability score is a whole number, 1 to 30.";
  }
  return problems;
};

export const refused = (problems: DraftProblems): boolean => Object.keys(problems).length > 0;

export const raceIn = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): CharacterOption | undefined => optionNamed(options, "race", draft.race);

export const subraceOptionsOf = (race: CharacterOption | undefined): ReadonlyArray<SubraceBody> =>
  race?.kind === "race" ? race.body.subraces : [];

export const subraceIn = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): SubraceBody | undefined => {
  const race = raceIn(draft, options);
  return race?.kind === "race" ? subraceNamed(race.body, draft.subrace) : undefined;
};

const choiceFrom = (
  body: RaceBody | undefined,
  choices: ReadonlyArray<AbilityKey>,
): ReadonlyArray<AbilityBonus> => {
  const choice = body?.abilityBonusChoice;
  if (choice === undefined) return [];
  const allowed = new Map(choice.bonuses.map((bonus) => [bonus.ability, bonus]));
  return choices
    .filter((ability, index) => allowed.has(ability) && choices.indexOf(ability) === index)
    .slice(0, choice.choose)
    .map((ability) => allowed.get(ability)!);
};

export const selectedRaceBonuses = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): string => {
  const race = raceIn(draft, options);
  if (race?.kind !== "race") return "";
  const subrace = subraceIn(draft, options);
  const seed = seedFor({
    classEntry: undefined,
    raceEntry: race.body,
    subraceEntry: subrace,
    raceBonusChoices: choiceFrom(race.body, draft.raceBonusChoices),
    abilities: [],
  });
  return bonusesLine(seed.appliedBonuses);
};

export const raceChoiceNote = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): string | undefined => {
  const race = raceIn(draft, options);
  if (race?.kind !== "race" || race.body.abilityBonusChoice === undefined) return undefined;
  const choice = race.body.abilityBonusChoice;
  const selected = choiceFrom(race.body, draft.raceBonusChoices);
  const remaining = choice.choose - selected.length;
  const allowed = choice.bonuses.map((bonus) => bonus.ability).join(", ");
  return remaining <= 0
    ? `${race.name} adds ${bonusesLine(selected)} from its choice.`
    : `${race.name} chooses ${String(choice.choose)} extra +1 bonuses from ${allowed}. Pick ${String(remaining)} more.`;
};

export const seedOf = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): CharacterSeed => {
  const classOption = optionNamed(options, "class", draft.className);
  const raceOption = raceIn(draft, options);
  const subraceOption = subraceIn(draft, options);
  return seedFor({
    classEntry: classOption?.kind === "class" ? classOption.body : undefined,
    raceEntry: raceOption?.kind === "race" ? raceOption.body : undefined,
    subraceEntry: subraceOption,
    raceBonusChoices:
      raceOption?.kind === "race" ? choiceFrom(raceOption.body, draft.raceBonusChoices) : [],
    abilities: abilitiesFrom(draft.abilities),
  });
};

export const seededDraft = (
  draft: CharacterDraft,
  edited: ReadonlySet<SeededField>,
  options: ReadonlyArray<CharacterOption>,
): CharacterDraft => {
  const seed = seedOf(draft, options);
  return {
    ...draft,
    ...(edited.has("ac") ? {} : { ac: String(seed.ac) }),
    ...(edited.has("hpMax") || seed.hpMax === undefined ? {} : { hpMax: String(seed.hpMax) }),
  };
};

export const payloadFrom = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): CharacterOwnCreate => {
  const level = parseOptional(draft.level);
  const ac = parseOptional(draft.ac);
  const hpMax = parseOptional(draft.hpMax);
  const playerName = draft.playerName.trim();
  const race = draft.race.trim();
  const subrace = draft.subrace.trim();
  const className = draft.className.trim();
  const background = draft.background.trim();
  const sheetUrl = draft.sheetUrl.trim();
  const notes = draft.notes.trim();
  // The corpora's half of the sheet, through the same `sheetGrantsFor` Hob's
  // `proposeCharacter` composes — level-1 class features, racial traits, the
  // three sources' proficiencies, the background's kit — so a hand-filled Hill
  // Dwarf Fighter and a drafted one start on the same document.
  const raceOption = raceIn(draft, options);
  const subraceOption = subraceIn(draft, options);
  const grants = sheetGrantsFor({
    classOption: asClassOption(optionNamed(options, "class", draft.className)),
    raceOption: asRaceOption(raceOption),
    subraceName: subraceOption?.name ?? (subrace === "" ? undefined : subrace),
    backgroundOption: asBackgroundOption(optionNamed(options, "background", draft.background)),
  });
  const abilities = withSavingThrows(
    seedOf(draft, options).abilities,
    grants.savingThrows,
    grants.proficiencyBonus,
  );
  const identity: SheetIdentity = {
    ...identityGrants(grants),
    ...(background === "" ? {} : { background }),
  };
  const sheet: CharacterSheet = {
    ...emptyCharacterSheet,
    notes,
    abilities,
    traits: grants.traits,
    ...(Object.keys(identity).length === 0 ? {} : { identity }),
    ...(grants.proficiencies.length === 0 ? {} : { proficiencies: grants.proficiencies }),
    ...(grants.inventory.length === 0 ? {} : { inventory: grants.inventory }),
    ...(grants.gold === undefined ? {} : { currency: { gp: grants.gold } }),
  };

  return {
    name: draft.name.trim(),
    ...(playerName === "" ? {} : { playerName }),
    ...(level === null || level === undefined ? {} : { level }),
    ...(race === "" ? {} : { race }),
    ...(subrace === "" ? {} : { subrace }),
    ...(className === "" ? {} : { className }),
    ...(ac === null || ac === undefined ? {} : { ac }),
    ...(hpMax === null || hpMax === undefined ? {} : { hpMax }),
    ...(sheetUrl === "" ? {} : { sheetUrl }),
    ...(notes === "" &&
    abilities.length === 0 &&
    Object.keys(identity).length === 0 &&
    grants.proficiencies.length === 0 &&
    grants.traits.length === 0 &&
    grants.inventory.length === 0 &&
    grants.gold === undefined
      ? {}
      : { sheet }),
  };
};
