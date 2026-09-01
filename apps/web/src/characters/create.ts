import type {
  AbilityBonus,
  AbilityKey,
  BackgroundBody,
  CampaignMembership,
  CharacterOption,
  CharacterOwnCreate,
  CharacterSeed,
  CharacterSheet,
  RaceBody,
  SheetIdentity,
  SubraceBody,
  Trait,
} from "@taverns/api";
import {
  bonusesLine,
  emptyCharacterSheet,
  optionNamed,
  seedFor,
  STARTING_LEVEL,
  subraceNamed,
} from "@taverns/api";
import { abilitiesFrom, abilityDrafts, badScores, type AbilityDraft } from "./abilities";

export const MAX_AC = 40;
export const MAX_HP = 10_000;
export const MAX_LEVEL = 100;

export const tablesForNewCharacter = (
  memberships: ReadonlyArray<CampaignMembership>,
): ReadonlyArray<CampaignMembership> =>
  memberships.filter((membership) => membership.relation === "player");

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

const backgroundIn = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): BackgroundBody | undefined => {
  const option = optionNamed(options, "background", draft.background);
  return option?.kind === "background" ? option.body : undefined;
};

const backgroundProficiencies = (body: BackgroundBody | undefined): ReadonlyArray<string> =>
  body === undefined ? [] : [...body.proficiencies, ...body.languages];

const backgroundTraits = (body: BackgroundBody | undefined): ReadonlyArray<Trait> =>
  body?.feature === undefined ? [] : [{ name: body.feature.name, text: body.feature.text }];

const goldPieces = (body: BackgroundBody | undefined): number | undefined => {
  const match = body?.gold?.trim().match(/^(\d+)\s*gp$/i);
  if (match?.[1] === undefined) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
};

const backgroundInventory = (body: BackgroundBody | undefined): ReadonlyArray<{ name: string }> =>
  body === undefined ? [] : body.equipment.map((name) => ({ name }));

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
  const abilities = seedOf(draft, options).abilities;
  const backgroundBody = backgroundIn(draft, options);
  const proficiencies = backgroundProficiencies(backgroundBody);
  const traits = backgroundTraits(backgroundBody);
  const inventory = backgroundInventory(backgroundBody);
  const gp = goldPieces(backgroundBody);
  const identity: SheetIdentity = {
    ...(background === "" ? {} : { background }),
  };
  const sheet: CharacterSheet = {
    ...emptyCharacterSheet,
    notes,
    abilities,
    traits,
    ...(background === "" ? {} : { identity }),
    ...(proficiencies.length === 0 ? {} : { proficiencies }),
    ...(inventory.length === 0 ? {} : { inventory }),
    ...(gp === undefined ? {} : { currency: { gp } }),
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
    background === "" &&
    proficiencies.length === 0 &&
    traits.length === 0 &&
    inventory.length === 0 &&
    gp === undefined
      ? {}
      : { sheet }),
  };
};
