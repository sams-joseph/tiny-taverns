import { type BoardSize, boardPlane, gridLines } from "@taverns/api";
import { cn } from "@taverns/ui";
import type { ReactNode } from "react";

/**
 * A fight's board as squares: the sunken surface, the grid's lines when they
 * are shown, and whatever stands on it, in one box.
 *
 * ### One plane
 *
 * The grid is an SVG whose `viewBox` is the board's plane (`boardPlane`,
 * `BOARD_CELL_PX` a square), and the box takes the plane's aspect ratio, so
 * the browser does the one scaling there is and a percentage of the box is a
 * percentage of the plane. The strokes do not scale: a line is a line at any
 * width. A level fight draws its level under this box
 * (`run/LevelBackdrop.tsx`) and hides these lines, since the level draws its
 * own.
 *
 * No pan, no zoom and no scroller of its own: the board is as wide as its
 * box — the runner's card, or the canvas, which pans and zooms the box around
 * it (`run/BoardCanvas.tsx`).
 */
export function GridBoard({
  board,
  grid,
  className,
  children,
}: {
  readonly board: BoardSize;
  /** Whether the lines are drawn: the runner's *Grid* switch, or off over a level. */
  readonly grid: boolean;
  /**
   * The canvas draws the board `box-content`, so its frame sits outside the
   * plane's size and a square is exactly the size the canvas zoomed it to.
   */
  readonly className?: string;
  /**
   * What stands on the board — the runner's tokens (`run/RunTokens.tsx`) —
   * drawn over the grid in the same box.
   */
  readonly children?: ReactNode;
}) {
  const plane = boardPlane(board);
  const lines = gridLines(board);

  return (
    <div
      data-slot="board"
      className={cn(
        "relative w-full overflow-hidden rounded-card border border-hairline bg-surface-sunken",
        className,
      )}
      style={{ aspectRatio: `${String(plane.width)} / ${String(plane.height)}` }}
    >
      {grid && (
        <svg
          data-slot="board-grid"
          aria-hidden
          viewBox={`0 0 ${String(plane.width)} ${String(plane.height)}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full stroke-strong"
        >
          {lines.xs.map((x) => (
            <line
              key={`x${String(x)}`}
              data-line="column"
              x1={x}
              x2={x}
              y1={0}
              y2={plane.height}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {lines.ys.map((y) => (
            <line
              key={`y${String(y)}`}
              data-line="row"
              x1={0}
              x2={plane.width}
              y1={y}
              y2={y}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
      {children}
    </div>
  );
}
