import {
  BattleMap,
  BattleMapImages,
  type BattleMapUpdate,
  type BoardFogUpdate,
  Conflict,
  EncounterId,
  EncounterRunBoard,
  EncounterRunId,
  NotFound,
  SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema, SchemaGetter, SchemaTransformation } from "effect";
import { SqlClient, SqlError, SqlSchema } from "effect/sql";
import { type ImageSigner, imageSigner } from "../images/ImageUrls.js";
import { LiveEvents } from "../live/LiveEvents.js";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import { boardShown, RUNS } from "./liveTables.js";
import {
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  intArray,
  orNotFound,
  setClause,
  timestampColumns,
} from "./rows.js";
import { appendEvent, requestAlreadyApplied } from "./SessionEvents.js";
import { nestedRowWritable, rowWritable } from "./visibility.js";

/**
 * Reads and writes over `battle_map`, every encounter's board
 * (`0057_battle_maps.ts`) — **the creator's alone**, so every method takes a
 * `CampaignCreatorActor` and still composes `rowWritable` beneath it. There is
 * no player read here. The one player path to a map's picture is a fight's
 * board on the live table, while the DM shows it (`repo/PlayerTable.ts`),
 * which signs through {@link battleMapImages} and never selects the setting.
 *
 * There is no create and no delete. `Encounters.create` inserts an encounter's
 * map in its own transaction and the encounter's delete cascades it; the
 * setting line is written through the encounter's create and update too.
 *
 * Hob holds no copy: no toolkit has a map tool, and a map read signs its
 * picture's URLs, which a model must never hold.
 *
 * A fight's board (`encounter_run_board`, `0058_encounter_run_boards.ts`) is
 * read here too, because it carries the map's picture and this file is where a
 * map's URL is minted; and its fog of war is written here, because the write
 * answers with the board.
 */

/**
 * The picture beside a map row, as one `json` column: its id, state and size,
 * or `null` when the map has no picture record. **Every read that becomes a
 * `BattleMap` names this fragment** — the decode refuses a row without it —
 * and so does the player's board. `battle_map` must be in scope.
 */
export const battleMapPicture = (sql: SqlClient.SqlClient) => sql`
  (select json_build_object(
     'id', battle_map_image.id,
     'state', battle_map_image.state,
     'width', battle_map_image.width,
     'height', battle_map_image.height
   ) from battle_map_image
   where battle_map_image.map_id = battle_map.id) as picture
`;

/**
 * Whether the map's picture is still being drawn, as one `boolean` column:
 * `false` for a map with no picture record. `battle_map` must be in scope.
 */
const battleMapPending = (sql: SqlClient.SqlClient) => sql`
  coalesce(
    (select battle_map_image.state = 'generating' from battle_map_image
     where battle_map_image.map_id = battle_map.id),
    false
  ) as image_pending
`;

/** `battleMapPicture`, decoded. */
export const BattleMapPicture = Schema.NullOr(
  Schema.Struct({
    id: Schema.String,
    state: Schema.Literals(["generating", "ready", "failed"]),
    width: Schema.NullOr(Schema.Int),
    height: Schema.NullOr(Schema.Int),
  }),
);
export type BattleMapPicture = typeof BattleMapPicture.Type;

/**
 * A board's alignment as the wire spells it, from the three columns a
 * `battle_map` and an `encounter_run_board` both carry. `table` is a constant
 * from the repository, never anything a client supplies.
 */
export const alignmentColumn = (sql: SqlClient.SqlClient, table: string) => sql`
  json_build_object(
    'cellPx', ${sql(`${table}.cell_px`)},
    'offsetXPx', ${sql(`${table}.offset_x_px`)},
    'offsetYPx', ${sql(`${table}.offset_y_px`)}
  ) as alignment
`;

/**
 * A fight's fog as the wire spells it: the squares in `fog_hidden`, each
 * `row * board_columns + column` (`0087_run_board_fog.ts`), as `{column, row}`
 * in reading order. `encounter_run_board` must be in scope.
 */
export const fogColumn = (sql: SqlClient.SqlClient) => sql`
  coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'column', square % encounter_run_board.board_columns,
         'row', square / encounter_run_board.board_columns)
       order by square)
     from unnest(encounter_run_board.fog_hidden) as square),
    '[]'::jsonb
  ) as fog
`;

/** A board's two dimensions, which the wire calls `columns` and `rows`. */
export const boardColumns = { columns: "board_columns", rows: "board_rows" } as const;

/**
 * **The only place a battle map's URL is minted**, for a row a gated read
 * already returned: a creator-gated read below, or a seated player's table
 * while the DM shows the map (`repo/PlayerTable.ts`). `undefined` signs
 * nothing, the same answer a server with no URL secret gives.
 */
export const battleMapImages = (
  picture: BattleMapPicture,
  sign: ImageSigner | undefined,
): BattleMap["image"] => {
  if (
    picture === null ||
    picture.state !== "ready" ||
    picture.width === null ||
    picture.height === null ||
    sign === undefined
  ) {
    return null;
  }
  const paths = sign("battleMap", picture.id);
  return paths === null
    ? null
    : new BattleMapImages({
        cardUrl: paths.card,
        fullUrl: paths.full,
        width: picture.width,
        height: picture.height,
      });
};

/**
 * The `picture` column, decoded into the images the wire carries: the `image`
 * of every read that selects {@link battleMapPicture}. Minting is the decode's
 * last step, with the signer the reading repository was built with.
 */
export const pictureFromColumn = (sign: ImageSigner | undefined) =>
  BattleMapPicture.pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.instanceOf(BattleMapImages)),
      new SchemaTransformation.Transformation(
        SchemaGetter.transform((picture: BattleMapPicture) => battleMapImages(picture, sign)),
        SchemaGetter.forbidden(() => "a battle map's picture is minted, never read back"),
      ),
    ),
  );

/** A `battle_map` row as the creator reads it, its picture signed per read. */
const battleMapRow = (sign: ImageSigner | undefined) =>
  classFromColumns(
    BattleMap,
    { ...BattleMap.fields, ...timestampColumns, image: pictureFromColumn(sign) },
    { ...boardColumns, image: "picture" },
  );

/** `encounter_run_board`, with its map's setting line and picture beside it. */
const runBoardRow = (sign: ImageSigner | undefined) =>
  classFromColumns(
    EncounterRunBoard,
    { ...EncounterRunBoard.fields, image: pictureFromColumn(sign) },
    { ...boardColumns, image: "picture" },
  );

export class BattleMaps extends Context.Service<
  BattleMaps,
  {
    /** The encounter's map, or `NotFound` for an encounter this creator does not hold. */
    readonly forEncounter: (
      creator: CampaignCreatorActor,
      encounterId: EncounterId,
    ) => Effect.Effect<BattleMap, NotFound>;
    /**
     * The distinct creature types on the encounter's roster (`beast`,
     * `undead`), lower-cased and sorted — what a map drawn without a setting
     * line reads to choose a place, and never a creature's name. Empty for an
     * encounter this creator does not hold.
     */
    readonly rosterTypes: (
      creator: CampaignCreatorActor,
      encounterId: EncounterId,
    ) => Effect.Effect<ReadonlyArray<string>>;
    /** The grid, changed in place. */
    readonly update: (
      creator: CampaignCreatorActor,
      encounterId: EncounterId,
      patch: BattleMapUpdate,
    ) => Effect.Effect<BattleMap, NotFound>;
    /**
     * A fight's board, or `null` for a fight that has none; `NotFound` for a
     * run that is not in this creator's session.
     */
    readonly forRun: (
      creator: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
    ) => Effect.Effect<EncounterRunBoard | null, NotFound>;
    /**
     * Hide or reveal squares of a fight's board under fog of war — the DM's
     * alone, as the board is. `Conflict` for a fight with no board and for a
     * square off it. A repeated `requestId` changes nothing and answers the
     * board as it stands.
     *
     * The log line is shared while a player's table shows the board
     * (`liveTables.ts`' `boardShown`), so their doorbell rings and they re-read
     * a table that fog has changed; otherwise it is the DM's own.
     */
    readonly updateFog: (
      creator: CampaignCreatorActor,
      sessionId: SessionId,
      runId: EncounterRunId,
      update: BoardFogUpdate,
    ) => Effect.Effect<EncounterRunBoard, NotFound | Conflict>;
  }
>()("BattleMaps") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const live = yield* LiveEvents;
      const sign = yield* imageSigner;
      const BattleMapRow = battleMapRow(sign);
      const RunBoardRow = runBoardRow(sign);
      const missing = (encounterId: EncounterId) =>
        new NotFound({ resource: "battle map", id: encounterId });

      const MapRequest = Schema.toType(
        Schema.Struct({ ...creatorFields, encounterId: EncounterId }),
      );
      const map = SqlSchema.findOne({
        Request: MapRequest,
        Result: BattleMapRow,
        execute: ({ campaign, actor, encounterId }) => sql`
          select battle_map.*, ${alignmentColumn(sql, "battle_map")},
                 ${battleMapPicture(sql)}, ${battleMapPending(sql)}
          from battle_map
          where battle_map.encounter_id = ${encounterId}
            and ${rowWritable(sql, "battle_map", campaign, actor)}
        `,
      });
      const types = SqlSchema.findAll({
        Request: MapRequest,
        Result: fromColumns(Schema.Struct({ type: Schema.String })),
        execute: ({ campaign, actor, encounterId }) => sql`
          select distinct lower(btrim(creature.type)) as type
          from battle_map
          join encounter_creature on encounter_creature.encounter_id = battle_map.encounter_id
          join creature on creature.id = encounter_creature.creature_id
          where battle_map.encounter_id = ${encounterId}
            and ${rowWritable(sql, "battle_map", campaign, actor)}
            and btrim(creature.type) <> ''
          order by 1
        `,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            ...creatorFields,
            encounterId: EncounterId,
            columns: Schema.Record(Schema.String, Schema.Unknown),
          }),
        ),
        Result: BattleMapRow,
        execute: ({ campaign, actor, encounterId, columns }) => sql`
          update battle_map set ${setClause(sql, columns)}
          where battle_map.encounter_id = ${encounterId}
            and ${rowWritable(sql, "battle_map", campaign, actor)}
          returning battle_map.*, ${alignmentColumn(sql, "battle_map")},
                    ${battleMapPicture(sql)}, ${battleMapPending(sql)}
        `,
      });
      const run = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, sessionId: SessionId, runId: EncounterRunId }),
        ),
        Result: fromColumns(Schema.Struct({ id: EncounterRunId })),
        execute: ({ campaign, actor, sessionId, runId }) => sql`
          select encounter_run.id from encounter_run
          where encounter_run.id = ${runId}
            and ${nestedRowWritable(sql, RUNS, sessionId, campaign, actor)}
        `,
      });
      // The map is joined through the creator's own predicate again, so the
      // board's pointer grants nothing a map read would not: a pointer that
      // somehow named another table's map reads as none.
      const board = SqlSchema.findOneOption({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, runId: EncounterRunId })),
        Result: RunBoardRow,
        execute: ({ campaign, actor, runId }) => sql`
          select battle_map.id as map_id, battle_map.setting,
                 encounter_run_board.grid, encounter_run_board.board_columns,
                 encounter_run_board.board_rows, encounter_run_board.feet_per_cell,
                 ${alignmentColumn(sql, "encounter_run_board")},
                 ${battleMapPicture(sql)}, ${battleMapPending(sql)}, ${fogColumn(sql)}
          from encounter_run_board
          left join battle_map on battle_map.id = encounter_run_board.map_id
            and ${rowWritable(sql, "battle_map", campaign, actor)}
          where encounter_run_board.run_id = ${runId}
        `,
      });

      /**
       * The fight's fog, rewritten as one set: the whole-board change first,
       * then `hide` added and `reveal` taken out, distinct and in order. A
       * square is `row * board_columns + column`, the column's own spelling.
       */
      const fog = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            runId: EncounterRunId,
            whole: Schema.Literals(["revealAll", "coverAll", "reset", "none"]),
            hide: Schema.Array(Schema.Int),
            reveal: Schema.Array(Schema.Int),
          }),
        ),
        Result: fromColumns(Schema.Struct({ hidden: Schema.Int, shown: Schema.Boolean })),
        execute: ({ runId, whole, hide, reveal }) => sql`
          update encounter_run_board
          set fog_hidden = array(
            select distinct square
            from unnest(
              case ${whole}::text
                when 'revealAll' then '{}'::integer[]
                when 'coverAll' then array(
                  select generate_series(0, board_columns * board_rows - 1))
                when 'reset' then fog_start
                else fog_hidden
              end || ${intArray([...hide])}
            ) as square
            where square <> all(${intArray([...reveal])})
            order by square
          )
          where run_id = ${runId}
          returning cardinality(fog_hidden) as hidden,
            (select ${boardShown(sql)} from encounter_run
              where encounter_run.id = encounter_run_board.run_id) as shown
        `,
      });

      return {
        forEncounter: (creator, encounterId) =>
          dieOnSqlError(
            map({ ...asked(creator), encounterId }).pipe(
              Effect.catchTag("NoSuchElementError", () => Effect.fail(missing(encounterId))),
            ),
          ),

        rosterTypes: (creator, encounterId) =>
          dieOnSqlError(
            Effect.map(types({ ...asked(creator), encounterId }), (rows) =>
              rows.map((row) => row.type),
            ),
          ),

        update: (creator, encounterId, patch) =>
          dieOnSqlError(
            change({
              ...asked(creator),
              encounterId,
              columns: defined({
                grid: patch.grid,
                board_columns: patch.columns,
                board_rows: patch.rows,
                feet_per_cell: patch.feetPerCell,
                cell_px: patch.alignment?.cellPx,
                offset_x_px: patch.alignment?.offsetXPx,
                offset_y_px: patch.alignment?.offsetYPx,
              }),
            }).pipe(Effect.catchTag("NoSuchElementError", () => Effect.fail(missing(encounterId)))),
          ),

        forRun: (creator, sessionId, runId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* run({ ...asked(creator), sessionId, runId }).pipe(
                orNotFound("encounter_run", runId),
              );
              return Option.getOrNull(yield* board({ ...asked(creator), runId }));
            }),
          ),

        updateFog: (creator, sessionId, runId, update) => {
          const current = Effect.flatMap(board({ ...asked(creator), runId }), (found) =>
            Option.match(found, {
              onNone: () => Effect.fail(new Conflict({ message: "this fight has no board" })),
              onSome: Effect.succeed,
            }),
          );
          return dieOnSqlError(
            sql
              .withTransaction(
                Effect.gen(function* () {
                  yield* run({ ...asked(creator), sessionId, runId }).pipe(
                    orNotFound("encounter_run", runId),
                  );
                  if (yield* requestAlreadyApplied(sql, runId, update.requestId)) {
                    return yield* current;
                  }

                  // The board's size, locked for the rest of this write, so
                  // two strokes of the brush land one after the other.
                  const boards = yield* sql<{
                    readonly board_columns: number;
                    readonly board_rows: number;
                  }>`
                    select encounter_run_board.board_columns, encounter_run_board.board_rows
                    from encounter_run_board
                    where encounter_run_board.run_id = ${runId}
                    for update
                  `;
                  const size = boards[0];
                  if (size === undefined) {
                    return yield* new Conflict({ message: "this fight has no board" });
                  }
                  const squares = [...(update.hide ?? []), ...(update.reveal ?? [])];
                  if (
                    squares.some(
                      (square) =>
                        square.column >= size.board_columns || square.row >= size.board_rows,
                    )
                  ) {
                    return yield* new Conflict({ message: "that square is off the board" });
                  }
                  const index = (square: { readonly column: number; readonly row: number }) =>
                    square.row * size.board_columns + square.column;

                  const changed = yield* fog({
                    runId,
                    whole: update.revealAll
                      ? "revealAll"
                      : update.coverAll
                        ? "coverAll"
                        : update.reset
                          ? "reset"
                          : "none",
                    hide: (update.hide ?? []).map(index),
                    reveal: (update.reveal ?? []).map(index),
                  }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                  yield* appendEvent(sql, {
                    sessionId,
                    kind: "board-fog-updated",
                    encounterRunId: runId,
                    payload: { hidden: changed.hidden },
                    requestId: update.requestId,
                    visibility: changed.shown ? "shared" : "dm",
                  });
                  return yield* current;
                }),
              )
              .pipe(
                // Two sends of one stroke that raced past the idempotency
                // check; the unique index refuses the second, as for a move.
                Effect.catch((error) =>
                  SqlError.isSqlError(error) && error.reason._tag === "UniqueViolation"
                    ? current
                    : Effect.fail(error),
                ),
                Effect.tap(() => live.touched(sessionId)),
              ),
          );
        },
      };
    }),
  );
}
