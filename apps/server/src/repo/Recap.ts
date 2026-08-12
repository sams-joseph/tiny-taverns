import {
  type Actor,
  type CampaignId,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  RecapFight,
  RecapRunLink,
  SessionRecap,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { BEATS, type BeatRow, toBeat } from "./Beats.js";
import { type CombatantRow, toCombatant } from "./Combatants.js";
import { type EncounterRunRow, toEncounterRun } from "./EncounterRuns.js";
import { COMBATANT, initiativeOrder, RUN, RUNS } from "./liveTables.js";
import { type NoteRow, toNote } from "./Notes.js";
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
 * That is also why `CurrentActor` is a type-level requirement on `read`, as it
 * is on every other repository method: the assistant reaches this through the
 * same actor-scoped seam a browser does, so there is no second path to audit
 * when it ships.
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
 * and an unreachable session is a `NotFound` before any of the rest runs.
 *
 * The only selections done in TypeScript are the ones that are not about
 * visibility at all: grouping combatants under the run they were in, and
 * matching each fight to the link rows the database already returned. Both are
 * over rows the predicates already allowed.
 */
export class Recap extends Context.Service<
  Recap,
  {
    readonly read: (
      campaignId: CampaignId,
      sessionId: SessionId,
    ) => Effect.Effect<SessionRecap, NotFound, CurrentActor>;
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

      return {
        read: (campaignId, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;

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
              const session = toSession(sessions[0]!);

              // Oldest first: a recap is read forwards through the evening.
              const runRows = yield* sql<EncounterRunRow>`
                select encounter_run.* from encounter_run
                where ${nestedRowReadable(sql, RUNS, sessionId, campaignId, actor)}
                order by encounter_run.started_at asc, encounter_run.id asc
              `;
              const runIds = runRows.map((row) => row.id);

              // One query for every fight's initiative list rather than one per
              // fight. The `in` narrows to runs this actor has already been
              // allowed; the containment predicate is what actually authorises,
              // and it walks combatant → run → session → campaign as it does
              // for the runner.
              const combatantRows =
                runIds.length === 0
                  ? []
                  : yield* sql<CombatantRow>`
                      select combatant.* from combatant
                      where ${sql.in("combatant.encounter_run_id", runIds)}
                        and ${containedRowReadable(sql, COMBATANT, campaignId, actor)}
                      ${initiativeOrder(sql)}
                    `;

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
              const predecessorById = new Map(predecessors.map((row) => [row.id, row]));
              const successorByPredecessor = new Map(
                successors.flatMap((row) =>
                  row.continued_from === null ? [] : [[row.continued_from, row] as const],
                ),
              );

              const fights = runRows.map((row) => {
                const previous =
                  row.continued_from === null ? undefined : predecessorById.get(row.continued_from);
                const next = successorByPredecessor.get(row.id);
                return new RecapFight({
                  run: toEncounterRun(row),
                  combatants: combatantRows
                    .filter((combatant) => combatant.encounter_run_id === row.id)
                    .map(toCombatant),
                  continuedFrom: previous === undefined ? null : toLink(previous),
                  continuedInto: next === undefined ? null : toLink(next),
                });
              });

              // Verbatim, and in the order the night happened in — the same
              // order `Beats.list` returns them in, because it is the same
              // question.
              const beatRows = yield* sql<BeatRow>`
                select beat.* from beat
                where ${nestedRowReadable(sql, BEATS, sessionId, campaignId, actor)}
                order by beat.created_at asc, beat.id asc
              `;

              // Only the ticked ones. An unticked line is what the next night
              // inherits, not a fact about this one.
              const prepRows = yield* sql<PrepItemRow>`
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
              const noteRows = yield* sql<NoteRow>`
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

              return new SessionRecap({
                session,
                fights,
                beats: beatRows.map(toBeat),
                prepDone: prepRows.map(toPrepItem),
                notes: noteRows.map(toNote),
              });
            }),
          ),
      };
    }),
  );
}
