import { Schema } from "effect";
import { AreaShape } from "./AreaShape.js";
import { CombatantPosition } from "./Combatant.js";
import { LEVEL_SQUARES_MAX } from "./LevelKit.js";
import { RunBoardLevel } from "./LevelFight.js";

/**
 * A fight's board: `columns × rows` squares of `feetPerCell` feet, drawn on
 * itself. A fight on a level is drawn on the level's own copy
 * (`LevelFight.ts`); a fight on an encounter with no level is the plain grid
 * at {@link BOARD_COLUMNS_DEFAULT} × {@link BOARD_ROWS_DEFAULT}. There is no
 * picture under either.
 *
 * ### The plane
 *
 * Screens lay the board out on one plane, {@link BOARD_CELL_PX} pixels a
 * square with no offset, and measure every token, fog square, area and effect
 * in that plane's pixels ({@link cellRect}); an SVG `viewBox` or a percentage
 * maps it onto whatever size the board is drawn at. Rules never measure in
 * pixels: distance, reach and areas are in squares (below).
 */

/** The most squares a board runs across or down, a level's bound. */
export const BOARD_SQUARES_MAX = LEVEL_SQUARES_MAX;

/** The DMG's scale, and every new board's. */
export const FEET_PER_SQUARE_DEFAULT = 5;

/**
 * The plain board's size: a fight on an encounter with no level, and the
 * empty level made with every new encounter. 24 × 16 five-foot squares is
 * 120 × 80 feet.
 */
export const BOARD_COLUMNS_DEFAULT = 24;
export const BOARD_ROWS_DEFAULT = 16;

/** The pixels one square is on the plane a screen lays a board out on. */
export const BOARD_CELL_PX = 64;

/** The sizes an area takes, in feet: the Area tool's − and + stop here (its steps of 5 are its own). */
export const AREA_FEET = { minimum: 5, maximum: 120 } as const;

/** An area's size in feet, within {@link AREA_FEET}. */
const areaFeet = Schema.Int.check(Schema.isBetween(AREA_FEET));

/**
 * An area template pinned on a fight's board: a spell's sphere, cone, line or
 * cube, shown to the DM and, while the board is on their table, to the players
 * until the DM clears it. **Temporary**: it is where the spell lands right
 * now, so the board keeps nothing once the fight ends and a resumed fight
 * starts with nothing pinned (`0090_run_board_area.ts`). The session log does
 * keep a `board-area-updated` line per pin and clear, carrying the template.
 *
 * A sphere or a cube is centred on `origin`. A cone or a line starts at
 * `origin` and points at `toward`, which is never `origin` itself. Which
 * squares it covers is {@link areaSquares} at the board's `feetPerCell`; who
 * stands in them is the reader's to work out from the tokens they can see, so
 * no list of the caught is carried.
 */
export const BoardArea = Schema.Union([
  Schema.Struct({
    shape: Schema.Literals(["sphere", "cube"]),
    feet: areaFeet,
    origin: CombatantPosition,
  }),
  Schema.Struct({
    shape: Schema.Literals(["cone", "line"]),
    feet: areaFeet,
    origin: CombatantPosition,
    toward: CombatantPosition,
  }).check(
    Schema.makeFilter((area) =>
      area.origin.column === area.toward.column && area.origin.row === area.toward.row
        ? "a cone or a line points at a square other than its origin"
        : undefined,
    ),
  ),
]);
export type BoardArea = typeof BoardArea.Type;

/** The square a template points at: `toward` for a cone or a line, its own origin otherwise. */
export const areaToward = (area: BoardArea): CombatantPosition =>
  "toward" in area ? area.toward : area.origin;

/**
 * Pin an area template on a fight's board, replacing whatever was pinned, or
 * clear it with `area: null`: the Area tool's one write, answered with the
 * board. Clearing a board with nothing pinned changes nothing. `Conflict` for
 * a fight that is over or has no board, a square off the board, and a
 * template that covers no square of it. It carries a `requestId`, as a move
 * does.
 */
export const BoardAreaSet = Schema.Struct({
  area: Schema.NullOr(BoardArea),
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isBetweenLength(1, 128))),
});
export type BoardAreaSet = typeof BoardAreaSet.Type;

/**
 * A fight's board (`encounter_run_board`) — **the creator's alone**, read on the
 * runner beside the fight it belongs to.
 *
 * The board is the fight's own, taken when it started and carried to a
 * resumed fight: the encounter's level as it stood then (`level`), or the
 * plain grid when the encounter names none. Editing or deleting the level
 * never moves a fight.
 *
 * `fog` is the fight's own too: it starts clear, is carried to a resumed fight
 * with the board, and is written through `BoardFogUpdate`.
 */
export class EncounterRunBoard extends Schema.Class<EncounterRunBoard>("EncounterRunBoard")({
  columns: Schema.Int,
  rows: Schema.Int,
  feetPerCell: Schema.Int,
  /**
   * The squares under fog of war, in reading order (row by row). The DM sees
   * through it; a player's table draws these squares and nothing that stands
   * on them but the player's own character (`PlayerLiveBoard.fog`).
   */
  fog: Schema.Array(CombatantPosition),
  /** The area template pinned on the board, or `null` (`BoardArea`). */
  area: Schema.NullOr(BoardArea),
  /**
   * The fight's own copy of its encounter's level (`LevelFight.ts`), or
   * `null` for a fight on the plain grid; `columns`, `rows` and
   * `feetPerCell` are the level's on a level fight.
   */
  level: Schema.NullOr(RunBoardLevel),
}) {}

/** The most squares one fog write names: every square of the largest board. */
const fogSquares = Schema.Array(CombatantPosition).check(
  Schema.isBetweenLength(0, BOARD_SQUARES_MAX * BOARD_SQUARES_MAX),
);

/**
 * The DM's fog of war on a fight's board, changed in place: the Fog tool's one
 * write, answered with the board.
 *
 * At most one of `revealAll` (clear the board), `coverAll` (fog every square)
 * and `reset` (back to the fog the fight started with, which is none until fog
 * is authored in prep) applies first; then `hide` puts squares under fog and
 * `reveal` takes them out, `reveal` last. A stroke of the brush is one of the
 * two lists. A square off the fight's board, or a fight with no board, is a
 * `Conflict`. It is written over and over while the DM paints, so it carries
 * a `requestId`, as a move does.
 */
export const BoardFogUpdate = Schema.Struct({
  hide: Schema.optional(fogSquares),
  reveal: Schema.optional(fogSquares),
  revealAll: Schema.optional(Schema.Literal(true)),
  coverAll: Schema.optional(Schema.Literal(true)),
  reset: Schema.optional(Schema.Literal(true)),
  requestId: Schema.optional(Schema.NonEmptyString.check(Schema.isBetweenLength(1, 128))),
}).check(
  Schema.makeFilter((update) =>
    [update.revealAll, update.coverAll, update.reset].filter((whole) => whole === true).length > 1
      ? "at most one of revealAll, coverAll and reset"
      : undefined,
  ),
);
export type BoardFogUpdate = typeof BoardFogUpdate.Type;

/**
 * ## The board's plane — one implementation, pure
 *
 * Where the squares fall on the plane a screen lays a board out on
 * ({@link BOARD_CELL_PX} a square, from the top-left corner). A screen maps
 * the plane onto what it draws by one factor, or lets an SVG `viewBox` of
 * {@link boardPlane} do it.
 */

/** The parts of a board its plane reads. */
export interface BoardSize {
  readonly columns: number;
  readonly rows: number;
}

/** A rectangle in the board's plane, in pixels. */
export interface PlaneRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A width and a height in the board's plane, in pixels. */
export interface PlaneSize {
  readonly width: number;
  readonly height: number;
}

/** A square on the board: `column` across and `row` down, from zero. */
export interface BoardSquare {
  readonly column: number;
  readonly row: number;
}

/** Square `(column, row)`: `[c, c+1) · BOARD_CELL_PX` across and down. */
export const cellRect = (square: BoardSquare): PlaneRect => ({
  x: square.column * BOARD_CELL_PX,
  y: square.row * BOARD_CELL_PX,
  width: BOARD_CELL_PX,
  height: BOARD_CELL_PX,
});

/** The whole board: every square, from the top-left corner. */
export const boardRect = (board: BoardSize): PlaneRect => ({
  x: 0,
  y: 0,
  width: board.columns * BOARD_CELL_PX,
  height: board.rows * BOARD_CELL_PX,
});

/** The plane a board is drawn on: exactly the board. */
export const boardPlane = (board: BoardSize): PlaneSize => ({
  width: board.columns * BOARD_CELL_PX,
  height: board.rows * BOARD_CELL_PX,
});

/**
 * Where the grid's lines run: the left edge of every column and the right edge
 * of the last (`columns + 1` of them), and the same down.
 */
export const gridLines = (
  board: BoardSize,
): { readonly xs: ReadonlyArray<number>; readonly ys: ReadonlyArray<number> } => ({
  xs: Array.from({ length: board.columns + 1 }, (_, k) => k * BOARD_CELL_PX),
  ys: Array.from({ length: board.rows + 1 }, (_, k) => k * BOARD_CELL_PX),
});

/** The square under a point in the plane's pixels, or `undefined` off the board. */
export const squareAt = (
  board: BoardSize,
  point: { readonly x: number; readonly y: number },
): BoardSquare | undefined => {
  const column = Math.floor(point.x / BOARD_CELL_PX);
  const row = Math.floor(point.y / BOARD_CELL_PX);
  return column < 0 || row < 0 || column >= board.columns || row >= board.rows
    ? undefined
    : { column, row };
};

/**
 * ## Distance, reach and areas on the board
 *
 * The rules a fight's board measures by, in squares and the feet each one is
 * (`feetPerCell`), never in pixels: where a square falls is {@link cellRect}'s.
 * Every function takes the diagonal rule as an argument, because which one a
 * table plays is the campaign's call, not the board's.
 */

/**
 * How a diagonal step is counted. `five`: every square costs its feet,
 * diagonal or not, the SRD's grid rule. `alternating`: the first diagonal costs
 * one square, the second two, and so on alternately, the optional rule that
 * keeps a diagonal near its true length.
 */
export const DiagonalRule = Schema.Literals(["five", "alternating"]);
export type DiagonalRule = typeof DiagonalRule.Type;

/**
 * Squares walked from one square to another. Under `five` a diagonal is one
 * square, so it is the longer side; under `alternating` every second diagonal
 * is one more, which is the longer side plus half the shorter, rounded down.
 */
export const squaresBetween = (from: BoardSquare, to: BoardSquare, rule: DiagonalRule): number => {
  const across = Math.abs(from.column - to.column);
  const down = Math.abs(from.row - to.row);
  const longer = Math.max(across, down);
  return rule === "five" ? longer : longer + Math.floor(Math.min(across, down) / 2);
};

/** What measuring on a board needs: how many feet a square is, and how diagonals count. */
export interface BoardMeasure {
  readonly feetPerCell: number;
  readonly diagonals: DiagonalRule;
}

/** Feet from one square to another: {@link squaresBetween} at the board's feet per square. */
export const feetBetween = (from: BoardSquare, to: BoardSquare, measure: BoardMeasure): number =>
  squaresBetween(from, to, measure.diagonals) * measure.feetPerCell;

/**
 * Where tokens start: `count` free squares on one side of the board, the party
 * from the left edge and its foes from the right, each column filled from its
 * middle row outward before the next column in. A square already `taken` is
 * passed over; a board with no room left answers fewer squares than asked,
 * and the rest wait off the board.
 */
export const startingSquares = (
  board: BoardSize,
  side: "party" | "foes",
  count: number,
  taken: ReadonlyArray<BoardSquare>,
): ReadonlyArray<BoardSquare> => {
  const used = new Set(taken.map((square) => `${String(square.column)}:${String(square.row)}`));
  const middle = Math.floor((board.rows - 1) / 2);
  // 0, +1, −1, +2, −2, …: outward from the middle row.
  const rows = Array.from({ length: board.rows }, (_, k) =>
    k % 2 === 0 ? middle - k / 2 : middle + (k + 1) / 2,
  ).filter((row) => row >= 0 && row < board.rows);
  const out: Array<BoardSquare> = [];
  for (let step = 0; step < board.columns && out.length < count; step++) {
    const column = side === "party" ? step : board.columns - 1 - step;
    for (const row of rows) {
      if (out.length === count) break;
      const key = `${String(column)}:${String(row)}`;
      if (used.has(key)) continue;
      used.add(key);
      out.push({ column, row });
    }
  }
  return out;
};

const sameSquare = (a: BoardSquare, b: BoardSquare): boolean =>
  a.column === b.column && a.row === b.row;

/** Every square on the board, column by column, that `keep` keeps. */
const squaresWhere = (
  board: BoardSize,
  keep: (square: BoardSquare) => boolean,
): ReadonlyArray<BoardSquare> => {
  const out: Array<BoardSquare> = [];
  for (let column = 0; column < board.columns; column++) {
    for (let row = 0; row < board.rows; row++) {
      const square = { column, row };
      if (keep(square)) out.push(square);
    }
  }
  return out;
};

/**
 * The squares a creature standing on `from` can end a move on with `feet` to
 * walk: every square on the board no further than that, other than its own and
 * any square in `occupied`. Distance is straight-line under the rule, not a
 * path: a creature in the way is a square you cannot stop on, not a wall.
 */
export const reachableSquares = (
  board: BoardSize,
  {
    from,
    feet,
    occupied,
    ...measure
  }: BoardMeasure & {
    readonly from: BoardSquare;
    readonly feet: number;
    readonly occupied: ReadonlyArray<BoardSquare>;
  },
): ReadonlyArray<BoardSquare> =>
  squaresWhere(
    board,
    (square) =>
      !sameSquare(square, from) &&
      feetBetween(from, square, measure) <= feet &&
      !occupied.some((taken) => sameSquare(taken, square)),
  );

/**
 * The squares an area of effect `feet` big covers, cut at the board's edge.
 *
 * A sphere is every square whose centre is within `feet` of `origin`'s centre.
 * A cube is `feet` on a side with `origin` at its middle (the square left and
 * up of the middle when the side is an even number of squares). A cone and a
 * line start at `origin` and point at `toward`, `feet` long, never covering
 * `origin` itself: a line is one square wide unless `width` says more, and a cone is as wide as it is
 * far from its point.
 * A cone or a line with nowhere to point (`toward` is `origin`) covers nothing.
 *
 * A cone or a line measures each square's centre along its axis and across
 * it, in squares: a square counts from three tenths of a square out (so not
 * `origin`) to three tenths past the end, and across within half a square for
 * a line or half the distance out plus a third of a square for a cone. The
 * margins take in a square the edge runs through, so a cone aimed off the grid's
 * lines is not ragged. They are the drawing's, and its catch lists hold with them.
 */
export const areaSquares = (
  board: BoardSize,
  {
    shape,
    feet,
    feetPerCell,
    origin,
    toward,
    width,
  }: {
    readonly shape: AreaShape;
    readonly feet: number;
    readonly feetPerCell: number;
    readonly origin: BoardSquare;
    readonly toward: BoardSquare;
    /** A line's width in feet, when it is wider than one square (a stat block's `width`). */
    readonly width?: number;
  },
): ReadonlyArray<BoardSquare> => {
  const size = feet / feetPerCell;
  if (shape === "sphere") {
    return squaresWhere(
      board,
      (square) => Math.hypot(square.column - origin.column, square.row - origin.row) <= size + 0.01,
    );
  }
  if (shape === "cube") {
    const side = Math.floor(size);
    const first = {
      column: origin.column - Math.floor((side - 1) / 2),
      row: origin.row - Math.floor((side - 1) / 2),
    };
    return squaresWhere(
      board,
      (square) =>
        square.column >= first.column &&
        square.column < first.column + side &&
        square.row >= first.row &&
        square.row < first.row + side,
    );
  }
  const length = Math.hypot(toward.column - origin.column, toward.row - origin.row);
  if (length === 0) return [];
  const along = {
    column: (toward.column - origin.column) / length,
    row: (toward.row - origin.row) / length,
  };
  return squaresWhere(board, (square) => {
    const column = square.column - origin.column;
    const row = square.row - origin.row;
    const ahead = column * along.column + row * along.row;
    const aside = Math.abs(column * along.row - row * along.column);
    if (ahead <= 0.3 || ahead > size + 0.3) return false;
    const halfWidth = width === undefined ? 0.5 : Math.max(0.5, width / feetPerCell / 2);
    return shape === "cone" ? aside <= ahead / 2 + 0.35 : aside <= halfWidth;
  });
};

/** What a ruler laid from one square to another says. */
export interface RulerReading {
  readonly feet: number;
  /**
   * `distance` is a plain measure; `left` and `over` are a move against what the
   * mover has left to walk; `occupied` is a move onto a square someone holds;
   * `blocked` is a walk on a level that no way round reaches.
   */
  readonly verdict: "distance" | "left" | "over" | "occupied" | "blocked";
  /** `"35 ft"`, `"20 ft · 10 left"`, `"35 ft · 5 over"`, `"Occupied"` or `"No way there"`. */
  readonly text: string;
}

/**
 * The ruler's words. `remaining` is the feet the mover has left this turn, or
 * `null` when the ruler is a plain measure or moves somebody whose turn it is
 * not; `occupied` says the far end is a square someone else holds, which wins.
 * `walked` is a move's walk on a level (`pathCost`), which it reads in place
 * of the straight distance, and `null` when no walk gets there.
 */
export const rulerReading = ({
  from,
  to,
  remaining,
  occupied,
  walked,
  ...measure
}: BoardMeasure & {
  readonly from: BoardSquare;
  readonly to: BoardSquare;
  readonly remaining: number | null;
  readonly occupied: boolean;
  readonly walked?: number | null;
}): RulerReading => {
  const feet = walked ?? feetBetween(from, to, measure);
  const distance = `${String(feet)} ft`;
  if (occupied) return { feet, verdict: "occupied", text: "Occupied" };
  if (walked === null) return { feet, verdict: "blocked", text: "No way there" };
  if (remaining === null) return { feet, verdict: "distance", text: distance };
  return feet > remaining
    ? { feet, verdict: "over", text: `${distance} · ${String(feet - remaining)} over` }
    : { feet, verdict: "left", text: `${distance} · ${String(remaining - feet)} left` };
};
