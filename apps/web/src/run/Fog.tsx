import {
  type BattleMapBoard,
  type BattleMapImages,
  type BoardSquare,
  battleMapPlane,
  squareAt,
} from "@taverns/api";
import { Button, cn } from "@taverns/ui";
import { type PointerEvent, useRef, useState } from "react";
import { fogOutline, squareKey } from "./fog";

/**
 * Fog of war on a fight's board: the squares the DM has hidden from the
 * players (`EncounterRunBoard.fog`, `PlayerLiveBoard.fog`).
 *
 * - **The DM sees through it.** Their board dims a fogged square
 *   (`surface-sunken` at 62%, the drawing's) over whatever stands on it, so a
 *   token under fog is still there to run and plainly not the players'.
 * - **A player sees none of it.** Their board covers a fogged square outright,
 *   and nothing stands on one but their own character (the server sends no
 *   other token there, `tokenShown`), whose token is drawn over it.
 *
 * Both are this one layer, a single path in the board's plane
 * (`fogOutline`), so a covered board is one element however large it is.
 */
export function FogLayer({
  board,
  squares,
  veil,
}: {
  readonly board: BattleMapBoard & { readonly image: BattleMapImages | null };
  readonly squares: ReadonlyArray<BoardSquare>;
  /** `dim` for the DM, who sees through it; `opaque` for a player, who does not. */
  readonly veil: "dim" | "opaque";
}) {
  if (squares.length === 0) return null;
  const plane = battleMapPlane(board, board.image);
  return (
    <svg
      data-slot="fog"
      data-veil={veil}
      data-squares={squares.length}
      aria-hidden
      viewBox={`0 0 ${String(plane.width)} ${String(plane.height)}`}
      preserveAspectRatio="none"
      className={cn("pointer-events-none absolute inset-0 size-full", veil === "dim" && "z-lifted")}
    >
      <path
        d={fogOutline(board, squares)}
        className={veil === "dim" ? "fill-surface-sunken/62" : "fill-surface-sunken"}
      />
    </svg>
  );
}

/** The Fog brush's stroke, as the board's hook keeps it (`runBoard.ts`). */
export interface FogStroke {
  /** The first square of a stroke: it hides when that square is clear, reveals when it is fogged. */
  readonly start: (square: BoardSquare) => void;
  /** The pointer went from one square to another; every square on the way joins the stroke. */
  readonly extend: (from: BoardSquare, to: BoardSquare) => void;
  /** Let go: the stroke is one write. */
  readonly end: () => void;
  /** A cancelled pointer paints nothing. */
  readonly cancel: () => void;
}

/**
 * The Fog tool's brush: a layer over everything on the DM's board that takes
 * every press while the tool is on, so a stroke over a token paints the square
 * rather than dragging the token, and a stroke never pans the canvas
 * (`BoardCanvas.tsx` pans only a press that reaches it). The wheel still pans
 * and zooms. The square under the pointer is outlined, as the drawing does.
 */
export function FogBrush({
  board,
  stroke,
}: {
  readonly board: BattleMapBoard & { readonly image: BattleMapImages | null };
  readonly stroke: FogStroke;
}) {
  const plane = battleMapPlane(board, board.image);
  const layer = useRef<HTMLDivElement>(null);
  const painting = useRef<{ readonly pointerId: number; last: BoardSquare } | undefined>(undefined);
  const [hover, setHover] = useState<BoardSquare>();

  const squareUnder = (event: PointerEvent<HTMLDivElement>): BoardSquare | undefined => {
    const box = layer.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || box.height === 0) return undefined;
    return squareAt(board, {
      x: ((event.clientX - box.left) / box.width) * plane.width,
      y: ((event.clientY - box.top) / box.height) * plane.height,
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // The brush's, never the canvas's pan.
    event.stopPropagation();
    if (event.button !== 0 || event.isPrimary === false || painting.current !== undefined) return;
    const square = squareUnder(event);
    if (square === undefined) return;
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    painting.current = { pointerId: event.pointerId, last: square };
    stroke.start(square);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const square = squareUnder(event);
    setHover((current) =>
      current !== undefined && square !== undefined && squareKey(current) === squareKey(square)
        ? current
        : square,
    );
    const held = painting.current;
    if (held === undefined || held.pointerId !== event.pointerId || square === undefined) return;
    if (squareKey(square) === squareKey(held.last)) return;
    stroke.extend(held.last, square);
    held.last = square;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (painting.current?.pointerId !== event.pointerId) return;
    painting.current = undefined;
    stroke.end();
  };

  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (painting.current?.pointerId !== event.pointerId) return;
    painting.current = undefined;
    stroke.cancel();
  };

  return (
    <div
      ref={layer}
      data-slot="fog-brush"
      aria-hidden
      className="absolute inset-0 z-lifted cursor-crosshair"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => setHover(undefined)}
    >
      {hover !== undefined && (
        <svg
          viewBox={`0 0 ${String(plane.width)} ${String(plane.height)}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <path
            data-slot="fog-brush-square"
            d={fogOutline(board, [hover])}
            fill="none"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className="stroke-heading"
          />
        </svg>
      )}
    </div>
  );
}

/**
 * The Fog tool's board-wide writes, beside the dock's tools while Fog is on
 * (`BoardTools.tsx`). *Reset fog* puts back the fog the fight started with,
 * which is none until fog is authored in prep.
 */
export function FogActions({
  onWhole,
}: {
  readonly onWhole: (kind: "revealAll" | "coverAll" | "reset") => void;
}) {
  return (
    <div role="group" aria-label="Fog" className="flex flex-wrap items-center justify-center gap-1">
      <span aria-hidden className="mx-0.5 h-5 w-px bg-strong" />
      <Button variant="ghost" size="sm" onClick={() => onWhole("revealAll")}>
        Reveal all
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onWhole("coverAll")}>
        Cover all
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onWhole("reset")}>
        Reset fog
      </Button>
    </div>
  );
}
