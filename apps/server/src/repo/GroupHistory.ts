import {
  type AccountId,
  type AssistantTurnId,
  type CampaignId,
  Conflict,
  CurrentActor,
  type SharedWorldHistoryEntryCreate,
  SharedWorldHistoryEntry,
  type SharedWorldHistoryEntryId,
  SharedWorldHistorySummary,
  type SharedWorldHistorySummaryId,
  type SharedWorldId,
  NotFound,
  type Origin,
  type SessionId,
  type SessionRecap,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { type CampaignCreatorActor } from "./CreatorActor.js";
import { Recap } from "./Recap.js";
import {
  type AssistantOrigin,
  assistantColumns,
  defined,
  dieOnSqlError,
  likeContains,
} from "./rows.js";
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
  readonly id: SharedWorldHistoryEntryId;
  readonly group_id: SharedWorldId;
  readonly campaign_id: CampaignId | null;
  readonly session_id: SessionId | null;
  readonly source_kind: SharedWorldHistoryEntry["sourceKind"];
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

const toEntry = (row: EntryRow): SharedWorldHistoryEntry =>
  new SharedWorldHistoryEntry({
    id: row.id,
    worldId: row.group_id,
    campaignId: row.campaign_id,
    sessionId: row.session_id,
    sourceKind: row.source_kind,
    worldSeq: Number(row.group_seq),
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
  readonly id: SharedWorldHistorySummaryId;
  readonly group_id: SharedWorldId;
  readonly status: SharedWorldHistorySummary["status"];
  readonly last_group_seq: string;
  readonly text: string;
  readonly origin: "authored" | "assistant";
  readonly assistant_turn_id: AssistantTurnId | null;
  readonly accepted_at: Date | null;
  readonly created_at: Date;
}

const toSummary = (row: SummaryRow): SharedWorldHistorySummary =>
  new SharedWorldHistorySummary({
    id: row.id,
    worldId: row.group_id,
    status: row.status,
    lastWorldSeq: Number(row.last_group_seq),
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

/** One played night, as the group's timeline lists it. */
export interface PlayedNight {
  readonly campaignId: CampaignId;
  readonly campaignName: string;
  readonly sessionId: SessionId;
  readonly number: number;
  readonly title: string | null;
  readonly startedAt: DateTime.Utc;
  readonly endedAt: DateTime.Utc | null;
}

/** One played night's canonical story — see `nightStory` on the service. */
export interface NightStory {
  readonly campaignName: string;
  readonly number: number;
  readonly title: string | null;
  readonly startedAt: DateTime.Utc;
  /** The DM's own words, oldest first, verbatim. */
  readonly beats: ReadonlyArray<string>;
  /** Name and outcome only — no roster, no numbers, no stat blocks. */
  readonly fights: ReadonlyArray<{
    readonly name: string;
    readonly round: number;
    readonly outcome: "on the table" | "resolved" | "carried";
  }>;
}

export class GroupHistory extends Context.Service<
  GroupHistory,
  {
    readonly list: (
      groupId: SharedWorldId,
    ) => Effect.Effect<ReadonlyArray<SharedWorldHistoryEntry>, NotFound, CurrentActor>;
    /**
     * A member writing the chronicle by hand — `source_kind: 'manual'` — or,
     * with `from`, group Hob's accepted proposal: the same statement, one
     * extra argument, the `Proposals` rule one table across.
     */
    readonly create: (
      groupId: SharedWorldId,
      payload: SharedWorldHistoryEntryCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<SharedWorldHistoryEntry, NotFound, CurrentActor>;
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
      groupId: SharedWorldId,
      creator: CampaignCreatorActor,
      sessionId: SessionId,
    ) => Effect.Effect<SharedWorldHistoryEntry, NotFound | Conflict, CurrentActor>;
    /** The current accepted summary, or `null` — the ordinary state of a young group. */
    readonly summary: (
      groupId: SharedWorldId,
    ) => Effect.Effect<SharedWorldHistorySummary | null, NotFound, CurrentActor>;
    /**
     * The exact accepted-memory batch used to refresh Story So Far. Entries
     * begin immediately after the current accepted summary's coverage marker
     * and are oldest first, so the model can extend rather than rewrite memory.
     */
    readonly summarySources: (groupId: SharedWorldId) => Effect.Effect<
      {
        readonly summary: SharedWorldHistorySummary | null;
        readonly entries: ReadonlyArray<SharedWorldHistoryEntry>;
        readonly lastWorldSeq: number;
      },
      NotFound,
      CurrentActor
    >;
    /** Replace the one accepted summary while preserving its predecessors. */
    readonly acceptSummary: (
      groupId: SharedWorldId,
      text: string,
      lastWorldSeq: number,
      from: AssistantOrigin,
    ) => Effect.Effect<SharedWorldHistorySummary, NotFound, CurrentActor>;
    /**
     * Lexical search over the chronicle — group Hob's grounding read. `ILIKE`
     * over title and body, newest admitted first; the corpus is bounded (a
     * chronicle is written by hand and by accepts), so no `tsvector` yet —
     * `0008_beats.ts`'s rule, an index nothing reads is worse than none.
     */
    readonly search: (
      groupId: SharedWorldId,
      q: string,
    ) => Effect.Effect<ReadonlyArray<SharedWorldHistoryEntry>, NotFound, CurrentActor>;
    /**
     * Every **played** night across the group's campaigns — the canonical
     * timeline the group-Hob boundary decision grants: what has happened is
     * the group's. Keyed structurally on `session.started_at`: a planned
     * session is prep and does not exist here, whoever asks.
     */
    readonly playedNights: (
      groupId: SharedWorldId,
    ) => Effect.Effect<ReadonlyArray<PlayedNight>, NotFound, CurrentActor>;
    /**
     * One played night's canonical story: the beats verbatim and the fights
     * by name and outcome. **This is the one read in the product that crosses
     * a campaign boundary on group membership alone**, and the decision of
     * 2026-09-01 is its whole warrant — played sessions, story beats and
     * combat outcomes are canonical and group-visible. What it deliberately
     * does not read: notes (prep until shared), prep items, encounters that
     * never ran, combatant numbers, stat blocks. An unplayed session is the
     * ordinary `NotFound`, because unplayed prep does not exist at this level.
     */
    readonly nightStory: (
      groupId: SharedWorldId,
      campaignId: CampaignId,
      sessionId: SessionId,
    ) => Effect.Effect<NightStory, NotFound, CurrentActor>;
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

        create: (groupId, payload, from) =>
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
                insert into group_history_entry ${sql.insert(
                  defined({
                    group_id: groupId,
                    campaign_id: payload.campaignId,
                    session_id: payload.sessionId,
                    source_kind: "manual",
                    occurred_at:
                      payload.occurredAt === undefined
                        ? undefined
                        : DateTime.toDate(payload.occurredAt),
                    title: payload.title,
                    body: payload.body,
                    created_by_account_id: actor.accountId,
                    ...assistantColumns(from),
                  }),
                )}
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

        summarySources: (groupId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              const summaries = yield* sql<SummaryRow>`
                select * from group_history_summary
                where group_history_summary.group_id = ${groupId}
                  and group_history_summary.status = 'accepted'
              `;
              const current = summaries.length === 0 ? null : toSummary(summaries[0]!);
              const after = current?.lastWorldSeq ?? 0;
              const rows = yield* sql<EntryRow>`
                select * from group_history_entry
                where group_history_entry.group_id = ${groupId}
                  and group_history_entry.group_seq > ${after}
                order by group_history_entry.group_seq asc
                limit ${ENTRY_LIMIT}
              `;
              const entries = rows.map(toEntry);
              return {
                summary: current,
                entries,
                lastWorldSeq: entries.at(-1)?.worldSeq ?? after,
              };
            }),
          ),

        acceptSummary: (groupId, text, lastWorldSeq, from) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              // Different proposal turns may be approved at the same instant.
              // Serialize replacements on the world row so each transaction
              // supersedes what is current when its turn arrives, rather than
              // racing the partial unique index for an unexplained SQL defect.
              yield* sql`select id from play_group where id = ${groupId} for update`;
              // A proposal may cover only a real prefix of this world's
              // Chronicle. Zero is the exact boundary for an empty world.
              if (lastWorldSeq > 0) {
                const boundary = yield* sql<{ readonly group_seq: string }>`
                  select group_seq from group_history_entry
                  where group_id = ${groupId} and group_seq = ${lastWorldSeq}
                `;
                if (boundary.length === 0) {
                  return yield* new NotFound({ resource: "shared_world_history", id: groupId });
                }
              }
              yield* sql`
                update group_history_summary
                set status = 'superseded', updated_at = now()
                where group_id = ${groupId} and status = 'accepted'
              `;
              const rows = yield* sql<SummaryRow>`
                insert into group_history_summary
                  (group_id, status, last_group_seq, text, origin, assistant_turn_id,
                   accepted_by_account_id, accepted_at)
                values (${groupId}, 'accepted', ${lastWorldSeq}, ${text}, 'assistant',
                        ${from.assistantTurnId}, ${actor.accountId}, now())
                returning *
              `;
              return toSummary(rows[0]!);
            }),
          ),

        search: (groupId, q) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              const rows = yield* sql<EntryRow>`
                select * from group_history_entry
                where group_history_entry.group_id = ${groupId}
                  and (group_history_entry.body ilike ${likeContains(q)}
                       or group_history_entry.title ilike ${likeContains(q)})
                order by group_history_entry.group_seq desc
                limit 20
              `;
              return rows.map(toEntry);
            }),
          ),

        playedNights: (groupId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              const rows = yield* sql<{
                readonly campaign_id: CampaignId;
                readonly campaign_name: string;
                readonly session_id: SessionId;
                readonly number: number;
                readonly title: string | null;
                readonly started_at: Date;
                readonly ended_at: Date | null;
              }>`
                select campaign.id as campaign_id, campaign.name as campaign_name,
                       session.id as session_id, session.number, session.title,
                       session.started_at, session.ended_at
                from session
                join campaign on campaign.id = session.campaign_id
                where campaign.group_id = ${groupId}
                  and session.started_at is not null
                order by session.started_at asc, session.id asc
              `;
              return rows.map((row): PlayedNight => ({
                campaignId: row.campaign_id,
                campaignName: row.campaign_name,
                sessionId: row.session_id,
                number: row.number,
                title: row.title,
                startedAt: DateTime.fromDateUnsafe(row.started_at),
                endedAt: row.ended_at === null ? null : DateTime.fromDateUnsafe(row.ended_at),
              }));
            }),
          ),

        nightStory: (groupId, campaignId, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              // Two structural claims, both checked: the campaign is of this
              // group, and the session is of that campaign *and played*. A
              // planned session answers exactly as a missing one — unplayed
              // prep does not exist at group level, so there is nothing to be
              // told apart from nothing.
              const nights = yield* sql<{
                readonly number: number;
                readonly title: string | null;
                readonly started_at: Date;
                readonly campaign_name: string;
              }>`
                select session.number, session.title, session.started_at,
                       campaign.name as campaign_name
                from session
                join campaign on campaign.id = session.campaign_id
                where session.id = ${sessionId}
                  and campaign.id = ${campaignId}
                  and campaign.group_id = ${groupId}
                  and session.started_at is not null
              `;
              if (nights.length === 0) {
                return yield* new NotFound({ resource: "session", id: sessionId });
              }
              // Beats verbatim — canonical by the decision, whatever their
              // row-level visibility: a beat records what happened at the
              // table, and what happened is the group's.
              const beats = yield* sql<{ readonly body: string }>`
                select beat.body from beat
                where beat.session_id = ${sessionId}
                order by beat.created_at asc, beat.id asc
              `;
              const fights = yield* sql<{
                readonly encounter_name: string;
                readonly round: number;
                readonly ended_at: Date | null;
                readonly ended_reason: string | null;
              }>`
                select encounter_run.encounter_name, encounter_run.round,
                       encounter_run.ended_at, encounter_run.ended_reason
                from encounter_run
                where encounter_run.session_id = ${sessionId}
                order by encounter_run.created_at asc, encounter_run.id asc
              `;
              return {
                campaignName: nights[0]!.campaign_name,
                number: nights[0]!.number,
                title: nights[0]!.title,
                startedAt: DateTime.fromDateUnsafe(nights[0]!.started_at),
                beats: beats.map((row) => row.body),
                fights: fights.map((row) => ({
                  name: row.encounter_name,
                  round: row.round,
                  outcome:
                    row.ended_at === null
                      ? ("on the table" as const)
                      : row.ended_reason === "carried"
                        ? ("carried" as const)
                        : ("resolved" as const),
                })),
              };
            }),
          ),
      };
    }),
  );
}
