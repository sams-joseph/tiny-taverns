import {
  type CampaignCharacterId,
  Conflict,
  type LevelVisitOpen,
  LevelVisit,
  LevelVisitId,
  LevelVisitSummary,
  NotFound,
  startingSquares,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, type SqlError, SqlSchema } from "effect/sql";
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
import { campaignWritableById, levelOwned, levelVisitWritable, rowReadable } from "./visibility.js";

/**
 * A campaign's visits of its creator's levels (`0113_level_visits.ts`): the
 * dungeon as the party left it, one per campaign and level, for good. **The
 * creator's alone**: every method takes a `CampaignCreatorActor` and still
 * names `levelVisitWritable` beneath it, so a player or a stranger is
 * `NotFound` and never fetched.
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
 * A seat left its table (`Party.leave`, a revoked membership, a deleted
 * character): its token on every visit goes, and each visit on its table
 * looks again without it. In the retiring write's transaction. A seat
 * retires rather than being deleted, so its token's key does not cascade;
 * this is the delete.
 */
export const dropSeatTokens = (
  sql: SqlClient.SqlClient,
  seatIds: ReadonlyArray<CampaignCharacterId | string>,
): Effect.Effect<void, SqlError.SqlError> =>
  seatIds.length === 0
    ? Effect.void
    : Effect.gen(function* () {
        const gone = yield* sql<{ readonly visit_id: string }>`
          delete from level_visit_token
          where level_visit_token.seat_id = any(${uuidArray([...seatIds])})
          returning level_visit_token.visit_id
        `;
        const visits = [...new Set(gone.map((row) => row.visit_id))].sort();
        if (visits.length === 0) return;
        const onTable = yield* sql<{ readonly id: string }>`
          select level_visit.id from level_visit
          join campaign on campaign.table_visit_id = level_visit.id
            and campaign.id = level_visit.campaign_id
          where level_visit.id = any(${uuidArray(visits)})
          order by level_visit.id
        `;
        yield* Effect.forEach(onTable, (row) => refreshVisitVision(sql, row.id), {
          discard: true,
        });
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
     * seat down the left edge (`startingSquares`, on standable squares) and
     * the party's first look around. Another account's level is `NotFound`
     * before any write; a level the campaign already has a visit of is a
     * `Conflict`, and nothing is written.
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
  }
>()("LevelVisits") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

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

      return {
        list: (creator) => dieOnSqlError(listed(asked(creator))),

        findById: (creator, id) => dieOnSqlError(read(creator, id)),

        open: (creator, payload) =>
          dieOnSqlError(
            sql.withTransaction(
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
                const made = yield* sql<{ readonly id: LevelVisitId }>`
                  insert into level_visit (
                    campaign_id, level_id, level_owner_id, name,
                    board_columns, board_rows, feet_per_cell, ambient, floor
                  )
                  select ${campaign}, level.id, level.account_id, level.name,
                         level.columns, level.rows, level.feet_per_cell, level.ambient, level.floor
                  from level
                  where level.id = ${payload.levelId} and ${levelOwned(sql, actor)}
                    and ${campaignWritableById(sql, campaign, actor)}
                  on conflict (campaign_id, level_id) do nothing
                  returning level_visit.id
                `;
                const visitId = made[0]?.id;
                if (visitId === undefined) {
                  return yield* new Conflict({
                    message:
                      "this campaign already has a visit of that level: put it on the table, or reset the level to start it again",
                  });
                }
                yield* copyLevelParts(sql, VISIT_BOARD, visitId, payload.levelId, actor);

                // The party down the left edge, as a fight seeds it: each live
                // seat holding a character, in the order they sat down, on a
                // square a token may stand on. A board with no room left
                // stands fewer.
                const seats = yield* sql<{ readonly id: CampaignCharacterId }>`
                  select campaign_character.id from campaign_character
                  join character on character.id = campaign_character.character_id
                  where campaign_character.left_at is null
                    and ${rowReadable(sql, "campaign_character", campaign, actor)}
                  order by campaign_character.joined_at asc, campaign_character.id asc
                `;
                const level = yield* boardLevel(sql, VISIT_BOARD, visitId);
                if (level === null) return yield* Effect.die("a visit has no level");
                const squares = startingSquares(
                  { columns: level.layout.columns, rows: level.layout.rows },
                  "party",
                  seats.length,
                  unstandable(level.layout),
                );
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
                return yield* read(creator, visitId).pipe(Effect.orDie);
              }),
            ),
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
            Effect.gen(function* () {
              const { actor, campaign } = creator;
              const set = yield* sql`
                update campaign set table_visit_id = level_visit.id
                from level_visit
                where campaign.id = ${campaign}
                  and level_visit.id = ${id}
                  and ${levelVisitWritable(sql, campaign, actor)}
                returning campaign.id
              `;
              if (set.length === 0) return yield* new NotFound({ resource: "level_visit", id });
              return yield* read(creator, id).pipe(Effect.orDie);
            }),
          ),

        takeOffTable: (creator) =>
          dieOnSqlError(
            Effect.asVoid(
              sql`
                update campaign set table_visit_id = null
                where campaign.id = ${creator.campaign}
                  and ${campaignWritableById(sql, creator.campaign, creator.actor)}
              `,
            ),
          ),
      };
    }),
  );
}
