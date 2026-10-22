import { Schema, Struct } from "effect";
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
 * level's, and it is laid out on the same plane as every board (`Board.ts`).
 *
 * **The creator's whole**, on `EncounterRunBoard.level`. A seated player's
 * table carries `PlayerLiveLevel` instead: the party's view of it, narrowed in
 * SQL by what the party has seen (`0110_party_vision.ts`).
 */

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

/**
 * A character's darkvision in feet, from its sheet's traits: the most any
 * trait named for darkvision says (`… within 60 feet …`), or 0. The SRD's
 * races record darkvision only as the `Darkvision` trait's prose, which the
 * composers copy onto the sheet (`SheetGrants`), so the number is read from
 * that text; a trait that names no distance grants none, rather than a guess.
 */
export const darkvisionOf = (
  traits: ReadonlyArray<{ readonly name: string; readonly text?: string | undefined }>,
): number => {
  let feet = 0;
  for (const trait of traits) {
    if (!/darkvision/i.test(trait.name)) continue;
    const said = /(\d+)\s*(?:-\s*)?(?:feet|foot|ft\b)/i.exec(trait.text ?? "");
    if (said !== null) feet = Math.max(feet, Number(said[1]));
  }
  return feet;
};

/** A prop as the party sees it: never a DM-only one, so it carries no such flag. */
export const PlayerLevelProp = Schema.Struct(Struct.omit(LevelProp.fields, ["dmOnly"]));
export type PlayerLevelProp = typeof PlayerLevelProp.Type;

/** A light as the party sees it: only a lit one is sent, so it carries no switch. */
export const PlayerLevelLight = Schema.Struct(Struct.omit(LevelLight.fields, ["lit"]));
export type PlayerLevelLight = typeof PlayerLevelLight.Type;

/** A region as the party sees it: never a secret one, and only its squares the party has seen. */
export const PlayerLevelRegion = Schema.Struct(Struct.omit(LevelRegion.fields, ["secret"]));
export type PlayerLevelRegion = typeof PlayerLevelRegion.Type;

/**
 * A fight's level as a seated player's table has it: what the party has seen,
 * and nothing else (`0110_party_vision.ts`). A distinct schema, computed in SQL
 * against the board's `party_sees` and `party_seen` with the DM's fog taken
 * out, so nothing outside is ever selected:
 *
 * - `seen`, the squares explored, and `sees`, those in sight now (a subset),
 *   each ascending;
 * - `floor`, the material of each `seen` square, in `seen`'s order: no other
 *   square's floor is sent;
 * - walls touching a seen square; an unrevealed secret door is sent as a plain
 *   `wall` with no door state, and a revealed one as its `secretDoor`;
 * - props that are not DM-only whose footprint touches a seen square;
 * - lights that are lit and stand on a seen square;
 * - regions that are not secret, clipped to the seen squares.
 */
export const PlayerLiveLevel = Schema.Struct({
  ambient: LevelAmbient,
  sees: Schema.Array(Schema.Int),
  seen: Schema.Array(Schema.Int),
  floor: Schema.Array(Schema.Int),
  walls: Schema.Array(LevelWall),
  props: Schema.Array(PlayerLevelProp),
  lights: Schema.Array(PlayerLevelLight),
  regions: Schema.Array(PlayerLevelRegion),
});
export type PlayerLiveLevel = typeof PlayerLiveLevel.Type;

/**
 * The party's level as the geometry and the renderer read it: every square
 * not seen is `void` (`LEVEL_MATERIALS[0]`), and every part is what the table
 * was sent, so nothing drawn says more than the wire did.
 */
export const playerLevelLayout = (
  board: { readonly columns: number; readonly rows: number; readonly feetPerCell: number },
  level: PlayerLiveLevel,
): LevelLayout => {
  const floor = Array.from({ length: board.columns * board.rows }, () => 0);
  level.seen.forEach((square, k) => {
    if (square < floor.length) floor[square] = level.floor[k] ?? 0;
  });
  return {
    columns: board.columns,
    rows: board.rows,
    feetPerCell: board.feetPerCell,
    ambient: level.ambient,
    floor,
    walls: level.walls,
    props: level.props.map((prop) => ({ ...prop, dmOnly: false })),
    lights: level.lights.map((light) => ({ ...light, lit: true })),
    regions: level.regions.map((region) => ({ ...region, secret: false })),
  };
};

/** What the table knows of the secret doors on its level: every one it was sent is revealed. */
export const playerSight = (level: Pick<PlayerLiveLevel, "walls">): SightOptions => ({
  revealed: new Set(level.walls.filter((wall) => wall.kind === "secretDoor").map((w) => w.id)),
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
