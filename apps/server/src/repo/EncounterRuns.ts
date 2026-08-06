import {
  type Actor,
  type CampaignId,
  type CharacterId,
  type CombatantId,
  Conflict,
  type CreatureId,
  CurrentActor,
  EncounterRun,
  type EncounterRunId,
  type EncounterRunStart,
  type EncounterRunUpdate,
  type EncounterId,
  type NextTurn,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { COMBATANT, initiativeOrder, ROSTER, RUN, RUNS } from "./liveTables.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import { appendEvent, requestAlreadyApplied } from "./SessionEvents.js";
import {
  containedChildWritable,
  corpusRowReadable,
  ensureNestedParentReadable,
  ensureNestedParentWritable,
  ensureNestedRowWritable,
  nestedRowReadable,
  nestedRowWritable,
  rowReadable,
} from "./visibility.js";

interface EncounterRunRow extends ProvenanceColumns {
  readonly id: EncounterRunId;
  readonly session_id: SessionId;
  readonly encounter_id: EncounterId | null;
  readonly encounter_name: string;
  readonly round: number;
  readonly active_combatant_id: CombatantId | null;
  readonly started_at: Date;
  readonly ended_at: Date | null;
}

const toEncounterRun = (row: EncounterRunRow): EncounterRun =>
  new EncounterRun({
    id: row.id,
    sessionId: row.session_id,
    encounterId: row.encounter_id,
    encounterName: row.encounter_name,
    round: row.round,
    activeCombatantId: row.active_combatant_id,
    startedAt: DateTime.fromDateUnsafe(row.started_at),
    endedAt: row.ended_at === null ? null : DateTime.fromDateUnsafe(row.ended_at),
    ...provenanceOf(row),
  });

/**
 * The partial unique index `encounter_run_one_live_per_session`, as the 409 it
 * means.
 *
 * Starting a second fight while one is on the table is refused rather than
 * silently switching, because the first one's initiative order is still on
 * screen and its hit points are still the truth about six creatures. The DM
 * ends the first fight, deliberately.
 */
const asConflict = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Conflict, R> =>
  Effect.catch(effect, (error): Effect.Effect<A, E | Conflict> =>
    SqlError.isSqlError(error) &&
    error.reason._tag === "UniqueViolation" &&
    error.reason.constraint.includes("one_live_per_session")
      ? Effect.fail(
          new Conflict({
            message: "this session already has an encounter on the table; end it first",
          }),
        )
      : Effect.fail(error),
  );

interface PartyRow {
  readonly id: CharacterId;
  readonly name: string;
  readonly player_name: string | null;
  readonly descriptor: string | null;
  readonly ac: number | null;
  readonly hp_max: number | null;
}

interface RosterRow {
  readonly count: number;
  readonly creature_id: CreatureId;
  readonly name: string;
  readonly size: string | null;
  readonly type: string;
  readonly ac: number;
  readonly hp: number;
}

/**
 * The NPC half of the fixtures' `sub` line: `"Small humanoid"` (`data.js:16`)
 * from `size: "Small"` and `type: "Humanoid"` (`data.js:36`).
 *
 * The type is lower-cased because the fixture's own two forms differ in exactly
 * that way — the bestiary row capitalises it as a column heading would, and the
 * initiative row reads it as prose. This is the only transformation between
 * them, and doing it once at seed time beats a display rule the client has to
 * remember.
 */
const npcSubtitle = (size: string | null, type: string): string =>
  size === null || size === "" ? type : `${size} ${type.toLowerCase()}`;

/**
 * The live session.
 *
 * Everything in here writes **straight through to Postgres, transactionally**.
 * There is no in-memory copy of a fight and no write-behind buffer, because
 * `EncounterRunner.jsx:164` makes the DM a promise — "initiative order and hit
 * points are saved to Session 12" — and the moment that promise matters most is
 * a crash mid-combat. §3.4 measured the cost of keeping it: a four-hour session
 * is order 10³ writes, which is a rounding error for Postgres. What actually
 * differs about the live surface is the *read* pattern, and that is the stream.
 */
export class EncounterRuns extends Context.Service<
  EncounterRuns,
  {
    readonly list: (
      campaignId: CampaignId,
      sessionId: SessionId,
    ) => Effect.Effect<ReadonlyArray<EncounterRun>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      sessionId: SessionId,
      id: EncounterRunId,
    ) => Effect.Effect<EncounterRun, NotFound, CurrentActor>;
    readonly start: (
      campaignId: CampaignId,
      sessionId: SessionId,
      payload: EncounterRunStart,
    ) => Effect.Effect<EncounterRun, NotFound | Conflict, CurrentActor>;
    readonly update: (
      campaignId: CampaignId,
      sessionId: SessionId,
      id: EncounterRunId,
      patch: EncounterRunUpdate,
    ) => Effect.Effect<EncounterRun, NotFound, CurrentActor>;
    readonly nextTurn: (
      campaignId: CampaignId,
      sessionId: SessionId,
      id: EncounterRunId,
      payload: NextTurn,
    ) => Effect.Effect<EncounterRun, NotFound, CurrentActor>;
    readonly end: (
      campaignId: CampaignId,
      sessionId: SessionId,
      id: EncounterRunId,
    ) => Effect.Effect<EncounterRun, NotFound, CurrentActor>;
  }
>()("EncounterRuns") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      /**
       * The run named by the path, for a writer.
       *
       * Takes the session as well as the run, and `nestedRowWritable` binds the
       * foreign key between them. Reading it by id alone would be satisfied by
       * a run in another session of the same campaign — each id checks out on
       * its own, and nothing in the pair says one contains the other.
       */
      const readRun = (
        campaignId: CampaignId,
        sessionId: SessionId,
        id: EncounterRunId,
        actor: Actor,
      ): Effect.Effect<EncounterRun, NotFound, never> =>
        sql<EncounterRunRow>`
          select encounter_run.* from encounter_run
          where encounter_run.id = ${id}
            and ${nestedRowWritable(sql, RUNS, sessionId, campaignId, actor)}
        `.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows.length === 0
              ? new NotFound({ resource: "encounter_run", id })
              : Effect.succeed(toEncounterRun(rows[0]!)),
          ),
        );

      /**
       * The turn marker's next resting place.
       *
       * Reads the whole list through the *writable* predicate rather than the
       * readable one, which matters: turn order must not depend on who is
       * watching. Only a DM reaches this code, and a combatant hidden from
       * players still takes their turn.
       */
      const advance = (
        campaignId: CampaignId,
        runId: EncounterRunId,
        actor: Actor,
        from: CombatantId | null,
      ) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ readonly id: CombatantId }>`
            select combatant.id from combatant
            where ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
            ${initiativeOrder(sql)}
          `;
          if (rows.length === 0) return { activeCombatantId: null, wrapped: false };
          const at = from === null ? -1 : rows.findIndex((row) => row.id === from);
          const next = (at + 1) % rows.length;
          // Wrapping past the bottom of the order is what ends a round —
          // `EncounterRunner.jsx:112-116`. Starting from nobody does not.
          return { activeCombatantId: rows[next]!.id, wrapped: at >= 0 && next === 0 };
        });

      return {
        list: (campaignId, sessionId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureNestedParentReadable(sql, RUNS, sessionId, campaignId, actor);
              const rows = yield* sql<EncounterRunRow>`
                select encounter_run.* from encounter_run
                where ${nestedRowReadable(sql, RUNS, sessionId, campaignId, actor)}
                order by encounter_run.started_at desc
              `;
              return rows.map(toEncounterRun);
            }),
          ),

        findById: (campaignId, sessionId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // The session in the path is a claim about which session contains
              // this run, so it is checked rather than trusted — naming another
              // table's session id must not reach this run.
              yield* ensureNestedParentReadable(sql, RUNS, sessionId, campaignId, actor);
              const rows = yield* sql<EncounterRunRow>`
                select encounter_run.* from encounter_run
                where encounter_run.id = ${id}
                  and ${nestedRowReadable(sql, RUNS, sessionId, campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "encounter_run", id });
              return toEncounterRun(rows[0]!);
            }),
          ),

        /**
         * Start a fight, and seed it.
         *
         * One transaction, because a half-seeded fight is worse than none: a
         * run with the party in it and no goblins looks like a fight that has
         * begun, and the DM would have to notice. Six statements commit or none
         * do.
         */
        start: (campaignId, sessionId, payload) =>
          dieOnSqlError(
            asConflict(
              sql
                .withTransaction(
                  Effect.gen(function* () {
                    const actor = yield* CurrentActor;
                    yield* ensureNestedParentWritable(sql, RUNS, sessionId, campaignId, actor);

                    // The encounter id is a claim like any other. It must be one
                    // this actor can reach *from this campaign* — the same
                    // predicate a read of it would apply.
                    const encounters = yield* sql<{ readonly id: EncounterId; readonly name: string }>`
                      select encounter.id, encounter.name from encounter
                      where encounter.id = ${payload.encounterId}
                        and ${rowReadable(sql, "encounter", campaignId, actor)}
                    `;
                    if (encounters.length === 0) {
                      return yield* new NotFound({
                        resource: "encounter",
                        id: payload.encounterId,
                      });
                    }
                    const encounter = encounters[0]!;

                    const runs = yield* sql<EncounterRunRow>`
                      insert into encounter_run ${sql.insert(
                        defined({
                          session_id: sessionId,
                          encounter_id: encounter.id,
                          encounter_name: encounter.name,
                          visibility: payload.visibility,
                        }),
                      )}
                      returning *
                    `;
                    const run = runs[0]!;

                    // Seed the party. `data.js:15,17,20` — the PCs are in
                    // initiative alongside the monsters, and a fight without
                    // them is not a fight.
                    const party =
                      payload.includeParty === false
                        ? []
                        : yield* sql<PartyRow>`
                            select character.id, character.name, character.player_name,
                                   character.descriptor, character.ac, character.hp_max
                            from character
                            where ${rowReadable(sql, "character", campaignId, actor)}
                            order by character.created_at asc
                          `;

                    // Seed the monsters, `count` instances each. This is where
                    // `data.js:18-19`'s two `Goblin Archer` rows come from: the
                    // roster line says how many, and each one becomes a row
                    // that can be damaged on its own. They are not numbered,
                    // because the fixture does not number them.
                    //
                    // The creature is filtered by `corpusRowReadable`, not by a
                    // join alone — half the creatures a roster may name are
                    // global `system` rows, and they are reachable only through
                    // a campaign this actor can read.
                    const roster = yield* sql<RosterRow>`
                      select encounter_creature.count as count,
                             creature.id as creature_id, creature.name, creature.size,
                             creature.type, creature.ac, creature.hp
                      from encounter_creature
                      join creature on creature.id = encounter_creature.creature_id
                      where ${nestedRowReadable(sql, ROSTER, encounter.id, campaignId, actor)}
                        and ${corpusRowReadable(sql, "creature", campaignId, actor)}
                      order by creature.cr_sort desc, creature.name asc
                    `;
                    // The two orderings above are for the *insert*, and they
                    // do not survive into the initiative list: everything a
                    // seed inserts shares one `created_at`, so reads fall
                    // through to `id`. See `initiativeOrder`. They are kept
                    // because a deterministic insert order is what makes the
                    // seed reproducible for a given roster.

                    const seeded: Array<Record<string, unknown>> = [];
                    for (const member of party) {
                      seeded.push({
                        encounter_run_id: run.id,
                        character_id: member.id,
                        creature_id: null,
                        display_name: member.name,
                        subtitle: member.descriptor,
                        player_name: member.player_name,
                        initiative: 0,
                        hp_current: member.hp_max ?? 0,
                        hp_max: member.hp_max ?? 0,
                        ac: member.ac,
                        kind: "pc",
                      });
                    }
                    for (const line of roster) {
                      for (let index = 0; index < line.count; index += 1) {
                        seeded.push({
                          encounter_run_id: run.id,
                          character_id: null,
                          creature_id: line.creature_id,
                          display_name: line.name,
                          subtitle: npcSubtitle(line.size, line.type),
                          player_name: null,
                          initiative: 0,
                          hp_current: line.hp,
                          hp_max: line.hp,
                          ac: line.ac,
                          kind: "npc",
                        });
                      }
                    }
                    if (seeded.length > 0) {
                      yield* sql`insert into combatant ${sql.insert(seeded)}`;
                    }

                    // Put it on the table, and put the marker on whoever is
                    // first. Both pointers are written here and nowhere else.
                    const { activeCombatantId } = yield* advance(campaignId, run.id, actor, null);
                    const started = yield* sql<EncounterRunRow>`
                      update encounter_run
                      set active_combatant_id = ${activeCombatantId}, updated_at = now()
                      where encounter_run.id = ${run.id}
                      returning *
                    `;
                    yield* sql`
                      update session set active_encounter_run_id = ${run.id}, updated_at = now()
                      where session.id = ${sessionId}
                    `;

                    yield* appendEvent(sql, {
                      sessionId,
                      kind: "run-started",
                      encounterRunId: run.id,
                      payload: {
                        encounterId: encounter.id,
                        encounterName: encounter.name,
                        combatants: seeded.length,
                      },
                    });

                    return toEncounterRun(started[0]!);
                  }),
                )
                .pipe(Effect.tap(() => live.touched(sessionId))),
            ),
          ),

        update: (campaignId, sessionId, id, patch) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureNestedParentWritable(sql, RUNS, sessionId, campaignId, actor);
                  const columns = defined({
                    round: patch.round,
                    active_combatant_id: patch.activeCombatantId,
                    visibility: patch.visibility,
                  });
                  const rows = yield* sql<EncounterRunRow>`
                    update encounter_run set ${setClause(sql, columns)}
                    where encounter_run.id = ${id}
                      and ${containedChildWritable(sql, RUN, sessionId, campaignId, actor)}
                    returning *
                  `;
                  if (rows.length === 0) {
                    return yield* new NotFound({ resource: "encounter_run", id });
                  }
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "run-updated",
                    encounterRunId: id,
                    payload: { ...patch },
                  });
                  return toEncounterRun(rows[0]!);
                }),
              )
              .pipe(
                // A turn marker naming a combatant in another fight is refused
                // by `encounter_run_active_combatant_fkey`, which is composite.
                // The repository turns that into the 404 the rest of the surface
                // answers with rather than letting it become a 500.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "ConstraintError"
                    ? new NotFound({
                        resource: "combatant",
                        id: patch.activeCombatantId ?? id,
                      })
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          ),

        /**
         * Advance initiative — `EncounterRunner.jsx:112-116`, round roll-over
         * included.
         *
         * Carries a `requestId` because "Next turn" is bound to the space bar
         * and to a button, and a repeat of one already applied returns the run
         * unchanged rather than skipping a creature's turn.
         */
        nextTurn: (campaignId, sessionId, id, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  yield* ensureNestedRowWritable(sql, RUNS, id, sessionId, campaignId, actor);

                  if (yield* requestAlreadyApplied(sql, id, payload.requestId)) {
                    return yield* readRun(campaignId, sessionId, id, actor);
                  }

                  const current = yield* readRun(campaignId, sessionId, id, actor);
                  const { activeCombatantId, wrapped } = yield* advance(
                    campaignId,
                    id,
                    actor,
                    current.activeCombatantId,
                  );
                  if (activeCombatantId === null) return current;

                  const round = current.round + (wrapped ? 1 : 0);
                  const rows = yield* sql<EncounterRunRow>`
                    update encounter_run
                    set active_combatant_id = ${activeCombatantId},
                        round = ${round},
                        updated_at = now()
                    where encounter_run.id = ${id}
                    returning *
                  `;
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "turn-advanced",
                    encounterRunId: id,
                    combatantId: activeCombatantId,
                    payload: { round, wrapped },
                    requestId: payload.requestId,
                  });
                  return toEncounterRun(rows[0]!);
                }),
              )
              .pipe(
                // Two taps that raced past the check together: the unique index
                // on `(encounter_run_id, request_id)` refuses the second, and
                // the honest answer is the state the first one produced.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? Effect.flatMap(CurrentActor, (actor) =>
                        readRun(campaignId, sessionId, id, actor),
                      )
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          ),

        /**
         * Take the fight off the table.
         *
         * Nothing is deleted. The run, its combatants and its log all stay —
         * `EncounterRunner.jsx:164` promises the DM they are "saved to Session
         * 12", and §1.4's interrupted-and-resumed fight is a second run of the
         * same encounter next week rather than a resurrection of this one.
         *
         * Idempotent: ending an ended run is a no-op that appends no second
         * event, so a retried request cannot put two endings in the log.
         */
        end: (campaignId, sessionId, id) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const actor = yield* CurrentActor;
                  const current = yield* readRun(campaignId, sessionId, id, actor);
                  if (current.endedAt !== null) return current;

                  const rows = yield* sql<EncounterRunRow>`
                    update encounter_run set ended_at = now(), updated_at = now()
                    where encounter_run.id = ${id} and encounter_run.ended_at is null
                    returning *
                  `;
                  // Clearing the pointer is the same statement's job as setting
                  // `ended_at`, in the same transaction — that is what stops
                  // the session naming a fight that is over. The `and` on the
                  // current value keeps this from clobbering a pointer that has
                  // already moved on.
                  yield* sql`
                    update session
                    set active_encounter_run_id = null, updated_at = now()
                    where session.id = ${sessionId} and session.active_encounter_run_id = ${id}
                  `;
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "run-ended",
                    encounterRunId: id,
                    payload: { round: current.round },
                  });
                  return toEncounterRun(rows[0]!);
                }),
              )
              .pipe(Effect.tap(() => live.touched(sessionId))),
          ),
      };
    }),
  );
}
