import { Schema } from "effect";
import { AccountId, CampaignId, MagicItemId } from "./Ids.js";
import { pageFilter } from "./Page.js";
import { provenanceFields, Visibility } from "./Provenance.js";
import { queryArray } from "./Query.js";

/** A source reference as the product exposes it: a stable key and display label. */
export const MagicItemReference = Schema.Struct({
  index: Schema.NonEmptyString.check(Schema.isLengthBetween(1, 120)),
  name: Schema.NonEmptyString.check(Schema.isLengthBetween(1, 240)),
});
export type MagicItemReference = typeof MagicItemReference.Type;

const text = Schema.String.check(Schema.isLengthBetween(0, 30_000));
const label = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 240));
const note = Schema.String.check(Schema.isLengthBetween(0, 600));
const sourceKey = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 120));
const sourceKeys = queryArray(sourceKey).check(Schema.isLengthBetween(0, 80));
const nonNegativeInt = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }));

/** The preserved 5e-bits display document for one magic item. */
export const MagicItemBody = Schema.Struct({
  item: MagicItemReference,
  equipmentCategory: MagicItemReference,
  rarity: MagicItemReference,
  desc: Schema.optional(Schema.Array(text)),
  image: Schema.optional(Schema.String.check(Schema.isLengthBetween(1, 260))),
  requiresAttunement: Schema.optional(Schema.Boolean),
  attunementRequirement: Schema.optional(note),
  variant: Schema.optional(Schema.Boolean),
  variants: Schema.optional(Schema.Array(MagicItemReference).check(Schema.isLengthBetween(0, 80))),
  baseItem: Schema.optional(MagicItemReference),
});
export type MagicItemBody = typeof MagicItemBody.Type;

export const emptyMagicItemBody: MagicItemBody = {
  item: { index: "homebrew-magic-item", name: "Homebrew magic item" },
  equipmentCategory: { index: "wondrous-items", name: "Wondrous Items" },
  rarity: { index: "varies", name: "Varies" },
  desc: [],
  requiresAttunement: false,
  variants: [],
};

export class MagicItem extends Schema.Class<MagicItem>("MagicItem")({
  id: MagicItemId,
  campaignId: Schema.NullOr(CampaignId),
  accountId: Schema.NullOr(AccountId),
  derivedFrom: Schema.NullOr(MagicItemId),
  name: Schema.String,
  categoryIndex: sourceKey,
  categoryName: label,
  rarityIndex: sourceKey,
  rarityName: label,
  raritySort: nonNegativeInt,
  requiresAttunement: Schema.Boolean,
  attunementRequirement: Schema.NullOr(note),
  isVariant: Schema.Boolean,
  variantCount: nonNegativeInt,
  baseItemId: Schema.NullOr(MagicItemId),
  baseItemName: Schema.NullOr(label),
  variantIds: Schema.Array(MagicItemId),
  variantNames: Schema.Array(label),
  image: Schema.NullOr(Schema.String.check(Schema.isLengthBetween(1, 260))),
  magicItem: MagicItemBody,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const MagicItemDraft = {
  name: Schema.NonEmptyString,
  equipmentCategory: MagicItemReference,
  rarity: MagicItemReference,
  requiresAttunement: Schema.optional(Schema.Boolean),
  attunementRequirement: Schema.optional(note),
  desc: Schema.optional(Schema.Array(text)),
  image: Schema.optional(Schema.String.check(Schema.isLengthBetween(1, 260))),
  magicItem: Schema.optional(MagicItemBody),
} as const;

export const MagicItemLibraryCreate = Schema.Struct(MagicItemDraft);
export type MagicItemLibraryCreate = typeof MagicItemLibraryCreate.Type;

export const MagicItemCreate = Schema.Struct({
  ...MagicItemDraft,
  visibility: Schema.optional(Visibility),
});
export type MagicItemCreate = typeof MagicItemCreate.Type;

const MagicItemPatch = {
  name: Schema.optional(Schema.NonEmptyString),
  equipmentCategory: Schema.optional(MagicItemReference),
  rarity: Schema.optional(MagicItemReference),
  requiresAttunement: Schema.optional(Schema.Boolean),
  attunementRequirement: Schema.optional(note),
  desc: Schema.optional(Schema.Array(text)),
  image: Schema.optional(Schema.String.check(Schema.isLengthBetween(1, 260))),
  magicItem: Schema.optional(MagicItemBody),
} as const;

export const MagicItemLibraryUpdate = Schema.Struct(MagicItemPatch);
export type MagicItemLibraryUpdate = typeof MagicItemLibraryUpdate.Type;

export const MagicItemUpdate = Schema.Struct({
  ...MagicItemPatch,
  visibility: Schema.optional(Visibility),
});
export type MagicItemUpdate = typeof MagicItemUpdate.Type;

export const MagicItemSort = Schema.Literals(["name", "rarity", "recent"]);
export type MagicItemSort = typeof MagicItemSort.Type;

export const MagicItemAttunementFilter = Schema.Literals(["required", "none"]);
export type MagicItemAttunementFilter = typeof MagicItemAttunementFilter.Type;

export const MagicItemVariantState = Schema.Literals(["base", "variant", "standalone"]);
export type MagicItemVariantState = typeof MagicItemVariantState.Type;

/** Filters the Library and campaign magic item screens expose. */
export const MagicItemFilter = {
  q: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 200))),
  categories: Schema.optional(sourceKeys),
  rarities: Schema.optional(sourceKeys),
  attunement: Schema.optional(
    queryArray(MagicItemAttunementFilter).check(Schema.isLengthBetween(0, 2)),
  ),
  variantStates: Schema.optional(
    queryArray(MagicItemVariantState).check(Schema.isLengthBetween(0, 3)),
  ),
  sort: Schema.optional(MagicItemSort),
  ...pageFilter(MagicItemSort),
} as const;

export const MagicItemFilterValues = Schema.Struct(MagicItemFilter);
export type MagicItemFilterValues = typeof MagicItemFilterValues.Type;
