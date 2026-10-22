import type { Point } from "./document";

/**
 * Where the camera looks: the level point at the canvas's centre and how many
 * CSS pixels a square is drawn. Straight down, so this is the whole camera.
 */
export interface LevelView {
  readonly cx: number;
  readonly cy: number;
  /** CSS pixels a square. */
  readonly zoom: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/** A square drawn at least this many pixels (a 200-square level fits a small window) and at most this many. */
export const ZOOM_MIN = 4;
export const ZOOM_MAX = 160;

const clampZoom = (zoom: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));

/** The level point under a canvas pixel. */
export const toWorld = (view: LevelView, size: ViewportSize, sx: number, sy: number): Point => ({
  x: view.cx + (sx - size.width / 2) / view.zoom,
  y: view.cy + (sy - size.height / 2) / view.zoom,
});

/** The canvas pixel over a level point. */
export const toScreen = (view: LevelView, size: ViewportSize, p: Point): Point => ({
  x: (p.x - view.cx) * view.zoom + size.width / 2,
  y: (p.y - view.cy) * view.zoom + size.height / 2,
});

/** Zoom by `factor` about a canvas pixel, which keeps the level point under it. */
export const zoomAt = (
  view: LevelView,
  size: ViewportSize,
  sx: number,
  sy: number,
  factor: number,
): LevelView => {
  const before = toWorld(view, size, sx, sy);
  const zoom = clampZoom(view.zoom * factor);
  const after = toWorld({ ...view, zoom }, size, sx, sy);
  return { cx: view.cx + before.x - after.x, cy: view.cy + before.y - after.y, zoom };
};

/** Pan by a drag of `(dx, dy)` canvas pixels. */
export const panBy = (view: LevelView, dx: number, dy: number): LevelView => ({
  ...view,
  cx: view.cx - dx / view.zoom,
  cy: view.cy - dy / view.zoom,
});

/**
 * The whole level in the canvas, as large as fits inside `inset` pixels of
 * margin on every side (the editor's floating panels), centred.
 */
export const fitView = (
  level: { readonly columns: number; readonly rows: number },
  size: ViewportSize,
  inset: number,
): LevelView => {
  const width = Math.max(1, size.width - inset * 2);
  const height = Math.max(1, size.height - inset * 2);
  return {
    zoom: clampZoom(Math.min(width / level.columns, height / level.rows)),
    cx: level.columns / 2,
    cy: level.rows / 2,
  };
};

/** The wheel's zoom for a `deltaY`: a pinch (sent with Ctrl) zooms faster than a scroll. */
export const wheelFactor = (deltaY: number, pinch: boolean): number =>
  Math.exp(-deltaY * (pinch ? 0.01 : 0.0015));
