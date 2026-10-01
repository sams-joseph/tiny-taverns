import {
  type AssistantThreadId,
  AssistantTurnId,
  CampaignId,
  Conflict,
  CombatantId,
  EncounterRunId,
  HobDirectResourceUpdate,
  HobDirectResourceUpdateId,
  NotFound,
  SessionId,
  CharacterId,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { initiativeOrderKeys, RUNS } from "./liveTables.js";
import { reserveHobTurn } from "./HobThreads.js";
import { classFromColumns, dieOnSqlError, fromColumns, orNotFound } from "./rows.js";
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

/** The campaign's live fight, and whether its DM has let Hob write to it. */
const ActiveRunRow = fromColumns(
  Schema.Struct({
    sessionId: SessionId,
    runId: EncounterRunId,
    allowHobDirectWrites: Schema.Boolean,
  }),
);

/** One unspent resource of one PC in the live fight, before it is given its key. */
const TargetRow = fromColumns(
  Schema.Struct({
    sessionId: SessionId,
    runId: EncounterRunId,
    combatantId: CombatantId,
    characterId: CharacterId,
    characterName: Schema.String,
    resourceId: Schema.String,
    resourceName: Schema.String,
    used: Schema.Number,
    max: Schema.Number,
    unit: Schema.NullOr(Schema.String),
  }),
);

/** A `hob_direct_resource_update` row as the wire reads it, decoded off `select *`. */
const UpdateRow = classFromColumns(HobDirectResourceUpdate, {
  ...HobDirectResourceUpdate.fields,
  undoneAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  createdAt: Schema.DateTimeUtcFromDate,
});

/** What a spend changed: the counter's name and bound, and its value either side. */
const SpendResultRow = fromColumns(
  Schema.Struct({
    resourceName: Schema.String,
    resourceMax: Schema.Number,
    beforeUsed: Schema.Number,
    afterUsed: Schema.Number,
  }),
);

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

      const activeRun = SqlSchema.findOneOption({
        Request: Schema.toType(CampaignId),
        Result: ActiveRunRow,
        execute: (campaignId) => sql`
          select session.id as session_id,
                 encounter_run.id as run_id,
                 encounter_run.allow_hob_direct_writes
          from campaign
          join session on session.id = campaign.current_session_id
          join encounter_run on encounter_run.id = session.active_encounter_run_id
          where campaign.id = ${campaignId}
            and encounter_run.session_id = session.id
            and encounter_run.ended_at is null
          limit 1
        `,
      });

      const targets = SqlSchema.findAll({
        Request: Schema.toType(EncounterRunId),
        Result: TargetRow,
        execute: (runId) => sql`
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
          where encounter_run.id = ${runId}
            and combatant.kind = 'pc'
            and combatant.character_id is not null
            and (resource.value ->> 'used')::integer < (resource.value ->> 'max')::integer
          order by ${initiativeOrderKeys(sql)}, resource.ordinality asc
        `,
      });

      /** The update a tool call already made, for a retried call. */
      const existingUpdate = SqlSchema.findOneOption({
        Request: Schema.toType(
          Schema.Struct({ turnId: AssistantTurnId, toolCallId: Schema.String }),
        ),
        Result: UpdateRow,
        execute: ({ turnId, toolCallId }) => sql`
          select * from hob_direct_resource_update
          where assistant_turn_id = ${turnId} and tool_call_id = ${toolCallId}
          limit 1
        `,
      });

      const readExisting = (turnId: AssistantTurnId, toolCallId: string | undefined) =>
        toolCallId === undefined
          ? Effect.succeed(undefined)
          : Effect.map(existingUpdate({ turnId, toolCallId }), Option.getOrUndefined);

      const RunRequest = Schema.toType(
        Schema.Struct({ sessionId: SessionId, runId: EncounterRunId }),
      );
      const updates = SqlSchema.findAll({
        Request: RunRequest,
        Result: UpdateRow,
        execute: ({ sessionId, runId }) => sql`
          select * from hob_direct_resource_update
          where encounter_run_id = ${runId}
            and session_id = ${sessionId}
          order by created_at desc, id desc
          limit 50
        `,
      });
      const lockedUpdate = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            sessionId: SessionId,
            runId: EncounterRunId,
            id: HobDirectResourceUpdateId,
          }),
        ),
        Result: UpdateRow,
        execute: ({ sessionId, runId, id }) => sql`
          select * from hob_direct_resource_update
          where id = ${id}
            and encounter_run_id = ${runId}
            and session_id = ${sessionId}
          for update
        `,
      });
      /** The spend itself: one counter moved by a clamped delta, in one statement. */
      const spend = SqlSchema.findOneOption({
        Request: Schema.toType(
          Schema.Struct({
            characterId: CharacterId,
            resourceId: Schema.String,
            amount: Schema.Int,
          }),
        ),
        Result: SpendResultRow,
        execute: ({ characterId, resourceId, amount }) => sql`
          with located as (
            select character.id,
                   resource.ordinality - 1 as index,
                   resource.value ->> 'name' as resource_name,
                   (resource.value ->> 'used')::integer as before_used,
                   (resource.value ->> 'max')::integer as resource_max
            from character
            cross join lateral jsonb_array_elements(coalesce(character.body -> 'resources', '[]'::jsonb))
              with ordinality as resource(value, ordinality)
            where character.id = ${characterId}
              and resource.value ->> 'id' = ${resourceId}
          ), next_value as (
            select located.*,
                   greatest(0, least(located.resource_max, located.before_used + ${amount})) as after_used
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
        `,
      });
      const insertUpdate = SqlSchema.findOne({
        Request: Schema.toType(Schema.Record(Schema.String, Schema.Unknown)),
        Result: UpdateRow,
        execute: (columns) => sql`
          insert into hob_direct_resource_update ${sql.insert(columns)}
          returning *
        `,
      });
      const markUndone = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ id: HobDirectResourceUpdateId, accountId: Schema.String }),
        ),
        Result: UpdateRow,
        execute: ({ id, accountId }) => sql`
          update hob_direct_resource_update
          set undone_at = now(),
              undone_by_account_id = ${accountId},
              updated_at = now()
          where id = ${id}
          returning *
        `,
      });

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
              const active = Option.getOrUndefined(yield* activeRun(dm.campaign));
              if (active === undefined || !active.allowHobDirectWrites) return undefined;
              const rows = yield* targets(active.runId);
              return {
                sessionId: active.sessionId,
                runId: active.runId,
                targets: rows.map((row, index) => ({
                  key: `target:${String(index + 1)}`,
                  ...row,
                  unit: row.unit ?? undefined,
                })),
              } satisfies HobDirectResourceContext;
            }),
          ),

        list: (dm, sessionId, runId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureNestedRowWritable(sql, RUNS, runId, sessionId, dm.campaign, dm.actor);
              return yield* updates({ sessionId, runId });
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

                  const spent = yield* spend({
                    characterId: input.characterId,
                    resourceId: input.resourceId,
                    amount: input.amount,
                  });
                  if (Option.isNone(spent)) return yield* resourceMissing(input.resourceId);
                  const row = spent.value;
                  if (row.afterUsed === row.beforeUsed) return yield* noChange;

                  // An insert answers with its row; not getting one is a defect.
                  const update = yield* insertUpdate({
                    session_id: input.sessionId,
                    encounter_run_id: input.runId,
                    combatant_id: input.combatantId,
                    character_id: input.characterId,
                    character_name: input.characterName,
                    resource_id: input.resourceId,
                    resource_name: row.resourceName,
                    resource_max: row.resourceMax,
                    amount: input.amount,
                    before_used: row.beforeUsed,
                    after_used: row.afterUsed,
                    assistant_turn_id: input.turnId,
                    tool_call_id: input.toolCallId ?? null,
                  }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
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
                  const before = yield* lockedUpdate({ sessionId, runId, id }).pipe(
                    orNotFound("hob_direct_resource_update", id),
                  );
                  if (before.undoneAt !== null) return before;
                  if (before.characterId === null) return yield* undoUnsafe;

                  const reverted = yield* sql<{ readonly id: CharacterId }>`
                    with located as (
                      select character.id,
                             resource.ordinality - 1 as index,
                             (resource.value ->> 'used')::integer as current_used
                      from character
                      cross join lateral jsonb_array_elements(coalesce(character.body -> 'resources', '[]'::jsonb))
                        with ordinality as resource(value, ordinality)
                      where character.id = ${before.characterId}
                        and resource.value ->> 'id' = ${before.resourceId}
                    )
                    update character
                    set body = jsonb_set(
                          character.body,
                          array['resources', located.index::text, 'used'],
                          to_jsonb(${before.beforeUsed}::integer),
                          false
                        ),
                        version = character.version + 1,
                        updated_at = now()
                    from located
                    where character.id = located.id
                      and located.current_used = ${before.afterUsed}
                    returning character.id
                  `;
                  if (reverted.length === 0) return yield* undoUnsafe;

                  const updated = yield* markUndone({ id, accountId: dm.actor.accountId }).pipe(
                    Effect.catchTag("NoSuchElementError", Effect.die),
                  );
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "hob-resource-undone",
                    encounterRunId: runId,
                    combatantId: before.combatantId ?? undefined,
                    payload: { updateId: id, resourceId: before.resourceId },
                  });
                  return updated;
                }),
              )
              .pipe(Effect.tap(() => ring(sessionId))),
          ),
      };
    }),
  );
}
