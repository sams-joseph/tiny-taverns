import {
  Actor,
  type Beat,
  CampaignId,
  ChronicleNight,
  CurrentActor,
  type EncounterRun,
  EncounterRunId,
  NotFound,
  PlayerChronicleNight,
  type PlayerCombatant,
  PlayerSessionRecap,
  type PrepItem,
  RecapFight,
  RecapRunLink,
  RecapScene,
  type Session,
  SessionRecap,
  SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlError, SqlSchema } from "effect/sql";
import { BEATS, BeatRow } from "./Beats.js";
import { portraitSigner } from "./Characters.js";
import { combatantColumns, combatantRow } from "./Combatants.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { EncounterRunRow, runColumns } from "./EncounterRuns.js";
import { CheckRow, SceneRow } from "./RunScenes.js";
import { COMBATANT, initiativeOrder, RUN, RUNS } from "./liveTables.js";
import { noteColumns, NoteRow, playerNoteColumns, PlayerNoteRow } from "./Notes.js";
import { playerCombatantColumns, PlayerCombatantRow } from "./playerCombatant.js";
import { PREP, PrepItemRow } from "./PrepItems.js";
import { dieOnSqlError, fromColumns } from "./rows.js";
import { SessionRow, sessionColumns } from "./Sessions.js";
import {
  containedRowReadable,
  ensureCampaignReadable,
  nestedRowReadable,
  nestedRowsReadable,
  rowReadable,
} from "./visibility.js";

/**
 * A run at the other end of a `continued_from` pointer, plus the number of the
 * night it belongs to.
 *
 * `session_number` comes from a correlated subquery rather than a join because
 * the predicates below are written against the *unaliased* `encounter_run`
 * table — `containedRowReadable` emits `encounter_run.session_id`, not
 * `alias.session_id` — so a self-join would need aliases the predicates cannot
 * see. The subquery's own `from session` is a separate scope from the one
 * inside the predicate, and both resolve to the row they mean.
 */
const LinkRow = fromColumns(
  Schema.Struct({ ...RecapRunLink.fields, continuedFrom: Schema.NullOr(EncounterRunId) }),
  { runId: "id" },
);
type LinkRow = typeof LinkRow.Type;

const linkOf = ({ continuedFrom: _, ...link }: LinkRow): RecapRunLink =>
  new RecapRunLink(link, { disableChecks: true });

/** Rows filed under the night they belong to, each night's in the order read. */
const groupBySession = <Row>(
  rows: ReadonlyArray<Row>,
  sessionOf: (row: Row) => SessionId,
): ReadonlyMap<SessionId, ReadonlyArray<Row>> => {
  const bySession = new Map<SessionId, Array<Row>>();
  for (const row of rows) {
    const filed = bySession.get(sessionOf(row));
    if (filed === undefined) bySession.set(sessionOf(row), [row]);
    else filed.push(row);
  }
  return bySession;
};

/** Who is reading, and the campaign they read it in: what every read here is asked with. */
const readerFields = { campaignId: CampaignId, actor: Actor } as const;

/** What a read of some nights' runs is asked with: the reader, and the runs it was allowed. */
const RunsRequest = Schema.toType(
  Schema.Struct({ ...readerFields, runIds: Schema.Array(EncounterRunId) }),
);

/**
 * A night as every read of the record starts from: the session, its runs and
 * its beats. The Chronicle is a list of these; a recap is one of them and
 * more (`Night`). Read by `nights` in the layer, whichever of the two asked.
 */
interface NightRows {
  readonly session: Session;
  /** Oldest first, through `runColumns`. */
  readonly runs: ReadonlyArray<EncounterRun>;
  /** Oldest first. */
  readonly beats: ReadonlyArray<Beat>;
}

/**
 * Everything a recap is made of **except the initiative lists and the notes**
 * — which are exactly the parts the two projections disagree about. The notes
 * are picked by one `where` (`readOut` in the layer), so both projections read
 * the same rows.
 *
 * The other sources are already narrowed row by row by `repo/visibility.ts`,
 * so a player's beats and ticked prep are the `shared` ones and nothing else,
 * and that has been true since `0001`. Reading them once and handing them to
 * both projections is what stops the DM's recap and the player's from coming
 * to disagree about what a night contains — the same argument that made this
 * a server-side repository in the first place, applied inside the file.
 */
interface Night extends NightRows {
  readonly runIds: ReadonlyArray<EncounterRunId>;
  readonly predecessorById: ReadonlyMap<EncounterRunId, LinkRow>;
  readonly successorByPredecessor: ReadonlyMap<EncounterRunId, LinkRow>;
  readonly prepDone: ReadonlyArray<PrepItem>;
}

/**
 * What happened on the night of session N.
 *
 * **A view, assembled per read. Nothing here is stored and nothing is
 * summarised.** The recap is five reads over retained detail — see
 * `SessionRecap` for which five and why those — and the constraint that keeps
 * it useful is the captain's standing one: a summary that replaces the detail
 * becomes the only thing anyone reads, and the detail stops being the
 * campaign's memory. The DM's own summary of the night rides on the session
 * row (`Session.summary`), above this detail rather than instead of it. There
 * is deliberately no write path in this file and no model call anywhere near
 * it.
 *
 * ### Two projections, two methods, two schemas
 *
 * `read` is the DM's and takes a `CampaignCreatorActor`; `readAsPlayer` is everybody else's
 * and answers `PlayerSessionRecap`, in which a monster carries a band and no
 * armour class. That split is the captain's decision of 2026-08-12 and it is
 * enforced by the *shape* rather than by a check: there is no field on a
 * `PlayerMonsterCombatant` for an exact hit-point total, `repo/playerCombatant.ts`
 * never selects one, and `read` cannot be called at all without a proof that
 * `repo/CampaignCreatorActor.ts` mints from one membership read.
 *
 * Before that split this file was the last live-surface read outside the gate,
 * and it handed a player of a `shared` campaign a monster's exact `hpCurrent`,
 * `hpMax` and `ac` — measured, in shipped code. `repo/CampaignCreatorActor.ts` predicted it
 * would be the next candidate and left it alone; this is that change.
 *
 * **A run is narrowed in one place only: which encounter it was.** Its round
 * and ending are things a player who was there lived through. Its encounter's
 * id and name are not — they are the encounter's, and a player who may not read
 * the encounter (Shared and Ready) is told the kind of scene instead, "A fight"
 * or "A conversation" (`runColumns`, the captain's decisions of 2026-09-25).
 * A scene that is not a fight carries no combatants to a player, as it showed
 * them no order at the table. The beats and the prep are not narrowed past
 * their rows; a note is told as `PlayerNote`, as on the player's Overview, so
 * the creator's links and provenance stay the creator's.
 *
 * ### The whole record, through the same function
 *
 * `chronicle` and `chronicleAsPlayer` answer every night at once — its runs
 * and its beats, the part of a recap a list of nights draws — so the
 * Chronicle can open them all without one recap read per card. They are not
 * a second account of a night: `nights` in the layer reads the session, the
 * runs and the beats for both a recap and the list, and a recap is that one
 * night plus what only it reads. The same two audiences, gated the same way.
 *
 * ### Why it is a repository and not a client composition
 *
 * `AGENTS.md` says "one `Effect` per screen, not one hook per endpoint", and
 * the campaign view follows it. This departs, for one sufficient reason: **the
 * recap has two consumers.** The Chronicle screen is one; the assistant's
 * `sessionRecap` tool is the other, and it runs here. Composed in the client,
 * the assistant would re-implement it, and the two would answer "what happened
 * last session" differently — the exact failure the `log`/`events` pair was
 * shaped to avoid.
 *
 * ### Every read goes through `repo/visibility.ts`, and none of it is filtered
 * ### afterwards
 *
 * Five queries, five existing predicates, no new one. That matters more here
 * than anywhere else in the product: a recap is the one read whose *shape* is
 * "load a night and assemble it", which is precisely the shape that tempts
 * someone to fetch the rows and sort them out in TypeScript. Post-filtering is
 * the leak pattern — the DM-only text is already in memory and one forgotten
 * `.filter` ships it — so the rows a player may not have never leave Postgres,
 * and an unreachable session is a `NotFound` before any of the rest runs. The
 * player projection obeys the same rule one level down: the columns it may not
 * have are not selected, rather than selected and dropped.
 *
 * The only selections done in TypeScript are the ones that are not about
 * visibility at all: grouping combatants under the run they were in, and
 * matching each fight to the link rows the database already returned. Both are
 * over rows the predicates already allowed.
 */
export class Recap extends Context.Service<
  Recap,
  {
    /**
     * The DM's recap — whole `Combatant` values, exact numbers, everything.
     *
     * Gated, so it is the proof and not the path that decides who has it.
     */
    readonly read: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
    ) => Effect.Effect<SessionRecap, NotFound>;
    /**
     * The same night, told to somebody who played in it.
     *
     * Ordinary `CurrentActor`, because every row it returns is one the shipped
     * predicates already allow — the narrowing here is of *fields*, and it is
     * carried by `PlayerSessionRecap` rather than by anything this method does.
     * A DM may read it too, which is how "what will my players see" is one
     * request rather than a second implementation.
     */
    readonly readAsPlayer: (
      campaignId: CampaignId,
      sessionId: SessionId,
    ) => Effect.Effect<PlayerSessionRecap, NotFound, CurrentActor>;
    /**
     * Every night of the campaign, newest first, each with its runs and its
     * beats — the Chronicle's list, in one read rather than a recap per card.
     *
     * The same rows `read` starts from, through the same function, so a night
     * here is the night its recap describes. Gated like `read`: it is the
     * creator's record, and `ChronicleNight` is where a field only the DM may
     * read would go.
     */
    readonly chronicle: (
      dm: CampaignCreatorActor,
    ) => Effect.Effect<ReadonlyArray<ChronicleNight>, never>;
    /**
     * The nights this member may read, told as `PlayerChronicleNight`.
     *
     * An unreadable campaign is `NotFound`, never an empty record: "nothing
     * happened" and "not yours" must not look alike to somebody outside it.
     */
    readonly chronicleAsPlayer: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<PlayerChronicleNight>, NotFound, CurrentActor>;
  }
>()("Recap") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const CombatantRow = combatantRow(yield* portraitSigner);

      /** The runs of these nights this actor may read, oldest first, through `runColumns`. */
      const runsOf = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({
            campaignId: CampaignId,
            actor: Actor,
            sessionIds: Schema.Array(SessionId),
          }),
        ),
        Result: EncounterRunRow,
        execute: ({ campaignId, actor, sessionIds }) => sql`
          select ${runColumns(sql, campaignId, actor)} from encounter_run
          where ${nestedRowsReadable(sql, RUNS, sessionIds, campaignId, actor)}
          order by encounter_run.started_at asc, encounter_run.id asc
        `,
      });
      /**
       * Every fight's initiative list in one query rather than one per fight.
       * The `in` narrows to runs this actor has already been allowed; the
       * containment predicate is what actually authorises, and it walks
       * combatant → run → session → campaign as it does for the runner.
       */
      const combatantsOf = SqlSchema.findAll({
        Request: RunsRequest,
        Result: CombatantRow,
        execute: ({ campaignId, actor, runIds }) => sql`
          select ${combatantColumns(sql, campaignId, actor)} from combatant
          where ${sql.in("combatant.encounter_run_id", runIds)}
            and ${containedRowReadable(sql, COMBATANT, campaignId, actor)}
          ${initiativeOrder(sql)}
        `,
      });
      /**
       * The checks and saves logged in these scenes. The run is joined back
       * through the containment predicate rather than trusting the ids, as the
       * combatants' query does.
       */
      const checksOf = SqlSchema.findAll({
        Request: RunsRequest,
        Result: CheckRow,
        execute: ({ campaignId, actor, runIds }) => sql`
          select encounter_run_check.* from encounter_run_check
          join encounter_run on encounter_run.id = encounter_run_check.encounter_run_id
          where ${sql.in("encounter_run_check.encounter_run_id", runIds)}
            and ${containedRowReadable(sql, RUN, campaignId, actor)}
          order by encounter_run_check.created_at asc, encounter_run_check.id asc
        `,
      });
      /** Where each scene that is not a fight stood. */
      const scenesOf = SqlSchema.findAll({
        Request: RunsRequest,
        Result: SceneRow,
        execute: ({ campaignId, actor, runIds }) => sql`
          select encounter_run_scene.* from encounter_run_scene
          join encounter_run on encounter_run.id = encounter_run_scene.run_id
          where ${sql.in("encounter_run_scene.run_id", runIds)}
            and encounter_run.mode <> 'combat'
            and ${containedRowReadable(sql, RUN, campaignId, actor)}
        `,
      });
      /**
       * The player projection of the fights' rows: the same predicate, a
       * different select list, and only a fight's — a conversation, a skill
       * challenge or a hazard had no initiative order at the table.
       */
      const playerCombatantsOf = SqlSchema.findAll({
        Request: RunsRequest,
        Result: PlayerCombatantRow,
        execute: ({ campaignId, actor, runIds }) => sql`
          select ${playerCombatantColumns(sql)} from combatant
          where ${sql.in("combatant.encounter_run_id", runIds)}
            and ${containedRowReadable(sql, COMBATANT, campaignId, actor)}
            and exists (
              select 1 from encounter_run
              where encounter_run.id = combatant.encounter_run_id
                and encounter_run.mode = 'combat'
            )
          ${initiativeOrder(sql)}
        `,
      });

      /**
       * The runs on the far end of a carry-over, in whichever direction.
       *
       * `continued_from` is **provenance, not an access path** — the same
       * status as `creature.derived_from` — so following it does not grant
       * reach. The predicate is applied to the run at the far end exactly as it
       * would be to any other run, which means a link into something this actor
       * cannot see comes back as no row and the recap says nothing rather than
       * leaking that there is something to say. Fail closed, by composition.
       *
       * `where` is handed in because the two directions differ only in it:
       * looking back matches the predecessor by id, looking forward matches
       * successors by their pointer.
       */
      const linked = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({
            ...readerFields,
            column: Schema.Literals(["encounter_run.id", "encounter_run.continued_from"]),
            values: Schema.Array(EncounterRunId),
          }),
        ),
        Result: LinkRow,
        execute: ({ campaignId, actor, column, values }) => sql`
          select encounter_run.id, encounter_run.session_id, encounter_run.round,
                 encounter_run.continued_from,
                 (select session.number from session
                   where session.id = encounter_run.session_id) as session_number
          from encounter_run
          where ${sql.in(column, values)}
            and ${containedRowReadable(sql, RUN, campaignId, actor)}
        `,
      });
      const links = (
        campaignId: CampaignId,
        actor: Actor,
        column: "encounter_run.id" | "encounter_run.continued_from",
        values: ReadonlyArray<EncounterRunId>,
      ): Effect.Effect<ReadonlyArray<LinkRow>, never, never> =>
        values.length === 0
          ? Effect.succeed([])
          : linked({ campaignId, actor, column, values }).pipe(Effect.orDie);

      const readableNights = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({
            ...readerFields,
            which: Schema.Union([SessionId, Schema.Literal("every")]),
          }),
        ),
        Result: SessionRow,
        execute: ({ campaignId, actor, which }) => sql`
          select ${sessionColumns(sql, campaignId, actor)} from session
          where ${sql.and([
            ...(which === "every" ? [] : [sql`session.id = ${which}`]),
            rowReadable(sql, "session", campaignId, actor),
          ])}
          order by session.number desc
        `,
      });
      // Verbatim, and in the order the night happened in — the same order
      // `Beats.list` returns them in, because it is the same question.
      const nightsBeats = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({ ...readerFields, sessionIds: Schema.Array(SessionId) }),
        ),
        Result: BeatRow,
        execute: ({ campaignId, actor, sessionIds }) => sql`
          select beat.* from beat
          where ${nestedRowsReadable(sql, BEATS, sessionIds, campaignId, actor)}
          order by beat.created_at asc, beat.id asc
        `,
      });
      const NightRequest = Schema.toType(Schema.Struct({ ...readerFields, sessionId: SessionId }));
      // Only the ticked ones. An unticked line is what the next night
      // inherits, not a fact about this one.
      const ticked = SqlSchema.findAll({
        Request: NightRequest,
        Result: PrepItemRow,
        execute: ({ campaignId, actor, sessionId }) => sql`
          select prep_item.* from prep_item
          where prep_item.done
            and ${nestedRowReadable(sql, PREP, sessionId, campaignId, actor)}
          order by prep_item.created_at asc, prep_item.id asc
        `,
      });

      /**
       * The prose that was actually read out: a note attached to an encounter
       * one of tonight's fights was started from. Structural rather than a
       * timestamp heuristic — see `SessionRecap.notes`. The `exists`
       * re-applies the run predicate rather than trusting the run ids, so this
       * clause is safe read on its own terms. The two projections select
       * different columns from the same rows — a player's are `PlayerNote`'s,
       * with no visibility, provenance, pin or links.
       */
      const readOut = (campaignId: CampaignId, actor: Actor, sessionId: SessionId) =>
        sql.and([
          sql`note.encounter_id is not null`,
          sql`exists (
            select 1 from encounter_run
            where encounter_run.session_id = ${sessionId}
              and encounter_run.encounter_id = note.encounter_id
              and ${containedRowReadable(sql, RUN, campaignId, actor)}
          )`,
          rowReadable(sql, "note", campaignId, actor),
        ]);
      const notesReadOut = SqlSchema.findAll({
        Request: NightRequest,
        Result: NoteRow,
        execute: ({ campaignId, actor, sessionId }) => sql`
          select ${noteColumns(sql)} from note where ${readOut(campaignId, actor, sessionId)}
          order by note.created_at asc, note.id asc
        `,
      });
      const notesReadOutToPlayer = SqlSchema.findAll({
        Request: NightRequest,
        Result: PlayerNoteRow,
        execute: ({ campaignId, actor, sessionId }) => sql`
          select ${playerNoteColumns(sql, campaignId, actor)} from note
          where ${readOut(campaignId, actor, sessionId)}
          order by note.created_at asc, note.id asc
        `,
      });

      /**
       * The nights this actor may read — one by id for a recap, or every one
       * for the Chronicle — each with its runs and its beats, newest night
       * first. **The one implementation of what a night contains**: `night`
       * below is this for one id plus what only a recap reads.
       *
       * Three statements however many nights, each through its predicate;
       * the only thing done in TypeScript is filing the rows the predicates
       * allowed under the night they name.
       */
      const nights = (
        campaignId: CampaignId,
        actor: Actor,
        which: SessionId | "every",
      ): Effect.Effect<ReadonlyArray<NightRows>, SqlError.SqlError | Schema.SchemaError> =>
        Effect.gen(function* () {
          // The nights themselves, and the gate for everything below them.
          const sessions = yield* readableNights({ campaignId, actor, which });
          if (sessions.length === 0) return [];
          const sessionIds = sessions.map((row) => row.id);

          // Oldest first: a night is read forwards through the evening. The
          // columns are `runColumns`, so a fight whose encounter this reader
          // may not read is not named after it.
          const runs = yield* runsOf({ campaignId, actor, sessionIds });

          const beats = yield* nightsBeats({ campaignId, actor, sessionIds });

          const runsByNight = groupBySession(runs, (run) => run.sessionId);
          const beatsOf = groupBySession(beats, (beat) => beat.sessionId);
          return sessions.map((session) => ({
            session,
            runs: runsByNight.get(session.id) ?? [],
            beats: beatsOf.get(session.id) ?? [],
          }));
        });

      /** The night, minus the initiative lists. Shared by both projections. */
      const night = (
        campaignId: CampaignId,
        actor: Actor,
        sessionId: SessionId,
      ): Effect.Effect<Night, NotFound | SqlError.SqlError | Schema.SchemaError> =>
        Effect.gen(function* () {
          // An unreachable session is a 404 naming the session rather than
          // an empty recap, which would read as "nothing happened".
          const [rows] = yield* nights(campaignId, actor, sessionId);
          if (rows === undefined) {
            return yield* new NotFound({ resource: "session", id: sessionId });
          }
          const { runs } = rows;
          const runIds = runs.map((run) => run.id);

          const predecessors = yield* links(
            campaignId,
            actor,
            "encounter_run.id",
            runs.flatMap((run) => (run.continuedFrom === null ? [] : [run.continuedFrom])),
          );
          const successors = yield* links(
            campaignId,
            actor,
            "encounter_run.continued_from",
            runIds,
          );

          const prepDone = yield* ticked({ campaignId, actor, sessionId });

          return {
            ...rows,
            runIds,
            predecessorById: new Map(predecessors.map((row) => [row.runId, row])),
            successorByPredecessor: new Map(
              successors.flatMap((row) =>
                row.continuedFrom === null ? [] : [[row.continuedFrom, row] as const],
              ),
            ),
            prepDone,
          };
        });

      /**
       * One fight per run, with whichever combatant projection the caller read.
       *
       * The two links are the same at both projections — a `RecapRunLink` is a
       * run id, a night and a round, and none of those is a number anybody is
       * keeping — so this is written once and the combatants are the parameter.
       */
      const fightsOf = <C>(
        state: Night,
        combatantsOf: (runId: EncounterRunId) => ReadonlyArray<C>,
      ) =>
        state.runs.map((run) => {
          const previous =
            run.continuedFrom === null ? undefined : state.predecessorById.get(run.continuedFrom);
          const next = state.successorByPredecessor.get(run.id);
          return {
            run,
            combatants: combatantsOf(run.id),
            continuedFrom: previous === undefined ? null : linkOf(previous),
            continuedInto: next === undefined ? null : linkOf(next),
          };
        });

      const sceneOf = (row: typeof SceneRow.Type | undefined): RecapScene | null =>
        row === undefined
          ? null
          : new RecapScene({
              challenge: row.challenge,
              attitude: row.attitude,
              stage: row.stage,
              stages: row.stages,
            });

      return {
        read: ({ actor, campaign: campaignId }, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const state = yield* night(campaignId, actor, sessionId);
              const asked = { campaignId, actor, runIds: state.runIds };

              const combatants = state.runIds.length === 0 ? [] : yield* combatantsOf(asked);

              // The checks and saves logged in tonight's scenes — the
              // creator's alone, so only this projection reads them.
              const checks = state.runIds.length === 0 ? [] : yield* checksOf(asked);

              // Where each scene stood — what "they made it" and "lasted two
              // stages" are counted from. The creator's, as the checks are.
              const scenes = state.runIds.length === 0 ? [] : yield* scenesOf(asked);

              const notes = yield* notesReadOut({ campaignId, actor, sessionId });

              return new SessionRecap({
                session: state.session,
                fights: fightsOf(state, (runId) =>
                  combatants.filter((combatant) => combatant.encounterRunId === runId),
                ).map(
                  (fight) =>
                    new RecapFight({
                      ...fight,
                      checks: checks.filter((check) => check.runId === fight.run.id),
                      scene: sceneOf(scenes.find((scene) => scene.runId === fight.run.id)),
                    }),
                ),
                beats: state.beats,
                prepDone: state.prepDone,
                notes,
              });
            }),
          ),

        readAsPlayer: (campaignId, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const state = yield* night(campaignId, actor, sessionId);

              // The same predicate as above, and a different select list. The
              // narrowing is in the columns rather than in a decode, so a
              // monster's exact hit points and its armour class are never read
              // out of Postgres at all — see `repo/playerCombatant.ts`.
              //
              // Only a fight's: a conversation, a skill challenge or a hazard
              // had no initiative order at the table (`PlayerTable`), so its
              // recap names nobody in it either — who the party met, or what
              // the hazard's roster held, stays the creator's.
              const combatants =
                state.runIds.length === 0
                  ? []
                  : yield* playerCombatantsOf({ campaignId, actor, runIds: state.runIds });

              const notes = yield* notesReadOutToPlayer({ campaignId, actor, sessionId });

              return new PlayerSessionRecap({
                session: state.session,
                fights: fightsOf(state, (runId): ReadonlyArray<PlayerCombatant> =>
                  combatants.filter((combatant) => combatant.encounterRunId === runId),
                ),
                beats: state.beats,
                prepDone: state.prepDone,
                notes,
              });
            }),
          ),

        chronicle: ({ actor, campaign: campaignId }) =>
          dieOnSqlError(
            Effect.map(nights(campaignId, actor, "every"), (all) =>
              all.map(
                (rows) =>
                  new ChronicleNight({
                    session: rows.session,
                    runs: rows.runs,
                    beats: rows.beats,
                  }),
              ),
            ),
          ),

        chronicleAsPlayer: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              // The same function the creator's list reads through, with a
              // player's actor: the predicates, not this method, decide which
              // nights, runs and beats come back.
              const all = yield* nights(campaignId, actor, "every");
              return all.map(
                (rows) =>
                  new PlayerChronicleNight({
                    session: rows.session,
                    runs: rows.runs,
                    beats: rows.beats,
                  }),
              );
            }),
          ),
      };
    }),
  );
}
