import type { PictureRect, PictureSize } from "@taverns/api";
import { useState } from "react";

/**
 * How the board is looked at on the canvas: straight down, or tilted into the
 * isometric view of `Encounter Canvas.dc.html` (the maintainer's call of
 * 2026-10-17). Either way the board is the same flat plane with the same
 * squares; the isometric view is one more linear map on top of the canvas's
 * pan and zoom (`BoardCanvas.tsx`), so everything drawn on the plane (the
 * picture, the grid, fog, areas, rulers, the effects) tilts with it, and the
 * tokens' standing parts are turned back upright (`uprightTransform`).
 *
 * The map is the drawing's `rotateX(60deg) rotateZ(45deg)` with no
 * perspective, which is affine: a 45° turn, then the height halved. Pure, so a
 * test can pin where a point lands and that the inverse undoes it.
 */
export type BoardView = "top" | "iso";

export const BOARD_VIEWS: ReadonlyArray<BoardView> = ["top", "iso"];

/** A linear map of the plane: `x' = a·x + c·y`, `y' = b·x + d·y`, as CSS's `matrix()` orders them. */
export interface Linear {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

const C = Math.SQRT1_2;

export const IDENTITY: Linear = { a: 1, b: 0, c: 0, d: 1 };
export const ISOMETRIC: Linear = { a: C, b: C / 2, c: -C, d: C / 2 };

export const linearOf = (view: BoardView): Linear => (view === "iso" ? ISOMETRIC : IDENTITY);

export const applyLinear = (
  m: Linear,
  p: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } => ({
  x: m.a * p.x + m.c * p.y,
  y: m.b * p.x + m.d * p.y,
});

export const invertLinear = (m: Linear): Linear => {
  const det = m.a * m.d - m.b * m.c;
  return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det };
};

/** The box the plane's rectangle lands in under `m`: where it starts and how big it is. */
export const boundsUnder = (m: Linear, size: PictureSize): PictureRect => {
  const corners = [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: 0, y: size.height },
    { x: size.width, y: size.height },
  ].map((p) => applyLinear(m, p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

/** `m` as a CSS `matrix()`, translated by `(e, f)`. */
export const cssMatrix = (m: Linear, e = 0, f = 0): string =>
  `matrix(${[m.a, m.b, m.c, m.d, e, f].map((n) => String(Number(n.toFixed(6)))).join(",")})`;

/**
 * What stands a thing drawn on the tilted plane back up: the inverse of the
 * tilt, for a token's disc, its bar and its name, so they face the DM however
 * the floor under them is turned. `undefined` looking straight down.
 */
export const uprightTransform = (view: BoardView): string | undefined =>
  view === "iso" ? cssMatrix(invertLinear(ISOMETRIC)) : undefined;

/**
 * Which way is up on the screen, in the plane's own units per screen unit: what
 * the effects lift a height along (`fx3d/projection.ts`). Straight down, the
 * plane's up is the screen's; tilted, it is the inverse tilt of the screen's.
 */
export const screenUpOnPlane = (view: BoardView): { readonly x: number; readonly y: number } =>
  applyLinear(invertLinear(linearOf(view)), { x: 0, y: -1 });

/**
 * The board's view on the canvas: this browser's preference, kept across fights
 * and reloads, the DM's and a player's alike. Guarded as `tokenNames.ts` is,
 * since storage can be refused; the drawing's isometric view stands in.
 */
const KEY = "taverns:run:board-view";

const read = (): BoardView => {
  try {
    const stored = localStorage.getItem(KEY);
    return BOARD_VIEWS.find((view) => view === stored) ?? "iso";
  } catch {
    return "iso";
  }
};

export function useBoardView(): readonly [BoardView, (view: BoardView) => void] {
  const [view, setView] = useState<BoardView>(read);
  const choose = (next: BoardView) => {
    setView(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Kept for this visit only.
    }
  };
  return [view, choose];
}
