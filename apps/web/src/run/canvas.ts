import type { BoardSquare, PlaneRect, PlaneSize } from "@taverns/api";
import { cellRect } from "@taverns/api";

/**
 * Where the fight's board sits on the runner's canvas (`BoardCanvas.tsx`), as
 * arithmetic a test can pin.
 *
 * A view is the one transform the canvas applies to the board: a point `p` of
 * the board's plane (`boardPlane`, `BOARD_CELL_PX` a square) is drawn at
 * `p · zoom + (x, y)` in the canvas's own pixels. Panning moves `(x, y)`;
 * zooming changes `zoom` about a point that stays where it is.
 *
 * Zoom is bounded by how big a square is drawn, not by a factor, so the
 * bounds say what a person sees whatever the plane's scale.
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
  /**
   * A token a DM can read at a glance: the drawing's 44px standee
   * (`Encounter Canvas.dc.html`), what the view opens on when it opens on
   * whoever is up.
   */
  readable: 44,
} as const;

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
 * as fits and centred in it.
 */
export const fitView = (plane: PlaneSize, area: PlaneRect, limits: ZoomLimits): CanvasView => {
  const zoom = clamp(Math.min(area.width / plane.width, area.height / plane.height), limits);
  return {
    zoom,
    x: area.x + (area.width - plane.width * zoom) / 2,
    y: area.y + (area.height - plane.height * zoom) / 2,
  };
};

/**
 * Where a view opens when the whole board will not fit at a size: a point of
 * the plane to open on, and the drawn square (`SQUARE_PX`) below which the
 * fitted board is given up for it.
 */
export interface CanvasFocus {
  readonly at: { readonly x: number; readonly y: number };
  readonly squarePx: number;
}

/**
 * What the runner opens on: the fitted board, unless that would draw a square
 * smaller than a pointer can hit, in which case the board is drawn at that
 * smallest playable size from the area's top-left corner and the rest is a pan
 * away. A board that fits at that size is centred.
 *
 * Given a `focus`, it opens on its point instead: the fitted board when its
 * squares are at least `focus.squarePx`, else squares of that size as near
 * centred on the point as the board allows (`withinArea`): a board wider than
 * the area is never pulled in from its edge, leaving a bare band on one side
 * while the other is cut off. The DM's boards open on whoever is up, or the
 * party, at `readable`; a player's on their own token at `target`, so a
 * board a pointer can play whole is shown whole, party and all.
 */
export const openingView = (
  plane: PlaneSize,
  area: PlaneRect,
  cellPx: number,
  focus?: CanvasFocus,
): CanvasView => {
  const limits = zoomLimits(cellPx);
  const fitted = fitView(plane, area, limits);
  if (focus !== undefined) {
    const zoom = focus.squarePx / cellPx;
    if (fitted.zoom >= zoom) return fitted;
    return withinArea(
      {
        zoom,
        x: area.x + area.width / 2 - focus.at.x * zoom,
        y: area.y + area.height / 2 - focus.at.y * zoom,
      },
      plane,
      area,
    );
  }
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

/**
 * `view` panned as little as it takes to use `area` well along each axis: a
 * board that fits that way is centred in it, and one that does not covers it,
 * edge to edge, with no bare band inside it.
 */
export const withinArea = (view: CanvasView, plane: PlaneSize, area: PlaneRect): CanvasView => {
  const along = (at: number, size: number, start: number, length: number) =>
    size <= length
      ? start + (length - size) / 2
      : Math.min(start, Math.max(start + length - size, at));
  return {
    zoom: view.zoom,
    x: along(view.x, plane.width * view.zoom, area.x, area.width),
    y: along(view.y, plane.height * view.zoom, area.y, area.height),
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
 * pan can never lose it.
 */
export const keepInView = (
  view: CanvasView,
  plane: PlaneSize,
  canvas: PlaneSize,
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
 * Pixels per unit of a wheel event's delta: a mouse wheel in Firefox reports
 * lines, a few to a notch, where everything else reports pixels.
 */
export const wheelUnit = (event: { readonly deltaMode: number }): number =>
  event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;

/**
 * The zoom factor for one wheel event over the canvas: a mouse wheel's notch
 * (about 100) is one bounded step; a trackpad's scroll or pinch, a stream of
 * small deltas, is a smooth one.
 */
export const wheelZoomFactor = (deltaY: number): number =>
  2 ** (-Math.min(50, Math.max(-50, deltaY)) / 100);

/** The middle of a square, in the plane's units: what the camera centres. */
export const centreOf = (square: BoardSquare): { readonly x: number; readonly y: number } => {
  const rect = cellRect(square);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
};
