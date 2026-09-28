import type {
  AbilityBonus,
  AbilityKey,
  BackgroundOption,
  CampaignMembership,
  CharacterOption,
  CharacterOwnCreate,
  CharacterSeed,
  CharacterSheet,
  ClassOption,
  EquipmentId,
  KitEquipment,
  KitPick,
  RaceBody,
  StartingKit,
  StartingSheetSources,
  SubraceBody,
} from "@taverns/api";
import {
  APPEARANCE_MAX,
  asBackgroundOption,
  asClassOption,
  asRaceOption,
  bonusesLine,
  defaultKitPicks,
  inCategory,
  optionNamed,
  seedFor,
  STARTING_LEVEL,
  startingSeed,
  startingSheetBody,
  subraceNamed,
} from "@taverns/api";
import { abilitiesFrom, abilityDrafts, badScores, type AbilityDraft } from "./abilities";

export const MAX_AC = 40;
export const MAX_HP = 10_000;
export const MAX_LEVEL = 100;

/**
 * The tables *New character* offers as context beside *No campaign* — every
 * table this account is at, whichever side of it they sit. The continuity
 * decision made a creator a player too, so a character of your own can go
 * into a table you run exactly as into one you sit at. The old rule filtered
 * to `player` because a character used to be campaign-scoped and DM-typed;
 * neither is true any more.
 */
export const tablesForNewCharacter = (
  memberships: ReadonlyArray<CampaignMembership>,
): ReadonlyArray<CampaignMembership> => memberships;

/** `""` ⇄ `null`. A blank number box is *I have not filled this in*, not a zero; `undefined` is not a whole number. */
export const parseOptional = (raw: string): number | null | undefined =>
  raw.trim() === "" ? null : Number.isInteger(Number(raw)) ? Number(raw) : undefined;

/** What a sheet's level, AC and hit-point boxes refuse, before the schema refuses it. */
export interface IdentityNumberProblems {
  readonly level?: string;
  readonly ac?: string;
  readonly hpMax?: string;
}

/**
 * **The sheet's three identity numbers, checked the way the columns check
 * them** — a character's (this form, `IdentityDialog`) and an NPC sheet's
 * (`cast/NpcSheetDialog.tsx`), which carry the same columns under the same
 * bounds. Each box may be blank; a filled one is a whole number in range.
 */
export const identityNumberProblems = (boxes: {
  readonly level: string;
  readonly ac: string;
  readonly hpMax: string;
}): IdentityNumberProblems => {
  const problems: { level?: string; ac?: string; hpMax?: string } = {};
  const level = parseOptional(boxes.level);
  const ac = parseOptional(boxes.ac);
  const hpMax = parseOptional(boxes.hpMax);
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
  return problems;
};

const isWebUrl = (raw: string): boolean => /^https?:\/\//i.test(raw);

export interface CharacterDraft {
  readonly name: string;
  readonly playerName: string;
  readonly level: string;
  readonly race: string;
  readonly subrace: string;
  readonly raceBonusChoices: ReadonlyArray<AbilityKey>;
  readonly className: string;
  /**
   * Which side of each of the class's *(a)/(b)* kit choices was taken, and
   * which rows were picked where a side says *"any martial weapon"* — one
   * entry per `startingKit.choices` entry, in order. Reset to side (a)
   * throughout when the class changes, because the choices are the class's.
   */
  readonly kitChoices: ReadonlyArray<KitPick>;
  readonly background: string;
  /**
   * The same for the background's kit — one entry per its `startingKit.choices`
   * entry. A 2014 background's one choice is a category (*"any holy symbol"*),
   * so the pick is which row was taken from it. Reset when the background
   * changes, because the choices are the background's.
   */
  readonly backgroundKitChoices: ReadonlyArray<KitPick>;
  readonly ac: string;
  readonly hpMax: string;
  readonly sheetUrl: string;
  readonly notes: string;
  /** `sheet.story.appearance` — what a portrait is drawn from. */
  readonly appearance: string;
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
  kitChoices: [],
  background: "",
  backgroundKitChoices: [],
  ac: "",
  hpMax: "",
  sheetUrl: "",
  notes: "",
  appearance: "",
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
  } = { ...identityNumberProblems(draft) };

  if (draft.name.trim() === "") problems.name = "Give them a name.";
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

export const classIn = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): ClassOption | undefined => asClassOption(optionNamed(options, "class", draft.className));

/** The picked class's structured kit, when the source lists one. */
export const kitOf = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): StartingKit | undefined => classIn(draft, options)?.body.startingKit;

/** The rows a kit category offers — what a *"pick a martial weapon"* select lists. */
export const kitRowsIn = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
  categoryIndex: string,
): ReadonlyArray<KitEquipment> =>
  (classIn(draft, options)?.details?.equipment ?? []).filter((row) =>
    inCategory(row, categoryIndex),
  );

export const backgroundIn = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): BackgroundOption | undefined =>
  asBackgroundOption(optionNamed(options, "background", draft.background));

/** The picked background's structured kit, when the importer wrote one. */
export const backgroundKitOf = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): StartingKit | undefined => backgroundIn(draft, options)?.body.startingKit;

/** The rows a background's kit category offers — the holy symbols, say. */
export const backgroundKitRowsIn = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
  categoryIndex: string,
): ReadonlyArray<KitEquipment> =>
  (backgroundIn(draft, options)?.details?.equipment ?? []).filter((row) =>
    inCategory(row, categoryIndex),
  );

/**
 * Which of the two kits a pick is about. The class's and the background's are
 * the same shape (`StartingKit`, `KitPick`), read by the same `kitLinesFor`,
 * so the three pick helpers below take the field rather than existing twice.
 */
export type KitField = "kitChoices" | "backgroundKitChoices";

/** A class pick resets the kit to side (a) throughout: the choices are the class's own. */
export const withKitDefaults = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
  field: KitField = "kitChoices",
): CharacterDraft => ({
  ...draft,
  [field]: defaultKitPicks(
    field === "kitChoices" ? kitOf(draft, options) : backgroundKitOf(draft, options),
  ),
});

/** Take side `option` of choice `index`; the side's own picks start empty. */
export const pickKitSide = (
  draft: CharacterDraft,
  index: number,
  option: number,
  field: KitField = "kitChoices",
): CharacterDraft => ({
  ...draft,
  [field]: draft[field].map((pick, at) => (at === index ? { option, picks: [] } : pick)),
});

/** Pick the `slot`th row of choice `index`'s category lines, in the side's order. */
export const pickKitRow = (
  draft: CharacterDraft,
  index: number,
  slot: number,
  equipmentId: EquipmentId | undefined,
  field: KitField = "kitChoices",
): CharacterDraft => ({
  ...draft,
  [field]: draft[field].map((pick, at) => {
    if (at !== index) return pick;
    // The picks are the dense list `kitLinesFor` consumes in order, so a slot
    // cleared in the middle closes up rather than leaving a hole.
    const picks = pick.picks.filter((_, position) => position !== slot);
    if (equipmentId !== undefined) picks.splice(Math.min(slot, picks.length), 0, equipmentId);
    return { ...pick, picks };
  }),
});

/**
 * The draft as `startingSheetBody` reads it: the picked options, the cells as
 * placed, the race's chosen bonuses, the kit picks and the Level box. The seed
 * the form shows and the sheet it sends are both composed from this, so the
 * hit points in the box are the ones the sheet was written at — and an NPC's
 * quick start (`cast/npcSheet.ts`) composes from the same draft through here.
 */
export const startingSourcesOf = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): StartingSheetSources => {
  const raceOption = asRaceOption(raceIn(draft, options));
  return {
    classOption: classIn(draft, options),
    raceOption,
    subrace: draft.subrace,
    backgroundOption: backgroundIn(draft, options),
    background: draft.background,
    level: parseOptional(draft.level) ?? undefined,
    abilities: abilitiesFrom(draft.abilities),
    raceBonusChoices: choiceFrom(raceOption?.body, draft.raceBonusChoices),
    kitChoices: draft.kitChoices,
    backgroundKitChoices: draft.backgroundKitChoices,
  };
};

export const seedOf = (
  draft: CharacterDraft,
  options: ReadonlyArray<CharacterOption>,
): CharacterSeed => startingSeed(startingSourcesOf(draft, options));

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

/** The four pickers a starting sheet is chosen with. */
export type SheetPick = "race" | "subrace" | "className" | "background";

/**
 * A pick, and what it moves: a race clears its subrace and its chosen bonuses,
 * and a class or background pick resets that kit to side (a) throughout — the
 * choices are its own, and a pick made against another's list would point at a
 * side that no longer exists. Then it re-seeds, sparing a box typed over. The
 * new-character form's and an NPC quick start's one rule for a pick.
 */
export const withPick = (
  draft: CharacterDraft,
  key: SheetPick,
  value: string,
  edited: ReadonlySet<SeededField>,
  options: ReadonlyArray<CharacterOption>,
): CharacterDraft => {
  const next =
    key === "race"
      ? { ...draft, race: value, subrace: "", raceBonusChoices: [] }
      : { ...draft, [key]: value };
  return seededDraft(
    key === "className"
      ? withKitDefaults(next, options)
      : key === "background"
        ? withKitDefaults(next, options, "backgroundKitChoices")
        : next,
    edited,
    options,
  );
};

/** A race bonus ticked or cleared, and the re-seed it causes. */
export const withRaceBonus = (
  draft: CharacterDraft,
  ability: AbilityKey,
  on: boolean,
  edited: ReadonlySet<SeededField>,
  options: ReadonlyArray<CharacterOption>,
): CharacterDraft =>
  seededDraft(
    {
      ...draft,
      raceBonusChoices: on
        ? [...draft.raceBonusChoices, ability]
        : draft.raceBonusChoices.filter((item) => item !== ability),
    },
    edited,
    options,
  );

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
  const sheetUrl = draft.sheetUrl.trim();
  const notes = draft.notes.trim();
  const appearance = draft.appearance.trim().slice(0, APPEARANCE_MAX);
  // The rules half, through the same `startingSheetBody` Hob's
  // `proposeCharacter` composes — class features to the Level box's level,
  // racial traits, the three sources' proficiencies, the kits as picked, side
  // (a) where they were not — so a hand-filled Hill Dwarf Fighter and a drafted
  // one start on the same document, and a Paladin 5 typed here gets the level-5
  // slots.
  const { body } = startingSheetBody(startingSourcesOf(draft, options));
  const sheet: CharacterSheet = {
    ...body,
    notes,
    // The same key Hob's `proposeCharacter` writes its appearance line to.
    ...(appearance === "" ? {} : { story: { appearance } }),
  };
  const bodyEmpty =
    body.abilities.length === 0 && body.traits.length === 0 && Object.keys(body).length === 2;

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
    ...(notes === "" && appearance === "" && bodyEmpty ? {} : { sheet }),
  };
};
