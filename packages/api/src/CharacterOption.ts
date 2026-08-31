import { Schema } from "effect";
import { AccountId, CampaignId, CharacterOptionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";
import { AbilityBonus, AbilityBonusChoice, AbilityKey } from "./Ruleset.js";

/** A character-building option: a 2014 class, race, or background. */
export const OptionKind = Schema.Literals(["class", "race", "background"]);
export type OptionKind = typeof OptionKind.Type;

const summary = Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 500)));
const textLine = Schema.String.check(Schema.isLengthBetween(0, 500));
const textList = Schema.Array(textLine).check(Schema.isLengthBetween(0, 50));
const hitDie = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }));
const unarmouredAc = Schema.Array(AbilityKey).check(Schema.isLengthBetween(0, 6));
const speed = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 200 }));
const hpPerLevel = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 20 }));

export const ClassBody = Schema.Struct({
  hitDie,
  unarmouredAc,
  /** Projected creation-facing source facts; not a class-progression model. */
  proficiencies: Schema.optional(textList),
  savingThrows: Schema.optional(textList),
  summary,
});
export type ClassBody = typeof ClassBody.Type;

export const SubraceBody = Schema.Struct({
  name: Schema.NonEmptyString.check(Schema.isLengthBetween(1, 60)),
  abilityBonuses: Schema.Array(AbilityBonus).check(Schema.isLengthBetween(0, 6)),
  hpPerLevel: Schema.optional(hpPerLevel),
  traits: textList,
  summary,
});
export type SubraceBody = typeof SubraceBody.Type;

export const RaceBody = Schema.Struct({
  speed,
  size: Schema.NonEmptyString.check(Schema.isLengthBetween(1, 60)),
  abilityBonuses: Schema.Array(AbilityBonus).check(Schema.isLengthBetween(0, 6)),
  abilityBonusChoice: Schema.optional(AbilityBonusChoice),
  hpPerLevel,
  traits: textList,
  subraces: Schema.Array(SubraceBody).check(Schema.isLengthBetween(0, 50)),
  summary,
});
export type RaceBody = typeof RaceBody.Type;

export const BackgroundFeature = Schema.Struct({
  name: Schema.NonEmptyString.check(Schema.isLengthBetween(1, 120)),
  text: Schema.String.check(Schema.isLengthBetween(0, 4000)),
});
export type BackgroundFeature = typeof BackgroundFeature.Type;

/** 2014 background source shape projected for today's readers. It never seeds ability scores. */
export const BackgroundBody = Schema.Struct({
  proficiencies: textList,
  languages: textList,
  equipment: textList,
  gold: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 80))),
  feature: Schema.optional(BackgroundFeature),
  choices: textList,
  summary,
});
export type BackgroundBody = typeof BackgroundBody.Type;

const optionFields = {
  id: CharacterOptionId,
  campaignId: Schema.NullOr(CampaignId),
  accountId: Schema.NullOr(AccountId),
  derivedFrom: Schema.NullOr(CharacterOptionId),
  name: Schema.String,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
} as const;

export const ClassOption = Schema.Struct({
  ...optionFields,
  kind: Schema.Literal("class"),
  body: ClassBody,
});
export type ClassOption = typeof ClassOption.Type;

export const RaceOption = Schema.Struct({
  ...optionFields,
  kind: Schema.Literal("race"),
  body: RaceBody,
});
export type RaceOption = typeof RaceOption.Type;

export const BackgroundOption = Schema.Struct({
  ...optionFields,
  kind: Schema.Literal("background"),
  body: BackgroundBody,
});
export type BackgroundOption = typeof BackgroundOption.Type;

export const CharacterOption = Schema.Union([ClassOption, RaceOption, BackgroundOption]);
export type CharacterOption = typeof CharacterOption.Type;

export const isClassOption = (option: CharacterOption): option is ClassOption =>
  option.kind === "class";
export const isRaceOption = (option: CharacterOption): option is RaceOption =>
  option.kind === "race";
export const isBackgroundOption = (option: CharacterOption): option is BackgroundOption =>
  option.kind === "background";

export const optionNamed = (
  options: ReadonlyArray<CharacterOption>,
  kind: OptionKind,
  label: string | null | undefined,
): CharacterOption | undefined => {
  const wanted = (label ?? "").trim().toLowerCase();
  if (wanted === "") return undefined;
  return options.find(
    (option) => option.kind === kind && option.name.trim().toLowerCase() === wanted,
  );
};

/** A subrace is selected only through its parent race; this helper is the containment rule. */
export const subraceNamed = (
  race: RaceBody | undefined,
  label: string | null | undefined,
): SubraceBody | undefined => {
  const wanted = (label ?? "").trim().toLowerCase();
  if (race === undefined || wanted === "") return undefined;
  return race.subraces.find((subrace) => subrace.name.trim().toLowerCase() === wanted);
};

const optionName = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 60));

export const OptionLibraryCreate = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("class"), name: optionName, body: ClassBody }),
  Schema.Struct({ kind: Schema.Literal("race"), name: optionName, body: RaceBody }),
  Schema.Struct({ kind: Schema.Literal("background"), name: optionName, body: BackgroundBody }),
]);
export type OptionLibraryCreate = typeof OptionLibraryCreate.Type;

const optionUpdateFields = {
  name: Schema.optional(optionName),
  body: Schema.optional(Schema.Union([ClassBody, RaceBody, BackgroundBody])),
} as const;

export const OptionLibraryUpdate = Schema.Struct(optionUpdateFields);
export type OptionLibraryUpdate = typeof OptionLibraryUpdate.Type;

export const OptionUpdate = Schema.Struct({
  ...optionUpdateFields,
  visibility: Schema.optional(Visibility),
});
export type OptionUpdate = typeof OptionUpdate.Type;

export const OptionDerive = OptionUpdate;
export type OptionDerive = typeof OptionDerive.Type;

export const OptionFilter = {
  kind: Schema.optional(OptionKind),
} as const;

export type OptionFilterValues = typeof OptionFilterValues.Type;
const OptionFilterValues = Schema.Struct(OptionFilter);

export const OPTION_LIMIT = 200;
