import {
  LEVEL_PROP_KINDS,
  PROP_KINDS,
  lightSources,
  partyVision,
  propFootprint,
  sightSegments,
  visibilityPolygon,
  visionSegments,
  type LevelLayout,
  type LevelLightTone,
  type LevelPropKind,
  type SightOptions,
  type SightSegment,
  type VisibilityPolygon,
} from "@taverns/api";
import type { Point, Segment } from "./document";
import type { Viewer } from "./picking";

/**
 * A level as the renderer draws it: what floor, walls, doors, props, lights
 * and vision fans exist and where. Pure and WebGL-free, so a test can pin it;
 * `renderer.ts` turns each part into meshes and rebuilds a part only when the
 * arrays it reads have changed.
 *
 * Every rule comes from `LevelGeometry.ts` (what blocks sight, a prop's
 * footprint, which lights shine, what the party sees); this file only arranges
 * the results for drawing.
 */

/**
 * Who is looking. The DM's editor knows every secret door; the party's
 * preview knows none (the editor has no record of what a party has found).
 */
export interface Reader {
  readonly revealed: ReadonlySet<string>;
  /** The party's view: DM-only props are not drawn. */
  readonly party: boolean;
}

/** The DM's reader: every secret door found, every prop drawn. */
export const dmReader = (level: Pick<LevelLayout, "walls">): Reader => {
  const known = dmReaders.get(level.walls);
  if (known !== undefined) return known;
  const reader: Reader = {
    revealed: new Set(level.walls.filter((w) => w.kind === "secretDoor").map((w) => w.id)),
    party: false,
  };
  dmReaders.set(level.walls, reader);
  return reader;
};

/** One DM reader per walls array, so an edit that leaves the walls alone rebuilds nothing that reads them. */
const dmReaders = new WeakMap<LevelLayout["walls"], Reader>();

/** The party's reader in the preview: no secret door found, no DM-only prop drawn. */
export const partyReader: Reader = { revealed: new Set(), party: true };

const sightOptions = (reader: Reader): SightOptions => ({ revealed: reader.revealed });

// ---------------------------------------------------------------------------
// Floor

export interface FloorPart {
  readonly columns: number;
  readonly rows: number;
  /** One `LEVEL_MATERIALS` index per square, row-major, as a texture's bytes. */
  readonly materials: Uint8Array;
}

export const describeFloor = (level: LevelLayout): FloorPart => {
  const materials = new Uint8Array(level.columns * level.rows);
  for (let k = 0; k < materials.length; k++) materials[k] = level.floor[k] ?? 0;
  return { columns: level.columns, rows: level.rows, materials };
};

// ---------------------------------------------------------------------------
// Walls and doors

/** How far a door's jamb runs into the opening, in squares, and how far past its end. */
export const JAMB = 0.14;
const JAMB_PAST = 0.12;

export interface DoorPart {
  readonly id: string;
  /** Where the leaf turns. */
  readonly hinge: Point;
  /** The unit direction of the shut leaf, along the wall. */
  readonly along: Point;
  /** The unit direction the leaf swings to, a quarter turn from `along`. */
  readonly swing: Point;
  readonly length: number;
  readonly open: boolean;
  readonly locked: boolean;
  /** The stone either side of the opening. */
  readonly jambs: readonly [Segment, Segment];
}

export interface WallsPart {
  /** Every run drawn as stone: walls, low walls, and secret doors shut or unknown. */
  readonly solid: ReadonlyArray<Segment>;
  readonly doors: ReadonlyArray<DoorPart>;
}

export const describeWalls = (level: LevelLayout, reader: Reader): WallsPart => {
  const solid: Array<Segment> = [];
  const doors: Array<DoorPart> = [];
  for (const wall of level.walls) {
    const known = wall.kind === "door" || reader.revealed.has(wall.id);
    const asDoor =
      wall.kind === "door" || (wall.kind === "secretDoor" && known && wall.doorState === "open");
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (!asDoor || length < 1e-6) {
      solid.push({ x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 });
      continue;
    }
    const ux = (wall.x2 - wall.x1) / length;
    const uy = (wall.y2 - wall.y1) / length;
    doors.push({
      id: wall.id,
      hinge: { x: wall.x1 + ux * JAMB, y: wall.y1 + uy * JAMB },
      along: { x: ux, y: uy },
      swing: { x: -uy, y: ux },
      length: Math.max(0.05, length - JAMB * 2),
      open: wall.doorState === "open",
      locked: wall.doorState === "locked",
      jambs: [
        {
          x1: wall.x1 - ux * JAMB_PAST,
          y1: wall.y1 - uy * JAMB_PAST,
          x2: wall.x1 + ux * JAMB,
          y2: wall.y1 + uy * JAMB,
        },
        {
          x1: wall.x2 - ux * JAMB,
          y1: wall.y2 - uy * JAMB,
          x2: wall.x2 + ux * JAMB_PAST,
          y2: wall.y2 + uy * JAMB_PAST,
        },
      ],
    });
  }
  return { solid, doors };
};

/** Where a door's leaf ends when it has swung `amount` of the way open (0 shut, 1 open). */
export const leafEnd = (door: DoorPart, amount: number): Point => {
  const angle = (Math.PI / 2) * Math.max(0, Math.min(1, amount));
  const dx = Math.cos(angle) * door.along.x + Math.sin(angle) * door.swing.x;
  const dy = Math.cos(angle) * door.along.y + Math.sin(angle) * door.swing.y;
  return { x: door.hinge.x + dx * door.length, y: door.hinge.y + dy * door.length };
};

// ---------------------------------------------------------------------------
// Props

export interface PropInstance {
  readonly id: string;
  /** The footprint's centre. */
  readonly cx: number;
  readonly cy: number;
  /** Quarter turns clockwise. */
  readonly rotation: number;
}

/** Every placed prop, grouped by kind, so each kind draws as one instanced batch. */
export type PropsPart = ReadonlyMap<LevelPropKind, ReadonlyArray<PropInstance>>;

export const describeProps = (level: LevelLayout, reader: Reader): PropsPart => {
  const out = new Map<LevelPropKind, Array<PropInstance>>();
  for (const kind of LEVEL_PROP_KINDS) out.set(kind, []);
  for (const prop of level.props) {
    if (reader.party && prop.dmOnly) continue;
    const { column, row, width, height } = propFootprint(prop);
    out.get(prop.kind)?.push({
      id: prop.id,
      cx: column + width / 2,
      cy: row + height / 2,
      rotation: ((prop.rotation % 4) + 4) % 4,
    });
  }
  return out;
};

/** The kinds that lie flat on the floor: drawn under everything else, with no shadow. */
export const flatKinds = (): ReadonlyArray<LevelPropKind> =>
  LEVEL_PROP_KINDS.filter((kind) => PROP_KINDS[kind].flat);

// ---------------------------------------------------------------------------
// Lights

export interface LightPart {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Bright, then dim, in squares. */
  readonly bright: number;
  readonly dim: number;
  readonly tone: LevelLightTone;
  readonly flicker: boolean;
  /** Carried by a prop (a brazier), which draws a larger flame. */
  readonly fromProp: boolean;
  /** Where its light falls, a fan about `(x, y)`. */
  readonly polygon: VisibilityPolygon;
}

/** What stops light for this reader: walls, shut doors, sight-blocking props and the board's edge. */
export const lightBlockers = (level: LevelLayout, reader: Reader): ReadonlyArray<SightSegment> =>
  sightSegments(level, sightOptions(reader));

/**
 * Every light that shines (`lightSources`: lit lights, then the lights props
 * carry), each with the polygon its light reaches. A prop's own light
 * flickers, as a flame does.
 */
export const describeLights = (
  level: LevelLayout,
  blockers: ReadonlyArray<SightSegment>,
): ReadonlyArray<LightPart> => {
  const flickers = new Map(level.lights.map((light) => [light.id, light.flicker]));
  return lightSources(level).map((source) => {
    const bright = source.bright / level.feetPerCell;
    const dim = source.dim / level.feetPerCell;
    const fromProp = !flickers.has(source.id);
    return {
      id: source.id,
      x: source.x,
      y: source.y,
      bright,
      dim,
      tone: source.tone,
      flicker: flickers.get(source.id) ?? true,
      fromProp,
      polygon: visibilityPolygon({ x: source.x, y: source.y }, bright + dim, blockers),
    };
  });
};

// ---------------------------------------------------------------------------
// The party's vision

export interface ViewerSight {
  readonly id: string;
  readonly origin: Point;
  /** What it can see out to the level's far corner: its line of sight. */
  readonly polygon: VisibilityPolygon;
  /** Its darkvision, in squares (0 for none). */
  readonly darkvision: number;
}

export interface VisionPart {
  readonly viewers: ReadonlyArray<ViewerSight>;
  /**
   * The squares the party sees now: `partyVision`, the rule the server's
   * `party_sees` write runs. The fans above only shape its edges.
   */
  readonly sees: ReadonlyArray<number>;
}

export const describeVision = (
  level: LevelLayout,
  viewers: ReadonlyArray<Viewer>,
  reader: Reader,
): VisionPart => {
  const options = sightOptions(reader);
  const segments = visionSegments(level, options);
  const reach = Math.hypot(level.columns, level.rows) + 1;
  return {
    viewers: viewers.map((viewer) => {
      const origin = { x: viewer.column + 0.5, y: viewer.row + 0.5 };
      return {
        id: viewer.id,
        origin,
        polygon: visibilityPolygon(origin, reach, segments),
        darkvision: viewer.darkvision / level.feetPerCell,
      };
    }),
    sees: partyVision(
      level,
      viewers.map((viewer) => ({
        square: { column: viewer.column, row: viewer.row },
        darkvision: viewer.darkvision,
      })),
      options,
    ),
  };
};

// ---------------------------------------------------------------------------
// The whole scene

export interface SceneDescription {
  readonly floor: FloorPart;
  readonly walls: WallsPart;
  readonly props: PropsPart;
  readonly lights: ReadonlyArray<LightPart>;
}

/** The whole level at once; the renderer builds the same parts one at a time as they change. */
export const describeScene = (level: LevelLayout, reader: Reader): SceneDescription => ({
  floor: describeFloor(level),
  walls: describeWalls(level, reader),
  props: describeProps(level, reader),
  lights: describeLights(level, lightBlockers(level, reader)),
});
