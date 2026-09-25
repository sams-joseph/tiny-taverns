import {
  type Actor,
  type BattleMapGrid,
  type CampaignCharacterId,
  type CampaignId,
  type CharacterId,
  type CombatantId,
  Conflict,
  CurrentActor,
  type EncounterRunId,
  type InitiativeSetBy,
  NotFound,
  PlayerLiveTable,
  type PlayerLiveBoard,
  type PlayerLiveCombatant,
  type PlayerLiveHpBand,
  type PlayerLiveSeat,
  type PlayerLiveToken,
  type PlayerLiveTurn,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { imageSigner } from "../images/ImageUrls.js";
import { LiveEvents } from "../live/LiveEvents.js";
import {
  type BattleMapImageColumns,
  battleMapImageColumns,
  battleMapImages,
} from "./BattleMaps.js";
import { portraitImages, portraitSigner, seatedPortraitColumn } from "./Characters.js";
import { type EncounterRunRow, runColumns } from "./EncounterRuns.js";
import { boardShown, COMBATANT, initiativeOrder, RUNS, tokenShown } from "./liveTables.js";
import { dieOnSqlError } from "./rows.js";
import { appendEvent } from "./SessionEvents.js";
import {
  containedRowReadable,
  ensureCampaignReadable,
  nestedRowReadable,
  ownSeatedCombatant,
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
  readonly initiative: number | null;
  /** Selected only for the asker's own row; `null` on every other. */
  readonly initiative_bonus: number | null;
  /** Selected only for the asker's own row; `null` on every other. */
  readonly initiative_set_by: InitiativeSetBy | null;
  readonly kind: "pc" | "npc";
  readonly conditions: ReadonlyArray<string>;
  readonly hp_current: number;
  readonly hp_max: number;
  readonly temp_hp: number;
  readonly hp_band: PlayerLiveHpBand;
  /** `seatedPortraitColumn`: the asker's own seat or a shared one, else `null`. */
  readonly portrait_id: string | null;
  /** Null together, and null unless this row's token is on the player's board. */
  readonly token_column: number | null;
  readonly token_row: number | null;
}

/** The fight's board as a player may see it: the grid and the picture, no setting. */
interface PlayerBoardRow extends BattleMapImageColumns {
  readonly grid: BattleMapGrid;
  readonly board_columns: number;
  readonly board_rows: number;
  readonly feet_per_cell: number;
  readonly cell_px: number;
  readonly offset_x_px: number;
  readonly offset_y_px: number;
}

/**
 * What is on one table right now, to somebody sitting at it.
 *
 * A campaign membership is eligibility. **An active `campaign_character` row is
 * table presence**, and that is why this endpoint returns `null` to a member
 * with no seat instead of treating `combatant.character_id` as enough. Every
 * combatant in the player order is either an NPC row the DM shared or a PC row
 * that still has an active seat in this campaign.
 *
 * **The board** is selected only while the fight is shared and the DM has
 * turned on *Share map* (`0067_run_map_sharing.ts`), and never its setting
 * line. A token is a position selected beside a row of the order under the
 * same condition, and not at all for an NPC while hostile tokens are hidden,
 * so a row the order drops takes its token with it.
 */
export class PlayerTable extends Context.Service<
  PlayerTable,
  {
    readonly read: (
      campaignId: CampaignId,
    ) => Effect.Effect<PlayerLiveTable | null, NotFound, CurrentActor>;
    /**
     * Enter your own character's initiative, from your Table.
     *
     * Reaches one row: the combatant `ownSeatedCombatant` allows, in the named
     * fight. Anything else is `NotFound`, the answer the read gives.
     *
     * **When it is refused as a `Conflict`**, both states the player can see on
     * their own table: the fight is not rolling initiative (it has begun, or
     * it is over), or the DM has already written this number. The rule is
     * `combatant.initiative_set_by`: a player may enter a number where there
     * is none, and change one they entered themselves, until the DM writes
     * one — after that the DM's number stands, and nothing the player sends
     * overwrites it. The DM can always overwrite the player's.
     */
    readonly setInitiative: (
      campaignId: CampaignId,
      runId: EncounterRunId,
      combatantId: CombatantId,
      initiative: number,
    ) => Effect.Effect<void, NotFound | Conflict, CurrentActor>;
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
      const live = yield* LiveEvents;
      const sign = yield* portraitSigner;
      const signMap = yield* imageSigner;

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
            initiativeBonus: row.initiative_bonus,
            initiativeSetBy: row.initiative_set_by,
            hpCurrent: row.hp_current,
            hpMax: row.hp_max,
            tempHp: row.temp_hp,
            conditions: row.conditions,
            portrait: portraitImages(row.portrait_id, sign),
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
            portrait: portraitImages(row.portrait_id, sign),
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

              // `runColumns`, so the fight names no encounter this player may
              // not read — its id is how the screen finds the read-aloud.
              const runs = yield* sql<EncounterRunRow>`
                select ${runColumns(sql, campaignId, actor)}
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

              // The picture is joined through the board's pointer only to a
              // map in this campaign, so the pointer grants nothing outside it.
              const boards = yield* sql<PlayerBoardRow>`
                select encounter_run_board.grid, encounter_run_board.board_columns,
                       encounter_run_board.board_rows, encounter_run_board.feet_per_cell,
                       encounter_run_board.cell_px, encounter_run_board.offset_x_px,
                       encounter_run_board.offset_y_px,
                       ${battleMapImageColumns(sql)}
                from encounter_run_board
                join encounter_run on encounter_run.id = encounter_run_board.run_id
                left join battle_map on battle_map.id = encounter_run_board.map_id
                  and battle_map.campaign_id = ${campaignId}
                where encounter_run_board.run_id = ${run.id}
                  and ${boardShown(sql)}
              `;
              const board = boards[0];

              const rows = yield* sql<LiveCombatantRow>`
                select combatant.id,
                       combatant.character_id,
                       seated.id as campaign_character_id,
                       own_seated.id as own_campaign_character_id,
                       combatant.display_name,
                       combatant.subtitle,
                       combatant.player_name,
                       combatant.initiative,
                       case when own_seated.id is not null
                         then combatant.initiative_bonus end as initiative_bonus,
                       case when own_seated.id is not null
                         then combatant.initiative_set_by end as initiative_set_by,
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
                       end as hp_band,
                       ${seatedPortraitColumn(sql, sql("combatant.character_id"), campaignId, actor)},
                       case when ${tokenShown(sql)} then combatant.board_column end as token_column,
                       case when ${tokenShown(sql)} then combatant.board_row end as token_row
                from combatant
                join encounter_run on encounter_run.id = combatant.encounter_run_id
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
                  -- A conversation, a skill challenge or a hazard has no
                  -- initiative order to show: only the asker's own rows are
                  -- read, for their seats, and nobody else's at all.
                  and (${run.mode} = 'combat' or own_seated.id is not null)
                ${initiativeOrder(sql)}
              `;
              const tokens: Array<PlayerLiveToken> = [];
              const present = rows.flatMap((row) => {
                const combatant = toOrder(row);
                if (combatant === undefined) return [];
                if (row.token_column !== null && row.token_row !== null) {
                  tokens.push({
                    combatantId: row.id,
                    position: { column: row.token_column, row: row.token_row },
                  });
                }
                return [combatant];
              });
              const order = run.mode === "combat" ? present : [];
              const upNextRow = order.find((row) => row.combatantId === run.active_combatant_id);
              const upNext: PlayerLiveTurn | null =
                upNextRow === undefined
                  ? null
                  : { combatantId: upNextRow.combatantId, displayName: upNextRow.displayName };
              const seats: ReadonlyArray<PlayerLiveSeat> = present.flatMap((row) =>
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
                  mode: run.mode,
                  round: run.round,
                  phase: run.phase,
                  upNext,
                  seats,
                  order,
                  board:
                    board === undefined
                      ? null
                      : ({
                          grid: board.grid,
                          columns: board.board_columns,
                          rows: board.board_rows,
                          feetPerCell: board.feet_per_cell,
                          alignment: {
                            cellPx: board.cell_px,
                            offsetXPx: board.offset_x_px,
                            offsetYPx: board.offset_y_px,
                          },
                          image: battleMapImages(board, signMap),
                          tokens,
                        } satisfies PlayerLiveBoard),
                },
              });
            }),
          ),

        setInitiative: (campaignId, runId, combatantId, initiative) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);

              const sessionId = yield* sql.withTransaction(
                Effect.gen(function* () {
                  // The row, locked, through the one predicate that says which
                  // row a player may write — and only in the fight on this
                  // table tonight: the campaign's current night, as the read.
                  const rows = yield* sql<{
                    readonly session_id: SessionId;
                    readonly phase: "initiative" | "turns";
                    readonly ended_at: Date | null;
                    readonly initiative_set_by: InitiativeSetBy | null;
                    readonly character_id: CharacterId;
                  }>`
                    select encounter_run.session_id, encounter_run.phase, encounter_run.ended_at,
                           combatant.initiative_set_by, combatant.character_id
                    from combatant
                    join encounter_run on encounter_run.id = combatant.encounter_run_id
                    where combatant.id = ${combatantId}
                      and combatant.encounter_run_id = ${runId}
                      and encounter_run.session_id = (
                            select campaign.current_session_id from campaign
                            where campaign.id = ${campaignId}
                          )
                      and ${ownSeatedCombatant(sql, COMBATANT, campaignId, actor)}
                    for update of combatant, encounter_run
                  `;
                  const row = rows[0];
                  if (row === undefined) {
                    return yield* new NotFound({ resource: "combatant", id: combatantId });
                  }
                  if (row.ended_at !== null || row.phase !== "initiative") {
                    return yield* new Conflict({
                      message: "this fight is not rolling initiative; tell your DM your number",
                    });
                  }
                  if (row.initiative_set_by === "dm") {
                    return yield* new Conflict({
                      message: "your DM has already written your initiative",
                    });
                  }

                  yield* sql`
                    update combatant
                    set initiative = ${initiative}, initiative_set_by = 'player', updated_at = now()
                    where combatant.id = ${combatantId}
                  `;
                  // The row and the fight are both shared — the predicate
                  // above read them — so the line is too, and it rings every
                  // seated player's doorbell as well as the DM's.
                  yield* appendEvent(sql, {
                    sessionId: row.session_id,
                    kind: "combatant-updated",
                    encounterRunId: runId,
                    combatantId,
                    characterId: row.character_id,
                    payload: { initiative, setBy: "player" },
                    visibility: "shared",
                  });
                  return row.session_id;
                }),
              );
              yield* live.touched(sessionId);
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
