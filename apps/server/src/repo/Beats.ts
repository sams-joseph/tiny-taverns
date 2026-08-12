import {
  type Actor,
  Beat,
  type BeatCreate,
  type BeatId,
  type BeatUpdate,
  type CampaignId,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { RUNS } from "./liveTables.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import { appendEvent } from "./SessionEvents.js";
import {
  ensureNestedParentReadable,
  ensureNestedParentWritable,
  type NestedTable,
  nestedRowReadable,
  nestedRowWritable,
} from "./visibility.js";

export interface BeatRow extends ProvenanceColumns {
  readonly id: BeatId;
  readonly session_id: SessionId;
  readonly encounter_run_id: EncounterRunId | null;
  readonly body: string;
}

export const toBeat = (row: BeatRow): Beat =>
  new Beat({
    id: row.id,
    sessionId: row.session_id,
    encounterRunId: row.encounter_run_id,
    body: row.body,
    ...provenanceOf(row),
  });

/** `beat` hangs off `session`, which hangs off `campaign`. Exactly `prep_item`. */
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
    readonly list: (
      campaignId: CampaignId,
      sessionId: SessionId,
    ) => Effect.Effect<ReadonlyArray<Beat>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      sessionId: SessionId,
      id: BeatId,
    ) => Effect.Effect<Beat, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      sessionId: SessionId,
      payload: BeatCreate,
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

      return {
        list: (campaignId, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureNestedParentReadable(sql, BEATS, sessionId, campaignId, actor);
              // Oldest first: a chronology, not a library. This is the order a
              // recap quotes them in, and the order the night happened in.
              const rows = yield* sql<BeatRow>`
                select beat.* from beat
                where ${nestedRowReadable(sql, BEATS, sessionId, campaignId, actor)}
                order by beat.created_at asc, beat.id asc
              `;
              return rows.map(toBeat);
            }),
          ),

        findById: (campaignId, sessionId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<BeatRow>`
                select beat.* from beat
                where beat.id = ${id}
                  and ${nestedRowReadable(sql, BEATS, sessionId, campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "beat", id });
              return toBeat(rows[0]!);
            }),
          ),

        create: (campaignId, sessionId, payload) =>
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
                  const rows = yield* sql<BeatRow>`
                    insert into beat ${sql.insert(
                      defined({
                        session_id: sessionId,
                        encounter_run_id: payload.encounterRunId,
                        body: payload.body,
                        visibility: payload.visibility,
                      }),
                    )}
                    returning *
                  `;
                  const beat = toBeat(rows[0]!);
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
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({ body: patch.body, visibility: patch.visibility });
              const rows = yield* sql<BeatRow>`
                update beat set ${setClause(sql, columns)}
                where beat.id = ${id}
                  and ${nestedRowWritable(sql, BEATS, sessionId, campaignId, actor)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "beat", id });
              return toBeat(rows[0]!);
            }),
          ),

        remove: (campaignId, sessionId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: BeatId }>`
                delete from beat
                where beat.id = ${id}
                  and ${nestedRowWritable(sql, BEATS, sessionId, campaignId, actor)}
                returning beat.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "beat", id });
            }),
          ),
      };
    }),
  );
}
