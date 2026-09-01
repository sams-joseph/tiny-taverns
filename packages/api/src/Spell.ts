import { Schema } from "effect";
import { AccountId, CampaignId, SpellId } from "./Ids.js";
import { pageFilter } from "./Page.js";
import { provenanceFields, Visibility } from "./Provenance.js";
import { queryArray } from "./Query.js";

/**
 * A source reference as the product exposes it: a stable key and a display label.
 * Relationships are stored by concrete foreign keys/join tables on the server;
 * the URL-shaped 5e-bits transport fields are not part of the Taverns document.
 */
export const SpellReference = Schema.Struct({
  index: Schema.NonEmptyString.check(Schema.isLengthBetween(1, 80)),
  name: Schema.NonEmptyString.check(Schema.isLengthBetween(1, 120)),
});
export type SpellReference = typeof SpellReference.Type;

const text = Schema.String.check(Schema.isLengthBetween(0, 20_000));
const label = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 240));
const spellLevel = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 9 }));
const sourceKey = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 80));
const sourceKeys = queryArray(sourceKey).check(Schema.isLengthBetween(0, 24));
const levelKey = Schema.Literals(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
const levels = queryArray(levelKey).check(Schema.isLengthBetween(0, 10));
const diceByLevel = Schema.Record(Schema.String, Schema.String);

/** What 5e-bits records for spell damage. */
export const SpellDamage = Schema.Struct({
  damageType: Schema.optional(SpellReference),
  damageAtSlotLevel: Schema.optional(diceByLevel),
  damageAtCharacterLevel: Schema.optional(diceByLevel),
});
export type SpellDamage = typeof SpellDamage.Type;

/** A saving throw attached to a spell, when the source names one. */
export const SpellDc = Schema.Struct({
  dcType: SpellReference,
  dcSuccess: Schema.NonEmptyString,
  desc: Schema.optional(text),
});
export type SpellDc = typeof SpellDc.Type;

/** Area of effect, exactly as 5e-bits spells spell it. */
export const SpellArea = Schema.Struct({
  type: Schema.NonEmptyString,
  size: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100_000 })),
});
export type SpellArea = typeof SpellArea.Type;

/**
 * The complete display document for a spell.
 *
 * The row carries the things a list filters and cards draw — level, school,
 * casting time, range, duration, ritual/concentration and class keys. The
 * document keeps the rest of the 2014 source shape: descriptions, higher-level
 * text, components/material, attack/DC/damage/AoE/healing and references. It
 * is typed rather than `unknown` so an importer cannot silently drop one of the
 * spell-specific branches the 5e-bits schema carries.
 */
export const SpellBody = Schema.Struct({
  desc: Schema.Array(text),
  higherLevel: Schema.optional(Schema.Array(text)),
  components: Schema.Array(Schema.NonEmptyString.check(Schema.isLengthBetween(1, 12))),
  material: Schema.optional(text),
  attackType: Schema.optional(label),
  damage: Schema.optional(SpellDamage),
  dc: Schema.optional(SpellDc),
  areaOfEffect: Schema.optional(SpellArea),
  healAtSlotLevel: Schema.optional(diceByLevel),
  school: SpellReference,
  classes: Schema.Array(SpellReference),
  subclasses: Schema.Array(SpellReference),
});
export type SpellBody = typeof SpellBody.Type;

export const emptySpellBody: SpellBody = {
  desc: [],
  components: [],
  school: { index: "unknown", name: "Unknown" },
  classes: [],
  subclasses: [],
};

/**
 * A spell belongs to the bundle, to an account's Library, or to a campaign copy
 * — the same three-owner Library model as creatures and character options.
 */
export class Spell extends Schema.Class<Spell>("Spell")({
  id: SpellId,
  campaignId: Schema.NullOr(CampaignId),
  accountId: Schema.NullOr(AccountId),
  derivedFrom: Schema.NullOr(SpellId),
  name: Schema.String,
  level: spellLevel,
  schoolIndex: sourceKey,
  schoolName: label,
  ritual: Schema.Boolean,
  concentration: Schema.Boolean,
  castingTime: label,
  range: label,
  duration: label,
  classIndexes: Schema.Array(sourceKey),
  classNames: Schema.Array(label),
  subclassIndexes: Schema.Array(sourceKey),
  subclassNames: Schema.Array(label),
  spell: SpellBody,
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const SpellDraft = {
  name: Schema.NonEmptyString,
  level: spellLevel,
  school: SpellReference,
  ritual: Schema.optional(Schema.Boolean),
  concentration: Schema.optional(Schema.Boolean),
  castingTime: label,
  range: label,
  duration: label,
  classes: Schema.optional(Schema.Array(SpellReference).check(Schema.isLengthBetween(0, 24))),
  subclasses: Schema.optional(Schema.Array(SpellReference).check(Schema.isLengthBetween(0, 24))),
  spell: Schema.optional(SpellBody),
} as const;

export const SpellLibraryCreate = Schema.Struct(SpellDraft);
export type SpellLibraryCreate = typeof SpellLibraryCreate.Type;

export const SpellCreate = Schema.Struct({
  ...SpellDraft,
  visibility: Schema.optional(Visibility),
});
export type SpellCreate = typeof SpellCreate.Type;

const SpellPatch = {
  name: Schema.optional(Schema.NonEmptyString),
  level: Schema.optional(spellLevel),
  school: Schema.optional(SpellReference),
  ritual: Schema.optional(Schema.Boolean),
  concentration: Schema.optional(Schema.Boolean),
  castingTime: Schema.optional(label),
  range: Schema.optional(label),
  duration: Schema.optional(label),
  classes: Schema.optional(Schema.Array(SpellReference).check(Schema.isLengthBetween(0, 24))),
  subclasses: Schema.optional(Schema.Array(SpellReference).check(Schema.isLengthBetween(0, 24))),
  spell: Schema.optional(SpellBody),
} as const;

export const SpellLibraryUpdate = Schema.Struct(SpellPatch);
export type SpellLibraryUpdate = typeof SpellLibraryUpdate.Type;

export const SpellUpdate = Schema.Struct({
  ...SpellPatch,
  visibility: Schema.optional(Visibility),
});
export type SpellUpdate = typeof SpellUpdate.Type;

export const SpellSort = Schema.Literals(["level", "name", "recent"]);
export type SpellSort = typeof SpellSort.Type;

/** The controls shared by the account Library and a campaign's spell list. */
export const SpellFilter = {
  q: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 200))),
  levels: Schema.optional(levels),
  schools: Schema.optional(sourceKeys),
  classes: Schema.optional(sourceKeys),
  ritual: Schema.optional(Schema.Boolean),
  concentration: Schema.optional(Schema.Boolean),
  sort: Schema.optional(SpellSort),
  ...pageFilter(SpellSort),
} as const;

export const SpellFilterValues = Schema.Struct(SpellFilter);
export type SpellFilterValues = typeof SpellFilterValues.Type;
