import { Schema } from "effect";
import { AccountId, CampaignId, EquipmentId } from "./Ids.js";
import { pageFilter } from "./Page.js";
import { provenanceFields, Visibility } from "./Provenance.js";
import { queryArray } from "./Query.js";

/** A source reference in the 2014 equipment corpus. */
export const EquipmentReference = Schema.Struct({
  index: Schema.NonEmptyString.check(Schema.isLengthBetween(1, 100)),
  name: Schema.NonEmptyString.check(Schema.isLengthBetween(1, 160)),
  url: Schema.optional(Schema.String.check(Schema.isLengthBetween(1, 240))),
});
export type EquipmentReference = typeof EquipmentReference.Type;

const text = Schema.String.check(Schema.isLengthBetween(0, 20_000));
const label = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 240));
const sourceKey = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 100));
const sourceKeys = queryArray(sourceKey).check(Schema.isLengthBetween(0, 48));
const labels = queryArray(label).check(Schema.isLengthBetween(0, 48));
const nonNegative = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 }));
const nonNegativeInt = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000_000 }));

export const EquipmentCost = Schema.Struct({
  quantity: nonNegative,
  unit: label,
});
export type EquipmentCost = typeof EquipmentCost.Type;

export const EquipmentArmorClass = Schema.Struct({
  base: nonNegativeInt,
  dexBonus: Schema.Boolean,
  maxBonus: Schema.optional(nonNegativeInt),
});
export type EquipmentArmorClass = typeof EquipmentArmorClass.Type;

export const EquipmentRange = Schema.Struct({
  normal: nonNegativeInt,
  long: Schema.optional(nonNegativeInt),
});
export type EquipmentRange = typeof EquipmentRange.Type;

export const EquipmentThrowRange = Schema.Struct({
  normal: nonNegativeInt,
  long: nonNegativeInt,
});
export type EquipmentThrowRange = typeof EquipmentThrowRange.Type;

export const EquipmentSpeed = Schema.Struct({
  quantity: nonNegative,
  unit: label,
});
export type EquipmentSpeed = typeof EquipmentSpeed.Type;

export const EquipmentDamage = Schema.Struct({
  damageDice: label,
  damageType: EquipmentReference,
});
export type EquipmentDamage = typeof EquipmentDamage.Type;

export const EquipmentContent = Schema.Struct({
  item: EquipmentReference,
  quantity: nonNegative,
});
export type EquipmentContent = typeof EquipmentContent.Type;

/**
 * The full display document for 5e-bits 2014 mundane equipment.
 *
 * The row promotes only list/filter/sort fields. This document preserves the
 * heterogeneous source shape — descriptions, contents, capacities, speeds,
 * special text and optional item-specific structures — without folding mundane
 * equipment into character options or magic items.
 */
export const EquipmentBody = Schema.Struct({
  equipmentCategory: EquipmentReference,
  cost: EquipmentCost,
  desc: Schema.optional(Schema.Array(text)),
  weight: Schema.optional(nonNegative),
  gearCategory: Schema.optional(EquipmentReference),
  armorCategory: Schema.optional(label),
  armorClass: Schema.optional(EquipmentArmorClass),
  capacity: Schema.optional(label),
  categoryRange: Schema.optional(label),
  contents: Schema.optional(Schema.Array(EquipmentContent)),
  damage: Schema.optional(EquipmentDamage),
  image: Schema.optional(Schema.String.check(Schema.isLengthBetween(1, 240))),
  properties: Schema.optional(Schema.Array(EquipmentReference)),
  quantity: Schema.optional(nonNegative),
  range: Schema.optional(EquipmentRange),
  special: Schema.optional(Schema.Array(text)),
  speed: Schema.optional(EquipmentSpeed),
  stealthDisadvantage: Schema.optional(Schema.Boolean),
  strMinimum: Schema.optional(nonNegativeInt),
  throwRange: Schema.optional(EquipmentThrowRange),
  toolCategory: Schema.optional(label),
  twoHandedDamage: Schema.optional(EquipmentDamage),
  vehicleCategory: Schema.optional(label),
  weaponCategory: Schema.optional(label),
  weaponRange: Schema.optional(label),
  sourceUrl: Schema.optional(Schema.String.check(Schema.isLengthBetween(1, 240))),
});
export type EquipmentBody = typeof EquipmentBody.Type;

export const emptyEquipmentBody: EquipmentBody = {
  equipmentCategory: { index: "adventuring-gear", name: "Adventuring Gear" },
  cost: { quantity: 0, unit: "gp" },
  desc: [],
};

export class Equipment extends Schema.Class<Equipment>("Equipment")({
  id: EquipmentId,
  campaignId: Schema.NullOr(CampaignId),
  accountId: Schema.NullOr(AccountId),
  derivedFrom: Schema.NullOr(EquipmentId),
  name: Schema.String,
  categoryIndex: sourceKey,
  categoryName: label,
  costQuantity: nonNegative,
  costUnit: label,
  costGp: nonNegative,
  weight: Schema.NullOr(nonNegative),
  gearCategoryIndex: Schema.NullOr(sourceKey),
  gearCategoryName: Schema.NullOr(label),
  armorCategory: Schema.NullOr(label),
  weaponCategory: Schema.NullOr(label),
  weaponRange: Schema.NullOr(label),
  categoryRange: Schema.NullOr(label),
  toolCategory: Schema.NullOr(label),
  vehicleCategory: Schema.NullOr(label),
  armorClassBase: Schema.NullOr(nonNegativeInt),
  armorClassDexBonus: Schema.NullOr(Schema.Boolean),
  armorClassMaxBonus: Schema.NullOr(nonNegativeInt),
  strengthMinimum: Schema.NullOr(nonNegativeInt),
  stealthDisadvantage: Schema.NullOr(Schema.Boolean),
  damageDice: Schema.NullOr(label),
  damageTypeIndex: Schema.NullOr(sourceKey),
  damageTypeName: Schema.NullOr(label),
  twoHandedDamageDice: Schema.NullOr(label),
  rangeNormal: Schema.NullOr(nonNegativeInt),
  rangeLong: Schema.NullOr(nonNegativeInt),
  throwRangeNormal: Schema.NullOr(nonNegativeInt),
  throwRangeLong: Schema.NullOr(nonNegativeInt),
  propertyIndexes: Schema.Array(sourceKey),
  propertyNames: Schema.Array(label),
  equipment: EquipmentBody,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const EquipmentDraft = {
  name: Schema.NonEmptyString,
  equipmentCategory: EquipmentReference,
  cost: EquipmentCost,
  weight: Schema.optional(nonNegative),
  gearCategory: Schema.optional(EquipmentReference),
  armorCategory: Schema.optional(label),
  weaponCategory: Schema.optional(label),
  weaponRange: Schema.optional(label),
  categoryRange: Schema.optional(label),
  toolCategory: Schema.optional(label),
  vehicleCategory: Schema.optional(label),
  armorClass: Schema.optional(EquipmentArmorClass),
  strMinimum: Schema.optional(nonNegativeInt),
  stealthDisadvantage: Schema.optional(Schema.Boolean),
  damage: Schema.optional(EquipmentDamage),
  twoHandedDamage: Schema.optional(EquipmentDamage),
  range: Schema.optional(EquipmentRange),
  throwRange: Schema.optional(EquipmentThrowRange),
  properties: Schema.optional(
    Schema.Array(EquipmentReference).check(Schema.isLengthBetween(0, 24)),
  ),
  equipment: Schema.optional(EquipmentBody),
} as const;

export const EquipmentLibraryCreate = Schema.Struct(EquipmentDraft);
export type EquipmentLibraryCreate = typeof EquipmentLibraryCreate.Type;

export const EquipmentCreate = Schema.Struct({
  ...EquipmentDraft,
  visibility: Schema.optional(Visibility),
});
export type EquipmentCreate = typeof EquipmentCreate.Type;

const EquipmentPatch = {
  name: Schema.optional(Schema.NonEmptyString),
  equipmentCategory: Schema.optional(EquipmentReference),
  cost: Schema.optional(EquipmentCost),
  weight: Schema.optional(nonNegative),
  gearCategory: Schema.optional(EquipmentReference),
  armorCategory: Schema.optional(label),
  weaponCategory: Schema.optional(label),
  weaponRange: Schema.optional(label),
  categoryRange: Schema.optional(label),
  toolCategory: Schema.optional(label),
  vehicleCategory: Schema.optional(label),
  armorClass: Schema.optional(EquipmentArmorClass),
  strMinimum: Schema.optional(nonNegativeInt),
  stealthDisadvantage: Schema.optional(Schema.Boolean),
  damage: Schema.optional(EquipmentDamage),
  twoHandedDamage: Schema.optional(EquipmentDamage),
  range: Schema.optional(EquipmentRange),
  throwRange: Schema.optional(EquipmentThrowRange),
  properties: Schema.optional(
    Schema.Array(EquipmentReference).check(Schema.isLengthBetween(0, 24)),
  ),
  equipment: Schema.optional(EquipmentBody),
} as const;

export const EquipmentLibraryUpdate = Schema.Struct(EquipmentPatch);
export type EquipmentLibraryUpdate = typeof EquipmentLibraryUpdate.Type;

export const EquipmentUpdate = Schema.Struct({
  ...EquipmentPatch,
  visibility: Schema.optional(Visibility),
});
export type EquipmentUpdate = typeof EquipmentUpdate.Type;

export const EquipmentSort = Schema.Literals(["name", "recent", "cost", "weight"]);
export type EquipmentSort = typeof EquipmentSort.Type;

/** Filters the actual Library and campaign equipment screens expose. */
export const EquipmentFilter = {
  q: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 200))),
  categories: Schema.optional(sourceKeys),
  gearCategories: Schema.optional(sourceKeys),
  armorCategories: Schema.optional(labels),
  weaponCategories: Schema.optional(labels),
  weaponRanges: Schema.optional(labels),
  toolCategories: Schema.optional(labels),
  vehicleCategories: Schema.optional(labels),
  properties: Schema.optional(sourceKeys),
  sort: Schema.optional(EquipmentSort),
  ...pageFilter(EquipmentSort),
} as const;

export const EquipmentFilterValues = Schema.Struct(EquipmentFilter);
export type EquipmentFilterValues = typeof EquipmentFilterValues.Type;
