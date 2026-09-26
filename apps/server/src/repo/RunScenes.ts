import {
  type AbilityKey,
  type CheckOutcome,
  type CombatantId,
  Conflict,
  challengeTally,
  checkOutcome,
  type EncounterChallenge,
  type EncounterKind,
  EncounterRunCheck,
  type EncounterRunCheckCreate,
  type EncounterRunCheckId,
  type EncounterRunId,
  EncounterRunScene,
  type EncounterRunSceneUpdate,
  NotFound,
  type SceneAttitude,
  type SceneBeat,
  type SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { COMBATANT, RUNS } from "./liveTables.js";
import { defined, dieOnSqlError, setClause } from "./rows.js";
import { appendEvent } from "./SessionEvents.js";
import { containedChildWritable, nestedRowWritable } from "./visibility.js";

export interface SceneRow {
  readonly run_id: EncounterRunId;
  readonly beats: ReadonlyArray<SceneBeat>;
  readonly challenge: EncounterChallenge | null;
  readonly attitude: SceneAttitude | null;
  readonly stages: number | null;
  readonly stage: number | null;
}

export interface CheckRow {
  readonly id: EncounterRunCheckId;
  readonly encounter_run_id: EncounterRunId;
  readonly combatant_id: CombatantId | null;
  readonly display_name: string;
  readonly skill: string | null;
  readonly save_ability: AbilityKey | null;
  readonly total: number | null;
  readonly dc: number | null;
  readonly outcome: CheckOutcome;
  readonly stage: number | null;
  readonly created_at: Date;
}

export const toCheck = (row: CheckRow): EncounterRunCheck =>
  new EncounterRunCheck({
    id: row.id,
    runId: row.encounter_run_id,
    combatantId: row.combatant_id,
    displayName: row.display_name,
    skill: row.skill,
    save: row.save_ability,
    total: row.total,
    dc: row.dc,
    outcome: row.outcome,
    stage: row.stage,
    createdAt: DateTime.fromDateUnsafe(row.created_at),
  });

interface RunRow {
  readonly id: EncounterRunId;
  readonly mode: EncounterKind;
}

/**
 * The DC a check is made against when the DM names none: a skill challenge's
 * for a skill check in one, a hazard's for a save in one. A conversation has
 * no DC of its own — the DM sets each (the captain's decision on attitude).
 */
const sceneDc = (
  challenge: EncounterChallenge | null,
  payload: EncounterRunCheckCreate,
): number | null => {
  if (challenge?.kind === "challenge" && payload.skill !== undefined) return challenge.dc;
  if (challenge?.kind === "hazard" && payload.save !== undefined) return challenge.save.dc;
  return null;
};

/**
 * A running scene — a conversation, a skill challenge or a hazard — and its
 * log of checks and saves.
 *
 * **The creator's alone**, so every method takes a `CampaignCreatorActor`:
 * the scene is copied from the encounter's prep, which is the DM's plan, and
 * the checks carry DCs and targets a player is not told (`0065_run_scenes.ts`).
 * The run is found through the creator's nested predicate on every call, so a
 * run in another session, or another campaign, is a 404 like everything else.
 *
 * Writes go straight through, in one transaction each, and append a `dm`
 * event — the DM's other tabs re-read on it; a player's doorbell does not ring,
 * because nothing a player reads has changed.
 */
export class RunScenes extends Context.Service<
  RunScenes,
  {
    readonly read: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
    ) => Effect.Effect<EncounterRunScene, NotFound>;
    readonly update: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      patch: EncounterRunSceneUpdate,
    ) => Effect.Effect<EncounterRunScene, NotFound | Conflict>;
    readonly logCheck: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      payload: EncounterRunCheckCreate,
    ) => Effect.Effect<EncounterRunCheck, NotFound | Conflict>;
    readonly removeCheck: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      checkId: EncounterRunCheckId,
    ) => Effect.Effect<void, NotFound>;
  }
>()("RunScenes") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      const readRun = (
        { actor, campaign }: CampaignCreatorActor,
        sessionId: SessionId,
        id: EncounterRunId,
      ) =>
        Effect.flatMap(
          sql<RunRow>`
            select encounter_run.id, encounter_run.mode from encounter_run
            where encounter_run.id = ${id}
              and ${nestedRowWritable(sql, RUNS, sessionId, campaign, actor)}
          `,
          (rows) =>
            rows.length === 0
              ? Effect.fail(new NotFound({ resource: "encounter_run", id }))
              : Effect.succeed(rows[0]!),
        );

      /** The checks, oldest first — the order they were made in. */
      const checksOf = (runId: EncounterRunId) =>
        sql<CheckRow>`
          select encounter_run_check.* from encounter_run_check
          where encounter_run_check.encounter_run_id = ${runId}
          order by encounter_run_check.created_at asc, encounter_run_check.id asc
        `;

      /** Beneath a `readRun`, which is the gate: the scene is keyed by the run it proved. */
      const sceneOf = (runId: EncounterRunId) =>
        Effect.gen(function* () {
          const rows = yield* sql<SceneRow>`
            select encounter_run_scene.* from encounter_run_scene
            where encounter_run_scene.run_id = ${runId}
          `;
          const checks = yield* checksOf(runId);
          const row = rows[0];
          return new EncounterRunScene({
            runId,
            beats: row?.beats ?? [],
            challenge: row?.challenge ?? null,
            attitude: row?.attitude ?? null,
            stages: row?.stages ?? null,
            stage: row?.stage ?? null,
            checks: checks.map(toCheck),
          });
        });

      return {
        read: (dm, sessionId, runId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* readRun(dm, sessionId, runId);
              return yield* sceneOf(runId);
            }),
          ),

        update: (dm, sessionId, runId, patch) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const run = yield* readRun(dm, sessionId, runId);
                  const scene = yield* sceneOf(runId);

                  // Each field belongs to one kind of scene. A conversation
                  // that became a fight keeps the attitude it had, as history,
                  // and takes no new one.
                  if (patch.attitude !== undefined && run.mode !== "social") {
                    return yield* new Conflict({ message: "only a conversation has an attitude" });
                  }
                  if (
                    (patch.stages !== undefined || patch.stage !== undefined) &&
                    run.mode !== "hazard"
                  ) {
                    return yield* new Conflict({ message: "only a hazard has stages" });
                  }
                  const stages = patch.stages === undefined ? scene.stages : patch.stages;
                  const stage = patch.stage === undefined ? scene.stage : patch.stage;
                  if (stage !== null && (stages === null || stage > stages)) {
                    return yield* new Conflict({
                      message: "a hazard's stage is one of the stages it lasts",
                    });
                  }
                  if (patch.beat !== undefined && patch.beat.index >= scene.beats.length) {
                    return yield* new Conflict({ message: "that scene has no such beat" });
                  }

                  yield* sql`
                    update encounter_run_scene
                    set ${setClause(
                      sql,
                      defined({
                        attitude: patch.attitude,
                        stages: patch.stages,
                        stage: patch.stage,
                      }),
                    )}
                    where encounter_run_scene.run_id = ${runId}
                  `;
                  if (patch.beat !== undefined) {
                    yield* sql`
                      update encounter_run_scene
                      set beats = jsonb_set(
                            beats,
                            array[${String(patch.beat.index)}, 'done'],
                            to_jsonb(${patch.beat.done}::boolean)
                          ),
                          updated_at = now()
                      where encounter_run_scene.run_id = ${runId}
                    `;
                  }

                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "scene-updated",
                    encounterRunId: runId,
                    payload: { ...patch },
                  });
                  return yield* sceneOf(runId);
                }),
              )
              .pipe(Effect.tap(() => live.touched(sessionId))),
          ),

        logCheck: (dm, sessionId, runId, payload) => {
          /** A double-tapped *Log check*: the row the first tap made. */
          const already = (requestId: string) =>
            Effect.map(
              sql<CheckRow>`
                select encounter_run_check.* from encounter_run_check
                where encounter_run_check.encounter_run_id = ${runId}
                  and encounter_run_check.request_id = ${requestId}
              `,
              (rows) => (rows.length === 0 ? undefined : toCheck(rows[0]!)),
            );
          return dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const run = yield* readRun(dm, sessionId, runId);
                  if (payload.requestId !== undefined) {
                    const repeat = yield* already(payload.requestId);
                    if (repeat !== undefined) return repeat;
                  }
                  if (run.mode === "combat") {
                    return yield* new Conflict({ message: "a fight logs no checks" });
                  }

                  const combatants = yield* sql<{
                    readonly id: CombatantId;
                    readonly display_name: string;
                  }>`
                    select combatant.id, combatant.display_name from combatant
                    where combatant.id = ${payload.combatantId}
                      and ${containedChildWritable(sql, COMBATANT, runId, dm.campaign, dm.actor)}
                  `;
                  const combatant = combatants[0];
                  if (combatant === undefined) {
                    return yield* new NotFound({
                      resource: "combatant",
                      id: payload.combatantId,
                    });
                  }

                  const scene = yield* sceneOf(runId);
                  const challenge = scene.challenge;
                  if (run.mode === "challenge" && challenge?.kind === "challenge") {
                    if (challengeTally(challenge, scene.checks).settled !== null) {
                      return yield* new Conflict({ message: "the challenge is settled" });
                    }
                  }

                  const dc = payload.dc ?? sceneDc(challenge, payload);
                  const outcome =
                    payload.outcome ??
                    (payload.total !== undefined && dc !== null
                      ? checkOutcome(payload.total, dc)
                      : undefined);
                  if (outcome === undefined) {
                    return yield* new Conflict({
                      message: "say how it went, or give the total and the DC to work it out",
                    });
                  }

                  const rows = yield* sql<CheckRow>`
                    insert into encounter_run_check ${sql.insert({
                      encounter_run_id: runId,
                      combatant_id: combatant.id,
                      display_name: combatant.display_name,
                      skill: payload.skill?.trim() ?? null,
                      save_ability: payload.save ?? null,
                      total: payload.total ?? null,
                      dc,
                      outcome,
                      // A hazard's save is made in the stage it is in.
                      stage:
                        run.mode === "hazard" && payload.save !== undefined ? scene.stage : null,
                      request_id: payload.requestId ?? null,
                    })}
                    returning *
                  `;
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "check-logged",
                    encounterRunId: runId,
                    combatantId: combatant.id,
                    payload: { outcome },
                  });
                  return toCheck(rows[0]!);
                }),
              )
              .pipe(
                Effect.catch((error) => {
                  if (!SqlError.isSqlError(error) || error.reason._tag !== "UniqueViolation") {
                    return Effect.fail(error);
                  }
                  // Two taps that raced past the check together: the answer
                  // is the row the first one made.
                  if (
                    error.reason.constraint.includes("request_id") &&
                    payload.requestId !== undefined
                  ) {
                    return Effect.flatMap(already(payload.requestId), (row) =>
                      row === undefined ? Effect.fail(error) : Effect.succeed(row),
                    );
                  }
                  if (error.reason.constraint.includes("one_per_stage")) {
                    return Effect.fail(
                      new Conflict({
                        message: "that save is already logged for this stage; remove it first",
                      }),
                    );
                  }
                  return Effect.fail(error);
                }),
                Effect.tap(() => live.touched(sessionId)),
              ),
          );
        },

        removeCheck: (dm, sessionId, runId, checkId) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* readRun(dm, sessionId, runId);
                  const rows = yield* sql<{ readonly combatant_id: CombatantId | null }>`
                    delete from encounter_run_check
                    where encounter_run_check.id = ${checkId}
                      and encounter_run_check.encounter_run_id = ${runId}
                    returning encounter_run_check.combatant_id
                  `;
                  if (rows.length === 0) {
                    return yield* new NotFound({ resource: "encounter_run_check", id: checkId });
                  }
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "check-removed",
                    encounterRunId: runId,
                    combatantId: rows[0]!.combatant_id ?? undefined,
                  });
                }),
              )
              .pipe(Effect.tap(() => live.touched(sessionId))),
          ),
      };
    }),
  );
}
