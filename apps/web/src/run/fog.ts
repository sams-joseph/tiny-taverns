import type { BattleMapBoard, BoardFogUpdate, BoardSquare } from "@taverns/api";
import { cellRect } from "@taverns/api";

/**
 * Fog of war on the fight's board, as arithmetic a test can pin: what the Fog
 * tool shows while its writes are on their way, and the outline it draws.
 *
 * The server holds the fog (`EncounterRunBoard.fog`, written through
 * `BoardFogUpdate`); the runner draws the server's answer with the strokes it
 * has sent and not heard back about laid over it, in the order they were sent,
 * so a stroke stays painted from the moment it is drawn.
 */

/** One write of the Fog tool, as it is applied over the fog the board holds. */
export type FogEdit =
  | { readonly kind: "hide" | "reveal"; readonly squares: ReadonlyArray<BoardSquare> }
  | { readonly kind: "revealAll" | "coverAll" | "reset" };

/** The write's payload, without its `requestId`. */
export const fogPayload = (edit: FogEdit): Omit<BoardFogUpdate, "requestId"> => {
  switch (edit.kind) {
    case "hide":
      return { hide: edit.squares };
    case "reveal":
      return { reveal: edit.squares };
    case "revealAll":
      return { revealAll: true };
    case "coverAll":
      return { coverAll: true };
    case "reset":
      return { reset: true };
  }
};

/** A square as a set key. */
export const squareKey = (square: BoardSquare): string =>
  `${String(square.column)},${String(square.row)}`;

/**
 * The fog after `edits`, in order, over what the board holds. *Reset* goes back
 * to the fog the fight started with, which the runner does not read, so until
 * the server answers it changes nothing here.
 */
export const fogAfter = (
  board: Pick<BattleMapBoard, "columns" | "rows">,
  fog: ReadonlyArray<BoardSquare>,
  edits: ReadonlyArray<FogEdit>,
): ReadonlyArray<BoardSquare> => {
  if (edits.length === 0) return fog;
  const hidden = new Map(fog.map((square) => [squareKey(square), square]));
  for (const edit of edits) {
    switch (edit.kind) {
      case "hide":
        for (const square of edit.squares) hidden.set(squareKey(square), square);
        break;
      case "reveal":
        for (const square of edit.squares) hidden.delete(squareKey(square));
        break;
      case "revealAll":
        hidden.clear();
        break;
      case "coverAll":
        for (let row = 0; row < board.rows; row++) {
          for (let column = 0; column < board.columns; column++) {
            hidden.set(squareKey({ column, row }), { column, row });
          }
        }
        break;
      case "reset":
        break;
    }
  }
  return [...hidden.values()];
};

/**
 * Every square on the straight line from `from` to `to`, both ends included: a
 * pointer that crosses three squares between two of its events still paints
 * the three.
 */
export const squaresBetween = (from: BoardSquare, to: BoardSquare): ReadonlyArray<BoardSquare> => {
  const steps = Math.max(Math.abs(to.column - from.column), Math.abs(to.row - from.row));
  if (steps === 0) return [from];
  return Array.from({ length: steps + 1 }, (_, step) => ({
    column: Math.round(from.column + ((to.column - from.column) * step) / steps),
    row: Math.round(from.row + ((to.row - from.row) * step) / steps),
  }));
};

/**
 * One SVG path covering every square, in the board's plane: a path rather than
 * a rectangle per square, so a fogged board is one element however many
 * squares it covers, and two squares side by side leave no seam between them.
 */
export const fogOutline = (board: BattleMapBoard, squares: ReadonlyArray<BoardSquare>): string =>
  squares
    .map((square) => {
      const { x, y, width, height } = cellRect(board, square);
      return `M${String(x)} ${String(y)}h${String(width)}v${String(height)}h${String(-width)}z`;
    })
    .join("");
