import type { PictureRect, PictureSize } from "@taverns/api";

/**
 * Where the fight's board sits on the runner's canvas (`BoardCanvas.tsx`), as
 * arithmetic a test can pin.
 *
 * A view is the one transform the canvas applies to the board: a point `p` of
 * the board's plane (the original picture's pixels, `battleMapPlane`) is drawn
 * at `p · zoom + (x, y)` in the canvas's own pixels. Panning moves `(x, y)`;
 * zooming changes `zoom` about a point that stays where it is.
 *
 * Zoom is bounded by how big a square is drawn, not by a factor, because the
 * plane's pixels are a picture's and one map's square may be 64 of them and
 * another's 140: the same factor would be a different board on each.
 */

export interface CanvasView {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** A drawn square, in canvas pixels: the zoom's floor and ceiling, and the opening view's floor. */
export const SQUARE_PX = {
  /** Small enough to see a whole large board at once. */
  min: 6,
  /** Large enough to read a token's label from across the table. */
  max: 160,
  /** The smallest thing a pointer is asked to hit (WCAG 2.5.8), so the opening view can be played. */
  target: 24,
} as const;

/** One press of + or −. */
export const ZOOM_STEP = 1.25;

export interface ZoomLimits {
  readonly min: number;
  readonly max: number;
}

/** The zoom range for a board whose squares are `cellPx` of its plane. */
export const zoomLimits = (cellPx: number): ZoomLimits => ({
  min: SQUARE_PX.min / cellPx,
  max: SQUARE_PX.max / cellPx,
});

const clamp = (value: number, { min, max }: ZoomLimits): number =>
  Math.min(max, Math.max(min, value));

/**
 * The whole board in `area` (the part of the canvas no panel covers), as large
 * as fits and centred in it. *Fit*.
 */
export const fitView = (plane: PictureSize, area: PictureRect, limits: ZoomLimits): CanvasView => {
  const zoom = clamp(Math.min(area.width / plane.width, area.height / plane.height), limits);
  return {
    zoom,
    x: area.x + (area.width - plane.width * zoom) / 2,
    y: area.y + (area.height - plane.height * zoom) / 2,
  };
};

/**
 * What the runner opens on: the fitted board, unless that would draw a square
 * smaller than a pointer can hit, in which case the board is drawn at that
 * smallest playable size from the area's top-left corner and the rest is a pan
 * away. A board that fits at that size is centred, as *Fit* centres it.
 */
export const openingView = (plane: PictureSize, area: PictureRect, cellPx: number): CanvasView => {
  const limits = zoomLimits(cellPx);
  const fitted = fitView(plane, area, limits);
  const playable = SQUARE_PX.target / cellPx;
  if (fitted.zoom >= playable) return fitted;
  const width = plane.width * playable;
  const height = plane.height * playable;
  return {
    zoom: playable,
    x: width <= area.width ? area.x + (area.width - width) / 2 : area.x,
    y: height <= area.height ? area.y + (area.height - height) / 2 : area.y,
  };
};

/** Zoom to `zoom` (clamped), keeping the plane's point under `at` where it is. */
export const zoomAbout = (
  view: CanvasView,
  zoom: number,
  at: { readonly x: number; readonly y: number },
  limits: ZoomLimits,
): CanvasView => {
  const next = clamp(zoom, limits);
  const ratio = next / view.zoom;
  return { zoom: next, x: at.x - (at.x - view.x) * ratio, y: at.y - (at.y - view.y) * ratio };
};

/**
 * Keep at least one square of the board on the canvas along each axis, so a
 * pan can never lose it; *Fit* is the way back to all of it.
 */
export const keepInView = (
  view: CanvasView,
  plane: PictureSize,
  canvas: PictureSize,
  cellPx: number,
): CanvasView => {
  const square = cellPx * view.zoom;
  const width = plane.width * view.zoom;
  const height = plane.height * view.zoom;
  return {
    zoom: view.zoom,
    x: Math.min(canvas.width - square, Math.max(square - width, view.x)),
    y: Math.min(canvas.height - square, Math.max(square - height, view.y)),
  };
};

/**
 * The zoom factor for one wheel event with ⌘/Ctrl held, which is also what a
 * trackpad pinch sends. A mouse wheel's notch (about 100) is one bounded step;
 * a pinch's stream of small deltas is a smooth one.
 */
export const wheelZoomFactor = (deltaY: number): number =>
  2 ** (-Math.min(50, Math.max(-50, deltaY)) / 100);
