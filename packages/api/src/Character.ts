import { Schema } from "effect";
import { CampaignId, CharacterId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * A player character. `descriptor` is the "Half-orc paladin" half of the
 * fixtures' `sub: "Half-orc paladin · Ilse"` line — the display string is
 * assembled from `descriptor` and `playerName`, not stored.
 */
export class Character extends Schema.Class<Character>("Character")({
  id: CharacterId,
  campaignId: CampaignId,
  name: Schema.String,
  playerName: Schema.NullOr(Schema.String),
  descriptor: Schema.NullOr(Schema.String),
  ac: Schema.NullOr(Schema.Int),
  hpMax: Schema.NullOr(Schema.Int),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

const ac = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 40 }));
const hp = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }));

export const CharacterCreate = Schema.Struct({
  name: Schema.NonEmptyString,
  playerName: Schema.optional(Schema.String),
  descriptor: Schema.optional(Schema.String),
  ac: Schema.optional(ac),
  hpMax: Schema.optional(hp),
  visibility: Schema.optional(Visibility),
});
export type CharacterCreate = typeof CharacterCreate.Type;

export const CharacterUpdate = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  playerName: Schema.optional(Schema.NullOr(Schema.String)),
  descriptor: Schema.optional(Schema.NullOr(Schema.String)),
  ac: Schema.optional(Schema.NullOr(ac)),
  hpMax: Schema.optional(Schema.NullOr(hp)),
  visibility: Schema.optional(Visibility),
});
export type CharacterUpdate = typeof CharacterUpdate.Type;
