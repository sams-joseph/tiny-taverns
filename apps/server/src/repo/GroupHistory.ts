import {
  AccountId,
  AssistantTurnId,
  CampaignId,
  Conflict,
  EncounterKind,
  EncounterRunEndedReason,
  CurrentActor,
  type SharedWorldHistoryEntryCreate,
  SharedWorldHistoryEntry,
  SharedWorldHistorySummary,
  SharedWorldId,
  NotFound,
  SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema, type Statement } from "effect/unstable/sql";
import { type CampaignCreatorActor } from "./CreatorActor.js";
import { fightName } from "./EncounterRuns.js";
import { initiativeOrder } from "./liveTables.js";
import {
  type AssistantOrigin,
  assistantColumns,
  defined,
  classFromColumns,
  dieOnSqlError,
  fromColumns,
  likeContains,
  orNotFound,
} from "./rows.js";
import {
  ensureGroupReadable,
  ensureGroupWritable,
  fightToldTheWorld,
  runEncounterToldTheWorld,
  toldTheWorld,
} from "./visibility.js";

/**
 * The group's chronicle — report §3.5, under the decisions of 2026-09-01 and
 * the captain's narrowing of 2026-09-25.
 *
 * **Entries are copies, admitted on purpose; the group never reads through a
 * campaign.** That is the whole privacy design: what has happened is the
 * group's the moment its campaign's creator shares it (`fromRecap` renders
 * the played night to prose *here, at share time*), and unplayed prep never
 * enters this table at all — so a group-level read can be as wide as it
 * likes without a `WHERE` clause ever having to tell one creator's private
 * notes from another's. The boundary is which rows exist, not a predicate.
 *
 * What a played night *contributes* is narrower than the night: only what its
 * DM shared (`toldNight`). A hidden fight, a fight still on the table and a
 * beat, prep line or combatant kept to the DM are the table's, not the
 * world's — the same answer the table's own players get.
 *
 * Every read and write here is gated on **live group membership**
 * (`ensureGroupReadable`), because the chronicle is the group's: there is no
 * `dm`/`shared` axis at this level and deliberately no visibility column.
 * `fromRecap` alone wants more — the campaign creator's proof — because it is
 * the one act that turns campaign-private material into group history.
 */

/** `bigint`, which `pg` hands back as a string: read as the wire's integer. */
const seqColumn = Schema.NumberFromString.pipe(Schema.decodeTo(Schema.Int));

/** A `group_history_entry` row as the wire reads it, decoded off `select *` by `SqlSchema`. */
const EntryRow = classFromColumns(
  SharedWorldHistoryEntry,
  {
    ...SharedWorldHistoryEntry.fields,
    worldSeq: seqColumn,
    occurredAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    acceptedAt: Schema.DateTimeUtcFromDate,
    createdAt: Schema.DateTimeUtcFromDate,
  },
  { worldId: "group_id", worldSeq: "group_seq" },
);

/** A `group_history_summary` row as the wire reads it. */
const SummaryRow = classFromColumns(
  SharedWorldHistorySummary,
  {
    ...SharedWorldHistorySummary.fields,
    lastWorldSeq: seqColumn,
    acceptedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    createdAt: Schema.DateTimeUtcFromDate,
  },
  { worldId: "group_id", lastWorldSeq: "last_group_seq" },
);

/** The session a told night is read from, beside its campaign's name and the told summary. */
const NightRow = fromColumns(
  Schema.Struct({
    number: Schema.Int,
    title: Schema.NullOr(Schema.String),
    startedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    campaignName: Schema.String,
    summary: Schema.NullOr(Schema.String),
  }),
);

/** A shared, ended fight as its Shared World is told it. */
const ToldFightRow = fromColumns(
  Schema.Struct({
    name: Schema.String,
    mode: EncounterKind,
    round: Schema.Int,
    outcome: EncounterRunEndedReason,
    fell: Schema.Array(Schema.String),
  }),
  { name: "encounter_name", outcome: "ended_reason" },
);

/** One played night, as the group's timeline lists it. */
/** The written columns of an insert, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

const PlayedNightRow = fromColumns(
  Schema.Struct({
    campaignId: CampaignId,
    campaignName: Schema.String,
    sessionId: SessionId,
    number: Schema.Int,
    title: Schema.NullOr(Schema.String),
    startedAt: Schema.DateTimeUtcFromDate,
    endedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  }),
);

/**
 * A night's summary as its Shared World may be told it: only when the session
 * itself is shared with its table, by the same predicate every other part of
 * a told night composes.
 */
const toldSummary = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`case when ${toldTheWorld(sql, "session")} then session.summary end`;

/** Bounded, newest-admitted first. Not paged: a chronicle is read, not mined. */
const ENTRY_LIMIT = 500;

/**
 * One played night as its Shared World is told it — the output of the one read
 * both `nightStory` and `fromRecap` take it from (`toldNight` in the layer).
 */
export interface ToldNight {
  readonly campaignName: string;
  readonly number: number;
  readonly title: string | null;
  readonly startedAt: DateTime.Utc;
  /**
   * The DM's summary of the night, only when the night itself is shared with
   * its table (`toldTheWorld` over the session); null otherwise. The title is
   * told whatever the switch says, the summary never.
   */
  readonly summary: string | null;
  /** Shared beats, verbatim, oldest first. */
  readonly beats: ReadonlyArray<string>;
  /** Shared fights that have ended, in the order they started. */
  readonly fights: ReadonlyArray<{
    readonly name: string;
    /** A fight, or a scene of another kind, which has no rounds to tell. */
    readonly mode: EncounterKind;
    readonly round: number;
    readonly outcome: "resolved" | "carried";
    /**
     * Shared combatants who ended a fight at zero hit points. Always empty for
     * a scene that was not a fight: its players were shown nobody in it.
     */
    readonly fell: ReadonlyArray<string>;
  }>;
  /** Shared prep lines the DM ticked. */
  readonly settled: ReadonlyArray<string>;
}

/**
 * A played night, rendered to the prose the group keeps — **at share time,
 * once**. Pure, so the copy rule is testable without a database: whatever this
 * returns is what the group remembers, however the campaign changes later.
 *
 * The night's summary first when its DM shared the night, then beats verbatim
 * (they are already the DM's words at the right length), fights
 * by name and outcome, the ticked prep as what the night settled. Exact
 * monster numbers are deliberately not written into the body — an outcome is
 * *what happened*, and a stat block is precisely what the product keeps to the
 * DM everywhere else. What the night holds that its DM did not share never
 * reaches this function: `toldNight` does not select it.
 */
export const renderNightEntry = (
  night: ToldNight,
): {
  readonly title: string;
  readonly body: string;
  readonly facts: unknown;
  readonly occurredAt: DateTime.Utc;
} => {
  const title =
    night.title === null || night.title === ""
      ? `Session ${String(night.number)}`
      : `Session ${String(night.number)} — ${night.title}`;

  const fightLines = night.fights.map((fight) => {
    const outcome =
      fight.mode !== "combat"
        ? fight.outcome === "carried"
          ? "paused when the night ended"
          : "played to its end"
        : fight.outcome === "carried"
          ? `paused at round ${String(fight.round)}`
          : `fought to a finish at round ${String(fight.round)}`;
    const fell = fight.fell.length === 0 ? "" : ` ${fight.fell.join(", ")} went down.`;
    return `${fight.name}: ${outcome}.${fell}`;
  });

  const body = [
    ...(night.summary === null ? [] : [night.summary]),
    ...night.beats,
    ...fightLines,
    ...(night.settled.length === 0
      ? []
      : [`Settled before sitting down: ${night.settled.join("; ")}.`]),
  ].join("\n");

  return {
    title,
    body: body === "" ? "The night was played, and nobody wrote anything down." : body,
    facts: {
      sessionNumber: night.number,
      fights: night.fights.map((fight) => ({
        name: fight.name,
        mode: fight.mode,
        round: fight.round,
        endedReason: fight.outcome,
      })),
      beats: night.beats.length,
    },
    occurredAt: night.startedAt,
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

/** One played night's story as the world is told it — see `nightStory` on the service. */
export interface NightStory {
  readonly campaignName: string;
  readonly number: number;
  readonly title: string | null;
  readonly startedAt: DateTime.Utc;
  /** The DM's summary, when the night is shared with its table. */
  readonly summary: string | null;
  /** The DM's shared words, oldest first, verbatim. */
  readonly beats: ReadonlyArray<string>;
  /** Shared, ended fights: name and outcome only — no roster, no numbers, no stat blocks. */
  readonly fights: ReadonlyArray<{
    readonly name: string;
    readonly mode: EncounterKind;
    readonly round: number;
    readonly outcome: "resolved" | "carried";
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
     * than a campaign id — it is the one write that turns campaign material
     * into group history, so the authority is the same `CampaignCreatorActor`
     * the recap itself requires, and the group in the path has to be the
     * proof's own (a campaign of another group is the ordinary `NotFound`).
     * What it copies is the night as the world is told it (`toldNight`), not
     * the creator's recap: sharing the night does not flip the Share switch
     * of anything in it.
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
     * The owner's clear: the world is left with no Story So Far. Owner-only
     * (`ensureGroupWritable`), as renaming and archiving are, so a member who
     * is not the owner is the ordinary `NotFound`; a world with none already
     * is a no-op, as the campaign story's `remove` is.
     *
     * **Predecessors are kept, as a replacement keeps them.** The current
     * summary is marked `superseded` rather than deleted, so a clear is a
     * replacement by nothing: the row keeps its text and the turn it was kept
     * from, and nothing reads a superseded row. With no accepted summary,
     * `summarySources` starts from the first entry again, so Hob's next draft
     * reads the whole Chronicle rather than extending what was cleared.
     */
    readonly clearSummary: (groupId: SharedWorldId) => Effect.Effect<void, NotFound, CurrentActor>;
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
     * One played night's story: the shared beats verbatim and the shared,
     * ended fights by name and outcome. **This is the one read in the product
     * that crosses a campaign boundary on group membership alone.** The
     * decision of 2026-09-01 is its warrant — played nights are the world's —
     * and the captain's of 2026-09-25 its limit: the world is told only what
     * the DM shared, so a hidden fight, a fight still on the table and a
     * DM-only beat are not in it. What it never tells: notes (prep until
     * shared), prep items, encounters that never ran, combatant numbers, stat
     * blocks. An unplayed session is the ordinary `NotFound`, because
     * unplayed prep does not exist at this level.
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

      /**
       * A night's told fights: shared, ended, in the order they started — see
       * `toldNight` for what is and is not told of each.
       */
      const toldFights = SqlSchema.findAll({
        Request: Schema.toType(SessionId),
        Result: ToldFightRow,
        execute: (sessionId) => sql`
          select ${fightName(sql, runEncounterToldTheWorld(sql))} as encounter_name,
                 encounter_run.mode,
                 encounter_run.round,
                 encounter_run.ended_reason,
                 array(
                   select combatant.display_name from combatant
                   where combatant.encounter_run_id = encounter_run.id
                     and encounter_run.mode = 'combat'
                     and combatant.hp_current <= 0
                     and ${toldTheWorld(sql, "combatant")}
                   ${initiativeOrder(sql)}
                 ) as fell
          from encounter_run
          where encounter_run.session_id = ${sessionId}
            and ${fightToldTheWorld(sql)}
          order by encounter_run.started_at asc, encounter_run.id asc
        `,
      });
      const entries = SqlSchema.findAll({
        Request: Schema.toType(SharedWorldId),
        Result: EntryRow,
        execute: (groupId) => sql`
          select * from group_history_entry
          where group_history_entry.group_id = ${groupId}
          order by group_history_entry.group_seq desc
          limit ${ENTRY_LIMIT}
        `,
      });
      /** The accepted-memory batch after `after`, oldest first. */
      const entriesAfter = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ groupId: SharedWorldId, after: Schema.Number })),
        Result: EntryRow,
        execute: ({ groupId, after }) => sql`
          select * from group_history_entry
          where group_history_entry.group_id = ${groupId}
            and group_history_entry.group_seq > ${after}
          order by group_history_entry.group_seq asc
          limit ${ENTRY_LIMIT}
        `,
      });
      const matching = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ groupId: SharedWorldId, q: Schema.String })),
        Result: EntryRow,
        execute: ({ groupId, q }) => sql`
          select * from group_history_entry
          where group_history_entry.group_id = ${groupId}
            and (group_history_entry.body ilike ${likeContains(q)}
                 or group_history_entry.title ilike ${likeContains(q)})
          order by group_history_entry.group_seq desc
          limit 20
        `,
      });
      const insertEntry = SqlSchema.findOne({
        Request: Columns,
        Result: EntryRow,
        execute: (columns) =>
          sql`insert into group_history_entry ${sql.insert(columns)} returning *`,
      });
      /** The world's one accepted summary, if it has one. */
      const accepted = SqlSchema.findOneOption({
        Request: Schema.toType(SharedWorldId),
        Result: SummaryRow,
        execute: (groupId) => sql`
          select * from group_history_summary
          where group_history_summary.group_id = ${groupId}
            and group_history_summary.status = 'accepted'
        `,
      });
      /** Group Hob's accepted Story So Far, which the caller has made the only accepted one. */
      const insertSummary = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            groupId: SharedWorldId,
            lastWorldSeq: Schema.Number,
            text: Schema.String,
            assistantTurnId: AssistantTurnId,
            accountId: AccountId,
          }),
        ),
        Result: SummaryRow,
        execute: ({ groupId, lastWorldSeq, text, assistantTurnId, accountId }) => sql`
          insert into group_history_summary
            (group_id, status, last_group_seq, text, origin, assistant_turn_id,
             accepted_by_account_id, accepted_at)
          values (${groupId}, 'accepted', ${lastWorldSeq}, ${text}, 'assistant',
                  ${assistantTurnId}, ${accountId}, now())
          returning *
        `,
      });
      /** A session of the proof's campaign, played or not, with what the world may be told of it. */
      const sessionOf = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, sessionId: SessionId })),
        Result: NightRow,
        execute: ({ campaignId, sessionId }) => sql`
          select session.number, session.title, session.started_at,
                 campaign.name as campaign_name,
                 ${toldSummary(sql)} as summary
          from session
          join campaign on campaign.id = session.campaign_id
          where session.id = ${sessionId}
            and campaign.id = ${campaignId}
        `,
      });
      /** A played session of a campaign of this world. */
      const playedNight = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ groupId: SharedWorldId, campaignId: CampaignId, sessionId: SessionId }),
        ),
        Result: NightRow,
        execute: ({ groupId, campaignId, sessionId }) => sql`
          select session.number, session.title, session.started_at,
                 campaign.name as campaign_name,
                 ${toldSummary(sql)} as summary
          from session
          join campaign on campaign.id = session.campaign_id
          where session.id = ${sessionId}
            and campaign.id = ${campaignId}
            and campaign.group_id = ${groupId}
            and session.started_at is not null
        `,
      });
      const timeline = SqlSchema.findAll({
        Request: Schema.toType(SharedWorldId),
        Result: PlayedNightRow,
        execute: (groupId) => sql`
          select campaign.id as campaign_id, campaign.name as campaign_name,
                 session.id as session_id, session.number, session.title,
                 session.started_at, session.ended_at
          from session
          join campaign on campaign.id = session.campaign_id
          where campaign.group_id = ${groupId}
            and session.started_at is not null
          order by session.started_at asc, session.id asc
        `,
      });

      /**
       * One played night as its Shared World is told it — the one read behind
       * both `nightStory` and `fromRecap`, so what world Hob is told and what
       * the Chronicle keeps cannot disagree. Every part composes the Share
       * switch in SQL (`toldTheWorld`, `fightToldTheWorld`), so a hidden fight,
       * a fight still on the table, and a beat, prep line or combatant kept to
       * the DM are never selected. A told fight is named after its encounter
       * only when that encounter is shared with the table's players (Shared and
       * Ready, `runEncounterToldTheWorld`), and is otherwise told by its kind,
       * "A fight" or "A conversation" (`fightName`), as it is to those
       * players; a scene that was not a fight tells nobody who fell in it, as
       * its players were shown nobody in it. The caller has already bound the
       * session to its campaign and group and checked that it was played.
       */
      const toldNight = (
        sessionId: SessionId,
        night: {
          readonly number: number;
          readonly title: string | null;
          readonly startedAt: DateTime.Utc;
          readonly campaignName: string;
          readonly summary: string | null;
        },
      ) =>
        Effect.gen(function* () {
          const beats = yield* sql<{ readonly body: string }>`
            select beat.body from beat
            where beat.session_id = ${sessionId}
              and ${toldTheWorld(sql, "beat")}
            order by beat.created_at asc, beat.id asc
          `;
          const fights = yield* toldFights(sessionId);
          const settled = yield* sql<{ readonly label: string }>`
            select prep_item.label from prep_item
            where prep_item.session_id = ${sessionId}
              and prep_item.done
              and ${toldTheWorld(sql, "prep_item")}
            order by prep_item.created_at asc, prep_item.id asc
          `;
          return {
            campaignName: night.campaignName,
            number: night.number,
            title: night.title,
            startedAt: night.startedAt,
            summary: night.summary,
            beats: beats.map((row) => row.body),
            fights,
            settled: settled.map((row) => row.label),
          } satisfies ToldNight;
        });

      return {
        list: (groupId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              return yield* entries(groupId);
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
              // An insert answers with its row; not getting one is a defect.
              return yield* insertEntry(
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
              ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
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
              const night = yield* sessionOf({ campaignId: creator.campaign, sessionId }).pipe(
                orNotFound("session", sessionId),
              );
              if (night.startedAt === null) {
                return yield* new Conflict({
                  message:
                    "this night has not been played yet — the chronicle records what happened, and nothing has",
                });
              }
              const rendered = renderNightEntry(
                yield* toldNight(sessionId, { ...night, startedAt: night.startedAt }),
              );
              // An insert answers with its row; not getting one is a defect.
              return yield* insertEntry({
                group_id: groupId,
                campaign_id: creator.campaign,
                session_id: sessionId,
                source_kind: "recap",
                source_id: sessionId,
                occurred_at: DateTime.toDate(rendered.occurredAt),
                title: rendered.title,
                body: rendered.body,
                facts: JSON.stringify(rendered.facts),
                created_by_account_id: actor.accountId,
              }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
            }),
          ),

        summary: (groupId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              return Option.getOrNull(yield* accepted(groupId));
            }),
          ),

        summarySources: (groupId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              const current = Option.getOrNull(yield* accepted(groupId));
              const after = current?.lastWorldSeq ?? 0;
              const batch = yield* entriesAfter({ groupId, after });
              return {
                summary: current,
                entries: batch,
                lastWorldSeq: batch.at(-1)?.worldSeq ?? after,
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
              // An insert answers with its row; not getting one is a defect.
              return yield* insertSummary({
                groupId,
                lastWorldSeq,
                text,
                assistantTurnId: from.assistantTurnId,
                accountId: actor.accountId,
              }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
            }),
          ),

        clearSummary: (groupId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureGroupWritable(sql, groupId, actor);
                // The same row lock `acceptSummary` serializes on, so a keep
                // and a clear at the same instant apply one after the other.
                yield* sql`select id from play_group where id = ${groupId} for update`;
                yield* sql`
                  update group_history_summary
                  set status = 'superseded', updated_at = now()
                  where group_id = ${groupId} and status = 'accepted'
                `;
              }),
            ),
          ),

        search: (groupId, q) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              return yield* matching({ groupId, q });
            }),
          ),

        playedNights: (groupId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, groupId, actor);
              return yield* timeline(groupId);
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
              const played = yield* playedNight({ groupId, campaignId, sessionId }).pipe(
                orNotFound("session", sessionId),
              );
              // `started_at is not null` is in the statement's own predicate.
              const night = yield* toldNight(sessionId, {
                ...played,
                startedAt: played.startedAt!,
              });
              return {
                campaignName: night.campaignName,
                number: night.number,
                title: night.title,
                startedAt: night.startedAt,
                summary: night.summary,
                beats: night.beats,
                fights: night.fights.map((fight) => ({
                  name: fight.name,
                  mode: fight.mode,
                  round: fight.round,
                  outcome: fight.outcome,
                })),
              };
            }),
          ),
      };
    }),
  );
}
