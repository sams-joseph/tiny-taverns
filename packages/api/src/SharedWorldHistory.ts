import { Schema } from "effect";
import {
  AssistantTurnId,
  AccountId,
  CampaignId,
  SharedWorldHistoryEntryId,
  SharedWorldHistorySummaryId,
  SharedWorldId,
  SessionId,
} from "./Ids.js";
import { Origin } from "./Provenance.js";

/**
 * Shared World history: what the Shared World has agreed happened — report §3.5.
 *
 * **An entry is a copy, admitted on purpose, and canonical once admitted.**
 * It is never read back through the campaign it came from: the body is stored
 * prose, the `campaignId`/`sessionId` are provenance pointers that survive as
 * `null` when their rows go, and the Shared World's memory outlives every campaign
 * in it. That is the deliberate alternative to a "magic read" over every
 * campaign table, which would make one creator's private prep another's
 * context — the boundary `decision-group-hob-boundary.md` draws.
 *
 * **There is no `visibility` here.** Being in this table *is* the visibility:
 * a Shared World member reads the Shared World's history, full stop. What must not enter it
 * uninvited simply is not written to it.
 */

export const HistorySource = Schema.Literals([
  "recap",
  "beat",
  "note",
  "fight",
  "manual",
  "character",
  "summary_edit",
]);
export type HistorySource = typeof HistorySource.Type;

export class SharedWorldHistoryEntry extends Schema.Class<SharedWorldHistoryEntry>(
  "SharedWorldHistoryEntry",
)({
  id: SharedWorldHistoryEntryId,
  worldId: SharedWorldId,
  /** Where it came from — `null` once that campaign is gone. Provenance, not a reach path. */
  campaignId: Schema.NullOr(CampaignId),
  sessionId: Schema.NullOr(SessionId),
  sourceKind: HistorySource,
  /**
   * Acceptance order across the Shared World — one global sequence, so entries from two
   * campaigns interleave in the order the world admitted them. A cursor only
   * has to increase; nothing counts it.
   */
  worldSeq: Schema.Int,
  /** When it happened in the world, when somebody said. Display, never ordering. */
  occurredAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  acceptedAt: Schema.DateTimeUtcFromString,
  title: Schema.NullOr(Schema.String),
  body: Schema.String,
  /**
   * The machine-legible remainder — session numbers, fight outcomes, names —
   * for Shared World Hob to cite. Like `SessionEvent.payload`, not a contract
   * anything branches on.
   */
  facts: Schema.Unknown,
  origin: Origin,
  assistantTurnId: Schema.NullOr(AssistantTurnId),
  createdByAccountId: Schema.NullOr(AccountId),
  createdAt: Schema.DateTimeUtcFromString,
}) {}

const title = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 200));
const body = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 20_000));

/**
 * A manual entry — any live member writing the Shared World's chronicle by hand.
 * `campaignId`/`sessionId` are optional provenance claims; the campaign one is
 * checked against the Shared World (a campaign of another Shared World is a `NotFound`).
 */
export const SharedWorldHistoryEntryCreate = Schema.Struct({
  title: Schema.optional(title),
  body,
  campaignId: Schema.optional(CampaignId),
  sessionId: Schema.optional(SessionId),
  occurredAt: Schema.optional(Schema.DateTimeUtcFromString),
});
export type SharedWorldHistoryEntryCreate = typeof SharedWorldHistoryEntryCreate.Type;

/**
 * Sharing a played night to the Shared World — the campaign creator's act, and the
 * ordinary way canonical history enters the chronicle. The server renders the
 * recap to prose *at share time* and stores the copy; later edits to the
 * campaign do not reach it.
 */
export const SharedWorldHistoryFromRecap = Schema.Struct({
  campaignId: CampaignId,
  sessionId: SessionId,
});
export type SharedWorldHistoryFromRecap = typeof SharedWorldHistoryFromRecap.Type;

export const SummaryStatus = Schema.Literals(["draft", "accepted", "superseded"]);
export type SummaryStatus = typeof SummaryStatus.Type;

/**
 * The running summary — derived, replaceable, and at most one `accepted` per
 * Shared World (a partial unique index). `lastWorldSeq` is how much of the record it
 * has read, so staleness is arithmetic rather than a flag.
 */
export class SharedWorldHistorySummary extends Schema.Class<SharedWorldHistorySummary>(
  "SharedWorldHistorySummary",
)({
  id: SharedWorldHistorySummaryId,
  worldId: SharedWorldId,
  status: SummaryStatus,
  lastWorldSeq: Schema.Int,
  text: Schema.String,
  origin: Schema.Literals(["authored", "assistant"]),
  assistantTurnId: Schema.NullOr(AssistantTurnId),
  acceptedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
