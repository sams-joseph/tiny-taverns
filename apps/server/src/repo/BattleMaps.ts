import {
  BattleMap,
  type BattleMapGrid,
  type BattleMapId,
  BattleMapImages,
  type BattleMapUpdate,
  type CampaignId,
  type EncounterId,
  EncounterRunBoard,
  type EncounterRunId,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { type ImageSigner, imageSigner } from "../images/ImageUrls.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { RUNS } from "./liveTables.js";
import { defined, dieOnSqlError, setClause } from "./rows.js";
import { nestedRowWritable, rowWritable } from "./visibility.js";

/**
 * Reads and writes over `battle_map`, every encounter's board
 * (`0057_battle_maps.ts`) — **the creator's alone**, so every method takes a
 * `CampaignCreatorActor` and still composes `rowWritable` beneath it. There is
 * no player read here, and no player path anywhere reads this table: gate
 * first, project later, for the day the table sees a map.
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
 * map's URL is minted.
 */

interface BattleMapRow {
  readonly id: BattleMapId;
  readonly encounter_id: EncounterId;
  readonly campaign_id: CampaignId;
  readonly setting: string | null;
  readonly grid: BattleMapGrid;
  readonly board_columns: number;
  readonly board_rows: number;
  readonly feet_per_cell: number;
  readonly cell_px: number;
  readonly offset_x_px: number;
  readonly offset_y_px: number;
  readonly created_at: Date;
  readonly updated_at: Date;
  /** From {@link battleMapImageColumns}; `null` when the map has no picture record. */
  readonly image_id: string | null;
  readonly image_state: "generating" | "ready" | "failed" | null;
  readonly image_width: number | null;
  readonly image_height: number | null;
}

/** `encounter_run_board`, with its map's setting line and picture beside it. */
interface RunBoardRow {
  /** The map as joined — `null` when the board's map is gone. */
  readonly map_id: BattleMapId | null;
  readonly setting: string | null;
  readonly grid: BattleMapGrid;
  readonly board_columns: number;
  readonly board_rows: number;
  readonly feet_per_cell: number;
  readonly cell_px: number;
  readonly offset_x_px: number;
  readonly offset_y_px: number;
  readonly image_id: string | null;
  readonly image_state: "generating" | "ready" | "failed" | null;
  readonly image_width: number | null;
  readonly image_height: number | null;
}

/**
 * The picture's facts beside a map row. **Every read that becomes a
 * `BattleMap` names this fragment** — `toBattleMap` dies on a row without it.
 */
const battleMapImageColumns = (sql: SqlClient.SqlClient) => sql`
  (select battle_map_image.id from battle_map_image
   where battle_map_image.map_id = battle_map.id) as image_id,
  (select battle_map_image.state from battle_map_image
   where battle_map_image.map_id = battle_map.id) as image_state,
  (select battle_map_image.width from battle_map_image
   where battle_map_image.map_id = battle_map.id) as image_width,
  (select battle_map_image.height from battle_map_image
   where battle_map_image.map_id = battle_map.id) as image_height
`;

/**
 * **The only place a battle map's URL is minted**, for a row a creator-gated
 * read below already returned. `undefined` signs nothing, the same answer a
 * server with no URL secret gives.
 */
const imagesOf = (
  row: BattleMapRow | RunBoardRow,
  sign: ImageSigner | undefined,
): BattleMap["image"] => {
  if (
    row.image_state !== "ready" ||
    row.image_id === null ||
    row.image_width === null ||
    row.image_height === null ||
    sign === undefined
  ) {
    return null;
  }
  const paths = sign("battleMap", row.image_id);
  return paths === null
    ? null
    : new BattleMapImages({
        cardUrl: paths.card,
        fullUrl: paths.full,
        width: row.image_width,
        height: row.image_height,
      });
};

const toBattleMap = (row: BattleMapRow, sign: ImageSigner | undefined): BattleMap => {
  if (row.image_state === undefined) {
    throw new Error("a battle map read did not select battleMapImageColumns");
  }
  return new BattleMap({
    id: row.id,
    encounterId: row.encounter_id,
    campaignId: row.campaign_id,
    setting: row.setting,
    grid: row.grid,
    columns: row.board_columns,
    rows: row.board_rows,
    feetPerCell: row.feet_per_cell,
    alignment: {
      cellPx: row.cell_px,
      offsetXPx: row.offset_x_px,
      offsetYPx: row.offset_y_px,
    },
    image: imagesOf(row, sign),
    imagePending: row.image_state === "generating",
    createdAt: DateTime.fromDateUnsafe(row.created_at),
    updatedAt: DateTime.fromDateUnsafe(row.updated_at),
  });
};

const toRunBoard = (row: RunBoardRow, sign: ImageSigner | undefined): EncounterRunBoard =>
  new EncounterRunBoard({
    mapId: row.map_id,
    setting: row.setting,
    grid: row.grid,
    columns: row.board_columns,
    rows: row.board_rows,
    feetPerCell: row.feet_per_cell,
    alignment: {
      cellPx: row.cell_px,
      offsetXPx: row.offset_x_px,
      offsetYPx: row.offset_y_px,
    },
    image: imagesOf(row, sign),
    imagePending: row.image_state === "generating",
  });

export class BattleMaps extends Context.Service<
  BattleMaps,
  {
    /** The encounter's map, or `NotFound` for an encounter this creator does not hold. */
    readonly forEncounter: (
      creator: CampaignCreatorActor,
      encounterId: EncounterId,
    ) => Effect.Effect<BattleMap, NotFound>;
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
  }
>()("BattleMaps") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const sign = yield* imageSigner;
      const missing = (encounterId: EncounterId) =>
        new NotFound({ resource: "battle map", id: encounterId });

      return {
        forEncounter: (creator, encounterId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<BattleMapRow>`
                select battle_map.*, ${battleMapImageColumns(sql)} from battle_map
                where battle_map.encounter_id = ${encounterId}
                  and ${rowWritable(sql, "battle_map", creator.campaign, creator.actor)}
              `;
              if (rows.length === 0) return yield* missing(encounterId);
              return toBattleMap(rows[0]!, sign);
            }),
          ),

        update: (creator, encounterId, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const columns = defined({
                grid: patch.grid,
                board_columns: patch.columns,
                board_rows: patch.rows,
                feet_per_cell: patch.feetPerCell,
                cell_px: patch.alignment?.cellPx,
                offset_x_px: patch.alignment?.offsetXPx,
                offset_y_px: patch.alignment?.offsetYPx,
              });
              const rows = yield* sql<BattleMapRow>`
                update battle_map set ${setClause(sql, columns)}
                where battle_map.encounter_id = ${encounterId}
                  and ${rowWritable(sql, "battle_map", creator.campaign, creator.actor)}
                returning battle_map.*, ${battleMapImageColumns(sql)}
              `;
              if (rows.length === 0) return yield* missing(encounterId);
              return toBattleMap(rows[0]!, sign);
            }),
          ),

        forRun: (creator, sessionId, runId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const runs = yield* sql<{ readonly id: EncounterRunId }>`
                select encounter_run.id from encounter_run
                where encounter_run.id = ${runId}
                  and ${nestedRowWritable(sql, RUNS, sessionId, creator.campaign, creator.actor)}
              `;
              if (runs.length === 0) {
                return yield* new NotFound({ resource: "encounter_run", id: runId });
              }
              // The map is joined through the creator's own predicate again,
              // so the board's pointer grants nothing a map read would not:
              // a pointer that somehow named another table's map reads as none.
              const rows = yield* sql<RunBoardRow>`
                select battle_map.id as map_id, battle_map.setting,
                       encounter_run_board.grid, encounter_run_board.board_columns,
                       encounter_run_board.board_rows, encounter_run_board.feet_per_cell,
                       encounter_run_board.cell_px, encounter_run_board.offset_x_px,
                       encounter_run_board.offset_y_px,
                       ${battleMapImageColumns(sql)}
                from encounter_run_board
                left join battle_map on battle_map.id = encounter_run_board.map_id
                  and ${rowWritable(sql, "battle_map", creator.campaign, creator.actor)}
                where encounter_run_board.run_id = ${runId}
              `;
              return rows.length === 0 ? null : toRunBoard(rows[0]!, sign);
            }),
          ),
      };
    }),
  );
}
