import {
  Actor,
  type AssistantTurnId,
  CampaignId,
  type CharacterId,
  type CombatantId,
  EncounterRunId,
  NotFound,
  type Origin,
  SessionEvent,
  type SessionEventId,
  type SessionEventKind,
  SessionId,
  type SessionLogFilterValues,
  type Visibility,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema, type Statement } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { RUNS } from "./liveTables.js";
import { classFromColumns, defined, dieOnSqlError, int8Column, timestampColumns } from "./rows.js";
import {
  containedRowReadable,
  ensureNestedParentReadable,
  ensureNestedRowReadable,
  inCampaign,
  type NestedTable,
  nestedRowReadable,
  under,
} from "./visibility.js";

/**
 * A `session_event` row as the wire reads it, decoded off `session_event.*`
 * by `SqlSchema`.
 *
 * `seq` is a `bigint` column, read through `int8Column`: the width is
 * genuinely wanted (it is a sequence that only ever climbs) and the value is
 * nowhere near 2^53, so the decode narrows it once, here.
 */
const SessionEventRow = classFromColumns(SessionEvent, {
  ...SessionEvent.fields,
  seq: int8Column.pipe(Schema.decodeTo(SessionEvent.fields.seq)),
  ...timestampColumns,
});

/** The written columns, as `appendEvent` builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/** `session_event` hangs off `session`, which is campaign-scoped. */
const LOG: NestedTable = { table: "session_event", parent: "session", foreignKey: "session_id" };

/** What an append needs to know. `seq`, `id` and `created_at` are the database's. */
export interface AppendEvent {
  readonly sessionId: SessionId;
  readonly kind: SessionEventKind;
  readonly encounterRunId?: EncounterRunId | undefined;
  readonly combatantId?: CombatantId | undefined;
  readonly characterId?: CharacterId | undefined;
  readonly payload?: Record<string, unknown> | undefined;
  /** Set on the mutations a client may safely repeat. See `session_event_request_id_key`. */
  readonly requestId?: string | undefined;
  /**
   * Left to the column default (`dm`) unless the mutation has a player-safe
   * doorbell to ring. The player table stream still returns no payload — it
   * reads only shared event `seq`s and re-reads its narrow endpoints.
   */
  readonly visibility?: Visibility | undefined;
  /** Assistant-authored log rows name the turn that caused them. */
  readonly origin?: Origin | undefined;
  readonly assistantTurnId?: AssistantTurnId | undefined;
}

/**
 * Append one line to the log, in the caller's transaction.
 *
 * A plain function over `sql` rather than a method on the service below,
 * because every caller is a live mutation that is already inside
 * `sql.withTransaction` and the whole value of this insert is that it commits
 * with the mutation it describes or not at all. A service method would be the
 * same code with an opportunity to call it outside the transaction.
 */
export const appendEvent = (
  sql: SqlClient.SqlClient,
  event: AppendEvent,
): Effect.Effect<SessionEvent, never, never> =>
  SqlSchema.findOne({
    Request: Columns,
    Result: SessionEventRow,
    execute: (columns) => sql`insert into session_event ${sql.insert(columns)} returning *`,
  })(
    defined({
      session_id: event.sessionId,
      kind: event.kind,
      encounter_run_id: event.encounterRunId,
      combatant_id: event.combatantId,
      character_id: event.characterId,
      payload: event.payload === undefined ? undefined : JSON.stringify(event.payload),
      request_id: event.requestId,
      visibility: event.visibility,
      origin: event.origin,
      assistant_turn_id: event.assistantTurnId,
    }),
  ).pipe(Effect.orDie);

/**
 * Whether this run has already recorded this `requestId`.
 *
 * The read half of idempotency (§4.3). A live mutation checks it inside its own
 * transaction and, on a hit, returns current state without applying anything —
 * which is what stops a double-tapped damage button taking ten hit points
 * instead of five. `session_event_request_id_key` is the backstop for two
 * requests that race past the check together; the losing one gets a unique
 * violation, which the caller turns back into a re-read.
 */
export const requestAlreadyApplied = (
  sql: SqlClient.SqlClient,
  runId: EncounterRunId,
  requestId: string | undefined,
): Effect.Effect<boolean, never, never> =>
  requestId === undefined
    ? Effect.succeed(false)
    : sql<{ readonly id: SessionEventId }>`
        select session_event.id from session_event
        where session_event.encounter_run_id = ${runId}
          and session_event.request_id = ${requestId}
        limit 1
      `.pipe(
        Effect.map((rows) => rows.length > 0),
        Effect.orDie,
      );

/**
 * The same question for a write that happened outside a fight.
 *
 * Damage applied from the party list has no run to key on, so it is recorded
 * against the session — and `session_event_session_request_id_key` (`0014`) is
 * the backstop, partial on exactly the rows the run-keyed index excludes. The
 * `encounter_run_id is null` term is what keeps the two halves disjoint: a
 * request id reused by a later in-fight write is a different index's problem.
 */
export const sessionRequestAlreadyApplied = (
  sql: SqlClient.SqlClient,
  sessionId: SessionId,
  requestId: string | undefined,
): Effect.Effect<boolean, never, never> =>
  requestId === undefined
    ? Effect.succeed(false)
    : sql<{ readonly id: SessionEventId }>`
        select session_event.id from session_event
        where session_event.session_id = ${sessionId}
          and session_event.encounter_run_id is null
          and session_event.request_id = ${requestId}
        limit 1
      `.pipe(
        Effect.map((rows) => rows.length > 0),
        Effect.orDie,
      );

/**
 * Reads over the append-only log.
 *
 * There is no `create`, `update` or `remove` here and no endpoint that could
 * reach one. Writes come from `appendEvent`, inside the transaction of the
 * mutation being recorded.
 *
 * `listForRun` is the query the live stream is built on, and it is the *same*
 * query a client polling `GET /log` runs. That is the point: catching up after
 * a dropped connection is the ordinary read with the ordinary cursor, not a
 * replay path that only executes when something has already gone wrong and
 * therefore only rots when nobody is looking.
 *
 * **All three reads take a `CampaignCreatorActor`.** The log is still the
 * creator's own record of a fight, even though some rows are now also shared as
 * player-table doorbells. A player never receives these payloads through this
 * repository; their stream reads shared `seq`s only and re-reads a distinct
 * projection. Note that `pollForRun` is gated too: it is the *streaming*
 * spelling of `listForRun` and a grep for `CurrentActor>` misses it, which
 * would have left the gate on the other two decorative.
 */
export class SessionEvents extends Context.Service<
  SessionEvents,
  {
    readonly list: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      filter: SessionLogFilterValues,
    ) => Effect.Effect<ReadonlyArray<SessionEvent>, NotFound>;
    readonly listForRun: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      since: number,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<SessionEvent>, NotFound>;
    /**
     * The same read as `listForRun`, for the lifetime of one connection.
     *
     * It always took its actor as an argument rather than as a requirement,
     * because the live stream pulls repeatedly after the handler effect has
     * returned: the actor was decided when the request was authorised, and a
     * stream whose permissions could change under it mid-fight is a stream
     * nobody can reason about. That is also why the `CampaignCreatorActor` gate has to reach
     * this method by hand — a grep for `CurrentActor>` does not see it, and a
     * stream is exactly where a wide projection would go unnoticed.
     */
    readonly pollForRun: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      since: number,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<SessionEvent>, never, never>;
  }
>()("SessionEvents") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      /**
       * Everything in this run after `since`, oldest first.
       *
       * `limit` bounds one page, and the caller loops until a short page comes
       * back. Without it a client returning from an hour asleep would ask the
       * server to materialise the whole hour in one array.
       */
      const runEvents = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({
            actor: Actor,
            campaignId: CampaignId,
            runId: EncounterRunId,
            since: Schema.Number,
            limit: Schema.Number,
          }),
        ),
        Result: SessionEventRow,
        execute: ({ actor, campaignId, runId, since, limit }) => sql`
          select session_event.* from session_event
          where session_event.encounter_run_id = ${runId}
            and session_event.seq > ${since}
            and ${logReadable(sql, campaignId, actor)}
          order by session_event.seq asc
          limit ${limit}
        `,
      });
      const runPage = (
        actor: Actor,
        campaignId: CampaignId,
        runId: EncounterRunId,
        since: number,
        limit: number,
      ): Effect.Effect<ReadonlyArray<SessionEvent>, never, never> =>
        runEvents({ actor, campaignId, runId, since, limit }).pipe(Effect.orDie);

      const sessionEvents = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({
            actor: Actor,
            campaignId: CampaignId,
            sessionId: SessionId,
            since: Schema.Number,
            limit: Schema.Number,
          }),
        ),
        Result: SessionEventRow,
        execute: ({ actor, campaignId, sessionId, since, limit }) => sql`
          select session_event.* from session_event
          where ${nestedRowReadable(sql, LOG, sessionId, campaignId, actor)}
            and session_event.seq > ${since}
          order by session_event.seq asc
          limit ${limit}
        `,
      });

      return {
        list: ({ actor, campaign: campaignId }, sessionId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureNestedParentReadable(sql, LOG, sessionId, campaignId, actor);
              return yield* sessionEvents({
                actor,
                campaignId,
                sessionId,
                since: filter.since ?? 0,
                limit: filter.limit ?? 200,
              });
            }),
          ),

        listForRun: ({ actor, campaign: campaignId }, sessionId, runId, since, limit) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureNestedParentReadable(sql, LOG, sessionId, campaignId, actor);
              // One check, not two. "This session is readable" and "this run is
              // readable" are both true of a run in a *different* session of the
              // same campaign; only binding the foreign key between them asks
              // whether the run named is in the session named.
              yield* ensureNestedRowReadable(sql, RUNS, runId, sessionId, campaignId, actor);
              return yield* runPage(actor, campaignId, runId, since, limit);
            }),
          ),

        pollForRun: ({ actor, campaign: campaignId }, _sessionId, runId, since, limit) =>
          runPage(actor, campaignId, runId, since, limit),
      };
    }),
  );
}

/**
 * The log row's own readability.
 *
 * `session_event` is nested under `session` exactly as `prep_item` is, so this
 * is `nestedRowReadable` without the `session_id = ?` term — the run filter has
 * already narrowed to one session, and binding it twice would mean the caller
 * could pass a session that disagrees with the run.
 */
const logReadable = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  containedRowReadable(
    sql,
    under("session_event", "session_id", inCampaign("session")),
    campaignId,
    actor,
  );
