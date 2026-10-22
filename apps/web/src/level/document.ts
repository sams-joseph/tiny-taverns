import type {
  LayoutLight,
  LayoutProp,
  LayoutRegion,
  LayoutWall,
  LevelAmbient,
  LevelLayout,
} from "@taverns/api";

/**
 * The document the editor works on: a level as the wire carries it
 * (`packages/api`'s `LevelLayout`, plus its id, name, description and
 * `version`). Structural, so the wire's `Level` fits as it arrives and the
 * editor hands back the same shape to save.
 *
 * Every edit makes a new document and leaves the parts it did not touch as
 * the same arrays, so the renderer can rebuild only what changed by
 * comparing references (`renderer.ts`).
 */
export interface LevelDocument extends LevelLayout {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  /** The version the server last saved; a save carries it, and a stale one is refused. */
  readonly version: number;
  readonly ambient: LevelAmbient;
  readonly floor: ReadonlyArray<number>;
  readonly walls: ReadonlyArray<LayoutWall>;
  readonly props: ReadonlyArray<LayoutProp>;
  readonly lights: ReadonlyArray<LayoutLight>;
  readonly regions: ReadonlyArray<LayoutRegion>;
}

/** A point on a level, in squares. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A wall's end to end, in squares. */
export interface Segment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

let counter = 0;

/**
 * A fresh id for a part the editor adds. The server keeps a part's id across a
 * save, so it must be unique without asking it; a UUID where the browser has
 * one, else a counter (the test environment's fallback).
 */
export const newPartId = (): string => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid !== undefined) return uuid;
  counter += 1;
  return `part-${String(counter)}`;
};

/** Which square index a column and row is, `row * columns + column`. */
export const squareAt = (doc: Pick<LevelLayout, "columns">, column: number, row: number): number =>
  row * doc.columns + column;

export const onBoard = (
  doc: Pick<LevelLayout, "columns" | "rows">,
  column: number,
  row: number,
): boolean => column >= 0 && row >= 0 && column < doc.columns && row < doc.rows;

/** A wall's length in squares. */
export const lengthOf = (s: Segment): number => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
