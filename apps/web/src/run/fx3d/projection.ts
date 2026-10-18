/**
 * How the effects' world lands on the board's own plane (the picture's
 * pixels, `battleMapPlane`), so a three.js effect stands on the same square
 * the DOM token does.
 *
 * The world is measured in grid squares: `x` across from the grid's left
 * edge, `z` down from its top edge, `y` up off the ground. The camera looks
 * straight down, as the board does, with one shear: a point `y` squares up is
 * drawn `y * LIFT` squares higher on the screen, the convention a lifted token
 * already follows (`TokenFace`). So an arc, a dome or a pillar reads as
 * standing off the map while its foot stays on its square. Higher, and then
 * nearer the bottom of the board, is drawn in front.
 *
 * On the canvas's isometric view (`run/view.ts`) the board's plane is tilted
 * after it is drawn, so "up the screen" is no longer up the plane: the grid
 * carries `lift`, the plane's direction for a square of height, so a height
 * still rises straight up the screen once the plane is tilted, and `across`,
 * which puts a point further across the board (nearer the bottom of the tilted
 * screen) in front too.
 *
 * Pure, so a test can pin where a point lands.
 */

/** How far up the screen a square of height draws, in squares. */
export const LIFT = 0.75;

/** The grid as the board lays it on its plane: where square (0, 0) starts, and how big a square is. */
export interface GridOnPlane {
  readonly planeWidth: number;
  readonly planeHeight: number;
  readonly originX: number;
  readonly originY: number;
  readonly cell: number;
  /** Where a square of height goes on the plane, in squares; straight up it by `LIFT` when absent. */
  readonly lift?: { readonly x: number; readonly y: number };
  /** How much further across the board counts as nearer; none when absent. */
  readonly across?: number;
}

const liftOf = (grid: GridOnPlane) => grid.lift ?? { x: 0, y: -LIFT };

/** Where a world point lands on the plane, in the plane's own units. */
export const toPlane = (
  grid: GridOnPlane,
  point: { readonly x: number; readonly y: number; readonly z: number },
): { readonly x: number; readonly y: number } => {
  const lift = liftOf(grid);
  return {
    x: grid.originX + point.x * grid.cell + point.y * grid.cell * lift.x,
    y: grid.originY + point.z * grid.cell + point.y * grid.cell * lift.y,
  };
};

/**
 * The camera's projection, row-major for `Matrix4.set`: the world straight to
 * clip space, with `toPlane`'s placement and a depth that puts higher, then
 * nearer, in front. The view is the identity, so this is the whole camera.
 */
export const projectionRows = (grid: GridOnPlane): ReadonlyArray<number> => {
  const { planeWidth: w, planeHeight: h, originX, originY, cell } = grid;
  const lift = liftOf(grid);
  return [
    (2 * cell) / w,
    (2 * cell * lift.x) / w,
    0,
    (2 * originX) / w - 1,
    0,
    (-2 * cell * lift.y) / h,
    (-2 * cell) / h,
    1 - (2 * originY) / h,
    -0.004 * (grid.across ?? 0),
    -0.08,
    -0.004,
    0.5,
    0,
    0,
    0,
    1,
  ];
};
