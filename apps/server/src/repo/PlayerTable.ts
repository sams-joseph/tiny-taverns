import {
  Actor,
  CampaignCharacterId,
  CampaignId,
  CharacterId,
  type CombatantId,
  CombatantPosition,
  Conflict,
  CurrentActor,
  EncounterKind,
  EncounterRunId,
  type InitiativeSetBy,
  NotFound,
  PlayerLiveCombatantAlly,
  PlayerLiveCombatantNpc,
  PlayerLiveCombatantYou,
  PlayerLiveTable,
  PlayerLiveBoard,
  type PlayerLiveCombatant,
  type PlayerLiveSeat,
  type PlayerLiveToken,
  type PlayerLiveTurn,
  SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema, Struct } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { type ImageSigner, imageSigner } from "../images/ImageUrls.js";
import { LiveEvents } from "../live/LiveEvents.js";
import {
  alignmentColumn,
  battleMapPicture,
  boardColumns,
  pictureFromColumn,
} from "./BattleMaps.js";
import {
  type PortraitSigner,
  portraitFromId,
  portraitSigner,
  seatedPortraitColumn,
} from "./Characters.js";
import { EncounterRunRow, runColumns } from "./EncounterRuns.js";
import { boardShown, COMBATANT, initiativeOrder, RUNS, tokenShown } from "./liveTables.js";
import { dieOnSqlError, fromColumns } from "./rows.js";
import { playerLiveHitPointColumns } from "./playerCombatant.js";
import { appendEvent } from "./SessionEvents.js";
import {
  containedRowReadable,
  ensureCampaignReadable,
  nestedRowReadable,
  ownSeatedCombatant,
  rowReadable,
} from "./visibility.js";

/** One of the reader's live seats at the table, holding a character. */
const ActiveSeatRow = fromColumns(
  Schema.Struct({ id: CampaignCharacterId, characterId: CharacterId }),
);

/** Where a row's token stands on the player's board, or `null` when it is not on it. */
const token = { token: Schema.NullOr(CombatantPosition) } as const;

/**
 * A row of the player's order, as the union the wire carries — `kind` is
 * worked out in SQL, from whose seat the row is — with its token beside it.
 * The portrait is `seatedPortraitColumn`'s: the asker's own seat or a shared
 * one, else `null`.
 */
const liveCombatantRow = (sign: PortraitSigner | undefined) =>
  Schema.Union([
    fromColumns(
      Schema.Struct({
        ...PlayerLiveCombatantYou.fields,
        portrait: portraitFromId(sign),
        ...token,
      }),
      {
        combatantId: "id",
        campaignCharacterId: "own_campaign_character_id",
        portrait: "portrait_id",
      },
    ),
    fromColumns(
      Schema.Struct({
        ...PlayerLiveCombatantAlly.fields,
        portrait: portraitFromId(sign),
        ...token,
      }),
      { combatantId: "id", portrait: "portrait_id" },
    ),
    fromColumns(Schema.Struct({ ...PlayerLiveCombatantNpc.fields, ...token }), {
      combatantId: "id",
    }),
  ]);

/**
 * The fight's rows as this player may know them: an NPC the DM shared or a PC
 * that still has a live seat here, and the asker's own rows alone when the
 * scene is not a fight. Exported so a test can read the rows the decode is
 * handed, not only what the decode leaves.
 */
export const liveOrderStatement = (
  sql: SqlClient.SqlClient,
  request: {
    readonly campaignId: CampaignId;
    readonly runId: EncounterRunId;
    readonly mode: EncounterKind;
  },
  actor: Actor,
) => {
  const { campaignId, runId, mode } = request;
  return sql`
    select combatant.id,
           case
             when combatant.kind = 'npc' then 'npc'
             when own_seated.id is not null then 'you'
             else 'ally'
           end as kind,
           combatant.character_id,
           own_seated.id as own_campaign_character_id,
           combatant.display_name,
           combatant.subtitle,
           combatant.player_name,
           combatant.initiative,
           case when own_seated.id is not null
             then combatant.initiative_bonus end as initiative_bonus,
           case when own_seated.id is not null
             then combatant.initiative_set_by end as initiative_set_by,
           combatant.conditions,
           ${playerLiveHitPointColumns(sql, sql("own_seated.id"))},
           ${seatedPortraitColumn(sql, sql("combatant.character_id"), campaignId, actor)},
           case when ${tokenShown(sql)}
             and combatant.board_column is not null and combatant.board_row is not null
             then jsonb_build_object(
               'column', combatant.board_column, 'row', combatant.board_row)
           end as token
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
    where combatant.encounter_run_id = ${runId}
      and ${containedRowReadable(sql, COMBATANT, campaignId, actor)}
      and (combatant.kind = 'npc' or seated.id is not null)
      -- A conversation, a skill challenge or a hazard has no
      -- initiative order to show: only the asker's own rows are
      -- read, for their seats, and nobody else's at all.
      and (${mode} = 'combat' or own_seated.id is not null)
    ${initiativeOrder(sql)}
  `;
};

/** The fight's board as a player may see it: the grid and the picture, no setting. */
const playerBoardRow = (sign: ImageSigner | undefined) =>
  fromColumns(
    Schema.Struct({
      ...Struct.omit(PlayerLiveBoard.fields, ["tokens"]),
      image: pictureFromColumn(sign),
    }),
    { ...boardColumns, image: "picture" },
  );

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
      const LiveCombatantRow = liveCombatantRow(yield* portraitSigner);
      const PlayerBoardRow = playerBoardRow(yield* imageSigner);

      /**
       * The fight on this table tonight, if there is one. `runColumns`, so the
       * fight names no encounter this player may not read — its id is how the
       * screen finds the read-aloud.
       */
      const liveRun = SqlSchema.findOneOption({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, sessionId: SessionId })),
        Result: EncounterRunRow,
        execute: ({ campaignId, sessionId }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${runColumns(sql, campaignId, actor)}
              from encounter_run
              where encounter_run.ended_at is null
                and ${nestedRowReadable(sql, RUNS, sessionId, campaignId, actor)}
              order by encounter_run.started_at desc, encounter_run.id desc
              limit 1
            `,
          ),
      });
      /** The fight's rows as this player may know them: `liveOrderStatement`. */
      const liveOrder = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({ campaignId: CampaignId, runId: EncounterRunId, mode: EncounterKind }),
        ),
        Result: LiveCombatantRow,
        execute: (request) =>
          Effect.flatMap(Effect.service(CurrentActor), (actor) =>
            liveOrderStatement(sql, request, actor),
          ),
      });

      // The picture is joined through the board's pointer only to a map in
      // this campaign, so the pointer grants nothing outside it.
      const boardOf = SqlSchema.findOneOption({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, runId: EncounterRunId })),
        Result: PlayerBoardRow,
        execute: ({ campaignId, runId }) => sql`
          select encounter_run_board.grid, encounter_run_board.board_columns,
                 encounter_run_board.board_rows, encounter_run_board.feet_per_cell,
                 ${alignmentColumn(sql, "encounter_run_board")},
                 ${battleMapPicture(sql)}
          from encounter_run_board
          join encounter_run on encounter_run.id = encounter_run_board.run_id
          left join battle_map on battle_map.id = encounter_run_board.map_id
            and battle_map.campaign_id = ${campaignId}
          where encounter_run_board.run_id = ${runId}
            and ${boardShown(sql)}
        `,
      });

      const seats = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, actor: Actor })),
        Result: ActiveSeatRow,
        execute: ({ campaignId, actor }) => sql`
          select campaign_character.id, campaign_character.character_id
          from campaign_character
          where campaign_character.campaign_id = ${campaignId}
            and campaign_character.account_id = ${actor.accountId}
            and campaign_character.left_at is null
            and campaign_character.character_id is not null
          order by campaign_character.joined_at asc, campaign_character.id asc
        `,
      });
      const activeSeats = (campaignId: CampaignId, actor: Actor) =>
        seats({ campaignId, actor }).pipe(Effect.orDie);

      const currentReadableSession = (campaignId: CampaignId, sessionId: SessionId, actor: Actor) =>
        sql<{ readonly id: SessionId }>`
          select session.id from session
          join campaign on campaign.current_session_id = session.id
          where campaign.id = ${campaignId}
            and session.id = ${sessionId}
            and ${rowReadable(sql, "session", campaignId, actor)}
          limit 1
        `.pipe(Effect.orDie);

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

              const found = yield* liveRun({ campaignId, sessionId: session.id });
              if (Option.isNone(found)) {
                return new PlayerLiveTable({
                  campaignId,
                  sessionId: session.id,
                  sessionNumber: session.number,
                  fight: null,
                });
              }
              const run = found.value;

              const board = yield* boardOf({ campaignId, runId: run.id });

              const rows = yield* liveOrder({ campaignId, runId: run.id, mode: run.mode });
              const tokens: ReadonlyArray<PlayerLiveToken> = rows.flatMap((row) =>
                row.token === null ? [] : [{ combatantId: row.combatantId, position: row.token }],
              );
              const present: ReadonlyArray<PlayerLiveCombatant> = rows.map(
                ({ token: _token, ...combatant }) => combatant,
              );
              const order = run.mode === "combat" ? present : [];
              const upNextRow = order.find((row) => row.combatantId === run.activeCombatantId);
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
                  encounterId: run.encounterId,
                  mode: run.mode,
                  round: run.round,
                  phase: run.phase,
                  upNext,
                  seats,
                  order,
                  board: Option.match(board, {
                    onNone: () => null,
                    onSome: (row) => ({ ...row, tokens }),
                  }),
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
              const rows = yield* sql<{ readonly seq: number }>`
                select session_event.seq from session_event
                where session_event.session_id = ${sessionId}
                  and session_event.seq > ${since}
                  and session_event.visibility = 'shared'
                order by session_event.seq asc
                limit ${limit}
              `;
              return rows.map((row) => row.seq);
            }),
          ),
      };
    }),
  );
}
