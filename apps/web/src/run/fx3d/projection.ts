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
}

/** Where a world point lands on the plane, in the plane's own units. */
export const toPlane = (
  grid: GridOnPlane,
  point: { readonly x: number; readonly y: number; readonly z: number },
): { readonly x: number; readonly y: number } => ({
  x: grid.originX + point.x * grid.cell,
  y: grid.originY + point.z * grid.cell - point.y * grid.cell * LIFT,
});

/**
 * The camera's projection, row-major for `Matrix4.set`: the world straight to
 * clip space, with `toPlane`'s placement and a depth that puts higher, then
 * nearer, in front. The view is the identity, so this is the whole camera.
 */
export const projectionRows = (grid: GridOnPlane): ReadonlyArray<number> => {
  const { planeWidth: w, planeHeight: h, originX, originY, cell } = grid;
  return [
    (2 * cell) / w,
    0,
    0,
    (2 * originX) / w - 1,
    0,
    (2 * cell * LIFT) / h,
    (-2 * cell) / h,
    1 - (2 * originY) / h,
    0,
    -0.08,
    -0.004,
    0.5,
    0,
    0,
    0,
    1,
  ];
};
