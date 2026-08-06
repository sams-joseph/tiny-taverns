import { Schema } from "effect";
import { CampaignId, SessionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * One night at the table. `startedAt`/`endedAt` are the whole lifecycle:
 * planned (neither set) → running (started) → ended (both).
 */
export class Session extends Schema.Class<Session>("Session")({
  id: SessionId,
  campaignId: CampaignId,
  number: Schema.Int,
  title: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  endedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export const SessionCreate = Schema.Struct({
  number: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000 })),
  title: Schema.optional(Schema.String),
  visibility: Schema.optional(Visibility),
});
export type SessionCreate = typeof SessionCreate.Type;

export const SessionUpdate = Schema.Struct({
  number: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000 }))),
  title: Schema.optional(Schema.NullOr(Schema.String)),
  startedAt: Schema.optional(Schema.NullOr(Schema.DateTimeUtcFromString)),
  endedAt: Schema.optional(Schema.NullOr(Schema.DateTimeUtcFromString)),
  visibility: Schema.optional(Visibility),
});
export type SessionUpdate = typeof SessionUpdate.Type;
