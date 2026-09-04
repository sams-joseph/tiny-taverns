import {
  type Actor,
  type CampaignCharacterId,
  type CampaignId,
  type CharacterId,
  type CombatantId,
  CurrentActor,
  type EncounterId,
  type EncounterRunId,
  NotFound,
  PlayerLiveTable,
  type PlayerLiveCombatant,
  type PlayerLiveHpBand,
  type PlayerLiveSeat,
  type PlayerLiveTurn,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { COMBATANT, RUNS } from "./liveTables.js";
import { dieOnSqlError } from "./rows.js";
import {
  containedRowReadable,
  ensureCampaignReadable,
  nestedRowReadable,
  rowReadable,
} from "./visibility.js";

interface ActiveSeatRow {
  readonly id: CampaignCharacterId;
  readonly character_id: CharacterId;
}

interface LiveCombatantRow {
  readonly id: CombatantId;
  readonly character_id: CharacterId | null;
  readonly campaign_character_id: CampaignCharacterId | null;
  readonly own_campaign_character_id: CampaignCharacterId | null;
  readonly display_name: string;
  readonly subtitle: string | null;
  readonly player_name: string | null;
  readonly initiative: number;
  readonly kind: "pc" | "npc";
  readonly conditions: ReadonlyArray<string>;
  readonly hp_current: number;
  readonly hp_max: number;
  readonly temp_hp: number;
  readonly hp_band: PlayerLiveHpBand;
}

/**
 * What is on one table right now, to somebody sitting at it.
 *
 * A campaign membership is eligibility. **An active `campaign_character` row is
 * table presence**, and that is why this endpoint returns `null` to a member
 * with no seat instead of treating `combatant.character_id` as enough. Every
 * combatant in the player order is either an NPC row the DM shared or a PC row
 * that still has an active seat in this campaign.
 */
export class PlayerTable extends Context.Service<
  PlayerTable,
  {
    readonly read: (
      campaignId: CampaignId,
    ) => Effect.Effect<PlayerLiveTable | null, NotFound, CurrentActor>;
    /**
     * Contentless player live ticks. The cursor is `session_event.seq`; the
     * event payload is deliberately not returned, and clients re-read the
     * table/log through narrow endpoints.
     */
    readonly ticks: (
      actor: Actor,
      campaignId: CampaignId,
      sessionId: SessionId,
      since: number,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<number>, NotFound>;
  }
>()("PlayerTable") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const activeSeats = (campaignId: CampaignId, actor: Actor) =>
        sql<ActiveSeatRow>`
          select campaign_character.id, campaign_character.character_id
          from campaign_character
          where campaign_character.campaign_id = ${campaignId}
            and campaign_character.account_id = ${actor.accountId}
            and campaign_character.left_at is null
            and campaign_character.character_id is not null
          order by campaign_character.joined_at asc, campaign_character.id asc
        `.pipe(Effect.orDie);

      const currentReadableSession = (campaignId: CampaignId, sessionId: SessionId, actor: Actor) =>
        sql<{ readonly id: SessionId }>`
          select session.id from session
          join campaign on campaign.current_session_id = session.id
          where campaign.id = ${campaignId}
            and session.id = ${sessionId}
            and ${rowReadable(sql, "session", campaignId, actor)}
          limit 1
        `.pipe(Effect.orDie);

      const toOrder = (row: LiveCombatantRow): PlayerLiveCombatant | undefined => {
        if (row.kind === "pc" && row.character_id === null) return undefined;
        if (row.kind === "pc" && row.campaign_character_id === null) return undefined;
        if (row.kind === "pc" && row.own_campaign_character_id !== null) {
          return {
            kind: "you",
            combatantId: row.id,
            characterId: row.character_id!,
            campaignCharacterId: row.own_campaign_character_id,
            displayName: row.display_name,
            subtitle: row.subtitle,
            initiative: row.initiative,
            hpCurrent: row.hp_current,
            hpMax: row.hp_max,
            tempHp: row.temp_hp,
            conditions: row.conditions,
          };
        }
        if (row.kind === "pc") {
          return {
            kind: "ally",
            combatantId: row.id,
            characterId: row.character_id!,
            displayName: row.display_name,
            subtitle: row.subtitle,
            playerName: row.player_name,
            initiative: row.initiative,
            conditions: row.conditions,
          };
        }
        return {
          kind: "npc",
          combatantId: row.id,
          displayName: row.display_name,
          subtitle: row.subtitle,
          initiative: row.initiative,
          hpBand: row.hp_band,
          conditions: row.conditions,
        };
      };

      return {
        read: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);

              const ownSeats = yield* activeSeats(campaignId, actor);
              if (ownSeats.length === 0) return null;

              const sessions = yield* sql<{
                readonly id: SessionId;
                readonly number: number;
              }>`
                select session.id, session.number from session
                where session.id = (
                        select campaign.current_session_id from campaign
                        where campaign.id = ${campaignId}
                      )
                  and ${rowReadable(sql, "session", campaignId, actor)}
              `;
              const session = sessions[0];
              if (session === undefined) return null;

              const runs = yield* sql<{
                readonly id: EncounterRunId;
                readonly encounter_id: EncounterId | null;
                readonly round: number;
                readonly active_combatant_id: CombatantId | null;
              }>`
                select encounter_run.id, encounter_run.encounter_id, encounter_run.round,
                       encounter_run.active_combatant_id
                from encounter_run
                where encounter_run.ended_at is null
                  and ${nestedRowReadable(sql, RUNS, session.id, campaignId, actor)}
                order by encounter_run.started_at desc, encounter_run.id desc
                limit 1
              `;
              const run = runs[0];
              if (run === undefined) {
                return new PlayerLiveTable({
                  campaignId,
                  sessionId: session.id,
                  sessionNumber: session.number,
                  fight: null,
                });
              }

              const rows = yield* sql<LiveCombatantRow>`
                select combatant.id,
                       combatant.character_id,
                       seated.id as campaign_character_id,
                       own_seated.id as own_campaign_character_id,
                       combatant.display_name,
                       combatant.subtitle,
                       combatant.player_name,
                       combatant.initiative,
                       combatant.kind,
                       combatant.conditions,
                       combatant.hp_current,
                       combatant.hp_max,
                       coalesce(character.temp_hp, 0) as temp_hp,
                       case
                         when combatant.kind = 'pc' then 'unknown'
                         when combatant.hp_max <= 0 then 'unknown'
                         when combatant.hp_current <= 0 then 'down'
                         when combatant.hp_current >= combatant.hp_max then 'unhurt'
                         when combatant.hp_current * 2 <= combatant.hp_max then 'bloodied'
                         else 'hurt'
                       end as hp_band
                from combatant
                left join character on character.id = combatant.character_id
                left join campaign_character seated
                  on seated.campaign_id = ${campaignId}
                 and seated.character_id = combatant.character_id
                 and seated.left_at is null
                 and (seated.visibility = 'shared' or seated.account_id = ${actor.accountId})
                left join campaign_character own_seated
                  on own_seated.campaign_id = ${campaignId}
                 and own_seated.character_id = combatant.character_id
                 and own_seated.account_id = ${actor.accountId}
                 and own_seated.left_at is null
                where combatant.encounter_run_id = ${run.id}
                  and ${containedRowReadable(sql, COMBATANT, campaignId, actor)}
                  and (combatant.kind = 'npc' or seated.id is not null)
                order by combatant.initiative desc, combatant.created_at asc, combatant.id asc
              `;
              const order = rows.flatMap((row) => {
                const combatant = toOrder(row);
                return combatant === undefined ? [] : [combatant];
              });
              const upNextRow = order.find((row) => row.combatantId === run.active_combatant_id);
              const upNext: PlayerLiveTurn | null =
                upNextRow === undefined
                  ? null
                  : { combatantId: upNextRow.combatantId, displayName: upNextRow.displayName };
              const seats: ReadonlyArray<PlayerLiveSeat> = order.flatMap((row) =>
                row.kind === "you"
                  ? [
                      {
                        characterId: row.characterId,
                        campaignCharacterId: row.campaignCharacterId,
                        combatantId: row.combatantId,
                      },
                    ]
                  : [],
              );

              return new PlayerLiveTable({
                campaignId,
                sessionId: session.id,
                sessionNumber: session.number,
                fight: {
                  id: run.id,
                  encounterId: run.encounter_id,
                  round: run.round,
                  upNext,
                  seats,
                  order,
                },
              });
            }),
          ),

        ticks: (actor, campaignId, sessionId, since, limit) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureCampaignReadable(sql, campaignId, actor);
              const ownSeats = yield* activeSeats(campaignId, actor);
              if (ownSeats.length === 0) {
                return yield* new NotFound({ resource: "session", id: sessionId });
              }
              const readable = yield* currentReadableSession(campaignId, sessionId, actor);
              if (readable.length === 0) {
                return yield* new NotFound({ resource: "session", id: sessionId });
              }
              const rows = yield* sql<{ readonly seq: string }>`
                select session_event.seq from session_event
                where session_event.session_id = ${sessionId}
                  and session_event.seq > ${since}
                  and session_event.visibility = 'shared'
                order by session_event.seq asc
                limit ${limit}
              `;
              return rows.map((row) => Number(row.seq));
            }),
          ),
      };
    }),
  );
}
