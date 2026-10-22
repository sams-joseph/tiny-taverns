import { Schema } from "effect";
import { CampaignId, EncounterId } from "./Ids.js";
import { LevelLight, LevelProp, LevelRegion, LevelWall } from "./Level.js";
import type { LevelLayout, SightOptions } from "./LevelGeometry.js";
import { LevelAmbient, LevelDoorState } from "./LevelKit.js";

/**
 * A fight played on a level: the fight's own copy of it, the DM's live writes
 * to its doors and lights, and where a level is used.
 *
 * ### The snapshot
 *
 * A fight on an encounter with a level copies the level when it starts and
 * carries that copy to a resumed fight (`0109_level_fights.ts`), as a fight
 * keeps its grid (`0058`). Editing or deleting the level never moves a fight
 * in progress. The board's `columns`, `rows` and `feetPerCell` are the
 * level's, and the picture and its alignment do not apply: a level board is
 * drawn on itself, its alignment the plain grid.
 *
 * **The creator's alone**, on `EncounterRunBoard.level`. A player's table
 * carries none of it (`PlayerLiveBoard` is not widened): the party's narrowed
 * view of a level is computed in SQL in a later phase.
 */

/**
 * The pixels a square of a level board's plane is, with no offset: the
 * alignment every level fight's board carries, so the run board's tokens,
 * fog, areas and effects (all measured in the plane's pixels) land on the
 * squares the level is drawn on. The battle map's default square.
 */
export const LEVEL_BOARD_CELL_PX = 64;

/**
 * A wall of a fight's level: the level's wall with its door state live, and
 * `revealed`, whether the DM has revealed a secret door to the table. Only a
 * secret door is ever revealed; until it is, it is a wall to every rule a
 * player is held to (`LevelGeometry`'s `SightOptions.revealed`).
 */
export const RunLevelWall = Schema.Struct({
  ...LevelWall.fields,
  revealed: Schema.Boolean,
});
export type RunLevelWall = typeof RunLevelWall.Type;

/** A fight's copy of its level: everything but the board's size, which the board carries. */
export const RunBoardLevel = Schema.Struct({
  ambient: LevelAmbient,
  /** One `LEVEL_MATERIALS` index per square, row-major, `columns * rows` long. */
  floor: Schema.Array(Schema.Int),
  walls: Schema.Array(RunLevelWall),
  props: Schema.Array(LevelProp),
  /** `lit` is live: the DM lights and snuffs them. */
  lights: Schema.Array(LevelLight),
  regions: Schema.Array(LevelRegion),
});
export type RunBoardLevel = typeof RunBoardLevel.Type;

/** The board's size beside its level, as the geometry reads a level. */
export const runLevelLayout = (
  board: { readonly columns: number; readonly rows: number; readonly feetPerCell: number },
  level: RunBoardLevel,
): LevelLayout => ({
  columns: board.columns,
  rows: board.rows,
  feetPerCell: board.feetPerCell,
  ...level,
});

/**
 * What the table knows of a fight's secret doors: the ones the DM revealed.
 * The rules a player is held to (a move's walk) read this; the DM's own view
 * of the board knows every secret door.
 */
export const tableSight = (level: Pick<RunBoardLevel, "walls">): SightOptions => ({
  revealed: new Set(level.walls.filter((wall) => wall.revealed).map((wall) => wall.id)),
});

const requestId = Schema.optional(Schema.NonEmptyString.check(Schema.isBetweenLength(1, 128)));

/**
 * The DM's hand on one door of a fight's level: open, close or lock it, and,
 * for a secret door, reveal it to the table or hide it again. At least one of
 * the two. Answered with the board. `Conflict` for a fight that is over or has
 * no level, a wall that is not a door, and revealing a door that is not
 * secret; `NotFound` for a wall the fight's level does not have.
 */
export const BoardDoorUpdate = Schema.Struct({
  doorState: Schema.optional(LevelDoorState),
  revealed: Schema.optional(Schema.Boolean),
  requestId,
}).check(
  Schema.makeFilter((update) =>
    update.doorState === undefined && update.revealed === undefined
      ? "a door update names a door state, revealed, or both"
      : undefined,
  ),
);
export type BoardDoorUpdate = typeof BoardDoorUpdate.Type;

/**
 * The DM lights or snuffs one light of a fight's level. Answered with the
 * board. `Conflict` for a fight that is over or has no level; `NotFound` for
 * a light the fight's level does not have.
 */
export const BoardLightUpdate = Schema.Struct({
  lit: Schema.Boolean,
  requestId,
});
export type BoardLightUpdate = typeof BoardLightUpdate.Type;

/**
 * An encounter that names a level, with its campaign: what the level's delete
 * confirmation lists, since the delete takes the level off each of them.
 * Read by the level's owner, who is the creator of every one (an encounter
 * may name only its campaign's creator's level).
 */
export class LevelUse extends Schema.Class<LevelUse>("LevelUse")({
  encounterId: EncounterId,
  encounterName: Schema.String,
  campaignId: CampaignId,
  campaignName: Schema.String,
}) {}
