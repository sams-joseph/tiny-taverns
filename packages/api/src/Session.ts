import { Schema } from "effect";
import {
  AssistantTurnId,
  CampaignCharacterId,
  CampaignId,
  EncounterRunId,
  SessionId,
} from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/** Where a night's summary came from — the two ways it can be kept. */
export const SummaryOrigin = Schema.Literals(["authored", "assistant"]);
export type SummaryOrigin = typeof SummaryOrigin.Type;

/** A night's summary as written: a few sentences, bounded as the column is. */
export const SessionSummaryText = Schema.String.check(Schema.isLengthBetween(1, 8000));

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
   *
   * Null for a reader who cannot read that run: a player, while the fight's
   * Share switch is off, reads the night as though nothing were on the table.
   */
  activeEncounterRunId: Schema.NullOr(EncounterRunId),
  /**
   * The DM's few sentences about the night, kept on the night **above** the
   * detail the recap assembles, never in place of it: the beats, fights and
   * read-alouds stay word for word underneath. Written by the DM
   * (`SessionUpdate.summary`) or by accepting a draft Hob offered
   * (`proposeNightSummary`); nothing else writes it.
   */
  summary: Schema.NullOr(Schema.String),
  /**
   * Where the summary came from, apart from where the night did: `assistant`
   * with the turn that drafted it when a Hob draft was accepted, `authored`
   * when the DM wrote it first. An edit keeps it, as an edited note keeps
   * its own. Both are null exactly when `summary` is.
   */
  summaryOrigin: Schema.NullOr(SummaryOrigin),
  summaryAssistantTurnId: Schema.NullOr(AssistantTurnId),
  /**
   * The seat whose night it was (a `campaign_character`), or null. Null too
   * for a reader who cannot read that seat, exactly as
   * `activeEncounterRunId` is for a fight they cannot see.
   */
  spotlightSeatId: Schema.NullOr(CampaignCharacterId),
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
  /**
   * The DM's summary; null (or blank) clears it. There is no field for its
   * origin: a summary written here is the DM's, and only accepting Hob's
   * draft (`repo/Proposals.ts`) stamps `assistant`.
   */
  summary: Schema.optional(Schema.NullOr(SessionSummaryText)),
  /** A live seat of this campaign, or null for nobody. */
  spotlightSeatId: Schema.optional(Schema.NullOr(CampaignCharacterId)),
});
export type SessionUpdate = typeof SessionUpdate.Type;
