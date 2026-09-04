import { Schema } from "effect";
import { AccountId, CampaignId, CharacterId, EncounterRunId, RollId, SessionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/** How a d20 roll chose the face it kept. Non-d20 rolls are always normal. */
export const RollMode = Schema.Literals(["normal", "advantage", "disadvantage"]);
export type RollMode = typeof RollMode.Type;

/** The d20 critical result the browser observed, when the roll has one. */
export const RollCritical = Schema.Literals(["hit", "miss"]);
export type RollCritical = typeof RollCritical.Type;

const RollFaces = Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })));
const RollLabel = Schema.NonEmptyString;
const RollNotation = Schema.NonEmptyString;

/**
 * One browser-rolled result, persisted only while a night is open.
 *
 * The server stores the faces the browser submitted; it does not roll them and
 * it does not interpret the event payload later. Visibility is copied from the
 * session at append time, so a roll keeps the sharing rule it was made under.
 */
export class Roll extends Schema.Class<Roll>("Roll")({
  id: RollId,
  campaignId: CampaignId,
  sessionId: SessionId,
  encounterRunId: Schema.NullOr(EncounterRunId),
  accountId: AccountId,
  accountName: Schema.NonEmptyString,
  characterId: Schema.NullOr(CharacterId),
  characterName: Schema.NullOr(Schema.NonEmptyString),
  label: RollLabel,
  notation: RollNotation,
  dice: RollFaces,
  kept: RollFaces,
  modifier: Schema.Int,
  total: Schema.Int,
  mode: RollMode,
  critical: Schema.NullOr(RollCritical),
  requestId: Schema.NullOr(Schema.NonEmptyString),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/** What a sheet submits after it rolled in the browser. */
export const RollCreate = Schema.Struct({
  characterId: Schema.optional(CharacterId),
  label: RollLabel,
  notation: RollNotation,
  dice: RollFaces,
  kept: RollFaces,
  modifier: Schema.Int,
  total: Schema.Int,
  mode: RollMode,
  critical: Schema.optional(Schema.NullOr(RollCritical)),
  requestId: Schema.optional(Schema.NonEmptyString),
});
export type RollCreate = typeof RollCreate.Type;

/** One session's durable roll tray, newest useful rows first. */
export const RollListFilter = {
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
} as const;

const RollListFilterValues = Schema.Struct(RollListFilter);
export type RollListFilterValues = typeof RollListFilterValues.Type;
