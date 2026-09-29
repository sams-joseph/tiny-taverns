import {
  type Actor,
  Beat,
  type BeatCreate,
  BeatId,
  type BeatUpdate,
  CampaignId,
  type CreatedOrder,
  createdPageFilter,
  type CreatedPageFilterValues,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  type Page,
  SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { createdOrdering, orderClause, pageClauses, pageLimit, pageOfRows } from "./paging.js";
import { RUNS } from "./liveTables.js";
import {
  type AssistantOrigin,
  assistantColumns,
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  setClause,
  timestampColumns,
} from "./rows.js";
import { appendEvent } from "./SessionEvents.js";
import {
  ensureNestedParentReadable,
  ensureNestedParentWritable,
  type NestedTable,
  nestedRowReadable,
  nestedRowWritable,
} from "./visibility.js";

/**
 * A `beat` row as the wire reads it, decoded off `beat.*` by `SqlSchema`.
 * Exported for `Recap`, which reads every night's beats in one statement.
 */
export const BeatRow = classFromColumns(Beat, { ...Beat.fields, ...timestampColumns });

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/** The session a beat is under, and the campaign the caller says that session is in. */
const parentFields = { campaignId: CampaignId, sessionId: SessionId } as const;

/**
 * `beat` hangs off `session`, which hangs off `campaign`. Exactly `prep_item`.
 *
 * Exported because two other repositories need it — `Recap` lists a night's
 * beats and `Search` needs the same containment in its `Containment` form. One
 * statement of "a beat is under a session" is the whole point of the chain
 * being data rather than a predicate written out per caller.
 */
export const BEATS: NestedTable = { table: "beat", parent: "session", foreignKey: "session_id" };

/**
 * Fails with `NotFound` unless the named fight exists in *this* session and
 * this actor may write to it.
 *
 * The composite `beat_run_fkey` already makes a beat on one night attached to
 * another night's fight impossible, but a constraint violation is a defect and
 * a 500. This turns the same refusal into the 404 the rest of the surface
 * answers with, and it also covers what the key cannot see: whether the *actor*
 * reaches that run. Same shape as `Notes.ensureEncounterWritable`.
 */
const ensureRunWritable = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  sessionId: SessionId,
  runId: EncounterRunId | undefined,
  actor: Actor,
) =>
  Effect.gen(function* () {
    if (runId === undefined) return;
    const rows = yield* sql<{ readonly id: EncounterRunId }>`
      select encounter_run.id from encounter_run
      where encounter_run.id = ${runId}
        and ${nestedRowWritable(sql, RUNS, sessionId, campaignId, actor)}
    `;
    if (rows.length === 0) return yield* new NotFound({ resource: "encounter_run", id: runId });
  });

/**
 * What the DM jotted down while it was happening.
 *
 * The repository is `PrepItems` with one text column instead of a label and a
 * boolean, and that similarity is the point: a beat is session-scoped with no
 * `campaign_id`, so it inherits the whole visibility seam through the existing
 * `NestedTable` machinery with no new predicate. Every method takes the
 * campaign as well as the session because the session id arrives from a client
 * and is therefore a claim — trusting it alone would let a credential minted
 * for one table read another table's record of the night.
 *
 * Two things are specific to beats:
 *
 * - **Creating one appends `beat-added` to the log and rings the doorbell.**
 *   That puts a marker at the right `seq` so a recap can order beats against
 *   combat from the log alone, and it lets a second surface re-read. The prose
 *   stays out of the payload, so `payload` remains non-contractual.
 * - **Correcting one appends nothing.** The log has no update path by design,
 *   and a correction that arrived as a second log line would be exactly the
 *   append-a-retraction answer that ruled out storing beats there in the first
 *   place. The row is the truth; the marker only says when it first appeared.
 */
export class Beats extends Context.Service<
  Beats,
  {
    /** Paged, oldest first — see `repo/paging.ts`. */
    readonly list: (
      campaignId: CampaignId,
      sessionId: SessionId,
      filter: CreatedPageFilterValues,
    ) => Effect.Effect<Page<Beat, CreatedOrder>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      sessionId: SessionId,
      id: BeatId,
    ) => Effect.Effect<Beat, NotFound, CurrentActor>;
    /** `from` is the accept path's, and only its — see `Notes.create`. */
    readonly create: (
      campaignId: CampaignId,
      sessionId: SessionId,
      payload: BeatCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<Beat, NotFound, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      sessionId: SessionId,
      id: BeatId,
      patch: BeatUpdate,
    ) => Effect.Effect<Beat, NotFound, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      sessionId: SessionId,
      id: BeatId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Beats") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;
      const ordering = createdOrdering<Beat>(sql, "beat");

      // Oldest first: a chronology, not a library. This is the order a recap
      // quotes them in, and the order the night happened in.
      const readablePage = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({ ...parentFields, filter: Schema.Struct(createdPageFilter) }),
        ),
        Result: BeatRow,
        execute: ({ campaignId, sessionId, filter }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select beat.* from beat
              where ${sql.and([
                nestedRowReadable(sql, BEATS, sessionId, campaignId, actor),
                ...pageClauses(sql, ordering, filter.cursor),
              ])}
              order by ${orderClause(sql, ordering)}
              limit ${pageLimit(filter.limit)}
            `,
          ),
      });
      const readableById = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...parentFields, id: BeatId })),
        Result: BeatRow,
        execute: ({ campaignId, sessionId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select beat.* from beat
              where beat.id = ${id}
                and ${nestedRowReadable(sql, BEATS, sessionId, campaignId, actor)}
            `,
          ),
      });
      /** A new beat. What reaches its session was checked by the method that built the columns. */
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: BeatRow,
        execute: (columns) => sql`insert into beat ${sql.insert(columns)} returning *`,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...parentFields, id: BeatId, columns: Columns })),
        Result: BeatRow,
        execute: ({ campaignId, sessionId, id, columns }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update beat set ${setClause(sql, columns)}
              where beat.id = ${id}
                and ${nestedRowWritable(sql, BEATS, sessionId, campaignId, actor)}
              returning *
            `,
          ),
      });
      const erase = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...parentFields, id: BeatId })),
        Result: fromColumns(Schema.Struct({ id: BeatId })),
        execute: ({ campaignId, sessionId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              delete from beat
              where beat.id = ${id}
                and ${nestedRowWritable(sql, BEATS, sessionId, campaignId, actor)}
              returning beat.id
            `,
          ),
      });

      return {
        list: (campaignId, sessionId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureNestedParentReadable(sql, BEATS, sessionId, campaignId, actor);
              const rows = yield* readablePage({ campaignId, sessionId, filter });
              return pageOfRows(rows, filter.limit, ordering, "created", (beat) => beat);
            }),
          ),

        findById: (campaignId, sessionId, id) =>
          dieOnSqlError(readableById({ campaignId, sessionId, id }).pipe(orNotFound("beat", id))),

        create: (campaignId, sessionId, payload, from) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureNestedParentWritable(sql, BEATS, sessionId, campaignId, actor);
                  yield* ensureRunWritable(
                    sql,
                    campaignId,
                    sessionId,
                    payload.encounterRunId,
                    actor,
                  );
                  // An insert answers with its row; not getting one is a defect.
                  const beat = yield* insert(
                    defined({
                      session_id: sessionId,
                      encounter_run_id: payload.encounterRunId,
                      body: payload.body,
                      visibility: payload.visibility,
                      ...assistantColumns(from),
                    }),
                  ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                  // No prose in the payload. The beat is the row; this is a
                  // pointer in time to it, so `payload` stays the
                  // human-legible remainder it is documented as being.
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "beat-added",
                    encounterRunId: payload.encounterRunId,
                  });
                  return beat;
                }),
              )
              .pipe(Effect.tap(() => live.touched(sessionId))),
          ),

        update: (campaignId, sessionId, id, patch) =>
          dieOnSqlError(
            change({
              campaignId,
              sessionId,
              id,
              columns: defined({ body: patch.body, visibility: patch.visibility }),
            }).pipe(orNotFound("beat", id)),
          ),

        remove: (campaignId, sessionId, id) =>
          dieOnSqlError(
            Effect.asVoid(erase({ campaignId, sessionId, id }).pipe(orNotFound("beat", id))),
          ),
      };
    }),
  );
}
