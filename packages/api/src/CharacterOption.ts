import { Schema } from "effect";
import {
  AbilityScoreId,
  AccountId,
  CampaignId,
  CharacterOptionId,
  CharacterOptionSubraceId,
  ClassLevelId,
  FeatureId,
  LanguageId,
  ProficiencyId,
  RacialTraitId,
  RuleChoiceGroupId,
  SkillId,
  SubclassId,
} from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";
import { AbilityBonus, AbilityBonusChoice, AbilityKey } from "./Ruleset.js";

/** A character-building option: a 2014 class, race, or background. */
export const OptionKind = Schema.Literals(["class", "race", "background"]);
export type OptionKind = typeof OptionKind.Type;

const summary = Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 500)));
const textLine = Schema.String.check(Schema.isLengthBetween(0, 500));
const textList = Schema.Array(textLine).check(Schema.isLengthBetween(0, 50));
const longTextLine = Schema.String.check(Schema.isLengthBetween(0, 10_000));
const longTextList = Schema.Array(longTextLine).check(Schema.isLengthBetween(0, 50));
const hitDie = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }));
const unarmouredAc = Schema.Array(AbilityKey).check(Schema.isLengthBetween(0, 6));
const speed = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 200 }));
const hpPerLevel = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 20 }));
const sourceKey = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 100));
const sourceName = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 180));
const sourceReference = Schema.Struct({ index: sourceKey, name: sourceName });
const jsonObject = Schema.Record(Schema.String, Schema.Unknown);
const choiceCount = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }));
const ordinal = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }));

/** Concrete 2014 ability-score vocabulary row. */
export const RuleAbilityScore = Schema.Struct({
  id: AbilityScoreId,
  index: sourceKey,
  name: sourceName,
  fullName: sourceName,
  desc: longTextList,
});
export type RuleAbilityScore = typeof RuleAbilityScore.Type;

/** Concrete 2014 language vocabulary row. */
export const RuleLanguage = Schema.Struct({
  id: LanguageId,
  index: sourceKey,
  name: sourceName,
  type: sourceName,
  script: Schema.NullOr(Schema.String.check(Schema.isLengthBetween(0, 120))),
  typicalSpeakers: textList,
});
export type RuleLanguage = typeof RuleLanguage.Type;

/** Concrete 2014 skill vocabulary row, keyed to its ability score. */
export const RuleSkill = Schema.Struct({
  id: SkillId,
  index: sourceKey,
  name: sourceName,
  abilityScoreId: AbilityScoreId,
  ability: RuleAbilityScore,
  desc: longTextList,
});
export type RuleSkill = typeof RuleSkill.Type;

/** Concrete 2014 proficiency vocabulary row. */
export const RuleProficiency = Schema.Struct({
  id: ProficiencyId,
  index: sourceKey,
  name: sourceName,
  type: sourceName,
  referenceFamily: Schema.NullOr(sourceKey),
  referenceKey: Schema.NullOr(sourceKey),
  skillId: Schema.NullOr(SkillId),
  abilityScoreId: Schema.NullOr(AbilityScoreId),
});
export type RuleProficiency = typeof RuleProficiency.Type;

/** A racial trait row, with parentage and prose kept on the trait itself. */
export const RuleTrait = Schema.Struct({
  id: RacialTraitId,
  index: Schema.NullOr(sourceKey),
  name: sourceName,
  parentTraitId: Schema.NullOr(RacialTraitId),
  desc: longTextList,
});
export type RuleTrait = typeof RuleTrait.Type;

export const OptionSubraceDetail = Schema.Struct({
  id: CharacterOptionSubraceId,
  name: sourceName,
  index: Schema.NullOr(sourceKey),
  ordinal,
});
export type OptionSubraceDetail = typeof OptionSubraceDetail.Type;

export const OptionAbilityGrant = Schema.Struct({
  ability: RuleAbilityScore,
  amount: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 30 })),
  ordinal,
  subraceId: Schema.NullOr(CharacterOptionSubraceId),
  subraceName: Schema.NullOr(sourceName),
});
export type OptionAbilityGrant = typeof OptionAbilityGrant.Type;

export const OptionLanguageGrant = Schema.Struct({
  language: RuleLanguage,
  ordinal,
  subraceId: Schema.NullOr(CharacterOptionSubraceId),
  subraceName: Schema.NullOr(sourceName),
});
export type OptionLanguageGrant = typeof OptionLanguageGrant.Type;

export const OptionProficiencyGrant = Schema.Struct({
  proficiency: RuleProficiency,
  /** Present when the proficiency arrived through an attached racial trait. */
  sourceTrait: Schema.NullOr(RuleTrait),
  ordinal,
  subraceId: Schema.NullOr(CharacterOptionSubraceId),
  subraceName: Schema.NullOr(sourceName),
});
export type OptionProficiencyGrant = typeof OptionProficiencyGrant.Type;

export const OptionTraitGrant = Schema.Struct({
  trait: RuleTrait,
  ordinal,
  subraceId: Schema.NullOr(CharacterOptionSubraceId),
  subraceName: Schema.NullOr(sourceName),
});
export type OptionTraitGrant = typeof OptionTraitGrant.Type;

export const RuleChoiceKind = Schema.Literals([
  "ability-score",
  "language",
  "proficiency",
  "trait",
]);
export type RuleChoiceKind = typeof RuleChoiceKind.Type;

export const OptionChoiceGroup = Schema.Struct({
  id: RuleChoiceGroupId,
  owner: Schema.Literals(["option", "subrace", "trait"]),
  ownerName: Schema.NullOr(sourceName),
  kind: RuleChoiceKind,
  choose: choiceCount,
  desc: Schema.NullOr(Schema.String.check(Schema.isLengthBetween(0, 1000))),
  ordinal,
  abilities: Schema.Array(OptionAbilityGrant).check(Schema.isLengthBetween(0, 30)),
  languages: Schema.Array(RuleLanguage).check(Schema.isLengthBetween(0, 60)),
  proficiencies: Schema.Array(RuleProficiency).check(Schema.isLengthBetween(0, 140)),
  traits: Schema.Array(RuleTrait).check(Schema.isLengthBetween(0, 60)),
});
export type OptionChoiceGroup = typeof OptionChoiceGroup.Type;

/**
 * One class feature a fresh sheet starts with, projected off the progression
 * domain — `feature` rows at level 1 with no subclass and no parent, so
 * *Fighting Style* is granted and *Fighting Style: Archery* stays a choice the
 * player makes later. It rides on `details` rather than needing the whole
 * `ClassProgression` read because character creation is the reader: both
 * composers (the create form's `payloadFrom` and Hob's `proposeCharacter`)
 * already hold the hydrated option and nothing else.
 */
export const OptionFeatureGrant = Schema.Struct({
  id: FeatureId,
  index: Schema.NullOr(sourceKey),
  name: sourceName,
  desc: longTextList,
});
export type OptionFeatureGrant = typeof OptionFeatureGrant.Type;

export const OptionDetails = Schema.Struct({
  subraces: Schema.Array(OptionSubraceDetail).check(Schema.isLengthBetween(0, 50)),
  abilityBonuses: Schema.Array(OptionAbilityGrant).check(Schema.isLengthBetween(0, 80)),
  languages: Schema.Array(OptionLanguageGrant).check(Schema.isLengthBetween(0, 80)),
  proficiencies: Schema.Array(OptionProficiencyGrant).check(Schema.isLengthBetween(0, 160)),
  traits: Schema.Array(OptionTraitGrant).check(Schema.isLengthBetween(0, 80)),
  choices: Schema.Array(OptionChoiceGroup).check(Schema.isLengthBetween(0, 80)),
  /** Class options only: what the class grants at level 1, absent elsewhere. */
  levelOneFeatures: Schema.optional(
    Schema.Array(OptionFeatureGrant).check(Schema.isLengthBetween(0, 50)),
  ),
  /** Class options only: the level-1 `class_level` row's proficiency bonus. */
  proficiencyBonus: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 20 })),
  ),
});
export type OptionDetails = typeof OptionDetails.Type;

export const OptionVocabulary = Schema.Struct({
  abilities: Schema.Array(RuleAbilityScore),
  languages: Schema.Array(RuleLanguage),
  skills: Schema.Array(RuleSkill),
  proficiencies: Schema.Array(RuleProficiency),
  traits: Schema.Array(RuleTrait),
});
export type OptionVocabulary = typeof OptionVocabulary.Type;

const relationChoiceInput = Schema.Struct({
  kind: RuleChoiceKind,
  choose: choiceCount,
  desc: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 1000))),
  abilityBonuses: Schema.optional(
    Schema.Array(
      Schema.Struct({
        abilityScoreId: AbilityScoreId,
        amount: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 30 })),
      }),
    ).check(Schema.isLengthBetween(0, 30)),
  ),
  languageIds: Schema.optional(Schema.Array(LanguageId).check(Schema.isLengthBetween(0, 60))),
  proficiencyIds: Schema.optional(
    Schema.Array(ProficiencyId).check(Schema.isLengthBetween(0, 140)),
  ),
  traitIds: Schema.optional(Schema.Array(RacialTraitId).check(Schema.isLengthBetween(0, 60))),
});

export const OptionRelationsInput = Schema.Struct({
  languageIds: Schema.optional(Schema.Array(LanguageId).check(Schema.isLengthBetween(0, 60))),
  proficiencyIds: Schema.optional(
    Schema.Array(ProficiencyId).check(Schema.isLengthBetween(0, 140)),
  ),
  traitIds: Schema.optional(Schema.Array(RacialTraitId).check(Schema.isLengthBetween(0, 60))),
  choices: Schema.optional(Schema.Array(relationChoiceInput).check(Schema.isLengthBetween(0, 80))),
});
export type OptionRelationsInput = typeof OptionRelationsInput.Type;

export const ClassBody = Schema.Struct({
  hitDie,
  unarmouredAc,
  /** Projected creation-facing source facts; the concrete progression rows live beside it. */
  proficiencies: Schema.optional(textList),
  savingThrows: Schema.optional(textList),
  /** Counts of concrete progression rows, filled by readers that join that domain. */
  subclassCount: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 200 }))),
  levelCount: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 500 }))),
  featureCount: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 }))),
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
  details: Schema.optional(OptionDetails),
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

const progressionFields = {
  campaignId: Schema.NullOr(CampaignId),
  accountId: Schema.NullOr(AccountId),
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
} as const;

export const SubclassBody = Schema.Struct({
  flavor: Schema.optional(textLine),
  desc: longTextList,
});
export type SubclassBody = typeof SubclassBody.Type;

export const ClassLevelBody = Schema.Struct({
  classSpecific: Schema.optional(jsonObject),
  subclassSpecific: Schema.optional(jsonObject),
  spellcasting: Schema.optional(jsonObject),
  features: Schema.Array(sourceReference).check(Schema.isLengthBetween(0, 50)),
});
export type ClassLevelBody = typeof ClassLevelBody.Type;

export const FeatureBody = Schema.Struct({
  desc: longTextList,
  prerequisites: Schema.Array(Schema.Unknown).check(Schema.isLengthBetween(0, 50)),
  featureSpecific: Schema.optional(jsonObject),
  reference: Schema.optional(sourceReference),
});
export type FeatureBody = typeof FeatureBody.Type;

export const Subclass = Schema.Struct({
  ...progressionFields,
  id: SubclassId,
  classOptionId: CharacterOptionId,
  derivedFrom: Schema.NullOr(SubclassId),
  name: Schema.String,
  flavor: Schema.NullOr(Schema.String),
  body: SubclassBody,
});
export type Subclass = typeof Subclass.Type;

export const ClassLevel = Schema.Struct({
  ...progressionFields,
  id: ClassLevelId,
  classOptionId: CharacterOptionId,
  subclassId: Schema.NullOr(SubclassId),
  derivedFrom: Schema.NullOr(ClassLevelId),
  level: Schema.Int,
  abilityScoreBonuses: Schema.NullOr(Schema.Int),
  proficiencyBonus: Schema.NullOr(Schema.Int),
  body: ClassLevelBody,
});
export type ClassLevel = typeof ClassLevel.Type;

export const Feature = Schema.Struct({
  ...progressionFields,
  id: FeatureId,
  classOptionId: CharacterOptionId,
  subclassId: Schema.NullOr(SubclassId),
  classLevelId: Schema.NullOr(ClassLevelId),
  parentFeatureId: Schema.NullOr(FeatureId),
  derivedFrom: Schema.NullOr(FeatureId),
  name: Schema.String,
  level: Schema.Int,
  body: FeatureBody,
});
export type Feature = typeof Feature.Type;

export const ClassProgression = Schema.Struct({
  option: ClassOption,
  subclasses: Schema.Array(Subclass),
  levels: Schema.Array(ClassLevel),
  features: Schema.Array(Feature),
});
export type ClassProgression = typeof ClassProgression.Type;

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
  Schema.Struct({
    kind: Schema.Literal("class"),
    name: optionName,
    body: ClassBody,
    relations: Schema.optional(OptionRelationsInput),
  }),
  Schema.Struct({
    kind: Schema.Literal("race"),
    name: optionName,
    body: RaceBody,
    relations: Schema.optional(OptionRelationsInput),
  }),
  Schema.Struct({
    kind: Schema.Literal("background"),
    name: optionName,
    body: BackgroundBody,
    relations: Schema.optional(OptionRelationsInput),
  }),
]);
export type OptionLibraryCreate = typeof OptionLibraryCreate.Type;

const optionUpdateFields = {
  name: Schema.optional(optionName),
  body: Schema.optional(Schema.Union([ClassBody, RaceBody, BackgroundBody])),
  relations: Schema.optional(OptionRelationsInput),
} as const;

export const OptionLibraryUpdate = Schema.Struct(optionUpdateFields);
export type OptionLibraryUpdate = typeof OptionLibraryUpdate.Type;

export const OptionUpdate = Schema.Struct({
  ...optionUpdateFields,
  visibility: Schema.optional(Visibility),
});
export type OptionUpdate = typeof OptionUpdate.Type;

export const OptionFilter = {
  kind: Schema.optional(OptionKind),
} as const;

export type OptionFilterValues = typeof OptionFilterValues.Type;
const OptionFilterValues = Schema.Struct(OptionFilter);

export const OPTION_LIMIT = 200;
