import { propFootprint } from "@taverns/api";
import { onBoard, squareAt, type LevelDocument, type Point, type Segment } from "./document";
import type { PartRef } from "./edits";

/**
 * What a pointer is over, and where it snaps: the editor's hit testing. None
 * of this is a rule of the game (those are `LevelGeometry.ts`); it is how
 * near a click must land to take a thing.
 */

/** A viewer the "view as" preview places: editor scratch, never saved. */
export interface Viewer {
  readonly id: string;
  readonly name: string;
  readonly column: number;
  readonly row: number;
  /** Feet of darkvision, 0 for none. */
  readonly darkvision: number;
}

export type Hit = PartRef | { readonly type: "viewer"; readonly id: string };

export type HitKind = "viewer" | "light" | "door" | "prop" | "region" | "wall";

const ALL: ReadonlyArray<HitKind> = ["viewer", "light", "door", "prop", "region", "wall"];

/** How near, in squares, a click must land to take each kind of thing. */
const REACH = { viewer: 0.45, light: 0.35, door: 0.22, wall: 0.2 } as const;

export const distanceToSegment = (p: Point, s: Segment): number => {
  const sx = s.x2 - s.x1;
  const sy = s.y2 - s.y1;
  const length2 = sx * sx + sy * sy;
  const t =
    length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x1) * sx + (p.y - s.y1) * sy) / length2));
  return Math.hypot(s.x1 + t * sx - p.x, s.y1 + t * sy - p.y);
};

/**
 * The topmost thing under `p` of the given kinds, in the order a person
 * expects to take them: a viewer, then a light, a door, a prop (the last
 * placed first), a painted region, and the nearest wall.
 */
export const pick = (
  doc: LevelDocument,
  p: Point,
  kinds: ReadonlyArray<HitKind> = ALL,
  viewers: ReadonlyArray<Viewer> = [],
): Hit | null => {
  if (kinds.includes("viewer")) {
    for (const viewer of viewers) {
      if (Math.hypot(viewer.column + 0.5 - p.x, viewer.row + 0.5 - p.y) < REACH.viewer) {
        return { type: "viewer", id: viewer.id };
      }
    }
  }
  if (kinds.includes("light")) {
    for (let k = doc.lights.length - 1; k >= 0; k--) {
      const light = doc.lights[k]!;
      if (Math.hypot(light.x - p.x, light.y - p.y) < REACH.light) {
        return { type: "light", id: light.id };
      }
    }
  }
  if (kinds.includes("door")) {
    for (const wall of doc.walls) {
      if (wall.kind !== "wall" && distanceToSegment(p, wall) < REACH.door) {
        return { type: "wall", id: wall.id };
      }
    }
  }
  if (kinds.includes("prop")) {
    for (let k = doc.props.length - 1; k >= 0; k--) {
      const prop = doc.props[k]!;
      const { column, row, width, height } = propFootprint(prop);
      if (p.x >= column && p.y >= row && p.x < column + width && p.y < row + height) {
        return { type: "prop", id: prop.id };
      }
    }
  }
  if (kinds.includes("wall")) {
    let best: Hit | null = null;
    let nearest: number = REACH.wall;
    for (const wall of doc.walls) {
      const d = distanceToSegment(p, wall);
      if (d < nearest) {
        nearest = d;
        best = { type: "wall", id: wall.id };
      }
    }
    if (best !== null) return best;
  }
  if (kinds.includes("region")) {
    const column = Math.floor(p.x);
    const row = Math.floor(p.y);
    if (onBoard(doc, column, row)) {
      const at = squareAt(doc, column, row);
      for (let k = doc.regions.length - 1; k >= 0; k--) {
        const region = doc.regions[k]!;
        if (region.squares.includes(at)) return { type: "region", id: region.id };
      }
    }
  }
  return null;
};

/** The unit grid edge nearest `p`: where the door tool cuts. */
export const nearestEdge = (p: Point): Segment => {
  const column = Math.floor(p.x);
  const row = Math.floor(p.y);
  const fx = p.x - column;
  const fy = p.y - row;
  const distances = [fy, 1 - fy, fx, 1 - fx];
  const nearest = distances.indexOf(Math.min(...distances));
  const edges: ReadonlyArray<Segment> = [
    { x1: column, y1: row, x2: column + 1, y2: row },
    { x1: column, y1: row + 1, x2: column + 1, y2: row + 1 },
    { x1: column, y1: row, x2: column, y2: row + 1 },
    { x1: column + 1, y1: row, x2: column + 1, y2: row + 1 },
  ];
  return edges[nearest]!;
};

/** The grid vertex nearest `p`; with `half`, the nearest half-square vertex. */
export const snapVertex = (p: Point, half: boolean): Point =>
  half
    ? { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 }
    : { x: Math.round(p.x), y: Math.round(p.y) };

/** `p` kept inside the level's edge. */
export const clampToBoard = (doc: Pick<LevelDocument, "columns" | "rows">, p: Point): Point => ({
  x: Math.max(0, Math.min(doc.columns, p.x)),
  y: Math.max(0, Math.min(doc.rows, p.y)),
});
