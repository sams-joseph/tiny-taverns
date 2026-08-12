import {
  type CampaignId,
  Conflict,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  Session,
  type SessionCreate,
  type SessionId,
  type SessionUpdate,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import { appendEvent } from "./SessionEvents.js";
import {
  ensureCampaignReadable,
  ensureCampaignWritable,
  rowReadable,
  rowWritable,
} from "./visibility.js";

export interface SessionRow extends ProvenanceColumns {
  readonly id: SessionId;
  readonly campaign_id: CampaignId;
  readonly number: number;
  readonly title: string | null;
  readonly started_at: Date | null;
  readonly ended_at: Date | null;
  readonly active_encounter_run_id: EncounterRunId | null;
}

export const toSession = (row: SessionRow): Session =>
  new Session({
    id: row.id,
    campaignId: row.campaign_id,
    number: row.number,
    title: row.title,
    startedAt: row.started_at === null ? null : DateTime.fromDateUnsafe(row.started_at),
    endedAt: row.ended_at === null ? null : DateTime.fromDateUnsafe(row.ended_at),
    // Read-only on the wire. It is written by starting and ending a run, and
    // by nothing else — see `SessionUpdate`, which has no field for it.
    activeEncounterRunId: row.active_encounter_run_id,
    ...provenanceOf(row),
  });

/**
 * `(campaign_id, number)` is unique, so a repeated session number surfaces as a
 * 409 rather than a 500. The database is the arbiter — checking first and then
 * inserting would race.
 */
const asConflict = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Conflict, R> =>
  Effect.catch(effect, (error): Effect.Effect<A, E | Conflict> =>
    SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
      ? Effect.fail(new Conflict({ message: "that session number is already used" }))
      : Effect.fail(error),
  );

export class Sessions extends Context.Service<
  Sessions,
  {
    readonly list: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<Session>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      id: SessionId,
    ) => Effect.Effect<Session, NotFound, CurrentActor>;
    readonly create: (
      campaignId: CampaignId,
      payload: SessionCreate,
    ) => Effect.Effect<Session, NotFound | Conflict, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      id: SessionId,
      patch: SessionUpdate,
    ) => Effect.Effect<Session, NotFound | Conflict, CurrentActor>;
    readonly remove: (
      campaignId: CampaignId,
      id: SessionId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Sessions") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      /**
       * The other half of ending a session.
       *
       * §1.4 of the architecture describes one transition: `ended` freezes
       * `ended_at` **and clears `campaign.current_session_id`**. Only the first
       * half shipped, and the DM was left in a night that was already over —
       * the campaign screen resolves the session it is preparing from that
       * pointer, and `StartRunDialog` invents the next session only when the
       * pointer resolves to nothing.
       *
       * It lives here rather than in the dialog that stamped the end time
       * because it is not a step a client may forget: a second client would
       * never see the pointer move, and a future endpoint that ends a session
       * would have to remember the same thing again. The two writes are one
       * transaction, and `campaign_current_session_id_fkey` refuses the pair
       * coming apart even if some later path tries.
       *
       * Scoped to the row that was just written: an un-end (`endedAt: null`)
       * clears nothing, and a campaign pointing somewhere else is untouched.
       */
      const releaseIfFinished = (row: SessionRow) =>
        row.ended_at === null
          ? Effect.void
          : Effect.asVoid(sql`
              update campaign set current_session_id = null, updated_at = now()
              where campaign.id = ${row.campaign_id} and campaign.current_session_id = ${row.id}
            `);

      /**
       * The rest of ending a session: the fight still on the table.
       *
       * A night may now be finished mid-combat, and the fight carries into the
       * next one — the captain's decision, replacing the placeholder refusal in
       * `apps/web/src/session/finish.ts`. Taking it off the table here rather
       * than in the client is the same call `releaseIfFinished` makes and for
       * the same two reasons: a client that forgets recreates the bug, and a
       * second client never sees it happen. It also deletes the tab-race
       * re-read the campaign view used to do, which is a real simplification
       * the decision buys.
       *
       * Three writes, in the transaction that stamped `ended_at`:
       *
       * - the run is ended with `ended_reason = 'carried'`, which is what makes
       *   it *resumable* — an ended run with no reason looks like a fight the DM
       *   finished;
       * - the session stops pointing at it, exactly as `EncounterRuns.end`
       *   does, because a session must not name a fight that is over;
       * - `run-carried` goes in the log, so a recap can say "paused at round 4"
       *   rather than reporting a fight the party is still standing in as
       *   concluded.
       *
       * `encounter_run_one_live_per_session` guarantees there is at most one row
       * to find, so this is not a loop that could half-finish. Nothing is
       * deleted and nothing is decided on the DM's behalf: an unresumed carried
       * run is just an ended run with a marker on it.
       */
      const carryLiveRun = (row: SessionRow) =>
        row.ended_at === null
          ? Effect.succeed(false)
          : Effect.gen(function* () {
              const carried = yield* sql<{
                readonly id: EncounterRunId;
                readonly round: number;
                readonly encounter_name: string;
              }>`
                update encounter_run
                set ended_at = now(), ended_reason = 'carried', updated_at = now()
                where encounter_run.session_id = ${row.id} and encounter_run.ended_at is null
                returning encounter_run.id, encounter_run.round, encounter_run.encounter_name
              `;
              const run = carried[0];
              if (run === undefined) return false;

              yield* sql`
                update session set active_encounter_run_id = null, updated_at = now()
                where session.id = ${row.id} and session.active_encounter_run_id = ${run.id}
              `;
              yield* appendEvent(sql, {
                sessionId: row.id,
                kind: "run-carried",
                encounterRunId: run.id,
                payload: { round: run.round, encounterName: run.encounter_name },
              });
              return true;
            });

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const rows = yield* sql<SessionRow>`
                select * from session
                where ${rowReadable(sql, "session", campaignId, actor)}
                order by session.number desc
              `;
              return rows.map(toSession);
            }),
          ),

        findById: (campaignId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<SessionRow>`
                select * from session
                where session.id = ${id} and ${rowReadable(sql, "session", campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "session", id });
              return toSession(rows[0]!);
            }),
          ),

        create: (campaignId, payload) =>
          dieOnSqlError(
            asConflict(
              sql.withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureCampaignWritable(sql, campaignId, actor);
                  const rows = yield* sql<SessionRow>`
                    insert into session ${sql.insert(
                      defined({
                        campaign_id: campaignId,
                        number: payload.number,
                        title: payload.title,
                        visibility: payload.visibility,
                      }),
                    )}
                    returning *
                  `;
                  return toSession(rows[0]!);
                }),
              ),
            ),
          ),

        update: (campaignId, id, patch) =>
          dieOnSqlError(
            asConflict(
              sql
                .withTransaction(
                  Effect.gen(function* () {
                    const actor = yield* CurrentActor;
                    const columns = defined({
                      number: patch.number,
                      title: patch.title,
                      started_at: patch.startedAt && DateTime.toDateUtc(patch.startedAt),
                      ended_at: patch.endedAt && DateTime.toDateUtc(patch.endedAt),
                      visibility: patch.visibility,
                    });
                    const rows = yield* sql<SessionRow>`
                      update session set ${setClause(sql, columns)}
                      where session.id = ${id} and ${rowWritable(sql, "session", campaignId, actor)}
                      returning *
                    `;
                    if (rows.length === 0) return yield* new NotFound({ resource: "session", id });
                    yield* releaseIfFinished(rows[0]!);
                    const carried = yield* carryLiveRun(rows[0]!);
                    // Re-read rather than returning the row from above:
                    // `carryLiveRun` clears `active_encounter_run_id`, and
                    // handing back a session that still names a fight which is
                    // now off the table would be a lie one round trip long.
                    const settled = carried
                      ? yield* sql<SessionRow>`select * from session where session.id = ${id}`
                      : rows;
                    return { session: toSession(settled[0]!), carried };
                  }),
                )
                .pipe(
                  // The doorbell, after the commit and only when there was a
                  // fight to take off the table — a runner open in another tab
                  // learns the night ended under it the same way it learns
                  // everything else.
                  Effect.tap(({ carried }) => (carried ? live.touched(id) : Effect.void)),
                  Effect.map(({ session }) => session),
                ),
            ),
          ),

        /**
         * Delete a session.
         *
         * **This now throws away campaign history, not just a checklist.**
         * `beat` cascades from `session` like `prep_item` and `session_event`,
         * which is the right cascade — a beat with no night is meaningless —
         * but the DM's own record of what happened that evening goes with it.
         * A client reaching this deserves a confirmation that says so.
         */
        remove: (campaignId, id) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                // The pointer used to fall away on its own: the foreign key was
                // `on delete set null`, and it no longer can be — Postgres
                // refuses that action on a key containing a generated column,
                // and the key is what makes a finished session unable to be the
                // current one (`0006_session_finished.ts`). So the detach that
                // used to be invisible is written down. Rolled back with the
                // delete if it turns out there was nothing to delete.
                yield* sql`
                  update campaign set current_session_id = null, updated_at = now()
                  where campaign.id = ${campaignId} and campaign.current_session_id = ${id}
                `;
                const rows = yield* sql<{ readonly id: SessionId }>`
                  delete from session
                  where session.id = ${id} and ${rowWritable(sql, "session", campaignId, actor)}
                  returning session.id
                `;
                if (rows.length === 0) return yield* new NotFound({ resource: "session", id });
              }),
            ),
          ),
      };
    }),
  );
}
