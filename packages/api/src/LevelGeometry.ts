import type { BoardSquare } from "./BattleMap.js";
import {
  DIFFICULT_MATERIALS,
  LEVEL_MATERIALS,
  PROP_KINDS,
  type LevelAmbient,
  type LevelCover,
  type LevelDoorState,
  type LevelLightTone,
  type LevelPropKind,
  type LevelRegionKind,
  type LevelWallKind,
} from "./LevelKit.js";

/**
 * The geometry a level's rules read: what blocks sight, what a point can see,
 * how lit a square is, what cover a target has and what a step costs. The
 * editor's preview, the run board, the server's party vision write and Hob's
 * turns all call these, so they agree by construction.
 *
 * Everything is pure and deterministic. Coordinates are squares, `x` across
 * from the left edge and `y` down from the top (`LevelKit.ts`); a square
 * `{ column, row }` spans `[column, column + 1) × [row, row + 1)` and its
 * centre is `(column + ½, row + ½)`. Light and darkvision are in feet and are
 * converted by the level's `feetPerCell`, measured straight (Euclidean) from
 * point to centre, as the light is drawn.
 *
 * The input is structural ({@link LevelLayout}) so that a level off the wire,
 * a fight's snapshot and the editor's local document all fit without an
 * adapter.
 */

/** A point on a level, in squares. */
export interface LevelPoint {
  readonly x: number;
  readonly y: number;
}

/** A straight edge that stops sight, in squares. */
export interface SightSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** The parts of a wall the geometry reads. */
export interface LayoutWall {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly kind: LevelWallKind;
  /** `null` unless a door; a door with no state is closed. */
  readonly doorState: LevelDoorState | null;
  /** Blocks movement, not sight. */
  readonly low: boolean;
}

/** The parts of a placed prop the geometry reads. Each `null` flag is the kit's default. */
export interface LayoutProp {
  readonly id: string;
  readonly kind: LevelPropKind;
  /** The top-left square of its footprint. */
  readonly x: number;
  readonly y: number;
  /** Quarter turns clockwise, 0 to 3. */
  readonly rotation: number;
  readonly blocksMovement: boolean | null;
  readonly blocksSight: boolean | null;
  readonly cover: LevelCover | null;
  readonly difficult: boolean | null;
  readonly dmOnly: boolean;
}

/** The parts of a light the geometry reads. */
export interface LayoutLight {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Feet of bright light, then `dim` feet more of dim light. */
  readonly bright: number;
  readonly dim: number;
  readonly tone: LevelLightTone;
  readonly flicker: boolean;
  readonly lit: boolean;
}

/** The parts of a painted region the geometry reads. */
export interface LayoutRegion {
  readonly id: string;
  readonly kind: LevelRegionKind;
  /** Square indices, `row * columns + column`. */
  readonly squares: ReadonlyArray<number>;
  readonly secret: boolean;
}

/** A level as the geometry reads it: the wire's `Level` and a fight's snapshot both fit. */
export interface LevelLayout {
  readonly columns: number;
  readonly rows: number;
  readonly feetPerCell: number;
  readonly ambient: LevelAmbient;
  /** One `LEVEL_MATERIALS` index per square, row-major. */
  readonly floor: ReadonlyArray<number>;
  readonly walls: ReadonlyArray<LayoutWall>;
  readonly props: ReadonlyArray<LayoutProp>;
  readonly lights: ReadonlyArray<LayoutLight>;
  readonly regions: ReadonlyArray<LayoutRegion>;
}

/** How lit a square is. */
export type LightLevel = LevelAmbient;

/**
 * What a reader knows about the level's secret doors. Unfound, a secret door
 * is a wall whatever its state; found (its id in `revealed`), it is a door.
 * The server passes what the party has found; the DM's own view passes every
 * secret door.
 */
export interface SightOptions {
  readonly revealed?: ReadonlySet<string>;
}

/** A square's index in the level's per-square arrays (`floor`, a region's squares, party vision). */
export const levelSquareIndex = (
  level: Pick<LevelLayout, "columns">,
  square: BoardSquare,
): number => square.row * level.columns + square.column;

const onLevel = (level: Pick<LevelLayout, "columns" | "rows">, square: BoardSquare): boolean =>
  Number.isInteger(square.column) &&
  Number.isInteger(square.row) &&
  square.column >= 0 &&
  square.row >= 0 &&
  square.column < level.columns &&
  square.row < level.rows;

const centreOf = (square: BoardSquare): LevelPoint => ({
  x: square.column + 0.5,
  y: square.row + 0.5,
});

// ---------------------------------------------------------------------------
// Props

/** The squares a placed prop covers: the kit's size, width and height swapped on an odd quarter turn. */
export interface PropFootprint {
  readonly column: number;
  readonly row: number;
  readonly width: number;
  readonly height: number;
}

export const propFootprint = (
  prop: Pick<LayoutProp, "kind" | "x" | "y" | "rotation">,
): PropFootprint => {
  const kind = PROP_KINDS[prop.kind];
  const turned = prop.rotation % 2 !== 0;
  return {
    column: prop.x,
    row: prop.y,
    width: turned ? kind.height : kind.width,
    height: turned ? kind.width : kind.height,
  };
};

/** A placed prop's 5e behaviour: each override where it has one, else its kind's default. */
export interface PropBehaviour {
  readonly blocksMovement: boolean;
  readonly blocksSight: boolean;
  readonly cover: LevelCover;
  readonly difficult: boolean;
}

export const propBehaviour = (
  prop: Pick<LayoutProp, "kind" | "blocksMovement" | "blocksSight" | "cover" | "difficult">,
): PropBehaviour => {
  const kind = PROP_KINDS[prop.kind];
  return {
    blocksMovement: prop.blocksMovement ?? kind.blocksMovement,
    blocksSight: prop.blocksSight ?? kind.blocksSight,
    cover: prop.cover ?? kind.cover,
    difficult: prop.difficult ?? kind.difficult,
  };
};

const footprintHas = (footprint: PropFootprint, square: BoardSquare): boolean =>
  square.column >= footprint.column &&
  square.column < footprint.column + footprint.width &&
  square.row >= footprint.row &&
  square.row < footprint.row + footprint.height;

// ---------------------------------------------------------------------------
// Walls and what blocks sight

const doorOpen = (wall: LayoutWall, options: SightOptions): boolean => {
  if (wall.kind === "door") return wall.doorState === "open";
  if (wall.kind === "secretDoor") {
    return wall.doorState === "open" && options.revealed?.has(wall.id) === true;
  }
  return false;
};

/** A wall stops sight unless it is low or an open door; an unfound secret door always does. */
export const wallBlocksSight = (wall: LayoutWall, options: SightOptions = {}): boolean =>
  !wall.low && !doorOpen(wall, options);

/** A wall stops feet unless it is an open door; a low wall does, an unfound secret door does. */
export const wallBlocksMovement = (wall: LayoutWall, options: SightOptions = {}): boolean =>
  !doorOpen(wall, options);

/**
 * How far every sight segment runs past its ends, in squares. Two walls that
 * meet at a vertex then overlap there, so a ray aimed exactly at the joint
 * meets one of them instead of slipping between two rounding errors. The hit
 * test's `SLACK` guards the same joint from the ray's side. Either alone closes
 * the leaks the tests measure; with neither, rays slip out of a closed room.
 */
const HAIR = 0.003;
/** How far a box-shaped prop's outline sits inside its footprint. */
const PROP_INSET = 0.08;
/** A round prop's outline: a polygon of this many sides, this fraction of its footprint across. */
const ROUND_SIDES = 12;
const ROUND_RADIUS = 0.38;

const extended = (x1: number, y1: number, x2: number, y2: number): SightSegment => {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length === 0) return { x1, y1, x2, y2 };
  const ux = ((x2 - x1) / length) * HAIR;
  const uy = ((y2 - y1) / length) * HAIR;
  return { x1: x1 - ux, y1: y1 - uy, x2: x2 + ux, y2: y2 + uy };
};

const propOutline = (prop: LayoutProp): ReadonlyArray<SightSegment> => {
  const { column, row, width, height } = propFootprint(prop);
  if (PROP_KINDS[prop.kind].round) {
    const cx = column + width / 2;
    const cy = row + height / 2;
    const radius = Math.min(width, height) * ROUND_RADIUS;
    return Array.from({ length: ROUND_SIDES }, (_, k) => {
      const a = (k / ROUND_SIDES) * 2 * Math.PI;
      const b = ((k + 1) / ROUND_SIDES) * 2 * Math.PI;
      return extended(
        cx + Math.cos(a) * radius,
        cy + Math.sin(a) * radius,
        cx + Math.cos(b) * radius,
        cy + Math.sin(b) * radius,
      );
    });
  }
  const left = column + PROP_INSET;
  const top = row + PROP_INSET;
  const right = column + width - PROP_INSET;
  const bottom = row + height - PROP_INSET;
  return [
    extended(left, top, right, top),
    extended(right, top, right, bottom),
    extended(right, bottom, left, bottom),
    extended(left, bottom, left, top),
  ];
};

/**
 * What stops sight and light on a level: its walls (not low ones, not open
 * doors, and every secret door not in `revealed`), the outline of every
 * sight-blocking prop (a polygon for a round one, its footprint for the
 * rest), and the board's edge. Each segment runs a hair past its ends (see
 * `HAIR`).
 *
 * Magical darkness and heavy obscurement are not here: light passes through
 * them. {@link visionSegments} adds them for what a creature sees.
 */
export const sightSegments = (
  level: LevelLayout,
  options: SightOptions = {},
): ReadonlyArray<SightSegment> => {
  const out: Array<SightSegment> = [];
  for (const wall of level.walls) {
    if (wallBlocksSight(wall, options)) out.push(extended(wall.x1, wall.y1, wall.x2, wall.y2));
  }
  for (const prop of level.props) {
    if (propBehaviour(prop).blocksSight) out.push(...propOutline(prop));
  }
  const { columns, rows } = level;
  out.push(
    extended(0, 0, columns, 0),
    extended(columns, 0, columns, rows),
    extended(columns, rows, 0, rows),
    extended(0, rows, 0, 0),
  );
  return out;
};

const regionMask = (level: LevelLayout, kinds: ReadonlyArray<LevelRegionKind>): Uint8Array => {
  const mask = new Uint8Array(level.columns * level.rows);
  for (const region of level.regions) {
    if (!kinds.includes(region.kind)) continue;
    for (const square of region.squares) {
      if (square >= 0 && square < mask.length) mask[square] = 1;
    }
  }
  return mask;
};

/** Regions no creature sees into or through (PHB, heavily obscured; darkvision cannot see through magical darkness). */
const OBSCURING: ReadonlyArray<LevelRegionKind> = ["magicalDarkness", "heavyObscurement"];

/**
 * What stops a creature's sight: {@link sightSegments}, plus every edge of
 * every magically dark or heavily obscured square. A viewer outside such a
 * square sees neither into it nor past it; a viewer standing in one sees only
 * that square.
 */
export const visionSegments = (
  level: LevelLayout,
  options: SightOptions = {},
): ReadonlyArray<SightSegment> => {
  const out = [...sightSegments(level, options)];
  const obscured = regionMask(level, OBSCURING);
  const edges = new Set<string>();
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    const key = `${String(x1)},${String(y1)},${String(x2)},${String(y2)}`;
    if (edges.has(key)) return;
    edges.add(key);
    out.push(extended(x1, y1, x2, y2));
  };
  for (let index = 0; index < obscured.length; index++) {
    if (obscured[index] === 0) continue;
    const column = index % level.columns;
    const row = Math.floor(index / level.columns);
    edge(column, row, column + 1, row);
    edge(column, row + 1, column + 1, row + 1);
    edge(column, row, column, row + 1);
    edge(column + 1, row, column + 1, row + 1);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Casting rays
//
// A uniform grid of buckets over the segments' extent, walked cell by cell
// along a ray (Amanatides and Woo), so a ray only meets the segments near its
// path. Built once per segments array and kept in a WeakMap: the segment
// arrays these functions take are treated as immutable.

const BUCKET = 4;
/** Slack in the hit test, so a ray through a segment's very end still meets it. */
const SLACK = 1e-9;

interface SegmentIndex {
  readonly count: number;
  readonly x1: Float64Array;
  readonly y1: Float64Array;
  readonly sx: Float64Array;
  readonly sy: Float64Array;
  readonly left: number;
  readonly top: number;
  readonly across: number;
  readonly down: number;
  readonly buckets: ReadonlyArray<ReadonlyArray<number>>;
  /** Scratch: the pass that last tested each segment, so a long one is tested once a ray. */
  readonly marks: Uint32Array;
  pass: number;
}

const indexes = new WeakMap<ReadonlyArray<SightSegment>, SegmentIndex>();

const indexOf = (segments: ReadonlyArray<SightSegment>): SegmentIndex => {
  const known = indexes.get(segments);
  if (known !== undefined) return known;
  const count = segments.length;
  const x1 = new Float64Array(count);
  const y1 = new Float64Array(count);
  const sx = new Float64Array(count);
  const sy = new Float64Array(count);
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  segments.forEach((s, k) => {
    x1[k] = s.x1;
    y1[k] = s.y1;
    sx[k] = s.x2 - s.x1;
    sy[k] = s.y2 - s.y1;
    minX = Math.min(minX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxX = Math.max(maxX, s.x1, s.x2);
    maxY = Math.max(maxY, s.y1, s.y2);
  });
  const left = Math.floor(minX) - BUCKET;
  const top = Math.floor(minY) - BUCKET;
  const across = Math.ceil((maxX - left) / BUCKET) + 2;
  const down = Math.ceil((maxY - top) / BUCKET) + 2;
  const buckets: Array<Array<number>> = Array.from({ length: across * down }, () => []);
  const pad = 1e-6;
  segments.forEach((s, k) => {
    const c0 = Math.floor((Math.min(s.x1, s.x2) - pad - left) / BUCKET);
    const c1 = Math.floor((Math.max(s.x1, s.x2) + pad - left) / BUCKET);
    const r0 = Math.floor((Math.min(s.y1, s.y2) - pad - top) / BUCKET);
    const r1 = Math.floor((Math.max(s.y1, s.y2) + pad - top) / BUCKET);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) buckets[r * across + c]!.push(k);
    }
  });
  const index: SegmentIndex = {
    count,
    x1,
    y1,
    sx,
    sy,
    left,
    top,
    across,
    down,
    buckets,
    marks: new Uint32Array(count),
    pass: 0,
  };
  indexes.set(segments, index);
  return index;
};

/** How far along the unit ray `(ox, oy) + t·(ux, uy)` it meets segment `k`, or `Infinity`. */
const hitAt = (
  index: SegmentIndex,
  k: number,
  ox: number,
  oy: number,
  ux: number,
  uy: number,
): number => {
  const sx = index.sx[k]!;
  const sy = index.sy[k]!;
  const den = ux * sy - uy * sx;
  if (Math.abs(den) < 1e-12) return Infinity;
  const ax = index.x1[k]! - ox;
  const ay = index.y1[k]! - oy;
  const t = (ax * sy - ay * sx) / den;
  const u = (ax * uy - ay * ux) / den;
  return t > SLACK && u >= -SLACK && u <= 1 + SLACK ? t : Infinity;
};

/** The distance along a unit ray to the first segment it meets, at most `limit`. */
const castRay = (
  index: SegmentIndex,
  ox: number,
  oy: number,
  ux: number,
  uy: number,
  limit: number,
): number => {
  let best = limit;
  let column = Math.floor((ox - index.left) / BUCKET);
  let row = Math.floor((oy - index.top) / BUCKET);
  if (column < 0 || row < 0 || column >= index.across || row >= index.down) {
    for (let k = 0; k < index.count; k++) best = Math.min(best, hitAt(index, k, ox, oy, ux, uy));
    return best;
  }
  if (index.pass >= 0xffffffff) {
    index.marks.fill(0);
    index.pass = 0;
  }
  const pass = ++index.pass;
  const stepX = ux > 0 ? 1 : -1;
  const stepY = uy > 0 ? 1 : -1;
  let nextX =
    ux > 0
      ? (index.left + (column + 1) * BUCKET - ox) / ux
      : ux < 0
        ? (index.left + column * BUCKET - ox) / ux
        : Infinity;
  let nextY =
    uy > 0
      ? (index.top + (row + 1) * BUCKET - oy) / uy
      : uy < 0
        ? (index.top + row * BUCKET - oy) / uy
        : Infinity;
  const deltaX = ux === 0 ? Infinity : BUCKET / Math.abs(ux);
  const deltaY = uy === 0 ? Infinity : BUCKET / Math.abs(uy);
  for (;;) {
    for (const k of index.buckets[row * index.across + column]!) {
      if (index.marks[k] === pass) continue;
      index.marks[k] = pass;
      const t = hitAt(index, k, ox, oy, ux, uy);
      if (t < best) best = t;
    }
    // A hit is found by the time the walk reaches the bucket it lies in.
    const exit = Math.min(nextX, nextY);
    if (best <= exit) return best;
    if (nextX < nextY) {
      column += stepX;
      nextX += deltaX;
    } else {
      row += stepY;
      nextY += deltaY;
    }
    if (column < 0 || row < 0 || column >= index.across || row >= index.down) return best;
  }
};

const clearBetween = (
  index: SegmentIndex,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean => {
  const length = Math.hypot(bx - ax, by - ay);
  if (length < 1e-9) return true;
  return castRay(index, ax, ay, (bx - ax) / length, (by - ay) / length, length) >= length - 1e-9;
};

/** Whether nothing in `segments` crosses the straight line from `a` to `b`. */
export const lineOfSight = (
  a: LevelPoint,
  b: LevelPoint,
  segments: ReadonlyArray<SightSegment>,
): boolean => clearBetween(indexOf(segments), a.x, a.y, b.x, b.y);

// ---------------------------------------------------------------------------
// Visibility polygons

/**
 * What can be seen from `origin` out to `radius` squares: a star-shaped
 * polygon about `origin`. `vertices` is ready to draw as a triangle fan.
 */
export interface VisibilityPolygon {
  readonly origin: LevelPoint;
  readonly radius: number;
  /** Each vertex's angle about `origin`, ascending, in `[-π, π)`. */
  readonly angles: Float64Array;
  /** The vertices, flat `[x0, y0, x1, y1, …]`, in the order of `angles`. */
  readonly vertices: Float64Array;
}

/** Rays cast evenly round the circle, so the rim is round where nothing interrupts it. */
const RIM_RAYS = 128;
/** The angle either side of a segment's end at which a ray looks past it. */
const PAST = 1e-5;

const wrapAngle = (angle: number): number =>
  angle < -Math.PI ? angle + 2 * Math.PI : angle >= Math.PI ? angle - 2 * Math.PI : angle;

const distanceToSegment = (px: number, py: number, s: SightSegment): number => {
  const sx = s.x2 - s.x1;
  const sy = s.y2 - s.y1;
  const length2 = sx * sx + sy * sy;
  const t =
    length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.x1) * sx + (py - s.y1) * sy) / length2));
  return Math.hypot(s.x1 + t * sx - px, s.y1 + t * sy - py);
};

/**
 * The visibility polygon from `origin` out to `radius` squares, by angle
 * sweep: one ray at every segment end within reach and one a hair either
 * side of it (so the polygon follows a shadow's edge past a corner), one at
 * every point a segment crosses the rim (so a shadow meets the rim exactly),
 * and {@link RIM_RAYS} evenly round. Each ray stops at the first segment it
 * meets. Segments from {@link sightSegments} already overlap at shared
 * vertices, so no ray slips out through a corner.
 */
export const visibilityPolygon = (
  origin: LevelPoint,
  radius: number,
  segments: ReadonlyArray<SightSegment>,
): VisibilityPolygon => {
  const index = indexOf(segments);
  const { x: ox, y: oy } = origin;
  const angles: Array<number> = [];
  for (let k = 0; k < RIM_RAYS; k++) angles.push(-Math.PI + (2 * Math.PI * k) / RIM_RAYS);
  const radius2 = radius * radius;
  for (const s of segments) {
    if (distanceToSegment(ox, oy, s) >= radius) continue;
    for (const [px, py] of [
      [s.x1, s.y1],
      [s.x2, s.y2],
    ] as const) {
      const dx = px - ox;
      const dy = py - oy;
      if (dx * dx + dy * dy > radius2) continue;
      const angle = Math.atan2(dy, dx);
      angles.push(wrapAngle(angle - PAST), wrapAngle(angle), wrapAngle(angle + PAST));
    }
    const sx = s.x2 - s.x1;
    const sy = s.y2 - s.y1;
    const fx = s.x1 - ox;
    const fy = s.y1 - oy;
    const a = sx * sx + sy * sy;
    const b = 2 * (fx * sx + fy * sy);
    const c = fx * fx + fy * fy - radius2;
    const discriminant = b * b - 4 * a * c;
    if (a > 0 && discriminant > 0) {
      for (const sign of [-1, 1]) {
        const u = (-b + sign * Math.sqrt(discriminant)) / (2 * a);
        if (u >= 0 && u <= 1) angles.push(wrapAngle(Math.atan2(fy + u * sy, fx + u * sx)));
      }
    }
  }
  const sorted = Float64Array.from(angles).sort();
  const vertices = new Float64Array(sorted.length * 2);
  for (let k = 0; k < sorted.length; k++) {
    const ux = Math.cos(sorted[k]!);
    const uy = Math.sin(sorted[k]!);
    const t = castRay(index, ox, oy, ux, uy, radius);
    vertices[k * 2] = ox + ux * t;
    vertices[k * 2 + 1] = oy + uy * t;
  }
  return { origin, radius, angles: sorted, vertices };
};

/**
 * Whether `point` is inside a visibility polygon. Between two vertices that
 * both sit on the rim the edge is the rim's arc, not the chord, so a point
 * within `radius` and in the clear is inside however few rim rays there are.
 * A point on the boundary is inside.
 */
export const withinVisibility = (polygon: VisibilityPolygon, point: LevelPoint): boolean => {
  const { angles, vertices, radius } = polygon;
  const qx = point.x - polygon.origin.x;
  const qy = point.y - polygon.origin.y;
  const distance = Math.hypot(qx, qy);
  if (distance > radius + 1e-9) return false;
  if (distance < 1e-9) return true;
  const count = angles.length;
  if (count === 0) return false;
  const angle = Math.atan2(qy, qx);
  // The last vertex at or before `angle`; before the first, the wedge wraps from the last.
  let low = 0;
  let high = count - 1;
  if (angle < angles[0]!) {
    low = count - 1;
  } else {
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (angles[middle]! <= angle) low = middle;
      else high = middle - 1;
    }
  }
  const next = (low + 1) % count;
  const ax = vertices[low * 2]! - polygon.origin.x;
  const ay = vertices[low * 2 + 1]! - polygon.origin.y;
  const bx = vertices[next * 2]! - polygon.origin.x;
  const by = vertices[next * 2 + 1]! - polygon.origin.y;
  const ra = Math.hypot(ax, ay);
  const rb = Math.hypot(bx, by);
  if (ra >= radius - 1e-9 && rb >= radius - 1e-9) return true;
  const ex = bx - ax;
  const ey = by - ay;
  const originSide = ex * -ay - ey * -ax;
  if (Math.abs(originSide) < 1e-12) return distance <= Math.max(ra, rb) + 1e-9;
  const pointSide = ex * (qy - ay) - ey * (qx - ax);
  return pointSide * Math.sign(originSide) >= -1e-9 * Math.hypot(ex, ey);
};

// ---------------------------------------------------------------------------
// Cover

const COVERS: ReadonlyArray<LevelCover> = ["none", "half", "threeQuarters", "total"];
const coverRank = (cover: LevelCover): number => COVERS.indexOf(cover);
/** How far a corner is pulled into its own square, so a line from it starts on the creature's side of a wall along its edge. */
const CORNER_INSET = 1e-3;
/** How far a screening prop's footprint is shrunk, so a line that grazes its edge does not count. */
const SCREEN_INSET = 0.01;

const cornersOf = (square: BoardSquare): ReadonlyArray<LevelPoint> => {
  const near = CORNER_INSET;
  const far = 1 - CORNER_INSET;
  return [
    { x: square.column + near, y: square.row + near },
    { x: square.column + far, y: square.row + near },
    { x: square.column + near, y: square.row + far },
    { x: square.column + far, y: square.row + far },
  ];
};

/** Whether the segment from `a` to `b` runs through the inside of the rectangle (Liang and Barsky). */
const crossesRect = (
  a: LevelPoint,
  b: LevelPoint,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let enter = 0;
  let exit = 1;
  for (const [p, q] of [
    [-dx, a.x - left],
    [dx, right - a.x],
    [-dy, a.y - top],
    [dy, bottom - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
    if (enter >= exit) return false;
  }
  return true;
};

/**
 * The cover `target` has from `attacker`, both one square, by the DMG's rule
 * on a grid. For each corner of the attacker's square, draw lines to the four
 * corners of the target's and count those `segments` block: none blocked is
 * no cover, one or two half, three three-quarters, all four total. A line
 * that only touches the end of a wall is blocked by it; one that runs along a
 * wall is not. Each corner is pulled a hair into its own square, so a
 * creature in a closed room's corner cannot draw a line out through the
 * joint.
 *
 * A prop with cover that does not block sight (a crate, a table, a tree)
 * screens rather than blocks: from a corner, if any of its four lines runs
 * through the prop's footprint, the target has at least the prop's cover from
 * that corner. A prop that blocks sight already counts through its outline in
 * `segments`; a prop on either creature's square does not screen.
 *
 * The attacker uses the corner that leaves the least cover.
 */
export const cover = (
  attacker: BoardSquare,
  target: BoardSquare,
  segments: ReadonlyArray<SightSegment>,
  props: ReadonlyArray<LayoutProp>,
): LevelCover => {
  const index = indexOf(segments);
  const screens = props.flatMap((prop) => {
    const behaviour = propBehaviour(prop);
    if (behaviour.cover === "none" || behaviour.blocksSight) return [];
    const footprint = propFootprint(prop);
    if (footprintHas(footprint, attacker) || footprintHas(footprint, target)) return [];
    return [{ footprint, rank: coverRank(behaviour.cover) }];
  });
  const targetCorners = cornersOf(target);
  let least = COVERS.length - 1;
  for (const from of cornersOf(attacker)) {
    let blocked = 0;
    let screened = 0;
    for (const to of targetCorners) {
      if (!clearBetween(index, from.x, from.y, to.x, to.y)) blocked++;
      for (const { footprint, rank } of screens) {
        if (
          rank > screened &&
          crossesRect(
            from,
            to,
            footprint.column + SCREEN_INSET,
            footprint.row + SCREEN_INSET,
            footprint.column + footprint.width - SCREEN_INSET,
            footprint.row + footprint.height - SCREEN_INSET,
          )
        ) {
          screened = rank;
        }
      }
    }
    const byLines = blocked === 0 ? 0 : blocked <= 2 ? 1 : blocked === 3 ? 2 : 3;
    least = Math.min(least, Math.max(byLines, screened));
  }
  return COVERS[least]!;
};

// ---------------------------------------------------------------------------
// Light

/** A light that is shining: a lit light, or the light a prop carries at its footprint's centre. */
export interface LightSource {
  /** The light's id, or the carrying prop's. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly bright: number;
  readonly dim: number;
  readonly tone: LevelLightTone;
}

/** Every light shining on a level: its lit lights, then the lights its props carry. */
export const lightSources = (level: LevelLayout): ReadonlyArray<LightSource> => {
  const out: Array<LightSource> = level.lights
    .filter((light) => light.lit)
    .map(({ id, x, y, bright, dim, tone }) => ({ id, x, y, bright, dim, tone }));
  for (const prop of level.props) {
    const carried = PROP_KINDS[prop.kind].light;
    if (carried === null) continue;
    const { column, row, width, height } = propFootprint(prop);
    out.push({ id: prop.id, x: column + width / 2, y: row + height / 2, ...carried });
  }
  return out;
};

const LIGHTS: ReadonlyArray<LightLevel> = ["dark", "dim", "bright"];

/** How much light `source` casts on a point: 2 bright, 1 dim, 0 none. */
const glow = (
  index: SegmentIndex,
  source: LightSource,
  feetPerCell: number,
  point: LevelPoint,
): number => {
  const feet = Math.hypot(point.x - source.x, point.y - source.y) * feetPerCell;
  if (feet > source.bright + source.dim + 1e-9) return 0;
  if (!clearBetween(index, source.x, source.y, point.x, point.y)) return 0;
  return feet <= source.bright + 1e-9 ? 2 : 1;
};

/**
 * How lit `square` is: the level's ambient light, raised by every light whose
 * visibility polygon reaches the square's centre (no sight segment between
 * them) to bright within its `bright` feet and to dim within `bright + dim`.
 * Magical darkness is dark whatever shines on it (PHB: nonmagical light
 * cannot illuminate it).
 */
export const lightLevelAt = (
  level: LevelLayout,
  square: BoardSquare,
  options: SightOptions = {},
): LightLevel => {
  if (!onLevel(level, square)) return "dark";
  if (regionMask(level, ["magicalDarkness"])[levelSquareIndex(level, square)] === 1) return "dark";
  let lit = LIGHTS.indexOf(level.ambient);
  if (lit === 2) return "bright";
  const index = indexOf(sightSegments(level, options));
  const centre = centreOf(square);
  for (const source of lightSources(level)) {
    if (lit === 2) break;
    lit = Math.max(lit, glow(index, source, level.feetPerCell, centre));
  }
  return LIGHTS[lit]!;
};

const lightRanks = (level: LevelLayout, options: SightOptions): Uint8Array => {
  const { columns, rows, feetPerCell } = level;
  const ranks = new Uint8Array(columns * rows).fill(LIGHTS.indexOf(level.ambient));
  if (level.ambient !== "bright") {
    const index = indexOf(sightSegments(level, options));
    for (const source of lightSources(level)) {
      const reach = (source.bright + source.dim) / feetPerCell;
      if (!(reach > 0)) continue;
      const c0 = Math.max(0, Math.floor(source.x - reach));
      const c1 = Math.min(columns - 1, Math.floor(source.x + reach));
      const r0 = Math.max(0, Math.floor(source.y - reach));
      const r1 = Math.min(rows - 1, Math.floor(source.y + reach));
      for (let row = r0; row <= r1; row++) {
        for (let column = c0; column <= c1; column++) {
          const at = row * columns + column;
          if (ranks[at] === 2) continue;
          const shone = glow(index, source, feetPerCell, { x: column + 0.5, y: row + 0.5 });
          if (shone > ranks[at]!) ranks[at] = shone;
        }
      }
    }
  }
  const dark = regionMask(level, ["magicalDarkness"]);
  for (let at = 0; at < ranks.length; at++) if (dark[at] === 1) ranks[at] = 0;
  return ranks;
};

/** {@link lightLevelAt} for every square at once, row-major. */
export const lightLevels = (
  level: LevelLayout,
  options: SightOptions = {},
): ReadonlyArray<LightLevel> => Array.from(lightRanks(level, options), (rank) => LIGHTS[rank]!);

// ---------------------------------------------------------------------------
// Party vision

/** A creature looking: where it stands and its darkvision in feet (0 for none). */
export interface PartyViewer {
  readonly square: BoardSquare;
  readonly darkvision: number;
}

/**
 * The squares the party can see now, as sorted, distinct square indices.
 *
 * A viewer sees a square when the square's centre is inside its visibility
 * polygon over {@link visionSegments} (so never into or past magical darkness
 * or heavy obscurement) and the square is lit bright or dim, or lies within
 * its darkvision and is not magically dark. A viewer always sees the square
 * it stands on; one standing in magical darkness or heavy obscurement sees
 * only that. The party sees the union. A viewer off the board sees nothing.
 */
export const partyVision = (
  level: LevelLayout,
  viewers: ReadonlyArray<PartyViewer>,
  options: SightOptions = {},
): ReadonlyArray<number> => {
  const { columns, rows, feetPerCell } = level;
  const seen = new Uint8Array(columns * rows);
  const onBoard = viewers.filter((viewer) => onLevel(level, viewer.square));
  if (onBoard.length > 0) {
    const light = lightRanks(level, options);
    const dark = regionMask(level, ["magicalDarkness"]);
    const segments = visionSegments(level, options);
    const reach = Math.hypot(columns, rows) + 1;
    for (const viewer of onBoard) {
      seen[levelSquareIndex(level, viewer.square)] = 1;
      const origin = centreOf(viewer.square);
      const polygon = visibilityPolygon(origin, reach, segments);
      const darkvision = viewer.darkvision / feetPerCell;
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const at = row * columns + column;
          if (seen[at] === 1) continue;
          const centre = { x: column + 0.5, y: row + 0.5 };
          const visible =
            light[at]! > 0 ||
            (darkvision > 0 &&
              dark[at] === 0 &&
              Math.hypot(centre.x - origin.x, centre.y - origin.y) <= darkvision + 1e-9);
          if (visible && withinVisibility(polygon, centre)) seen[at] = 1;
        }
      }
    }
  }
  const out: Array<number> = [];
  for (let at = 0; at < seen.length; at++) if (seen[at] === 1) out.push(at);
  return out;
};

// ---------------------------------------------------------------------------
// Movement

const orientation = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number => {
  const value = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return Math.abs(value) < 1e-9 ? 0 : Math.sign(value);
};

/** Whether two closed segments share a point, touching included. */
const segmentsMeet = (a: LevelPoint, b: LevelPoint, wall: LayoutWall): boolean => {
  const o1 = orientation(a.x, a.y, b.x, b.y, wall.x1, wall.y1);
  const o2 = orientation(a.x, a.y, b.x, b.y, wall.x2, wall.y2);
  const o3 = orientation(wall.x1, wall.y1, wall.x2, wall.y2, a.x, a.y);
  const o4 = orientation(wall.x1, wall.y1, wall.x2, wall.y2, b.x, b.y);
  if (o1 === 0 && o2 === 0) {
    return (
      Math.max(a.x, b.x) >= Math.min(wall.x1, wall.x2) - 1e-9 &&
      Math.max(wall.x1, wall.x2) >= Math.min(a.x, b.x) - 1e-9 &&
      Math.max(a.y, b.y) >= Math.min(wall.y1, wall.y2) - 1e-9 &&
      Math.max(wall.y1, wall.y2) >= Math.min(a.y, b.y) - 1e-9
    );
  }
  return o1 * o2 <= 0 && o3 * o4 <= 0;
};

const stepBlocked = (
  walls: ReadonlyArray<LayoutWall>,
  from: BoardSquare,
  to: BoardSquare,
): boolean => {
  const a = centreOf(from);
  const b = centreOf(to);
  return walls.some((wall) => segmentsMeet(a, b, wall));
};

/**
 * What one step from `from` to an adjacent square `to` (diagonals included)
 * costs in feet: one square's worth, or twice that when `to` is difficult
 * terrain (a difficult material, a difficult prop on it, or a `difficult`
 * region). `null` when the step cannot be taken:
 *
 * - `to` is off the board, is not one step away, has no floor (`void`), or
 *   holds a prop that blocks movement;
 * - a wall that blocks movement (any wall, low ones too, and a door unless it
 *   is open; an unfound secret door always) meets the line between the two
 *   squares' centres;
 * - on a diagonal, walls at the corner between the two squares close both
 *   ways round it: the step through either square beside the diagonal is
 *   blocked. A wall that only ends at the corner leaves one way round, and
 *   the step stands.
 */
export const movementCost = (
  level: LevelLayout,
  from: BoardSquare,
  to: BoardSquare,
  options: SightOptions = {},
): number | null => {
  if (!onLevel(level, from) || !onLevel(level, to)) return null;
  const across = to.column - from.column;
  const down = to.row - from.row;
  if (Math.max(Math.abs(across), Math.abs(down)) !== 1) return null;
  const at = levelSquareIndex(level, to);
  const material = LEVEL_MATERIALS[level.floor[at] ?? 0] ?? "void";
  if (material === "void") return null;
  const standing = level.props.filter((prop) => footprintHas(propFootprint(prop), to));
  if (standing.some((prop) => propBehaviour(prop).blocksMovement)) return null;
  const walls = level.walls.filter((wall) => wallBlocksMovement(wall, options));
  if (across === 0 || down === 0) {
    if (stepBlocked(walls, from, to)) return null;
  } else {
    const corner = {
      x: from.column + (across > 0 ? 1 : 0),
      y: from.row + (down > 0 ? 1 : 0),
    };
    const beside = { column: to.column, row: from.row };
    const below = { column: from.column, row: to.row };
    const closedBeside = stepBlocked(walls, from, beside) || stepBlocked(walls, beside, to);
    const closedBelow = stepBlocked(walls, from, below) || stepBlocked(walls, below, to);
    if (closedBeside && closedBelow) return null;
    // A wall across the diagonal anywhere but at the corner (a wall at an angle).
    const a = centreOf(from);
    const b = centreOf(to);
    const throughCorner = (wall: LayoutWall) => distanceToSegment(corner.x, corner.y, wall) < 1e-6;
    if (walls.some((wall) => !throughCorner(wall) && segmentsMeet(a, b, wall))) return null;
  }
  const difficult =
    DIFFICULT_MATERIALS.has(material) ||
    standing.some((prop) => propBehaviour(prop).difficult) ||
    level.regions.some((region) => region.kind === "difficult" && region.squares.includes(at));
  return difficult ? level.feetPerCell * 2 : level.feetPerCell;
};
