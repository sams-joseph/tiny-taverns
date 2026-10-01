import {
  Actor,
  CampaignId,
  CharacterId,
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
import { SqlClient, SqlSchema, type Statement } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { appendEvent } from "./SessionEvents.js";
import {
  arrayParam,
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  timestampColumns,
} from "./rows.js";
import { RUN } from "./liveTables.js";
import {
  campaignReadable,
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

      // The run pointer goes through the run predicate for the reason
      // `sessionColumns` gives: a roll made while a hidden fight is on the
      // table must not tell a player that fight exists.
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
        character_roll.mode, character_roll.critical, character_roll.request_id,
        character_roll.visibility, character_roll.origin, character_roll.assistant_turn_id,
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

                  if (payload.characterId === undefined) {
                    if (!night.mayDmRoll) {
                      return yield* new NotFound({ resource: "character", id: "dm-roll" });
                    }
                  } else {
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

                  const rows = yield* sql<{ readonly id: RollId }>`
                    insert into character_roll ${sql.insert(
                      defined({
                        campaign_id: campaignId,
                        session_id: night.sessionId,
                        encounter_run_id: night.runId,
                        account_id: actor.accountId,
                        character_id: payload.characterId,
                        label: payload.label,
                        notation: payload.notation,
                        dice: arrayParam(payload.dice),
                        kept: arrayParam(payload.kept),
                        modifier: payload.modifier,
                        total: payload.total,
                        mode: payload.mode,
                        critical: payload.critical ?? null,
                        request_id: payload.requestId,
                        visibility: night.sessionVisibility,
                      }),
                    )}
                    on conflict do nothing
                    returning character_roll.id
                  `;
                  if (rows.length === 0 && payload.requestId !== undefined) {
                    const seen = yield* existing(campaignId, night.sessionId, payload.requestId);
                    if (seen !== undefined) return { roll: seen, inserted: false };
                  }
                  const roll = yield* made({ campaignId, id: rows[0]!.id }).pipe(
                    Effect.catchTag("NoSuchElementError", Effect.die),
                  );
                  yield* appendEvent(sql, {
                    sessionId: night.sessionId,
                    kind: "roll-made",
                    encounterRunId: night.runId ?? undefined,
                    characterId: payload.characterId,
                    payload: { rollId: roll.id, total: roll.total },
                    visibility: roll.visibility,
                  });
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
