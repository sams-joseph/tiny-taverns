import { Schema } from "effect";
import {
  AssistantTurnId,
  AccountId,
  CampaignId,
  GroupHistoryEntryId,
  GroupHistorySummaryId,
  GroupId,
  SessionId,
} from "./Ids.js";
import { Origin } from "./Provenance.js";

/**
 * Group history: what the group has agreed happened — report §3.5.
 *
 * **An entry is a copy, admitted on purpose, and canonical once admitted.**
 * It is never read back through the campaign it came from: the body is stored
 * prose, the `campaignId`/`sessionId` are provenance pointers that survive as
 * `null` when their rows go, and the group's memory outlives every campaign
 * in it. That is the deliberate alternative to a "magic read" over every
 * campaign table, which would make one creator's private prep another's
 * context — the boundary `decision-group-hob-boundary.md` draws.
 *
 * **There is no `visibility` here.** Being in this table *is* the visibility:
 * a group member reads the group's history, full stop. What must not enter it
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

export class GroupHistoryEntry extends Schema.Class<GroupHistoryEntry>("GroupHistoryEntry")({
  id: GroupHistoryEntryId,
  groupId: GroupId,
  /** Where it came from — `null` once that campaign is gone. Provenance, not a reach path. */
  campaignId: Schema.NullOr(CampaignId),
  sessionId: Schema.NullOr(SessionId),
  sourceKind: HistorySource,
  /**
   * Acceptance order, group-wide — one global sequence, so entries from two
   * campaigns interleave in the order the group admitted them. A cursor only
   * has to increase; nothing counts it.
   */
  groupSeq: Schema.Int,
  /** When it happened in the world, when somebody said. Display, never ordering. */
  occurredAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  acceptedAt: Schema.DateTimeUtcFromString,
  title: Schema.NullOr(Schema.String),
  body: Schema.String,
  /**
   * The machine-legible remainder — session numbers, fight outcomes, names —
   * for group Hob to cite. Like `SessionEvent.payload`, not a contract
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
 * A manual entry — any live member writing the group's chronicle by hand.
 * `campaignId`/`sessionId` are optional provenance claims; the campaign one is
 * checked against the group (a campaign of another group is a `NotFound`).
 */
export const GroupHistoryEntryCreate = Schema.Struct({
  title: Schema.optional(title),
  body,
  campaignId: Schema.optional(CampaignId),
  sessionId: Schema.optional(SessionId),
  occurredAt: Schema.optional(Schema.DateTimeUtcFromString),
});
export type GroupHistoryEntryCreate = typeof GroupHistoryEntryCreate.Type;

/**
 * Sharing a played night to the group — the campaign creator's act, and the
 * ordinary way canonical history enters the chronicle. The server renders the
 * recap to prose *at share time* and stores the copy; later edits to the
 * campaign do not reach it.
 */
export const GroupHistoryFromRecap = Schema.Struct({
  campaignId: CampaignId,
  sessionId: SessionId,
});
export type GroupHistoryFromRecap = typeof GroupHistoryFromRecap.Type;

export const SummaryStatus = Schema.Literals(["draft", "accepted", "superseded"]);
export type SummaryStatus = typeof SummaryStatus.Type;

/**
 * The running summary — derived, replaceable, and at most one `accepted` per
 * group (a partial unique index). `lastGroupSeq` is how much of the record it
 * has read, so staleness is arithmetic rather than a flag.
 */
export class GroupHistorySummary extends Schema.Class<GroupHistorySummary>("GroupHistorySummary")({
  id: GroupHistorySummaryId,
  groupId: GroupId,
  status: SummaryStatus,
  lastGroupSeq: Schema.Int,
  text: Schema.String,
  origin: Schema.Literals(["authored", "assistant"]),
  assistantTurnId: Schema.NullOr(AssistantTurnId),
  acceptedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
