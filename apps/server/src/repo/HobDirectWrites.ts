import {
  type AssistantThreadId,
  type AssistantTurnId,
  Conflict,
  type CombatantId,
  type EncounterRunId,
  HobDirectResourceUpdate,
  type HobDirectResourceUpdateId,
  NotFound,
  type SessionId,
  type CharacterId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { RUNS } from "./liveTables.js";
import { reserveHobTurn } from "./HobThreads.js";
import { dieOnSqlError } from "./rows.js";
import { appendEvent } from "./SessionEvents.js";
import { ensureNestedRowWritable } from "./visibility.js";

/**
 * The resource choices Hob may spend right now.
 *
 * `key` is what reaches the tool schema. It is an enum value generated for this
 * one request rather than a free-form resource id, which is the mechanical guard
 * the direct-write decision names: the model can pick from existing counters and
 * an integer amount, and it cannot invent prose for the write path.
 */
export interface HobDirectResourceTarget {
  readonly key: string;
  readonly sessionId: SessionId;
  readonly runId: EncounterRunId;
  readonly combatantId: CombatantId;
  readonly characterId: CharacterId;
  readonly characterName: string;
  readonly resourceId: string;
  readonly resourceName: string;
  readonly used: number;
  readonly max: number;
  readonly unit?: string | undefined;
}

export interface HobDirectResourceContext {
  readonly sessionId: SessionId;
  readonly runId: EncounterRunId;
  readonly targets: ReadonlyArray<HobDirectResourceTarget>;
}

interface ActiveRunRow {
  readonly session_id: SessionId;
  readonly run_id: EncounterRunId;
  readonly allow_hob_direct_writes: boolean;
}

interface TargetRow {
  readonly session_id: SessionId;
  readonly run_id: EncounterRunId;
  readonly combatant_id: CombatantId;
  readonly character_id: CharacterId;
  readonly character_name: string;
  readonly resource_id: string;
  readonly resource_name: string;
  readonly used: number;
  readonly max: number;
  readonly unit: string | null;
}

interface UpdateRow {
  readonly id: HobDirectResourceUpdateId;
  readonly session_id: SessionId;
  readonly encounter_run_id: EncounterRunId;
  readonly combatant_id: CombatantId | null;
  readonly character_id: CharacterId | null;
  readonly character_name: string;
  readonly resource_id: string;
  readonly resource_name: string;
  readonly resource_max: number;
  readonly amount: number;
  readonly before_used: number;
  readonly after_used: number;
  readonly assistant_turn_id: AssistantTurnId;
  readonly undone_at: Date | null;
  readonly created_at: Date;
}

interface SpendResultRow {
  readonly resource_name: string;
  readonly resource_max: number;
  readonly before_used: number;
  readonly after_used: number;
}

const toUpdate = (row: UpdateRow): HobDirectResourceUpdate =>
  new HobDirectResourceUpdate({
    id: row.id,
    sessionId: row.session_id,
    encounterRunId: row.encounter_run_id,
    combatantId: row.combatant_id,
    characterId: row.character_id,
    characterName: row.character_name,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    resourceMax: row.resource_max,
    amount: row.amount,
    beforeUsed: row.before_used,
    afterUsed: row.after_used,
    assistantTurnId: row.assistant_turn_id,
    undoneAt: row.undone_at === null ? null : DateTime.fromDateUnsafe(row.undone_at),
    createdAt: DateTime.fromDateUnsafe(row.created_at),
  });

const directWritesOff = new Conflict({
  message: "Hob direct writes are off for this fight. Ask the DM to turn them on first.",
});

const notLive = new Conflict({
  message: "That fight is no longer the live fight on the table.",
});

const noChange = new Conflict({
  message: "That resource is already fully spent; Hob did not change it.",
});

const undoUnsafe = new Conflict({
  message:
    "That resource has changed since Hob spent it. Undo from the sheet, or adjust it by hand.",
});

const resourceMissing = (id: string): NotFound =>
  new NotFound({ resource: "character_resource", id });

const messageFor = (update: HobDirectResourceUpdate): string =>
  `${update.characterName}: spent ${String(update.afterUsed - update.beforeUsed)} ${update.resourceName}. ` +
  `The counter is now ${String(update.resourceMax - update.afterUsed)} of ${String(
    update.resourceMax,
  )} left.`;

export class HobDirectWrites extends Context.Service<
  HobDirectWrites,
  {
    /** Current live-fight resource targets, or none when the switch is off. */
    readonly currentTargets: (
      dm: CampaignCreatorActor,
    ) => Effect.Effect<HobDirectResourceContext | undefined>;
    /** The audit rows the runner draws, newest first. */
    readonly list: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
    ) => Effect.Effect<ReadonlyArray<HobDirectResourceUpdate>, NotFound>;
    /** Hob's direct write: spend an existing resource on an existing PC in the live fight. */
    readonly spendResource: (
      dm: CampaignCreatorActor,
      input: {
        readonly threadId: AssistantThreadId;
        readonly turnId: AssistantTurnId;
        readonly toolCallId?: string | undefined;
        readonly sessionId: SessionId;
        readonly runId: EncounterRunId;
        readonly combatantId: CombatantId;
        readonly characterId: CharacterId;
        readonly characterName: string;
        readonly resourceId: string;
        readonly amount: number;
      },
    ) => Effect.Effect<
      { readonly update: HobDirectResourceUpdate; readonly message: string },
      NotFound | Conflict
    >;
    /** The DM's inverse, safe only while the resource still holds Hob's after value. */
    readonly undo: (
      dm: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      id: HobDirectResourceUpdateId,
    ) => Effect.Effect<HobDirectResourceUpdate, NotFound | Conflict>;
  }
>()("HobDirectWrites") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* Effect.serviceOption(LiveEvents);

      const ring = (sessionId: SessionId) =>
        Option.match(live, {
          onNone: () => Effect.void,
          onSome: (events) => events.touched(sessionId),
        });

      const activeRun = (proof: CampaignCreatorActor) =>
        sql<ActiveRunRow>`
          select session.id as session_id,
                 encounter_run.id as run_id,
                 encounter_run.allow_hob_direct_writes
          from campaign
          join session on session.id = campaign.current_session_id
          join encounter_run on encounter_run.id = session.active_encounter_run_id
          where campaign.id = ${proof.campaign}
            and encounter_run.session_id = session.id
            and encounter_run.ended_at is null
          limit 1
        `;

      const readExisting = (turnId: AssistantTurnId, toolCallId: string | undefined) =>
        toolCallId === undefined
          ? Effect.succeed(undefined)
          : Effect.map(
              sql<UpdateRow>`
                select * from hob_direct_resource_update
                where assistant_turn_id = ${turnId} and tool_call_id = ${toolCallId}
                limit 1
              `,
              (rows) => (rows[0] === undefined ? undefined : toUpdate(rows[0])),
            );

      const ensureLiveAndEnabled = (
        proof: CampaignCreatorActor,
        sessionId: SessionId,
        runId: EncounterRunId,
      ) =>
        Effect.gen(function* () {
          yield* ensureNestedRowWritable(sql, RUNS, runId, sessionId, proof.campaign, proof.actor);
          const rows = yield* sql<{
            readonly ended_at: Date | null;
            readonly active_encounter_run_id: EncounterRunId | null;
            readonly allow_hob_direct_writes: boolean;
          }>`
            select encounter_run.ended_at,
                   session.active_encounter_run_id,
                   encounter_run.allow_hob_direct_writes
            from encounter_run
            join session on session.id = encounter_run.session_id
            where encounter_run.id = ${runId}
              and encounter_run.session_id = ${sessionId}
          `;
          const row = rows[0];
          if (row === undefined)
            return yield* new NotFound({ resource: "encounter_run", id: runId });
          if (row.ended_at !== null || row.active_encounter_run_id !== runId) return yield* notLive;
          if (!row.allow_hob_direct_writes) return yield* directWritesOff;
        });

      return {
        currentTargets: (dm) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const active = (yield* activeRun(dm))[0];
              if (active === undefined || !active.allow_hob_direct_writes) return undefined;
              const rows = yield* sql<TargetRow>`
                select encounter_run.session_id,
                       encounter_run.id as run_id,
                       combatant.id as combatant_id,
                       combatant.character_id,
                       combatant.display_name as character_name,
                       resource.value ->> 'id' as resource_id,
                       resource.value ->> 'name' as resource_name,
                       (resource.value ->> 'used')::integer as used,
                       (resource.value ->> 'max')::integer as max,
                       resource.value ->> 'unit' as unit
                from encounter_run
                join combatant on combatant.encounter_run_id = encounter_run.id
                join character on character.id = combatant.character_id
                cross join lateral jsonb_array_elements(coalesce(character.body -> 'resources', '[]'::jsonb))
                  with ordinality as resource(value, ordinality)
                where encounter_run.id = ${active.run_id}
                  and combatant.kind = 'pc'
                  and combatant.character_id is not null
                  and (resource.value ->> 'used')::integer < (resource.value ->> 'max')::integer
                order by combatant.initiative desc,
                         combatant.created_at asc,
                         combatant.id asc,
                         resource.ordinality asc
              `;
              return {
                sessionId: active.session_id,
                runId: active.run_id,
                targets: rows.map((row, index) => ({
                  key: `target:${String(index + 1)}`,
                  sessionId: row.session_id,
                  runId: row.run_id,
                  combatantId: row.combatant_id,
                  characterId: row.character_id,
                  characterName: row.character_name,
                  resourceId: row.resource_id,
                  resourceName: row.resource_name,
                  used: row.used,
                  max: row.max,
                  unit: row.unit ?? undefined,
                })),
              } satisfies HobDirectResourceContext;
            }),
          ),

        list: (dm, sessionId, runId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureNestedRowWritable(sql, RUNS, runId, sessionId, dm.campaign, dm.actor);
              const rows = yield* sql<UpdateRow>`
                select * from hob_direct_resource_update
                where encounter_run_id = ${runId}
                  and session_id = ${sessionId}
                order by created_at desc, id desc
                limit 50
              `;
              return rows.map(toUpdate);
            }),
          ),

        spendResource: (dm, input) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureLiveAndEnabled(dm, input.sessionId, input.runId);

                  const combatants = yield* sql<{ readonly id: CombatantId }>`
                    select combatant.id from combatant
                    where combatant.id = ${input.combatantId}
                      and combatant.encounter_run_id = ${input.runId}
                      and combatant.character_id = ${input.characterId}
                      and combatant.kind = 'pc'
                    for update
                  `;
                  if (combatants.length === 0) {
                    return yield* new NotFound({ resource: "combatant", id: input.combatantId });
                  }

                  yield* reserveHobTurn(
                    sql,
                    "dm",
                    dm.campaign,
                    input.threadId,
                    input.turnId,
                    dm.actor,
                  );
                  // Serialise every direct write for this assistant turn before
                  // reading the tool-call idempotency row. A duplicate that
                  // races past the first read then waits here and sees the row
                  // the first transaction inserted, rather than spending twice.
                  yield* sql`select assistant_turn.id from assistant_turn where assistant_turn.id = ${input.turnId} for update`;
                  const existing = yield* readExisting(input.turnId, input.toolCallId);
                  if (existing !== undefined) return existing;

                  const spent = yield* sql<SpendResultRow>`
                    with located as (
                      select character.id,
                             resource.ordinality - 1 as index,
                             resource.value ->> 'name' as resource_name,
                             (resource.value ->> 'used')::integer as before_used,
                             (resource.value ->> 'max')::integer as resource_max
                      from character
                      cross join lateral jsonb_array_elements(coalesce(character.body -> 'resources', '[]'::jsonb))
                        with ordinality as resource(value, ordinality)
                      where character.id = ${input.characterId}
                        and resource.value ->> 'id' = ${input.resourceId}
                    ), next_value as (
                      select located.*,
                             greatest(0, least(located.resource_max, located.before_used + ${input.amount})) as after_used
                      from located
                    )
                    update character
                    set body = jsonb_set(
                          character.body,
                          array['resources', next_value.index::text, 'used'],
                          to_jsonb(next_value.after_used),
                          false
                        ),
                        version = character.version + 1,
                        updated_at = now()
                    from next_value
                    where character.id = next_value.id
                    returning next_value.resource_name,
                              next_value.resource_max,
                              next_value.before_used,
                              next_value.after_used
                  `;
                  const row = spent[0];
                  if (row === undefined) return yield* resourceMissing(input.resourceId);
                  if (row.after_used === row.before_used) return yield* noChange;

                  const inserted = yield* sql<UpdateRow>`
                    insert into hob_direct_resource_update
                      (session_id, encounter_run_id, combatant_id, character_id, character_name,
                       resource_id, resource_name, resource_max, amount, before_used, after_used,
                       assistant_turn_id, tool_call_id)
                    values
                      (${input.sessionId}, ${input.runId}, ${input.combatantId}, ${input.characterId},
                       ${input.characterName}, ${input.resourceId}, ${row.resource_name},
                       ${row.resource_max}, ${input.amount}, ${row.before_used}, ${row.after_used},
                       ${input.turnId}, ${input.toolCallId ?? null})
                    returning *
                  `;
                  const update = toUpdate(inserted[0]!);
                  yield* appendEvent(sql, {
                    sessionId: input.sessionId,
                    kind: "hob-resource-spent",
                    encounterRunId: input.runId,
                    combatantId: input.combatantId,
                    payload: {
                      updateId: update.id,
                      characterId: input.characterId,
                      resourceId: input.resourceId,
                      amount: input.amount,
                    },
                    origin: "assistant",
                    assistantTurnId: input.turnId,
                  });
                  return update;
                }),
              )
              .pipe(
                Effect.tap(() => ring(input.sessionId)),
                Effect.map((update) => ({ update, message: messageFor(update) })),
              ),
          ),

        undo: (dm, sessionId, runId, id) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* ensureNestedRowWritable(
                    sql,
                    RUNS,
                    runId,
                    sessionId,
                    dm.campaign,
                    dm.actor,
                  );
                  const rows = yield* sql<UpdateRow>`
                    select * from hob_direct_resource_update
                    where id = ${id}
                      and encounter_run_id = ${runId}
                      and session_id = ${sessionId}
                    for update
                  `;
                  const before = rows[0];
                  if (before === undefined)
                    return yield* new NotFound({ resource: "hob_direct_resource_update", id });
                  if (before.undone_at !== null) return toUpdate(before);
                  if (before.character_id === null) return yield* undoUnsafe;

                  const reverted = yield* sql<{ readonly id: CharacterId }>`
                    with located as (
                      select character.id,
                             resource.ordinality - 1 as index,
                             (resource.value ->> 'used')::integer as current_used
                      from character
                      cross join lateral jsonb_array_elements(coalesce(character.body -> 'resources', '[]'::jsonb))
                        with ordinality as resource(value, ordinality)
                      where character.id = ${before.character_id}
                        and resource.value ->> 'id' = ${before.resource_id}
                    )
                    update character
                    set body = jsonb_set(
                          character.body,
                          array['resources', located.index::text, 'used'],
                          to_jsonb(${before.before_used}::integer),
                          false
                        ),
                        version = character.version + 1,
                        updated_at = now()
                    from located
                    where character.id = located.id
                      and located.current_used = ${before.after_used}
                    returning character.id
                  `;
                  if (reverted.length === 0) return yield* undoUnsafe;

                  const updated = yield* sql<UpdateRow>`
                    update hob_direct_resource_update
                    set undone_at = now(),
                        undone_by_account_id = ${dm.actor.accountId},
                        updated_at = now()
                    where id = ${id}
                    returning *
                  `;
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "hob-resource-undone",
                    encounterRunId: runId,
                    combatantId: before.combatant_id ?? undefined,
                    payload: { updateId: id, resourceId: before.resource_id },
                  });
                  return toUpdate(updated[0]!);
                }),
              )
              .pipe(Effect.tap(() => ring(sessionId))),
          ),
      };
    }),
  );
}
