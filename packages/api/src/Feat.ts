import { Schema } from "effect";
import { AbilityScoreId, AccountId, CampaignId, FeatId, FeatPrerequisiteGroupId } from "./Ids.js";
import { pageFilter } from "./Page.js";
import { provenanceFields, Visibility } from "./Provenance.js";
import { RuleAbilityScore } from "./CharacterOption.js";

const label = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 240));
const sourceKey = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 120));
const descriptionLine = Schema.String.check(Schema.isLengthBetween(0, 10_000));
const prerequisiteScore = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 30 }));
const ordinal = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }));

export const FeatPrerequisiteAbilityInput = Schema.Struct({
  abilityScoreId: AbilityScoreId,
  minimumScore: prerequisiteScore,
});
export type FeatPrerequisiteAbilityInput = typeof FeatPrerequisiteAbilityInput.Type;

export const FeatPrerequisiteAbility = Schema.Struct({
  abilityScoreId: AbilityScoreId,
  ability: RuleAbilityScore,
  minimumScore: prerequisiteScore,
  groupId: FeatPrerequisiteGroupId,
  groupOrdinal: ordinal,
  ordinal,
});
export type FeatPrerequisiteAbility = typeof FeatPrerequisiteAbility.Type;

export class Feat extends Schema.Class<Feat>("Feat")({
  id: FeatId,
  campaignId: Schema.NullOr(CampaignId),
  accountId: Schema.NullOr(AccountId),
  derivedFrom: Schema.NullOr(FeatId),
  sourceIndex: Schema.NullOr(sourceKey),
  name: label,
  description: Schema.Array(descriptionLine).check(Schema.isLengthBetween(0, 200)),
  prerequisites: Schema.Array(FeatPrerequisiteAbility).check(Schema.isLengthBetween(0, 100)),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const featDraft = {
  name: label,
  description: Schema.optional(Schema.Array(descriptionLine).check(Schema.isLengthBetween(0, 200))),
  prerequisites: Schema.optional(
    Schema.Array(FeatPrerequisiteAbilityInput).check(Schema.isLengthBetween(0, 100)),
  ),
} as const;

export const FeatLibraryCreate = Schema.Struct(featDraft);
export type FeatLibraryCreate = typeof FeatLibraryCreate.Type;

const featPatch = {
  name: Schema.optional(label),
  description: Schema.optional(Schema.Array(descriptionLine).check(Schema.isLengthBetween(0, 200))),
  prerequisites: Schema.optional(
    Schema.Array(FeatPrerequisiteAbilityInput).check(Schema.isLengthBetween(0, 100)),
  ),
} as const;

export const FeatLibraryUpdate = Schema.Struct(featPatch);
export type FeatLibraryUpdate = typeof FeatLibraryUpdate.Type;

export const FeatUpdate = Schema.Struct({ ...featPatch, visibility: Schema.optional(Visibility) });
export type FeatUpdate = typeof FeatUpdate.Type;

export const FeatDerive = FeatUpdate;
export type FeatDerive = typeof FeatDerive.Type;

export const FeatSort = Schema.Literals(["name", "recent"]);
export type FeatSort = typeof FeatSort.Type;

export const FeatFilter = {
  q: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 200))),
  sort: Schema.optional(FeatSort),
  ...pageFilter(FeatSort),
} as const;

export const FeatFilterValues = Schema.Struct(FeatFilter);
export type FeatFilterValues = typeof FeatFilterValues.Type;
