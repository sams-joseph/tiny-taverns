import {
  Actor,
  AssistantTurnId,
  CampaignCharacterId,
  CampaignId,
  Conflict,
  CurrentActor,
  EncounterRunId,
  NotFound,
  Session,
  type SessionCreate,
  SessionId,
  type SessionUpdate,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlError, SqlSchema, type Statement } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { clearArea, RUN } from "./liveTables.js";
import {
  type AssistantOrigin,
  assistantColumns,
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  proseColumn,
  setClause,
  timestampColumns,
} from "./rows.js";
import { appendEvent } from "./SessionEvents.js";
import {
  containedRowReadable,
  ensureCampaignReadable,
  ensureCampaignWritable,
  ownedRowReadable,
  rowReadable,
  rowWritable,
} from "./visibility.js";

/**
 * A `session` row as the wire reads it, decoded by `SqlSchema` off
 * `sessionColumns` or, for the creator's own writes, off `session.*`.
 * `active_encounter_run_id` is read-only on the wire: it is written by
 * starting and ending a run, and by nothing else — see `SessionUpdate`, which
 * has no field for it. Exported for `Recap`, which reads a night the same way.
 */
export const SessionRow = classFromColumns(Session, {
  ...Session.fields,
  startedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  endedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  ...timestampColumns,
});

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/**
 * A session row as this actor may read it: every column, with the two
 * pointers narrowed to rows they can read.
 *
 * `active_encounter_run_id` is a pointer into `encounter_run`, and a run has
 * its own Share switch. Selected raw, it tells a player that a hidden fight is
 * on the table, when it started and ended, and its id, while every run read
 * answers them `NotFound`. So the pointer goes through the run predicate and
 * comes back null for a fight they cannot see, as though none were running.
 * `spotlight_seat_id` goes through the seat's own predicate the party list
 * reads with, for the same reason. Every read that serialises a `Session` for
 * a caller selects through this.
 */
export const sessionColumns = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment => sql`
  session.id, session.campaign_id, session.number, session.title,
  session.started_at, session.ended_at,
  session.visibility, session.origin, session.assistant_turn_id,
  session.created_at, session.updated_at,
  case when exists (
    select 1 from encounter_run
    where encounter_run.id = session.active_encounter_run_id
      and ${containedRowReadable(sql, RUN, campaignId, actor)}
  ) then session.active_encounter_run_id end as active_encounter_run_id,
  session.summary, session.summary_origin, session.summary_assistant_turn_id,
  case when exists (
    select 1 from campaign_character
    where campaign_character.id = session.spotlight_seat_id
      and ${ownedRowReadable(sql, "campaign_character", campaignId, actor)}
  ) then session.spotlight_seat_id end as spotlight_seat_id
`;

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
    /** `from` is the accept path's, and only its — see `Notes.create`. */
    readonly create: (
      campaignId: CampaignId,
      payload: SessionCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<Session, NotFound | Conflict, CurrentActor>;
    /**
     * `from` is set only by `repo/Proposals.ts`, when the DM keeps a summary
     * Hob drafted: the same statement then stamps the summary `assistant`
     * with that turn. Without it a new summary is `authored`, and an edit
     * keeps whichever it had.
     */
    readonly update: (
      campaignId: CampaignId,
      id: SessionId,
      patch: SessionUpdate,
      from?: AssistantOrigin,
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
      const releaseIfFinished = (session: Session) =>
        session.endedAt === null
          ? Effect.void
          : Effect.asVoid(sql`
              update campaign set current_session_id = null, updated_at = now()
              where campaign.id = ${session.campaignId}
                and campaign.current_session_id = ${session.id}
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
       * Four writes, in the transaction that stamped `ended_at`:
       *
       * - the run is ended with `ended_reason = 'carried'`, which is what makes
       *   it *resumable* — an ended run with no reason looks like a fight the DM
       *   finished;
       * - the session stops pointing at it, exactly as `EncounterRuns.end`
       *   does, because a session must not name a fight that is over;
       * - its board's pinned area template is cleared, as `end` clears it;
       * - `run-carried` goes in the log, so a recap can say "paused at round 4"
       *   rather than reporting a fight the party is still standing in as
       *   concluded.
       *
       * `encounter_run_one_live_per_session` guarantees there is at most one row
       * to find, so this is not a loop that could half-finish. Nothing is
       * deleted and nothing is decided on the DM's behalf: an unresumed carried
       * run is just an ended run with a marker on it.
       */
      /** The night's live fight, ended as carried; no row when none was on the table. */
      const carryRun = SqlSchema.findOneOption({
        Request: Schema.toType(SessionId),
        Result: fromColumns(
          Schema.Struct({ id: EncounterRunId, round: Schema.Int, encounterName: Schema.String }),
        ),
        execute: (sessionId) => sql`
          update encounter_run
          set ended_at = now(), ended_reason = 'carried', updated_at = now()
          where encounter_run.session_id = ${sessionId} and encounter_run.ended_at is null
          returning encounter_run.id, encounter_run.round, encounter_run.encounter_name
        `,
      });
      const carryLiveRun = (session: Session) =>
        session.endedAt === null
          ? Effect.succeed(false)
          : Effect.gen(function* () {
              const carried = yield* carryRun(session.id);
              if (Option.isNone(carried)) return false;
              const run = carried.value;

              yield* sql`
                update session set active_encounter_run_id = null, updated_at = now()
                where session.id = ${session.id} and session.active_encounter_run_id = ${run.id}
              `;
              // A pinned template is the night's, not the fight's: the
              // resumed fight starts with nothing pinned.
              yield* clearArea(sql, run.id);
              yield* appendEvent(sql, {
                sessionId: session.id,
                kind: "run-carried",
                encounterRunId: run.id,
                payload: { round: run.round, encounterName: run.encounterName },
                visibility: session.visibility,
              });
              return true;
            });

      /**
       * The summary's three columns, written together so they cannot disagree
       * (`0070_session_entry.ts` refuses it if they do). Cleared, all three go.
       * Kept from Hob's draft, the turn is on it. Written by the DM, a night
       * with no summary gets an `authored` one, and an edit keeps whichever
       * origin the summary had, as an edited note keeps its own.
       */
      const summarySet = (
        summary: string | null | undefined,
        from: AssistantOrigin | undefined,
      ): Statement.Fragment =>
        summary === undefined
          ? sql``
          : summary === null
            ? sql`, summary = null, summary_origin = null, summary_assistant_turn_id = null`
            : from !== undefined
              ? sql`, summary = ${summary}, summary_origin = 'assistant',
                    summary_assistant_turn_id = ${from.assistantTurnId}`
              : sql`, summary = ${summary},
                    summary_origin = coalesce(session.summary_origin, 'authored')`;

      /**
       * A spotlight names a live seat of this campaign that the creator reads,
       * as a note's seat link does (`links.ensureLinkTarget`). The night is
       * asked about first, so somebody who may not write it is told the
       * session is not there, never anything about a seat; the composite key
       * refuses another campaign's seat anyway, and this turns that into a
       * `NotFound` rather than a failed statement.
       */
      const writableNight = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ id: SessionId, campaignId: CampaignId, actor: Actor }),
        ),
        Result: fromColumns(Schema.Struct({ id: SessionId })),
        execute: ({ id, campaignId, actor }) => sql`
          select session.id from session
          where session.id = ${id} and ${rowWritable(sql, "session", campaignId, actor)}
        `,
      });
      const liveSeat = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ seat: CampaignCharacterId, campaignId: CampaignId, actor: Actor }),
        ),
        Result: fromColumns(Schema.Struct({ id: CampaignCharacterId })),
        execute: ({ seat, campaignId, actor }) => sql`
          select campaign_character.id from campaign_character
          where campaign_character.id = ${seat}
            and campaign_character.campaign_id = ${campaignId}
            and campaign_character.left_at is null
            and ${ownedRowReadable(sql, "campaign_character", campaignId, actor)}
        `,
      });
      const ensureSpotlightSeat = (
        id: SessionId,
        campaignId: CampaignId,
        actor: Actor,
        seat: CampaignCharacterId,
      ) =>
        Effect.gen(function* () {
          yield* writableNight({ id, campaignId, actor }).pipe(orNotFound("session", id));
          yield* liveSeat({ seat, campaignId, actor }).pipe(orNotFound("seat", seat));
        });

      const readable = SqlSchema.findAll({
        Request: Schema.toType(CampaignId),
        Result: SessionRow,
        execute: (campaignId) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${sessionColumns(sql, campaignId, actor)} from session
              where ${rowReadable(sql, "session", campaignId, actor)}
              order by session.number desc
            `,
          ),
      });
      const readableById = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, id: SessionId })),
        Result: SessionRow,
        execute: ({ campaignId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${sessionColumns(sql, campaignId, actor)} from session
              where session.id = ${id} and ${rowReadable(sql, "session", campaignId, actor)}
            `,
          ),
      });
      /** A new night. What reaches its campaign was checked by the method that built the columns. */
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: SessionRow,
        execute: (columns) => sql`insert into session ${sql.insert(columns)} returning *`,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            campaignId: CampaignId,
            id: SessionId,
            columns: Columns,
            summary: Schema.NullOr(Schema.String).pipe(Schema.optionalKey),
            from: Schema.Struct({ assistantTurnId: AssistantTurnId }).pipe(Schema.optionalKey),
          }),
        ),
        Result: SessionRow,
        execute: ({ campaignId, id, columns, summary, from }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update session set ${setClause(sql, columns)}${summarySet(summary, from)}
              where session.id = ${id} and ${rowWritable(sql, "session", campaignId, actor)}
              returning *
            `,
          ),
      });
      /** The night as it stands, re-read after a carried fight moved its pointer. */
      const settled = SqlSchema.findOne({
        Request: Schema.toType(SessionId),
        Result: SessionRow,
        execute: (id) => sql`select * from session where session.id = ${id}`,
      });
      const erase = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, id: SessionId })),
        Result: fromColumns(Schema.Struct({ id: SessionId })),
        execute: ({ campaignId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              delete from session
              where session.id = ${id} and ${rowWritable(sql, "session", campaignId, actor)}
              returning session.id
            `,
          ),
      });

      return {
        list: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              return yield* readable(campaignId);
            }),
          ),

        findById: (campaignId, id) =>
          dieOnSqlError(readableById({ campaignId, id }).pipe(orNotFound("session", id))),

        create: (campaignId, payload, from) =>
          dieOnSqlError(
            asConflict(
              sql.withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureCampaignWritable(sql, campaignId, actor);
                  // An insert answers with its row; not getting one is a defect.
                  return yield* insert(
                    defined({
                      campaign_id: campaignId,
                      number: payload.number,
                      title: payload.title,
                      visibility: payload.visibility,
                      ...assistantColumns(from),
                    }),
                  ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                }),
              ),
            ),
          ),

        update: (campaignId, id, patch, from) =>
          dieOnSqlError(
            asConflict(
              sql
                .withTransaction(
                  Effect.gen(function* () {
                    const actor = yield* CurrentActor;
                    const spotlight = patch.spotlightSeatId;
                    if (spotlight !== undefined && spotlight !== null) {
                      yield* ensureSpotlightSeat(id, campaignId, actor, spotlight);
                    }
                    const columns = defined({
                      number: patch.number,
                      title: patch.title,
                      started_at: patch.startedAt && DateTime.toDateUtc(patch.startedAt),
                      ended_at: patch.endedAt && DateTime.toDateUtc(patch.endedAt),
                      visibility: patch.visibility,
                      spotlight_seat_id: spotlight,
                    });
                    const summary = proseColumn(patch.summary);
                    const written = yield* change({
                      campaignId,
                      id,
                      columns,
                      ...(summary === undefined ? {} : { summary }),
                      ...(from === undefined ? {} : { from }),
                    }).pipe(orNotFound("session", id));
                    yield* releaseIfFinished(written);
                    const carried = yield* carryLiveRun(written);
                    // Re-read rather than returning the row from above:
                    // `carryLiveRun` clears `active_encounter_run_id`, and
                    // handing back a session that still names a fight which is
                    // now off the table would be a lie one round trip long.
                    const session = carried
                      ? yield* settled(id).pipe(Effect.catchTag("NoSuchElementError", Effect.die))
                      : written;
                    return { session, carried };
                  }),
                )
                .pipe(
                  // The doorbell, after the commit. A carried fight still has
                  // a log row, but a visibility/title change may not; the
                  // player table stream is contentless, so the tick simply
                  // tells the browser to re-read the narrow table.
                  Effect.tap(() => live.touched(id)),
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
                yield* erase({ campaignId, id }).pipe(orNotFound("session", id));
              }),
            ),
          ),
      };
    }),
  );
}
