import {
  type Actor,
  type CampaignId,
  type CharacterId,
  Conflict,
  CurrentActor,
  type EncounterRunId,
  NotFound,
  Roll,
  type RollCreate,
  type RollId,
  type RollListFilterValues,
  type RollMode,
  type RollCritical,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Option } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { appendEvent } from "./SessionEvents.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf } from "./rows.js";
import { campaignReadable, campaignWritableById, ensureCampaignReadable } from "./visibility.js";

interface RollRow extends ProvenanceColumns {
  readonly id: RollId;
  readonly campaign_id: CampaignId;
  readonly session_id: SessionId;
  readonly encounter_run_id: EncounterRunId | null;
  readonly account_id: Actor["accountId"];
  readonly account_name: string;
  readonly character_id: CharacterId | null;
  readonly character_name: string | null;
  readonly label: string;
  readonly notation: string;
  readonly dice: ReadonlyArray<number>;
  readonly kept: ReadonlyArray<number>;
  readonly modifier: number;
  readonly total: number;
  readonly mode: RollMode;
  readonly critical: RollCritical | null;
  readonly request_id: string | null;
}

interface CurrentNightRow {
  readonly session_id: SessionId | null;
  readonly run_id: EncounterRunId | null;
  readonly session_visibility: "dm" | "shared" | null;
  readonly may_dm_roll: boolean;
}

const toRoll = (row: RollRow): Roll =>
  new Roll({
    id: row.id,
    campaignId: row.campaign_id,
    sessionId: row.session_id,
    encounterRunId: row.encounter_run_id,
    accountId: row.account_id,
    accountName: row.account_name,
    characterId: row.character_id,
    characterName: row.character_name,
    label: row.label,
    notation: row.notation,
    dice: row.dice,
    kept: row.kept,
    modifier: row.modifier,
    total: row.total,
    mode: row.mode,
    critical: row.critical,
    requestId: row.request_id,
    ...provenanceOf(row),
  });

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

      const currentNight = (
        campaignId: CampaignId,
        actor: Actor,
      ): Effect.Effect<CurrentNightRow, NotFound> =>
        sql<CurrentNightRow>`
          select campaign.current_session_id as session_id,
                 session.active_encounter_run_id as run_id,
                 session.visibility as session_visibility,
                 (${campaignWritableById(sql, campaignId, actor)}) as may_dm_roll
          from campaign
          left join session on session.id = campaign.current_session_id
          where campaign.id = ${campaignId} and ${campaignReadable(sql, actor, campaignId)}
        `.pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows.length === 0
              ? new NotFound({ resource: "campaign", id: campaignId })
              : Effect.succeed(rows[0]!),
          ),
        );

      const selectRoll = sql`
        character_roll.*, account.name as account_name, character.name as character_name
        from character_roll
        join account on account.id = character_roll.account_id
        left join character on character.id = character_roll.character_id
      `;

      const existing = (
        sessionId: SessionId,
        accountId: Actor["accountId"],
        requestId: string,
      ): Effect.Effect<Roll | undefined> =>
        sql<RollRow>`
          select ${selectRoll}
          where character_roll.session_id = ${sessionId}
            and character_roll.account_id = ${accountId}
            and character_roll.request_id = ${requestId}
          limit 1
        `.pipe(
          Effect.map((rows) => (rows[0] === undefined ? undefined : toRoll(rows[0]))),
          Effect.orDie,
        );

      return {
        create: (campaignId, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const result = yield* sql.withTransaction(
                Effect.gen(function* () {
                  const night = yield* currentNight(campaignId, actor);
                  if (night.session_id === null || night.session_visibility === null) {
                    return yield* noOpenNight;
                  }

                  if (payload.characterId === undefined) {
                    if (!night.may_dm_roll) {
                      return yield* new NotFound({ resource: "character", id: "dm-roll" });
                    }
                  } else if (!(yield* canRollCharacter(campaignId, payload.characterId, actor))) {
                    return yield* new NotFound({ resource: "character", id: payload.characterId });
                  }

                  if (payload.requestId !== undefined) {
                    const seen = yield* existing(
                      night.session_id,
                      actor.accountId,
                      payload.requestId,
                    );
                    if (seen !== undefined) return { roll: seen, inserted: false };
                  }

                  const rows = yield* sql<RollRow>`
                    insert into character_roll ${sql.insert(
                      defined({
                        campaign_id: campaignId,
                        session_id: night.session_id,
                        encounter_run_id: night.run_id,
                        account_id: actor.accountId,
                        character_id: payload.characterId,
                        label: payload.label,
                        notation: payload.notation,
                        dice: payload.dice,
                        kept: payload.kept,
                        modifier: payload.modifier,
                        total: payload.total,
                        mode: payload.mode,
                        critical: payload.critical ?? null,
                        request_id: payload.requestId,
                        visibility: night.session_visibility,
                      }),
                    )}
                    on conflict do nothing
                    returning *
                  `;
                  if (rows.length === 0 && payload.requestId !== undefined) {
                    const seen = yield* existing(
                      night.session_id,
                      actor.accountId,
                      payload.requestId,
                    );
                    if (seen !== undefined) return { roll: seen, inserted: false };
                  }
                  const fetched = yield* sql<RollRow>`
                    select ${selectRoll}
                    where character_roll.id = ${rows[0]!.id}
                  `;
                  const roll = toRoll(fetched[0]!);
                  yield* appendEvent(sql, {
                    sessionId: night.session_id,
                    kind: "roll-made",
                    encounterRunId: night.run_id ?? undefined,
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
              const rows = yield* sql<RollRow>`
                select ${selectRoll}
                where character_roll.session_id = ${sessionId}
                  and ${rollReadable(sql, campaignId, actor)}
                order by character_roll.created_at desc, character_roll.id desc
                limit ${filter.limit ?? 12}
              `;
              return rows.map(toRoll);
            }),
          ),

        findById: (campaignId, sessionId, rollId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<RollRow>`
                select ${selectRoll}
                where character_roll.id = ${rollId}
                  and character_roll.session_id = ${sessionId}
                  and ${rollReadable(sql, campaignId, actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "roll", id: rollId });
              return toRoll(rows[0]!);
            }),
          ),
      };
    }),
  );
}
