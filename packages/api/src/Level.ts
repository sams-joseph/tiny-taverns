import { Schema } from "effect";
import { LevelId, LevelPartId } from "./Ids.js";
import {
  LEVEL_LIGHT_FEET_MAX,
  LEVEL_MATERIALS,
  LEVEL_SQUARES_MAX,
  LevelAmbient,
  LevelCover,
  LevelDoorState,
  LevelLightTone,
  LevelPropKind,
  LevelRegionKind,
  LevelWallKind,
} from "./LevelKit.js";
import { type LevelLayout, propFootprint } from "./LevelGeometry.js";

/**
 * A level: a top-down battle map built of floors, walls, doors, props, lights
 * and regions, so line of sight, cover, light and movement can be computed.
 *
 * **Account-owned and top-level**, like a location: a level is in no campaign
 * and no world, and the Library's Levels shelf is its owner's only read.
 * Another account's level is `NotFound` everywhere.
 *
 * Coordinates are squares (`LevelKit.ts`): `x` across from the left edge, `y`
 * down from the top. A square's index is `row * columns + column`, the way a
 * fight's fog is spelled. Every bound here is restated by the tables'
 * checks (`0108_levels.ts`), so a level the schema refuses is one the
 * database would refuse too.
 */

/** The bounds the schema and the tables both state. */
export const LEVEL_NAME_MAX = 120;
export const LEVEL_DESCRIPTION_MAX = 2000;
/** The DMG's scale is 5; a square may stand for up to 100 feet. */
export const LEVEL_FEET_PER_CELL_MAX = 100;
export const LEVEL_FEET_PER_CELL_DEFAULT = 5;
/** The most parts of each kind one level holds: a 200 × 200 dungeon fits well inside. */
export const LEVEL_WALLS_MAX = 4000;
export const LEVEL_PROPS_MAX = 3000;
export const LEVEL_LIGHTS_MAX = 600;
export const LEVEL_REGIONS_MAX = 200;

/** The sizes a new level is offered at, in squares; any other is `columns × rows` within `LEVEL_SQUARES_MAX`. */
export const LEVEL_SIZES = {
  small: { columns: 32, rows: 24 },
  medium: { columns: 48, rows: 32 },
  large: { columns: 72, rows: 48 },
} as const;
export type LevelSize = keyof typeof LEVEL_SIZES;

const squares = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: LEVEL_SQUARES_MAX }));
const feetPerCell = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: LEVEL_FEET_PER_CELL_MAX }),
);
/** A grid vertex: whole or half squares, on a board of the largest size. */
const vertex = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: LEVEL_SQUARES_MAX }),
  Schema.isMultipleOf(0.5),
);
/** A whole square's column or row. */
const square = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: LEVEL_SQUARES_MAX - 1 }));
/** A point anywhere on a board of the largest size. */
const point = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: LEVEL_SQUARES_MAX }));
const lightFeet = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: LEVEL_LIGHT_FEET_MAX }));
const material = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: LEVEL_MATERIALS.length - 1 }),
);
const squareIndex = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: LEVEL_SQUARES_MAX * LEVEL_SQUARES_MAX - 1 }),
);

/**
 * A wall segment between two grid vertices. A door, open, closed or locked,
 * is a `door` or a `secretDoor`; a plain `wall` has no door state. A `low`
 * wall blocks movement but not sight.
 */
export const LevelWall = Schema.Struct({
  id: LevelPartId,
  x1: vertex,
  y1: vertex,
  x2: vertex,
  y2: vertex,
  kind: LevelWallKind,
  /** `null` unless a door. */
  doorState: Schema.NullOr(LevelDoorState),
  low: Schema.Boolean,
}).check(
  Schema.makeFilter((wall) => {
    const issues: Array<Schema.FilterIssue> = [];
    if ((wall.kind === "wall") !== (wall.doorState === null)) {
      issues.push({ path: ["doorState"], issue: "a door has a door state and a wall has none" });
    }
    if (wall.x1 === wall.x2 && wall.y1 === wall.y2) {
      issues.push({ path: ["x2"], issue: "a wall runs between two different vertices" });
    }
    return issues;
  }),
);
export type LevelWall = typeof LevelWall.Type;

/**
 * A prop from the code-built kit, its top-left square at `x`, `y`, turned
 * `rotation` quarter turns clockwise. Each behaviour is `null` for the kit's
 * default (`PROP_KINDS`) or the creator's override. A `dmOnly` prop is never
 * shown to a player.
 */
export const LevelProp = Schema.Struct({
  id: LevelPartId,
  kind: LevelPropKind,
  x: square,
  y: square,
  rotation: Schema.Literals([0, 1, 2, 3]),
  blocksMovement: Schema.NullOr(Schema.Boolean),
  blocksSight: Schema.NullOr(Schema.Boolean),
  cover: Schema.NullOr(LevelCover),
  difficult: Schema.NullOr(Schema.Boolean),
  dmOnly: Schema.Boolean,
});
export type LevelProp = typeof LevelProp.Type;

/**
 * A light at any point: `bright` feet of bright light, then `dim` feet more of
 * dim light (PHB). `lit` is whether it burns when a fight starts.
 */
export const LevelLight = Schema.Struct({
  id: LevelPartId,
  x: point,
  y: point,
  bright: lightFeet,
  dim: lightFeet,
  tone: LevelLightTone,
  flicker: Schema.Boolean,
  lit: Schema.Boolean,
});
export type LevelLight = typeof LevelLight.Type;

/** A painted set of squares with a rule of its own. A `secret` one is the DM's alone. */
export const LevelRegion = Schema.Struct({
  id: LevelPartId,
  kind: LevelRegionKind,
  /** `row * columns + column`, at least one. */
  squares: Schema.Array(squareIndex).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(LEVEL_SQUARES_MAX * LEVEL_SQUARES_MAX),
  ),
  secret: Schema.Boolean,
});
export type LevelRegion = typeof LevelRegion.Type;

/**
 * Everything that keeps a level on its own board, which no single field can
 * say: the floor has one material per square; walls, props' rotated
 * footprints, lights and region squares are inside `columns × rows`; and each
 * part's id is unique within the level. The tables state the same
 * (`0108_levels.ts`); this is what turns a refusal there into a `400` here.
 */
export const levelIssues = (level: LevelLayout): Array<Schema.FilterIssue> => {
  const issues: Array<Schema.FilterIssue> = [];
  const { columns, rows } = level;
  if (level.floor.length !== columns * rows) {
    issues.push({ path: ["floor"], issue: "the floor has one material per square" });
  }
  const unique = (key: string, parts: ReadonlyArray<{ readonly id: string }>) => {
    if (new Set(parts.map((part) => part.id)).size !== parts.length) {
      issues.push({ path: [key], issue: "each part's id is unique within the level" });
    }
  };
  unique("walls", level.walls);
  unique("props", level.props);
  unique("lights", level.lights);
  unique("regions", level.regions);
  level.walls.forEach((wall, index) => {
    if (Math.max(wall.x1, wall.x2) > columns || Math.max(wall.y1, wall.y2) > rows) {
      issues.push({ path: ["walls", index], issue: "a wall is on the board" });
    }
  });
  level.props.forEach((prop, index) => {
    const { width, height } = propFootprint(prop);
    if (prop.x + width > columns || prop.y + height > rows) {
      issues.push({ path: ["props", index], issue: "a prop's footprint is on the board" });
    }
  });
  level.lights.forEach((light, index) => {
    if (light.x > columns || light.y > rows) {
      issues.push({ path: ["lights", index], issue: "a light is on the board" });
    }
  });
  level.regions.forEach((region, index) => {
    if (region.squares.some((square) => square >= columns * rows)) {
      issues.push({ path: ["regions", index], issue: "a region's squares are on the board" });
    }
  });
  return issues;
};

const name = Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(LEVEL_NAME_MAX));

/**
 * A level, as its **owner** reads it: the whole document. `floor` is one
 * `LEVEL_MATERIALS` index per square, row-major, `columns * rows` long.
 * `version` goes back on the next save.
 */
export class Level extends Schema.Class<Level>("Level")({
  id: LevelId,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  columns: Schema.Int,
  rows: Schema.Int,
  feetPerCell: Schema.Int,
  ambient: LevelAmbient,
  floor: Schema.Array(Schema.Int),
  walls: Schema.Array(LevelWall),
  props: Schema.Array(LevelProp),
  lights: Schema.Array(LevelLight),
  regions: Schema.Array(LevelRegion),
  version: Schema.Int,
  origin: Schema.Literals(["authored", "assistant"]),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/** One of the owner's levels on the shelf: its size and how much is on it, not the document. */
export class LevelSummary extends Schema.Class<LevelSummary>("LevelSummary")({
  id: LevelId,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  columns: Schema.Int,
  rows: Schema.Int,
  feetPerCell: Schema.Int,
  wallCount: Schema.Int,
  propCount: Schema.Int,
  lightCount: Schema.Int,
  regionCount: Schema.Int,
  origin: Schema.Literals(["authored", "assistant"]),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * A new level in the asker's Library: an empty board of `void`, bright, with
 * nothing on it. No `origin`: a level kept from Hob is stamped by the accept.
 */
export const LevelCreate = Schema.Struct({
  name,
  /** Absent, `null` or blank is none. */
  description: Schema.optional(
    Schema.NullOr(Schema.String.check(Schema.isMaxLength(LEVEL_DESCRIPTION_MAX))),
  ),
  columns: squares,
  rows: squares,
  /** The DMG's 5 when omitted. */
  feetPerCell: Schema.optional(feetPerCell),
});
export type LevelCreate = typeof LevelCreate.Type;

/**
 * The owner's save: the whole document, replacing every part, with the
 * `version` it was read at. A save against an older version is a `Conflict`
 * and writes nothing. A blank description is stored as none.
 *
 * Bounded at {@link LEVEL_WALLS_MAX} walls, {@link LEVEL_PROPS_MAX} props,
 * {@link LEVEL_LIGHTS_MAX} lights and {@link LEVEL_REGIONS_MAX} regions, and
 * kept on its own board by {@link levelIssues}.
 */
export const LevelSave = Schema.Struct({
  name,
  description: Schema.NullOr(Schema.String.check(Schema.isMaxLength(LEVEL_DESCRIPTION_MAX))),
  columns: squares,
  rows: squares,
  feetPerCell,
  ambient: LevelAmbient,
  floor: Schema.Array(material).check(Schema.isMaxLength(LEVEL_SQUARES_MAX * LEVEL_SQUARES_MAX)),
  walls: Schema.Array(LevelWall).check(Schema.isMaxLength(LEVEL_WALLS_MAX)),
  props: Schema.Array(LevelProp).check(Schema.isMaxLength(LEVEL_PROPS_MAX)),
  lights: Schema.Array(LevelLight).check(Schema.isMaxLength(LEVEL_LIGHTS_MAX)),
  regions: Schema.Array(LevelRegion).check(Schema.isMaxLength(LEVEL_REGIONS_MAX)),
  version: Schema.Int,
}).check(Schema.makeFilter(levelIssues));
export type LevelSave = typeof LevelSave.Type;
