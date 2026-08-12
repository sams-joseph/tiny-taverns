import {
  type Actor,
  type CampaignId,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  type PlayerCombatant,
  PlayerSessionRecap,
  RecapFight,
  RecapRunLink,
  type Session,
  SessionRecap,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { BEATS, type BeatRow, toBeat } from "./Beats.js";
import { type CombatantRow, toCombatant } from "./Combatants.js";
import type { DmActor } from "./DmActor.js";
import { type EncounterRunRow, toEncounterRun } from "./EncounterRuns.js";
import { COMBATANT, initiativeOrder, RUN, RUNS } from "./liveTables.js";
import { type NoteRow, toNote } from "./Notes.js";
import {
  playerCombatantColumns,
  type PlayerCombatantRow,
  toPlayerCombatant,
} from "./playerCombatant.js";
import { PREP, type PrepItemRow, toPrepItem } from "./PrepItems.js";
import { dieOnSqlError } from "./rows.js";
import { type SessionRow, toSession } from "./Sessions.js";
import { containedRowReadable, nestedRowReadable, rowReadable } from "./visibility.js";

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
interface LinkRow {
  readonly id: EncounterRunId;
  readonly session_id: SessionId;
  readonly session_number: number;
  readonly round: number;
  readonly continued_from: EncounterRunId | null;
}

const toLink = (row: LinkRow): RecapRunLink =>
  new RecapRunLink({
    runId: row.id,
    sessionId: row.session_id,
    sessionNumber: row.session_number,
    round: row.round,
  });

/**
 * Everything a recap is made of **except the initiative lists** — which is
 * exactly the part the two projections disagree about.
 *
 * The four other sources are already narrowed row by row by
 * `repo/visibility.ts`, so a player's beats, notes and ticked prep are the
 * `shared` ones and nothing else, and that has been true since `0001`. Reading
 * them once and handing them to both projections is what stops the DM's recap
 * and the player's from coming to disagree about what a night contains — the
 * same argument that made this a server-side repository in the first place,
 * applied inside the file.
 */
interface Night {
  readonly session: Session;
  readonly runRows: ReadonlyArray<EncounterRunRow>;
  readonly runIds: ReadonlyArray<EncounterRunId>;
  readonly predecessorById: ReadonlyMap<EncounterRunId, LinkRow>;
  readonly successorByPredecessor: ReadonlyMap<EncounterRunId, LinkRow>;
  readonly beats: ReadonlyArray<BeatRow>;
  readonly prepDone: ReadonlyArray<PrepItemRow>;
  readonly notes: ReadonlyArray<NoteRow>;
}

/**
 * What happened on the night of session N.
 *
 * **A view, assembled per read. Nothing here is stored and nothing is
 * summarised.** The recap is five reads over retained detail — see
 * `SessionRecap` for which five and why those — and the constraint that keeps
 * it useful is the captain's standing one: the moment a stored one-line summary
 * exists, it is the only thing anyone reads, and the detail underneath it stops
 * being the campaign's memory. There is deliberately no write path in this
 * file and no model call anywhere near it.
 *
 * ### Two projections, two methods, two schemas
 *
 * `read` is the DM's and takes a `DmActor`; `readAsPlayer` is everybody else's
 * and answers `PlayerSessionRecap`, in which a monster carries a band and no
 * armour class. That split is the captain's decision of 2026-08-12 and it is
 * enforced by the *shape* rather than by a check: there is no field on a
 * `PlayerMonsterCombatant` for an exact hit-point total, `repo/playerCombatant.ts`
 * never selects one, and `read` cannot be called at all without a proof that
 * `repo/DmActor.ts` mints from one membership read.
 *
 * Before that split this file was the last live-surface read outside the gate,
 * and it handed a player of a `shared` campaign a monster's exact `hpCurrent`,
 * `hpMax` and `ac` — measured, in shipped code. `repo/DmActor.ts` predicted it
 * would be the next candidate and left it alone; this is that change.
 *
 * **What is deliberately not narrowed**: `run`, and the four non-combat
 * sources. A run's name, round and ending are things a player who was there
 * lived through, and no decision governs narrowing them — inventing one here
 * would settle the player fight view's shape by accident, which is the trap the
 * gate was left open for in the first place.
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
    readonly read: (dm: DmActor, sessionId: SessionId) => Effect.Effect<SessionRecap, NotFound>;
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
  }
>()("Recap") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

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
      const links = (
        campaignId: CampaignId,
        actor: Actor,
        column: string,
        values: ReadonlyArray<EncounterRunId>,
      ): Effect.Effect<ReadonlyArray<LinkRow>, never, never> =>
        values.length === 0
          ? Effect.succeed([])
          : sql<LinkRow>`
              select encounter_run.id, encounter_run.session_id, encounter_run.round,
                     encounter_run.continued_from,
                     (select session.number from session
                       where session.id = encounter_run.session_id) as session_number
              from encounter_run
              where ${sql.in(column, values)}
                and ${containedRowReadable(sql, RUN, campaignId, actor)}
            `.pipe(Effect.orDie);

      /** The night, minus the initiative lists. Shared by both projections. */
      const night = (
        campaignId: CampaignId,
        actor: Actor,
        sessionId: SessionId,
      ): Effect.Effect<Night, NotFound | SqlError.SqlError> =>
        Effect.gen(function* () {
          // The night itself, and the gate for everything below it. An
          // unreachable session is a 404 naming the session rather than an
          // empty recap, which would read as "nothing happened".
          const sessions = yield* sql<SessionRow>`
            select session.* from session
            where session.id = ${sessionId}
              and ${rowReadable(sql, "session", campaignId, actor)}
          `;
          if (sessions.length === 0) {
            return yield* new NotFound({ resource: "session", id: sessionId });
          }

          // Oldest first: a recap is read forwards through the evening.
          const runRows = yield* sql<EncounterRunRow>`
            select encounter_run.* from encounter_run
            where ${nestedRowReadable(sql, RUNS, sessionId, campaignId, actor)}
            order by encounter_run.started_at asc, encounter_run.id asc
          `;
          const runIds = runRows.map((row) => row.id);

          const predecessors = yield* links(
            campaignId,
            actor,
            "encounter_run.id",
            runRows.flatMap((row) => (row.continued_from === null ? [] : [row.continued_from])),
          );
          const successors = yield* links(
            campaignId,
            actor,
            "encounter_run.continued_from",
            runIds,
          );

          // Verbatim, and in the order the night happened in — the same
          // order `Beats.list` returns them in, because it is the same
          // question.
          const beats = yield* sql<BeatRow>`
            select beat.* from beat
            where ${nestedRowReadable(sql, BEATS, sessionId, campaignId, actor)}
            order by beat.created_at asc, beat.id asc
          `;

          // Only the ticked ones. An unticked line is what the next night
          // inherits, not a fact about this one.
          const prepDone = yield* sql<PrepItemRow>`
            select prep_item.* from prep_item
            where prep_item.done
              and ${nestedRowReadable(sql, PREP, sessionId, campaignId, actor)}
            order by prep_item.created_at asc, prep_item.id asc
          `;

          // The prose that was actually read out: a note attached to an
          // encounter one of tonight's fights was started from. Structural
          // rather than a timestamp heuristic — see `SessionRecap.notes`.
          // The `exists` re-applies the run predicate rather than trusting
          // the ids above, so this query is safe read on its own terms.
          const notes = yield* sql<NoteRow>`
            select note.* from note
            where note.encounter_id is not null
              and exists (
                select 1 from encounter_run
                where encounter_run.session_id = ${sessionId}
                  and encounter_run.encounter_id = note.encounter_id
                  and ${containedRowReadable(sql, RUN, campaignId, actor)}
              )
              and ${rowReadable(sql, "note", campaignId, actor)}
            order by note.created_at asc, note.id asc
          `;

          return {
            session: toSession(sessions[0]!),
            runRows,
            runIds,
            predecessorById: new Map(predecessors.map((row) => [row.id, row])),
            successorByPredecessor: new Map(
              successors.flatMap((row) =>
                row.continued_from === null ? [] : [[row.continued_from, row] as const],
              ),
            ),
            beats,
            prepDone,
            notes,
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
        state.runRows.map((row) => {
          const previous =
            row.continued_from === null ? undefined : state.predecessorById.get(row.continued_from);
          const next = state.successorByPredecessor.get(row.id);
          return {
            run: toEncounterRun(row),
            combatants: combatantsOf(row.id),
            continuedFrom: previous === undefined ? null : toLink(previous),
            continuedInto: next === undefined ? null : toLink(next),
          };
        });

      return {
        read: ({ actor, campaign: campaignId }, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const state = yield* night(campaignId, actor, sessionId);

              // One query for every fight's initiative list rather than one per
              // fight. The `in` narrows to runs this actor has already been
              // allowed; the containment predicate is what actually authorises,
              // and it walks combatant → run → session → campaign as it does
              // for the runner.
              const rows =
                state.runIds.length === 0
                  ? []
                  : yield* sql<CombatantRow>`
                      select combatant.* from combatant
                      where ${sql.in("combatant.encounter_run_id", state.runIds)}
                        and ${containedRowReadable(sql, COMBATANT, campaignId, actor)}
                      ${initiativeOrder(sql)}
                    `;

              return new SessionRecap({
                session: state.session,
                fights: fightsOf(state, (runId) =>
                  rows.filter((combatant) => combatant.encounter_run_id === runId).map(toCombatant),
                ).map((fight) => new RecapFight(fight)),
                beats: state.beats.map(toBeat),
                prepDone: state.prepDone.map(toPrepItem),
                notes: state.notes.map(toNote),
              });
            }),
          ),

        readAsPlayer: (campaignId, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const state = yield* night(campaignId, actor, sessionId);

              // The same predicate as above, and a different select list. The
              // narrowing is in the columns rather than in a mapper, so a
              // monster's exact hit points and its armour class are never read
              // out of Postgres at all — see `repo/playerCombatant.ts`.
              const rows =
                state.runIds.length === 0
                  ? []
                  : yield* sql<PlayerCombatantRow>`
                      select ${playerCombatantColumns(sql)} from combatant
                      where ${sql.in("combatant.encounter_run_id", state.runIds)}
                        and ${containedRowReadable(sql, COMBATANT, campaignId, actor)}
                      ${initiativeOrder(sql)}
                    `;

              return new PlayerSessionRecap({
                session: state.session,
                fights: fightsOf(state, (runId): ReadonlyArray<PlayerCombatant> =>
                  rows
                    .filter((combatant) => combatant.encounter_run_id === runId)
                    .map(toPlayerCombatant),
                ),
                beats: state.beats.map(toBeat),
                prepDone: state.prepDone.map(toPrepItem),
                notes: state.notes.map(toNote),
              });
            }),
          ),
      };
    }),
  );
}
