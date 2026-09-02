import {
  type AccountId,
  type AssistantTurnId,
  type CampaignId,
  Conflict,
  CurrentActor,
  type GroupHistoryEntryCreate,
  GroupHistoryEntry,
  type GroupHistoryEntryId,
  GroupHistorySummary,
  type GroupHistorySummaryId,
  type GroupId,
  NotFound,
  type Origin,
  type SessionId,
  type SessionRecap,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { type CampaignCreatorActor } from "./CreatorActor.js";
import { Recap } from "./Recap.js";
import { dieOnSqlError } from "./rows.js";
import { ensureGroupReadable } from "./visibility.js";

/**
 * The group's chronicle — report §3.5, under the decisions of 2026-09-01.
 *
 * **Entries are copies, admitted on purpose; the group never reads through a
 * campaign.** That is the whole privacy design: what has happened is the
 * group's the moment its campaign's creator shares it (`fromRecap` renders
 * the played night to prose *here, at share time*), and unplayed prep never
 * enters this table at all — so a group-level read can be as wide as it
 * likes without a `WHERE` clause ever having to tell one creator's private
 * notes from another's. The boundary is which rows exist, not a predicate.
 *
 * Every read and write here is gated on **live group membership**
 * (`ensureGroupReadable`), because the chronicle is the group's: there is no
 * `dm`/`shared` axis at this level and deliberately no visibility column.
 * `fromRecap` alone wants more — the campaign creator's proof — because it is
 * the one act that turns campaign-private material into group history.
 */

interface EntryRow {
  readonly id: GroupHistoryEntryId;
  readonly group_id: GroupId;
  readonly campaign_id: CampaignId | null;
  readonly session_id: SessionId | null;
  readonly source_kind: GroupHistoryEntry["sourceKind"];
  readonly source_id: string | null;
  /** `bigint`, so `pg` hands it back as a string — narrowed here, once. */
  readonly group_seq: string;
  readonly occurred_at: Date | null;
  readonly accepted_at: Date;
  readonly title: string | null;
  readonly body: string;
  readonly facts: unknown;
  readonly origin: Origin;
  readonly assistant_turn_id: AssistantTurnId | null;
  readonly created_by_account_id: AccountId | null;
  readonly created_at: Date;
}

const toEntry = (row: EntryRow): GroupHistoryEntry =>
  new GroupHistoryEntry({
    id: row.id,
    groupId: row.group_id,
    campaignId: row.campaign_id,
    sessionId: row.session_id,
    sourceKind: row.source_kind,
    groupSeq: Number(row.group_seq),
    occurredAt: row.occurred_at === null ? null : DateTime.fromDateUnsafe(row.occurred_at),
    acceptedAt: DateTime.fromDateUnsafe(row.accepted_at),
    title: row.title,
    body: row.body,
    facts: row.facts,
    origin: row.origin,
    assistantTurnId: row.assistant_turn_id,
    createdByAccountId: row.created_by_account_id,
    createdAt: DateTime.fromDateUnsafe(row.created_at),
  });

interface SummaryRow {
  readonly id: GroupHistorySummaryId;
  readonly group_id: GroupId;
  readonly status: GroupHistorySummary["status"];
  readonly last_group_seq: string;
  readonly text: string;
  readonly origin: "authored" | "assistant";
  readonly assistant_turn_id: AssistantTurnId | null;
  readonly accepted_at: Date | null;
  readonly created_at: Date;
}

const toSummary = (row: SummaryRow): GroupHistorySummary =>
  new GroupHistorySummary({
    id: row.id,
    groupId: row.group_id,
    status: row.status,
    lastGroupSeq: Number(row.last_group_seq),
    text: row.text,
    origin: row.origin,
    assistantTurnId: row.assistant_turn_id,
    acceptedAt: row.accepted_at === null ? null : DateTime.fromDateUnsafe(row.accepted_at),
    createdAt: DateTime.fromDateUnsafe(row.created_at),
  });

/** Bounded, newest-admitted first. Not paged: a chronicle is read, not mined. */
const ENTRY_LIMIT = 500;

/**
 * A played night, rendered to the prose the group keeps — **at share time,
 * once**. Pure, so the copy rule is testable without a database: whatever this
 * returns is what the group remembers, however the campaign changes later.
 *
 * Beats verbatim (they are already the DM's words at the right length), fights
 * by name and outcome, the ticked prep as what the night settled. Exact
 * monster numbers are deliberately not written into the body — an outcome is
 * *what happened*, and a stat block is precisely what the product keeps to the
 * DM everywhere else.
 */
export const renderRecapEntry = (
  recap: SessionRecap,
): {
  readonly title: string;
  readonly body: string;
  readonly facts: unknown;
  readonly occurredAt: DateTime.Utc | null;
} => {
  const session = recap.session;
  const title =
    session.title === null || session.title === ""
      ? `Session ${String(session.number)}`
      : `Session ${String(session.number)} — ${session.title}`;

  const fightLines = recap.fights.map((fight) => {
    const run = fight.run;
    const down = fight.combatants.filter(
      (combatant) => combatant.hpCurrent !== null && combatant.hpCurrent <= 0,
    );
    const outcome =
      run.endedAt === null
        ? `still on the table at round ${String(run.round)}`
        : run.endedReason === "carried"
          ? `paused at round ${String(run.round)}`
          : `fought to a finish at round ${String(run.round)}`;
    const fell =
      down.length === 0 ? "" : ` ${down.map((c) => c.displayName).join(", ")} went down.`;
    return `${run.encounterName}: ${outcome}.${fell}`;
  });

  const beatLines = recap.beats.map((beat) => beat.body);
  const settled = recap.prepDone.map((item) => item.label);

  const body = [
    ...beatLines,
    ...fightLines,
    ...(settled.length === 0 ? [] : [`Settled before sitting down: ${settled.join("; ")}.`]),
  ].join("\n");

  return {
    title,
    body: body === "" ? "The night was played, and nobody wrote anything down." : body,
    facts: {
      sessionNumber: session.number,
      fights: recap.fights.map((fight) => ({
        name: fight.run.encounterName,
        round: fight.run.round,
        endedReason: fight.run.endedReason,
      })),
      beats: recap.beats.length,
    },
    occurredAt: session.startedAt,
  };
};

export class GroupHistory extends Context.Service<
  GroupHistory,
  {
    readonly list: (
      groupId: GroupId,
    ) => Effect.Effect<ReadonlyArray<GroupHistoryEntry>, NotFound, CurrentActor>;
    /** A member writing the chronicle by hand — `source_kind: 'manual'`. */
    readonly create: (
      groupId: GroupId,
      payload: GroupHistoryEntryCreate,
    ) => Effect.Effect<GroupHistoryEntry, NotFound, CurrentActor>;
    /**
     * The campaign creator sharing a played night. Takes the **proof** rather
     * than a campaign id — it is the one write that turns campaign-private
     * material into group history, so the authority is the same
     * `CampaignCreatorActor` the recap itself requires, and the group in the
     * path has to be the proof's own (a campaign of another group is the
     * ordinary `NotFound`).
     *
     * An unplayed night is a `Conflict`, not an entry: the boundary decision
     * admits what has *happened*, and a session with no `startedAt` has not.
     */
    readonly fromRecap: (
      groupId: GroupId,
      creator: CampaignCreatorActor,
      sessionId: SessionId,
    ) => Effect.Effect<GroupHistoryEntry, NotFound | Conflict, CurrentActor>;
    /** The current accepted summary, or `null` — the ordinary state of a young group. */
    readonly summary: (
      groupId: GroupId,
    ) => Effect.Effect<GroupHistorySummary | null, NotFound, CurrentActor>;
  }
>()("GroupHistory") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const recaps = yield* Recap;

      return {
        list: (groupId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              const rows = yield* sql<EntryRow>`
                select * from group_history_entry
                where group_history_entry.group_id = ${groupId}
                order by group_history_entry.group_seq desc
                limit ${ENTRY_LIMIT}
              `;
              return rows.map(toEntry);
            }),
          ),

        create: (groupId, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              // The provenance pointers are claims, checked structurally: a
              // campaign of another group, or a session of another campaign,
              // is the ordinary NotFound rather than a pointer taken on faith.
              if (payload.campaignId !== undefined) {
                const inGroup = yield* sql<{ readonly id: CampaignId }>`
                  select campaign.id from campaign
                  where campaign.id = ${payload.campaignId} and campaign.group_id = ${groupId}
                `;
                if (inGroup.length === 0) {
                  return yield* new NotFound({ resource: "campaign", id: payload.campaignId });
                }
              }
              if (payload.sessionId !== undefined) {
                if (payload.campaignId === undefined) {
                  return yield* new NotFound({ resource: "session", id: payload.sessionId });
                }
                const inCampaign = yield* sql<{ readonly id: SessionId }>`
                  select session.id from session
                  where session.id = ${payload.sessionId}
                    and session.campaign_id = ${payload.campaignId}
                `;
                if (inCampaign.length === 0) {
                  return yield* new NotFound({ resource: "session", id: payload.sessionId });
                }
              }
              const rows = yield* sql<EntryRow>`
                insert into group_history_entry
                  (group_id, campaign_id, session_id, source_kind, occurred_at,
                   title, body, created_by_account_id)
                values (${groupId}, ${payload.campaignId ?? null}, ${payload.sessionId ?? null},
                        'manual',
                        ${payload.occurredAt === undefined ? null : DateTime.toDate(payload.occurredAt)},
                        ${payload.title ?? null}, ${payload.body}, ${actor.accountId})
                returning *
              `;
              return toEntry(rows[0]!);
            }),
          ),

        fromRecap: (groupId, creator, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              // The proof carries its campaign's group; a proof spent at
              // another group's chronicle is refused as the campaign not being
              // there to share from — the same sentence a stranger gets.
              if (creator.group !== groupId) {
                return yield* new NotFound({ resource: "campaign", id: creator.campaign });
              }
              const recap = yield* recaps.read(creator, sessionId);
              if (recap.session.startedAt === null) {
                return yield* new Conflict({
                  message:
                    "this night has not been played yet — the chronicle records what happened, and nothing has",
                });
              }
              const rendered = renderRecapEntry(recap);
              const rows = yield* sql<EntryRow>`
                insert into group_history_entry
                  (group_id, campaign_id, session_id, source_kind, source_id, occurred_at,
                   title, body, facts, created_by_account_id)
                values (${groupId}, ${creator.campaign}, ${sessionId}, 'recap', ${sessionId},
                        ${rendered.occurredAt === null ? null : DateTime.toDate(rendered.occurredAt)},
                        ${rendered.title}, ${rendered.body}, ${JSON.stringify(rendered.facts)},
                        ${actor.accountId})
                returning *
              `;
              return toEntry(rows[0]!);
            }),
          ),

        summary: (groupId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              const rows = yield* sql<SummaryRow>`
                select * from group_history_summary
                where group_history_summary.group_id = ${groupId}
                  and group_history_summary.status = 'accepted'
              `;
              return rows.length === 0 ? null : toSummary(rows[0]!);
            }),
          ),
      };
    }),
  );
}
