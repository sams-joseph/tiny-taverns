import {
  Actor,
  CampaignId,
  CharacterId,
  CombatantId,
  Conflict,
  CurrentActor,
  EncounterRunId,
  NotFound,
  Roll,
  type RollCreate,
  RollId,
  type RollListFilterValues,
  SessionId,
  Visibility,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient, type SqlError, SqlSchema, type Statement } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { appendEvent } from "./SessionEvents.js";
import {
  type AssistantOrigin,
  assistantColumns,
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  intArray,
  orNotFound,
  timestampColumns,
} from "./rows.js";
import { COMBATANT, fightLive, hiddenByFog, RUN } from "./liveTables.js";
import {
  campaignReadable,
  containedChildWritable,
  containedRowReadable,
  campaignWritableById,
  ensureCampaignReadable,
  rowReadable,
} from "./visibility.js";

/**
 * A `character_roll` row as the wire reads it, decoded off `selectRoll`: the
 * roller's name and the character's are joined, and the run pointer is
 * narrowed in SQL.
 */
const RollRow = classFromColumns(Roll, { ...Roll.fields, ...timestampColumns });

/**
 * The campaign's open night as a roll reads it: the night and its live fight,
 * who the night is shown to, and whether this actor may roll as the DM.
 */
const CurrentNightRow = fromColumns(
  Schema.Struct({
    sessionId: Schema.NullOr(SessionId),
    runId: Schema.NullOr(EncounterRunId),
    sessionVisibility: Schema.NullOr(Visibility),
    mayDmRoll: Schema.Boolean,
  }),
);

const noOpenNight = new Conflict({ message: "nobody is playing at that table right now" });

const rollReadable = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([
    sql`character_roll.campaign_id = ${campaignId}`,
    sql`exists (select 1 from campaign where campaign.id = character_roll.campaign_id and ${campaignReadable(sql, actor, campaignId)})`,
    sql.or([
      campaignWritableById(sql, campaignId, actor),
      sql`character_roll.visibility = 'shared'`,
      sql`character_roll.account_id = ${actor.accountId}`,
    ]),
  ]);

/**
 * **One roll filed**, and its `roll-made` line, in the caller's transaction:
 * the insert `rolls.create` makes for a browser's roll, and the one a kept
 * Hob turn makes for each die the server rolled (`repo/NpcTurns.ts`), which
 * names the turn (`origin = 'assistant'`). Who may file it, under which night
 * and fight, is the caller's to have proved. Answers the new row's id, or
 * `undefined` when a repeated `requestId` wrote nothing.
 */
export const fileRoll = (
  sql: SqlClient.SqlClient,
  roll: Omit<RollCreate, "visibility" | "characterId"> & {
    readonly campaignId: CampaignId;
    readonly sessionId: SessionId;
    readonly runId: EncounterRunId | null;
    readonly accountId: Actor["accountId"];
    readonly characterId?: CharacterId | undefined;
    readonly visibility: Visibility;
    readonly from?: AssistantOrigin | undefined;
  },
): Effect.Effect<RollId | undefined, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly id: RollId }>`
      insert into character_roll ${sql.insert(
        defined({
          campaign_id: roll.campaignId,
          session_id: roll.sessionId,
          encounter_run_id: roll.runId,
          account_id: roll.accountId,
          character_id: roll.characterId,
          label: roll.label,
          notation: roll.notation,
          dice: intArray(roll.dice),
          kept: intArray(roll.kept),
          modifier: roll.modifier,
          total: roll.total,
          mode: roll.mode,
          critical: roll.critical ?? null,
          kind: roll.kind,
          combatant_id: roll.combatantId,
          target_combatant_id: roll.targetCombatantId,
          target_ac: roll.targetAc,
          outcome: roll.outcome,
          delivery: roll.delivery,
          damage_type: roll.damageType,
          request_id: roll.requestId,
          visibility: roll.visibility,
          ...assistantColumns(roll.from),
        }),
      )}
      on conflict do nothing
      returning character_roll.id
    `;
    const id = rows[0]?.id;
    if (id === undefined) return undefined;
    if (roll.from !== undefined) {
      // A kept turn files all its dice in one transaction, where `now()` is
      // one instant; the clock keeps them in the order they were thrown.
      yield* sql`update character_roll set created_at = clock_timestamp() where id = ${id}`;
    }
    yield* appendEvent(sql, {
      sessionId: roll.sessionId,
      kind: "roll-made",
      encounterRunId: roll.runId ?? undefined,
      characterId: roll.characterId,
      payload: { rollId: id, total: roll.total },
      visibility: roll.visibility,
      ...(roll.from === undefined
        ? {}
        : { origin: "assistant" as const, assistantTurnId: roll.from.assistantTurnId }),
    });
    return id;
  });

export class Rolls extends Context.Service<
  Rolls,
  {
    readonly create: (
      campaignId: CampaignId,
      payload: RollCreate,
    ) => Effect.Effect<Roll, NotFound | Conflict, CurrentActor>;
    readonly list: (
      campaignId: CampaignId,
      sessionId: SessionId,
      filter: RollListFilterValues,
    ) => Effect.Effect<ReadonlyArray<Roll>, NotFound, CurrentActor>;
    readonly findById: (
      campaignId: CampaignId,
      sessionId: SessionId,
      rollId: RollId,
    ) => Effect.Effect<Roll, NotFound, CurrentActor>;
    readonly listForCharacter: (
      campaignId: CampaignId,
      sessionId: SessionId,
      characterId: CharacterId,
      filter: RollListFilterValues,
    ) => Effect.Effect<ReadonlyArray<Roll>, NotFound, CurrentActor>;
  }
>()("Rolls") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* Effect.serviceOption(LiveEvents);

      /**
       * Whether this actor may point a roll at this combatant: one of the fight
       * on the table tonight, which only the creator writes. The insert's
       * composite key holds the same rule against the roll's run.
       */
      const canNameCombatant = (
        campaignId: CampaignId,
        runId: EncounterRunId | null,
        combatantId: CombatantId,
        actor: Actor,
      ): Effect.Effect<boolean> =>
        runId === null
          ? Effect.succeed(false)
          : sql<{ readonly id: string }>`
              select combatant.id from combatant
              where combatant.id = ${combatantId}
                and ${containedChildWritable(sql, COMBATANT, runId, campaignId, actor)}
            `.pipe(
              Effect.map((rows) => rows.length > 0),
              Effect.orDie,
            );

      const canRollCharacter = (
        campaignId: CampaignId,
        characterId: CharacterId,
        actor: Actor,
      ): Effect.Effect<boolean> =>
        sql<{ readonly id: string }>`
          select campaign_character.id
          from campaign_character
          where campaign_character.campaign_id = ${campaignId}
            and campaign_character.character_id = ${characterId}
            and campaign_character.account_id = ${actor.accountId}
            and campaign_character.left_at is null
          limit 1
        `.pipe(
          Effect.map((rows) => rows.length > 0),
          Effect.orDie,
        );

      const nightOf = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, actor: Actor })),
        Result: CurrentNightRow,
        execute: ({ campaignId, actor }) => sql`
          select campaign.current_session_id as session_id,
                 session.active_encounter_run_id as run_id,
                 session.visibility as session_visibility,
                 (${campaignWritableById(sql, campaignId, actor)}) as may_dm_roll
          from campaign
          left join session on session.id = campaign.current_session_id
          where campaign.id = ${campaignId} and ${campaignReadable(sql, actor, campaignId)}
        `,
      });
      const currentNight = (
        campaignId: CampaignId,
        actor: Actor,
      ): Effect.Effect<typeof CurrentNightRow.Type, NotFound> =>
        nightOf({ campaignId, actor }).pipe(orNotFound("campaign", campaignId), dieOnSqlError);

      /**
       * Whether this reader may be told the roll's combatant in this column:
       * through the combatant's own predicate and, while its fight is live, not
       * hidden by fog (`liveTables.ts`' `hiddenByFog`: a creature under it, not
       * an ally the reader may see), as the player's order reads it.
       */
      const combatantNamed = (column: string, campaignId: CampaignId, actor: Actor) => sql`
        exists (
          select 1 from combatant
          join encounter_run on encounter_run.id = combatant.encounter_run_id
          where combatant.id = ${sql(`character_roll.${column}`)}
            and ${containedRowReadable(sql, COMBATANT, campaignId, actor)}
            and (${campaignWritableById(sql, campaignId, actor)}
              or not ${fightLive(sql)}
              or not ${hiddenByFog(sql, campaignId, actor)})
        )
      `;
      const combatantPointer = (column: string, campaignId: CampaignId, actor: Actor) => sql`
        case when ${combatantNamed(column, campaignId, actor)}
          then ${sql(`character_roll.${column}`)} end
      `;

      // The run pointer goes through the run predicate for the reason
      // `sessionColumns` gives: a roll made while a hidden fight is on the
      // table must not tell a player that fight exists. The combatant pointers
      // go through theirs, so a shared roll never names a hidden creature. A
      // player reads the target's AC only of a player character they may be
      // told is the target; a creature's AC is the DM's.
      const selectRoll = (campaignId: CampaignId, actor: Actor) => sql`
        character_roll.id, character_roll.campaign_id, character_roll.session_id,
        case when exists (
          select 1 from encounter_run
          where encounter_run.id = character_roll.encounter_run_id
            and ${containedRowReadable(sql, RUN, campaignId, actor)}
        ) then character_roll.encounter_run_id end as encounter_run_id,
        character_roll.account_id, character_roll.character_id,
        character_roll.label, character_roll.notation, character_roll.dice,
        character_roll.kept, character_roll.modifier, character_roll.total,
        character_roll.mode, character_roll.critical, character_roll.kind,
        ${combatantPointer("combatant_id", campaignId, actor)} as combatant_id,
        ${combatantPointer("target_combatant_id", campaignId, actor)} as target_combatant_id,
        case when ${campaignWritableById(sql, campaignId, actor)}
          or (${combatantNamed("target_combatant_id", campaignId, actor)}
            and exists (
              select 1 from combatant
              where combatant.id = character_roll.target_combatant_id
                and combatant.kind = 'pc'
            ))
          then character_roll.target_ac end as target_ac,
        character_roll.outcome, character_roll.delivery, character_roll.damage_type,
        character_roll.request_id,
        character_roll.visibility, character_roll.origin, character_roll.assistant_turn_id,
        character_roll.undone_at,
        character_roll.created_at, character_roll.updated_at,
        account.name as account_name, character.name as character_name
        from character_roll
        join account on account.id = character_roll.account_id
        left join character on character.id = character_roll.character_id
      `;

      /** The roll a retried request made the first time, if it made one. */
      const requested = SqlSchema.findOneOption({
        Request: Schema.toType(
          Schema.Struct({ campaignId: CampaignId, sessionId: SessionId, requestId: Schema.String }),
        ),
        Result: RollRow,
        execute: ({ campaignId, sessionId, requestId }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${selectRoll(campaignId, actor)}
              where character_roll.session_id = ${sessionId}
                and character_roll.account_id = ${actor.accountId}
                and character_roll.request_id = ${requestId}
              limit 1
            `,
          ),
      });
      const existing = (campaignId: CampaignId, sessionId: SessionId, requestId: string) =>
        Effect.map(requested({ campaignId, sessionId, requestId }), Option.getOrUndefined);
      /** A roll just made, by id: the insert beside it is the only gate it needs. */
      const made = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, id: RollId })),
        Result: RollRow,
        execute: ({ campaignId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${selectRoll(campaignId, actor)}
              where character_roll.id = ${id}
            `,
          ),
      });
      /** A night's rolls this actor may read, newest first. */
      const ofNight = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({ campaignId: CampaignId, sessionId: SessionId, limit: Schema.Int }),
        ),
        Result: RollRow,
        execute: ({ campaignId, sessionId, limit }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${selectRoll(campaignId, actor)}
              where character_roll.session_id = ${sessionId}
                and ${rollReadable(sql, campaignId, actor)}
              order by character_roll.created_at desc, character_roll.id desc
              limit ${limit}
            `,
          ),
      });
      /** A night's rolls of one of this actor's own seated characters, newest first. */
      const ofCharacter = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({
            campaignId: CampaignId,
            sessionId: SessionId,
            characterId: CharacterId,
            limit: Schema.Int,
          }),
        ),
        Result: RollRow,
        execute: ({ campaignId, sessionId, characterId, limit }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${selectRoll(campaignId, actor)}
              where character_roll.campaign_id = ${campaignId}
                and character_roll.session_id = ${sessionId}
                and character_roll.character_id = ${characterId}
                and character_roll.account_id = ${actor.accountId}
              order by character_roll.created_at desc, character_roll.id desc
              limit ${limit}
            `,
          ),
      });
      const readable = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ campaignId: CampaignId, sessionId: SessionId, id: RollId }),
        ),
        Result: RollRow,
        execute: ({ campaignId, sessionId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${selectRoll(campaignId, actor)}
              where character_roll.id = ${id}
                and character_roll.session_id = ${sessionId}
                and ${rollReadable(sql, campaignId, actor)}
            `,
          ),
      });

      return {
        create: (campaignId, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const result = yield* sql.withTransaction(
                Effect.gen(function* () {
                  const night = yield* currentNight(campaignId, actor);
                  if (night.sessionId === null || night.sessionVisibility === null) {
                    return yield* noOpenNight;
                  }

                  // The DM's own roll is theirs alone: its label may carry a
                  // monster's name, which a shared night would tell everyone.
                  const dmOnly = payload.characterId === undefined || payload.visibility === "dm";
                  if (dmOnly && !night.mayDmRoll) {
                    return yield* new NotFound({ resource: "character", id: "dm-roll" });
                  }
                  if (payload.characterId !== undefined) {
                    if (!night.mayDmRoll && night.sessionVisibility !== "shared") {
                      return yield* noOpenNight;
                    }
                    if (!(yield* canRollCharacter(campaignId, payload.characterId, actor))) {
                      return yield* new NotFound({
                        resource: "character",
                        id: payload.characterId,
                      });
                    }
                  }

                  if (payload.requestId !== undefined) {
                    const seen = yield* existing(campaignId, night.sessionId, payload.requestId);
                    if (seen !== undefined) return { roll: seen, inserted: false };
                  }

                  for (const combatantId of [payload.combatantId, payload.targetCombatantId]) {
                    if (combatantId === undefined) continue;
                    if (!(yield* canNameCombatant(campaignId, night.runId, combatantId, actor))) {
                      return yield* new NotFound({ resource: "combatant", id: combatantId });
                    }
                  }

                  const id = yield* fileRoll(sql, {
                    ...payload,
                    campaignId,
                    sessionId: night.sessionId,
                    runId: night.runId,
                    accountId: actor.accountId,
                    visibility: dmOnly ? "dm" : night.sessionVisibility,
                  });
                  if (id === undefined) {
                    const seen =
                      payload.requestId === undefined
                        ? undefined
                        : yield* existing(campaignId, night.sessionId, payload.requestId);
                    if (seen !== undefined) return { roll: seen, inserted: false };
                    return yield* Effect.die(new Error("a roll insert wrote nothing"));
                  }
                  const roll = yield* made({ campaignId, id }).pipe(
                    Effect.catchTag("NoSuchElementError", Effect.die),
                  );
                  return { roll, inserted: true };
                }),
              );
              if (result.inserted) {
                yield* Option.match(live, {
                  onNone: () => Effect.void,
                  onSome: (events) => events.touched(result.roll.sessionId),
                });
              }
              return result.roll;
            }),
          ),

        list: (campaignId, sessionId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              return yield* ofNight({ campaignId, sessionId, limit: filter.limit ?? 12 });
            }),
          ),

        listForCharacter: (campaignId, sessionId, characterId, filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const seats = yield* sql<{ readonly id: string }>`
                select campaign_character.id
                from campaign_character
                where campaign_character.campaign_id = ${campaignId}
                  and campaign_character.character_id = ${characterId}
                  and campaign_character.account_id = ${actor.accountId}
                  and campaign_character.left_at is null
                limit 1
              `;
              if (seats.length === 0) {
                return yield* new NotFound({ resource: "character", id: characterId });
              }
              const sessions = yield* sql<{ readonly id: SessionId }>`
                select session.id from session
                join campaign on campaign.current_session_id = session.id
                where campaign.id = ${campaignId}
                  and session.id = ${sessionId}
                  and ${rowReadable(sql, "session", campaignId, actor)}
                limit 1
              `;
              if (sessions.length === 0) {
                return yield* new NotFound({ resource: "session", id: sessionId });
              }
              return yield* ofCharacter({
                campaignId,
                sessionId,
                characterId,
                limit: filter.limit ?? 12,
              });
            }),
          ),

        findById: (campaignId, sessionId, rollId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              return yield* readable({ campaignId, sessionId, id: rollId }).pipe(
                orNotFound("roll", rollId),
              );
            }),
          ),
      };
    }),
  );
}
