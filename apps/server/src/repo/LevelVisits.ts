import {
  type BoardDoorUpdate,
  BoardDoorUpdatedPayload,
  type BoardFogUpdate,
  type BoardLightUpdate,
  BoardLightUpdatedPayload,
  type BoardRegionUpdate,
  BoardRegionUpdatedPayload,
  type BoardSquare,
  type CampaignCharacterId,
  type CampaignId,
  Conflict,
  type LevelLayout,
  type LevelPartId,
  type LevelVisitOpen,
  type LevelVisitTokenMove,
  LevelVisit,
  LevelVisitId,
  LevelVisitSummary,
  lightPresetOf,
  NotFound,
  type SessionEventKind,
  type SessionId,
  standable,
  startingSquares,
  VisitTabledPayload,
  VisitTokenMovedPayload,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, type SqlError, SqlSchema } from "effect/sql";
import { LiveEvents } from "../live/LiveEvents.js";
import { writeDoor, writeFog, writeLight, writeRegion } from "./boardWrites.js";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import {
  boardLevel,
  boardLevelColumn,
  copyLevelParts,
  refreshBoardVision,
  unstandable,
  VISIT_BOARD,
  type VisionViewer,
} from "./levelFights.js";
import {
  classFromColumns,
  dieOnSqlError,
  orNotFound,
  timestampColumns,
  uuidArray,
} from "./rows.js";
import { boardColumns, fogColumn } from "./RunBoards.js";
import { appendEvent } from "./SessionEvents.js";
import { campaignWritableById, levelOwned, levelVisitWritable, rowReadable } from "./visibility.js";

/**
 * A campaign's visits of its creator's levels (`0113_level_visits.ts`): the
 * dungeon as the party left it, one per campaign and level, for good. **The
 * creator's alone**: every method takes a `CampaignCreatorActor` and still
 * names `levelVisitWritable` beneath it, so a player or a stranger is
 * `NotFound` and never fetched.
 *
 * The DM explores a visit with no fight on it (`0114_level_visit_writes.ts`):
 * tokens, fog, doors, lights and secret regions, the last four through the
 * same statements a fight's board is written with (`boardWrites.ts`). Every
 * such write is one transaction holding the visit row, is a `Conflict` while
 * a live fight borrows the visit, is idempotent on its `requestId` through
 * the visit's own ledger, recomputes the party's vision over the visit
 * (`refreshVisitVision`), and logs a `visit-*` line on the night that is open,
 * ringing its doorbell after the commit. With no night open it logs nothing
 * and rings nothing.
 *
 * A visit is a live-play record: Hob does not open one (AGENTS.md, the
 * standing exceptions), so nothing here takes an `AssistantOrigin`.
 */

const VisitRow = classFromColumns(
  LevelVisit,
  { ...LevelVisit.fields, ...timestampColumns },
  boardColumns,
);
const SummaryRow = classFromColumns(
  LevelVisitSummary,
  { ...LevelVisitSummary.fields, ...timestampColumns },
  boardColumns,
);

const VisitRequest = Schema.toType(Schema.Struct({ ...creatorFields, id: LevelVisitId }));

/** Over `level_visit` joined to its `campaign`: whether it is the visit on the table. */
const onTableColumn = (sql: SqlClient.SqlClient) =>
  sql`(campaign.table_visit_id is not distinct from level_visit.id) as on_table`;

/**
 * Where the party's eyes stand on a visit: each token whose seat is still
 * live and holds a character, with that character's sheet traits.
 */
const visitViewers = (sql: SqlClient.SqlClient, visitId: string) =>
  sql<VisionViewer>`
    select level_visit_token.board_column, level_visit_token.board_row,
           character.body -> 'traits' as traits
    from level_visit_token
    join campaign_character seat on seat.id = level_visit_token.seat_id
    join character on character.id = seat.character_id
    where level_visit_token.visit_id = ${visitId} and seat.left_at is null
  `;

/**
 * Recompute what the party sees of a visit (`refreshBoardVision` over the
 * visit's copy). In the caller's transaction, beneath its gate. `shown` is
 * whether the visit is on its campaign's table.
 */
export const refreshVisitVision = (sql: SqlClient.SqlClient, visitId: string) =>
  refreshBoardVision(sql, {
    tables: VISIT_BOARD,
    id: visitId,
    viewers: visitViewers(sql, visitId),
    shown: sql`exists (select 1 from campaign
                       where campaign.id = level_visit.campaign_id
                         and campaign.table_visit_id = level_visit.id)`,
  });

/**
 * The night open at a campaign: its current session, started and not ended,
 * or `null`. A visit's writes are logged on it (`0114_level_visit_writes.ts`).
 */
const openNight = (sql: SqlClient.SqlClient, campaign: CampaignId | string) =>
  Effect.map(
    sql<{ readonly id: SessionId }>`
      select session.id from campaign
      join session on session.id = campaign.current_session_id
      where campaign.id = ${campaign}
        and session.started_at is not null and session.ended_at is null
    `,
    (rows) => rows[0]?.id ?? null,
  );

/** A visit's line, as a write describes it. */
interface VisitLine {
  readonly kind: SessionEventKind;
  readonly payload: Record<string, unknown>;
}

/**
 * Log a visit's line on its campaign's open night, in the caller's
 * transaction, answering the night whose doorbell the caller rings once it
 * has committed, or `null` with no night open, when nothing is written. The
 * DM's own line in this phase: no player read is told of a visit yet.
 */
const tellTheNight = (
  sql: SqlClient.SqlClient,
  campaign: CampaignId | string,
  visitId: string,
  line: VisitLine,
) =>
  Effect.gen(function* () {
    const sessionId = yield* openNight(sql, campaign);
    if (sessionId === null) return null;
    yield* appendEvent(sql, {
      sessionId,
      kind: line.kind,
      levelVisitId: visitId,
      payload: line.payload,
      visibility: "dm",
    });
    return sessionId;
  });

/**
 * The squares a visit stands the party on when it is opened, as many as
 * `count`: the level's entry squares a token may stand on, in reading order,
 * then down the left edge for any seat they do not hold (`startingSquares`,
 * the left edge a fight seeds), on standable squares. A board with no room
 * left stands fewer.
 */
const partySquares = (layout: LevelLayout, count: number): ReadonlyArray<BoardSquare> => {
  const blocked = unstandable(layout);
  const unusable = new Set(blocked.map((square) => square.row * layout.columns + square.column));
  const entries = [
    ...new Set(
      layout.regions
        .filter((region) => region.kind === "entry")
        .flatMap((region) => region.squares),
    ),
  ]
    .filter((square) => square < layout.columns * layout.rows && !unusable.has(square))
    .sort((a, b) => a - b)
    .slice(0, count)
    .map((square) => ({
      column: square % layout.columns,
      row: Math.floor(square / layout.columns),
    }));
  const rest = startingSquares(
    { columns: layout.columns, rows: layout.rows },
    "party",
    count - entries.length,
    [...blocked, ...entries],
  );
  return [...entries, ...rest];
};

/**
 * A seat left its table (`Party.leave`, a revoked membership, a deleted
 * character): its token on every visit goes, and each of those visits, on
 * the table or not, looks again without it, with a `visit-vision-updated`
 * line on its campaign's open night when what the party sees changed. In the
 * retiring write's transaction; answers the nights whose doorbell the caller
 * rings once it has committed. A seat retires rather than being deleted, so
 * its token's key does not cascade; this is the delete.
 */
export const dropSeatTokens = (
  sql: SqlClient.SqlClient,
  seatIds: ReadonlyArray<CampaignCharacterId | string>,
): Effect.Effect<ReadonlyArray<SessionId>, SqlError.SqlError> =>
  seatIds.length === 0
    ? Effect.succeed([])
    : Effect.gen(function* () {
        const gone = yield* sql<{ readonly visit_id: string; readonly campaign_id: string }>`
          delete from level_visit_token
          where level_visit_token.seat_id = any(${uuidArray([...seatIds])})
          returning level_visit_token.visit_id, level_visit_token.campaign_id
        `;
        // Every visit it stood on, on the table or not, so none keeps a
        // `party_sees` drawn from a token that is gone. Sorted, so two
        // retiring writes lock the boards in one order.
        const visits = [
          ...new Map(gone.map((row) => [row.visit_id, row.campaign_id] as const)).entries(),
        ].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        const nights = yield* Effect.forEach(visits, ([visitId, campaignId]) =>
          Effect.gen(function* () {
            const vision = yield* refreshVisitVision(sql, visitId);
            if (vision === null || !vision.changed) return null;
            return yield* tellTheNight(sql, campaignId, visitId, {
              kind: "visit-vision-updated",
              payload: {},
            });
          }),
        );
        return [...new Set(nights.filter((night): night is SessionId => night !== null))];
      });

export class LevelVisits extends Context.Service<
  LevelVisits,
  {
    /** The campaign's visits, by name. */
    readonly list: (
      creator: CampaignCreatorActor,
    ) => Effect.Effect<ReadonlyArray<LevelVisitSummary>>;
    readonly findById: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
    ) => Effect.Effect<LevelVisit, NotFound>;
    /**
     * Copy one of the creator's own levels into a new visit, in one
     * transaction holding the level `for share`, with a token for every live
     * seat on the level's entry squares, then down the left edge
     * (`partySquares`), and the party's first look around. Another account's
     * level is `NotFound` before any write; a level the campaign already has a
     * visit of is a `Conflict`, and nothing is written.
     */
    readonly open: (
      creator: CampaignCreatorActor,
      payload: LevelVisitOpen,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
    /**
     * *Reset level*: deletes the visit, its parts and its tokens, and takes it
     * off the table. A fight that borrowed it keeps its own copy and loses the
     * pointer. `Conflict` while a live fight is played on it.
     */
    readonly remove: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
    ) => Effect.Effect<void, NotFound | Conflict>;
    /** Makes the visit the one on the campaign's table, in place of any other. */
    readonly putOnTable: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
    ) => Effect.Effect<LevelVisit, NotFound>;
    /** Leaves no visit on the campaign's table. */
    readonly takeOffTable: (creator: CampaignCreatorActor) => Effect.Effect<void>;
    /**
     * Stand a seat's token on a square of the visit, as the DM would a
     * miniature: any square on the board a token may stand on (`standable`),
     * with no walk and no speed. `NotFound` for a seat with no token on the
     * visit; `Conflict` for a square off the board or one no token may stand
     * on. Two tokens may share a square, as in a fight.
     */
    readonly moveToken: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
      seatId: CampaignCharacterId,
      move: LevelVisitTokenMove,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
    /** The DM's fog on the visit (`writeFog`); a `reset` clears it, as the visit opened unfogged. */
    readonly updateFog: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
      update: BoardFogUpdate,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
    /** A door of the visit (`writeDoor`). */
    readonly updateDoor: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
      wallId: LevelPartId,
      update: BoardDoorUpdate,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
    /** A light of the visit (`writeLight`). */
    readonly updateLight: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
      lightId: LevelPartId,
      update: BoardLightUpdate,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
    /** A secret region of the visit (`writeRegion`). */
    readonly updateRegion: (
      creator: CampaignCreatorActor,
      id: LevelVisitId,
      regionId: LevelPartId,
      update: BoardRegionUpdate,
    ) => Effect.Effect<LevelVisit, NotFound | Conflict>;
  }
>()("LevelVisits") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;

      const listed = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(creatorFields)),
        Result: SummaryRow,
        execute: ({ campaign, actor }) => sql`
          select level_visit.id, level_visit.level_id, level_visit.name,
                 level_visit.board_columns, level_visit.board_rows, level_visit.feet_per_cell,
                 ${onTableColumn(sql)}, level_visit.created_at, level_visit.updated_at
          from level_visit
          join campaign on campaign.id = level_visit.campaign_id
          where ${levelVisitWritable(sql, campaign, actor)}
          order by lower(level_visit.name), level_visit.id
        `,
      });

      const visit = SqlSchema.findOne({
        Request: VisitRequest,
        Result: VisitRow,
        execute: ({ campaign, actor, id }) => sql`
          select level_visit.id, level_visit.level_id, level_visit.name,
                 level_visit.board_columns, level_visit.board_rows, level_visit.feet_per_cell,
                 ${boardLevelColumn(sql, VISIT_BOARD)},
                 ${fogColumn(sql, "level_visit")},
                 level_visit.party_sees, level_visit.party_seen,
                 coalesce((
                   select json_agg(json_build_object(
                     'seatId', seat.id, 'name', seat.display_name,
                     'column', level_visit_token.board_column, 'row', level_visit_token.board_row
                   ) order by seat.joined_at, seat.id)
                   from level_visit_token
                   join campaign_character seat on seat.id = level_visit_token.seat_id
                   where level_visit_token.visit_id = level_visit.id
                 ), '[]'::json) as tokens,
                 ${onTableColumn(sql)}, level_visit.created_at, level_visit.updated_at
          from level_visit
          join campaign on campaign.id = level_visit.campaign_id
          where level_visit.id = ${id} and ${levelVisitWritable(sql, campaign, actor)}
        `,
      });

      const read = (creator: CampaignCreatorActor, id: LevelVisitId) =>
        visit({ ...asked(creator), id }).pipe(orNotFound("level_visit", id));

      /** Ring the night a write logged on, once its transaction has committed. */
      const ring = (night: SessionId | null) =>
        night === null ? Effect.void : live.touched(night);

      /**
       * One exploring write on a visit, in one transaction: the visit held
       * `for update` beneath the creator's predicate (`NotFound` otherwise),
       * so the writes on one visit land one after the other; refused while a
       * live fight borrows it; its `requestId` entered in the visit's ledger,
       * a repeat answering the visit as it stands; then `body`, the party's
       * vision recomputed, and `body`'s line logged on the open night. Answers
       * the visit as the write leaves it, and rings the night after the
       * commit.
       */
      const explore = (
        creator: CampaignCreatorActor,
        id: LevelVisitId,
        requestId: string | undefined,
        body: Effect.Effect<VisitLine, NotFound | Conflict | SqlError.SqlError>,
      ) =>
        dieOnSqlError(
          sql
            .withTransaction(
              Effect.gen(function* () {
                const { actor, campaign } = creator;
                const locked = yield* sql`
                  select level_visit.id from level_visit
                  where level_visit.id = ${id} and ${levelVisitWritable(sql, campaign, actor)}
                  for update
                `;
                if (locked.length === 0) {
                  return yield* new NotFound({ resource: "level_visit", id });
                }
                // The fight's start holds the visit too (a later phase), so
                // once a fight borrows it nothing here writes until it ends.
                const borrowed = yield* sql`
                  select encounter_run.id from encounter_run
                  where encounter_run.level_visit_id = ${id} and encounter_run.ended_at is null
                `;
                if (borrowed.length > 0) {
                  return yield* new Conflict({
                    message:
                      "a fight is being played on this level: the board is the fight's until it ends",
                  });
                }
                if (requestId !== undefined) {
                  const entered = yield* sql`
                    insert into level_visit_request (visit_id, request_id)
                    values (${id}, ${requestId})
                    on conflict (visit_id, request_id) do nothing
                    returning level_visit_request.visit_id
                  `;
                  if (entered.length === 0) {
                    return { visit: yield* read(creator, id).pipe(Effect.orDie), night: null };
                  }
                }
                const line = yield* body;
                yield* sql`update level_visit set updated_at = now() where level_visit.id = ${id}`;
                yield* refreshVisitVision(sql, id);
                const night = yield* tellTheNight(sql, campaign, id, line);
                return { visit: yield* read(creator, id).pipe(Effect.orDie), night };
              }),
            )
            .pipe(Effect.flatMap(({ visit, night }) => Effect.as(ring(night), visit))),
        );

      return {
        list: (creator) => dieOnSqlError(listed(asked(creator))),

        findById: (creator, id) => dieOnSqlError(read(creator, id)),

        open: (creator, payload) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const { actor, campaign } = creator;
                  // Held `for share` until the commit, as a fight's start holds
                  // it (`copyLevel`): a save or a delete of the level waits, so
                  // the copy below is of this one level, whole.
                  const levels = yield* sql<{ readonly id: string }>`
                    select level.id from level
                    where level.id = ${payload.levelId} and ${levelOwned(sql, actor)}
                    for share of level
                  `;
                  if (levels.length === 0) {
                    return yield* new NotFound({ resource: "level", id: payload.levelId });
                  }
                  // One visit per campaign and level, for good; the unique key
                  // answers a race the same way.
                  const made = yield* sql<{ readonly id: LevelVisitId; readonly name: string }>`
                    insert into level_visit (
                      campaign_id, level_id, level_owner_id, name,
                      board_columns, board_rows, feet_per_cell, ambient, floor
                    )
                    select ${campaign}, level.id, level.account_id, level.name,
                           level.columns, level.rows, level.feet_per_cell, level.ambient,
                           level.floor
                    from level
                    where level.id = ${payload.levelId} and ${levelOwned(sql, actor)}
                      and ${campaignWritableById(sql, campaign, actor)}
                    on conflict (campaign_id, level_id) do nothing
                    returning level_visit.id, level_visit.name
                  `;
                  const opened = made[0];
                  if (opened === undefined) {
                    return yield* new Conflict({
                      message:
                        "this campaign already has a visit of that level: put it on the table, or reset the level to start it again",
                    });
                  }
                  const visitId = opened.id;
                  yield* copyLevelParts(sql, VISIT_BOARD, visitId, payload.levelId, actor);

                  // The party on the level's way in: each live seat holding a
                  // character, in the order they sat down.
                  const seats = yield* sql<{ readonly id: CampaignCharacterId }>`
                    select campaign_character.id from campaign_character
                    join character on character.id = campaign_character.character_id
                    where campaign_character.left_at is null
                      and ${rowReadable(sql, "campaign_character", campaign, actor)}
                    order by campaign_character.joined_at asc, campaign_character.id asc
                  `;
                  const level = yield* boardLevel(sql, VISIT_BOARD, visitId);
                  if (level === null) return yield* Effect.die("a visit has no level");
                  const squares = partySquares(level.layout, seats.length);
                  const tokens = squares.map((square, index) => ({
                    visit_id: visitId,
                    campaign_id: campaign,
                    seat_id: seats[index]!.id,
                    board_columns: level.layout.columns,
                    board_rows: level.layout.rows,
                    board_column: square.column,
                    board_row: square.row,
                  }));
                  if (tokens.length > 0) {
                    yield* sql`insert into level_visit_token ${sql.insert(tokens)}`;
                  }
                  yield* refreshVisitVision(sql, visitId);
                  const night = yield* tellTheNight(sql, campaign, visitId, {
                    kind: "visit-opened",
                    payload: { name: opened.name },
                  });
                  return { visit: yield* read(creator, visitId).pipe(Effect.orDie), night };
                }),
              )
              .pipe(Effect.flatMap(({ visit, night }) => Effect.as(ring(night), visit))),
          ),

        remove: (creator, id) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const { actor, campaign } = creator;
                const locked = yield* sql`
                  select level_visit.id from level_visit
                  where level_visit.id = ${id} and ${levelVisitWritable(sql, campaign, actor)}
                  for update
                `;
                if (locked.length === 0) {
                  return yield* new NotFound({ resource: "level_visit", id });
                }
                const borrowed = yield* sql`
                  select encounter_run.id from encounter_run
                  where encounter_run.level_visit_id = ${id} and encounter_run.ended_at is null
                `;
                if (borrowed.length > 0) {
                  return yield* new Conflict({
                    message:
                      "a fight is being played on this level: end it before resetting the level",
                  });
                }
                // The parts and tokens cascade; the table's pointer and every
                // borrowing fight's empty (`on delete set null`).
                yield* sql`
                  delete from level_visit
                  where level_visit.id = ${id} and ${levelVisitWritable(sql, campaign, actor)}
                `;
              }),
            ),
          ),

        putOnTable: (creator, id) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const { actor, campaign } = creator;
                  const set = yield* sql<{ readonly was: string | null }>`
                    update campaign set table_visit_id = level_visit.id
                    from level_visit
                    where campaign.id = ${campaign}
                      and level_visit.id = ${id}
                      and ${levelVisitWritable(sql, campaign, actor)}
                    returning old.table_visit_id as was
                  `;
                  const row = set[0];
                  if (row === undefined)
                    return yield* new NotFound({ resource: "level_visit", id });
                  // A visit put on in place of another: the other's line says it
                  // came off. Putting on the visit already there says nothing.
                  let night: SessionId | null = null;
                  if (row.was !== id) {
                    if (row.was !== null) {
                      night = yield* tellTheNight(sql, campaign, row.was, {
                        kind: "visit-tabled",
                        payload: { onTable: false } satisfies typeof VisitTabledPayload.Encoded,
                      });
                    }
                    night = yield* tellTheNight(sql, campaign, id, {
                      kind: "visit-tabled",
                      payload: { onTable: true } satisfies typeof VisitTabledPayload.Encoded,
                    });
                  }
                  return { visit: yield* read(creator, id).pipe(Effect.orDie), night };
                }),
              )
              .pipe(Effect.flatMap(({ visit, night }) => Effect.as(ring(night), visit))),
          ),

        takeOffTable: (creator) =>
          dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  const { actor, campaign } = creator;
                  const cleared = yield* sql<{ readonly was: string | null }>`
                    update campaign set table_visit_id = null
                    where campaign.id = ${campaign}
                      and ${campaignWritableById(sql, campaign, actor)}
                    returning old.table_visit_id as was
                  `;
                  const was = cleared[0]?.was ?? null;
                  return was === null
                    ? null
                    : yield* tellTheNight(sql, campaign, was, {
                        kind: "visit-tabled",
                        payload: { onTable: false } satisfies typeof VisitTabledPayload.Encoded,
                      });
                }),
              )
              .pipe(Effect.flatMap(ring)),
          ),

        moveToken: (creator, id, seatId, move) =>
          explore(
            creator,
            id,
            move.requestId,
            Effect.gen(function* () {
              const tokens = yield* sql<{
                readonly board_column: number;
                readonly board_row: number;
              }>`
                select level_visit_token.board_column, level_visit_token.board_row
                from level_visit_token
                where level_visit_token.visit_id = ${id} and level_visit_token.seat_id = ${seatId}
                for update
              `;
              const token = tokens[0];
              if (token === undefined) {
                return yield* new NotFound({ resource: "campaign_character", id: seatId });
              }
              const level = yield* boardLevel(sql, VISIT_BOARD, id);
              if (level === null) return yield* Effect.die("a visit has no level");
              const to = move.position;
              if (to.column >= level.layout.columns || to.row >= level.layout.rows) {
                return yield* new Conflict({ message: "that square is off the board" });
              }
              if (!standable(level.layout, to)) {
                return yield* new Conflict({ message: "no token can stand on that square" });
              }
              yield* sql`
                update level_visit_token
                set board_column = ${to.column}, board_row = ${to.row}
                where level_visit_token.visit_id = ${id} and level_visit_token.seat_id = ${seatId}
              `;
              return {
                kind: "visit-token-moved",
                payload: {
                  seatId,
                  from: { column: token.board_column, row: token.board_row },
                  to: { column: to.column, row: to.row },
                } satisfies typeof VisitTokenMovedPayload.Encoded,
              } satisfies VisitLine;
            }),
          ),

        updateFog: (creator, id, update) =>
          explore(
            creator,
            id,
            update.requestId,
            Effect.gen(function* () {
              const changed = yield* writeFog(sql, VISIT_BOARD, id, update, sql`false`);
              if (changed === null) return yield* Effect.die("a visit has no board row");
              return {
                kind: "visit-fog-updated",
                payload: { hidden: changed.hidden },
              } satisfies VisitLine;
            }),
          ),

        updateDoor: (creator, id, wallId, update) =>
          explore(
            creator,
            id,
            update.requestId,
            Effect.gen(function* () {
              const after = yield* writeDoor(sql, VISIT_BOARD, id, wallId, update);
              return {
                kind: "visit-door-updated",
                payload: {
                  wallId,
                  wallKind: after.kind,
                  doorState: after.door_state,
                  revealed: after.revealed,
                  wasDoorState: after.was_door_state,
                  wasRevealed: after.was_revealed,
                } satisfies typeof BoardDoorUpdatedPayload.Encoded,
              } satisfies VisitLine;
            }),
          ),

        updateLight: (creator, id, lightId, update) =>
          explore(
            creator,
            id,
            update.requestId,
            Effect.gen(function* () {
              const light = yield* writeLight(sql, VISIT_BOARD, id, lightId, update.lit);
              return {
                kind: "visit-light-updated",
                payload: {
                  lightId,
                  lit: update.lit,
                  preset: lightPresetOf(light),
                } satisfies typeof BoardLightUpdatedPayload.Encoded,
              } satisfies VisitLine;
            }),
          ),

        updateRegion: (creator, id, regionId, update) =>
          explore(
            creator,
            id,
            update.requestId,
            Effect.gen(function* () {
              const region = yield* writeRegion(sql, VISIT_BOARD, id, regionId, update.revealed);
              return {
                kind: "visit-region-updated",
                payload: {
                  regionId,
                  regionKind: region.kind,
                  revealed: update.revealed,
                  wasRevealed: region.wasRevealed,
                } satisfies typeof BoardRegionUpdatedPayload.Encoded,
              } satisfies VisitLine;
            }),
          ),
      };
    }),
  );
}
