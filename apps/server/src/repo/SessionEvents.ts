import {
  type Actor,
  type CampaignId,
  type CombatantId,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  SessionEvent,
  type SessionEventId,
  type SessionEventKind,
  type SessionId,
  type SessionLogFilterValues,
  type Visibility,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import { RUNS } from "./liveTables.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf } from "./rows.js";
import {
  containedRowReadable,
  ensureNestedParentReadable,
  ensureNestedRowReadable,
  inCampaign,
  type NestedTable,
  nestedRowReadable,
  under,
} from "./visibility.js";

interface SessionEventRow extends ProvenanceColumns {
  readonly id: SessionEventId;
  readonly session_id: SessionId;
  /**
   * `bigint`, and therefore a **string** off the wire. `pg` hands back `int8`
   * as text to protect a precision JavaScript cannot hold — the same reason
   * `creature.cr_sort` is `double precision` rather than `numeric`. Here the
   * width is genuinely wanted (it is a sequence that only ever climbs) and the
   * value is nowhere near 2^53, so the mapper narrows it once, here.
   */
  readonly seq: string;
  readonly kind: SessionEventKind;
  readonly encounter_run_id: EncounterRunId | null;
  readonly combatant_id: CombatantId | null;
  readonly payload: unknown;
  readonly request_id: string | null;
}

const toSessionEvent = (row: SessionEventRow): SessionEvent =>
  new SessionEvent({
    id: row.id,
    sessionId: row.session_id,
    seq: Number(row.seq),
    kind: row.kind,
    encounterRunId: row.encounter_run_id,
    combatantId: row.combatant_id,
    payload: row.payload,
    ...provenanceOf(row),
  });

/** `session_event` hangs off `session`, which is campaign-scoped. */
const LOG: NestedTable = { table: "session_event", parent: "session", foreignKey: "session_id" };

/** What an append needs to know. `seq`, `id` and `created_at` are the database's. */
export interface AppendEvent {
  readonly sessionId: SessionId;
  readonly kind: SessionEventKind;
  readonly encounterRunId?: EncounterRunId | undefined;
  readonly combatantId?: CombatantId | undefined;
  readonly payload?: Record<string, unknown> | undefined;
  /** Set on the mutations a client may safely repeat. See `session_event_request_id_key`. */
  readonly requestId?: string | undefined;
  /**
   * Left to the column default (`dm`) by every caller today.
   *
   * The consequence is deliberate and worth being explicit about: with no
   * player credential in existence, a player's stream is empty. Deciding per
   * kind which events a player may see is a real product decision that belongs
   * with the player view, and guessing it now would put a visibility rule
   * somewhere other than the predicate.
   */
  readonly visibility?: Visibility | undefined;
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
  sql<SessionEventRow>`
    insert into session_event ${sql.insert(
      defined({
        session_id: event.sessionId,
        kind: event.kind,
        encounter_run_id: event.encounterRunId,
        combatant_id: event.combatantId,
        payload: event.payload === undefined ? undefined : JSON.stringify(event.payload),
        request_id: event.requestId,
        visibility: event.visibility,
      }),
    )}
    returning *
  `.pipe(
    Effect.map((rows) => toSessionEvent(rows[0]!)),
    Effect.orDie,
  );

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
 */
export class SessionEvents extends Context.Service<
  SessionEvents,
  {
    readonly list: (
      campaignId: CampaignId,
      sessionId: SessionId,
      filter: SessionLogFilterValues,
    ) => Effect.Effect<ReadonlyArray<SessionEvent>, NotFound, CurrentActor>;
    readonly listForRun: (
      campaignId: CampaignId,
      sessionId: SessionId,
      runId: EncounterRunId,
      since: number,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<SessionEvent>, NotFound, CurrentActor>;
    /**
     * The same read as `listForRun`, with the actor already resolved.
     *
     * The live stream pulls repeatedly for the lifetime of a connection and
     * must not re-resolve `CurrentActor` on each pull: the actor was decided
     * when the request was authorised, and a stream whose permissions could
     * change under it mid-fight is a stream nobody can reason about.
     */
    readonly pollForRun: (
      actor: Actor,
      campaignId: CampaignId,
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
      const runPage = (
        actor: Actor,
        campaignId: CampaignId,
        runId: EncounterRunId,
        since: number,
        limit: number,
      ): Effect.Effect<ReadonlyArray<SessionEvent>, never, never> =>
        sql<SessionEventRow>`
          select session_event.* from session_event
          where session_event.encounter_run_id = ${runId}
            and session_event.seq > ${since}
            and ${logReadable(sql, campaignId, actor)}
          order by session_event.seq asc
          limit ${limit}
        `.pipe(
          Effect.map((rows) => rows.map(toSessionEvent)),
          Effect.orDie,
        );

      return {
        list: (campaignId, sessionId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureNestedParentReadable(sql, LOG, sessionId, campaignId, actor);
              const rows = yield* sql<SessionEventRow>`
                select session_event.* from session_event
                where ${nestedRowReadable(sql, LOG, sessionId, campaignId, actor)}
                  and session_event.seq > ${filter.since ?? 0}
                order by session_event.seq asc
                limit ${filter.limit ?? 200}
              `;
              return rows.map(toSessionEvent);
            }),
          ),

        listForRun: (campaignId, sessionId, runId, since, limit) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureNestedParentReadable(sql, LOG, sessionId, campaignId, actor);
              // One check, not two. "This session is readable" and "this run is
              // readable" are both true of a run in a *different* session of the
              // same campaign; only binding the foreign key between them asks
              // whether the run named is in the session named.
              yield* ensureNestedRowReadable(sql, RUNS, runId, sessionId, campaignId, actor);
              return yield* runPage(actor, campaignId, runId, since, limit);
            }),
          ),

        pollForRun: (actor, campaignId, _sessionId, runId, since, limit) =>
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
