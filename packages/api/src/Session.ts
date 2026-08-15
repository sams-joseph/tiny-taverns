import { Schema } from "effect";
import { CampaignId, EncounterRunId, SessionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * One night at the table. `startedAt`/`endedAt` are the whole lifecycle:
 * planned (neither set) → running (started) → ended (both).
 *
 * **"Running" means the DM has started the night, not that a fight is on the
 * table.** Those were one act until the captain separated them: a session can
 * open in a tavern with no encounter built, and an encounter goes on the table
 * when the party reaches it. So `startedAt` is stamped when the session is
 * opened — `apps/web/src/session/start.ts`, the one place a client writes it —
 * and a running session with `activeEncounterRunId` null is the ordinary state
 * of an evening rather than a night nobody has played.
 */
export class Session extends Schema.Class<Session>("Session")({
  id: SessionId,
  campaignId: CampaignId,
  number: Schema.Int,
  title: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  endedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  /**
   * The fight on the table right now — `data.js:10`'s `active: true`, rendered
   * as "On the table now" (`CampaignHome.jsx:23`).
   *
   * A pointer here rather than a flag on each encounter, because exactly one
   * encounter is live and two rows must not be able to both claim the table.
   * Not settable directly: it is written only by starting and ending a run, so
   * there is no writer that could leave it naming a fight that is over.
   */
  activeEncounterRunId: Schema.NullOr(EncounterRunId),
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
