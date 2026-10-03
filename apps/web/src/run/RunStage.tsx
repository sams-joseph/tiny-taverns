import type { PictureRect } from "@taverns/api";
import { cn } from "@taverns/ui";
import { battleMapPlane } from "@taverns/api";
import { type ReactNode, useCallback, useRef } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { BattleMapBoard } from "../campaign/BattleMapBoard";
import { BoardCanvas, CanvasZoom, type CanvasControls } from "./BoardCanvas";
import { BoardToggles } from "./RunBoardCard";
import { boardCaption, useRunBoard, type RunBoardProps } from "./runBoard";
import { RunTokens, TokenTray } from "./RunTokens";

/**
 * The fight at a desktop width: **a canvas, not a page.** The board fills the
 * stage under the runner's header, the DM pans and zooms it (`BoardCanvas.tsx`),
 * and everything else floats over it on the `hud` rung — the captain's call on
 * the encounter runner redesign (`Encounter Runner.dc.html`, D1: "more like a
 * canvas").
 *
 * This is the one screen that does not scroll with the window: the stage is
 * bounded to the viewport under the chrome, and each panel scrolls inside
 * itself. A table's DM keeps the board in view while reading a stat block, and
 * a page that scrolled would carry the board away with it.
 *
 * Four regions, each a home a later piece of the redesign fills:
 *
 * - **strip** — the initiative, top left: today's list (or *Roll initiative*
 *   while the fight rolls), which becomes the drawing's strip across the top.
 * - **panel** — the right-hand column: the selected creature's card, then the
 *   table's own cards the drawing leaves out (Hob's spends, NPCs at the table).
 * - **rolls** — bottom left: the DM's dice, the players' tray and the log.
 * - **tools** — bottom centre, over the board: *Grid*, *Hide from players*,
 *   zoom, the hint and the tokens nobody has put down (`RunBoardStage`).
 *
 * Below `@3xl` of `main` the board is too small to play on and the runner is
 * the window-scrolling grid it always was (`RunLayout.tsx`); `useStage` asks
 * that same container query (`stage.tsx`), so the canvas and the tokens' own `@3xl` cannot
 * disagree about which side of it the screen is on.
 */
export function RunStage({
  strip,
  panel,
  rolls,
  board,
}: {
  readonly strip: ReactNode;
  readonly panel: ReactNode;
  readonly rolls: ReactNode;
  /** The board, told which part of the stage no panel covers. */
  readonly board: (freeArea: (canvas: DOMRect) => PictureRect) => ReactNode;
}) {
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);

  // Between the two columns, inset as far as they are from the stage's edge.
  const freeArea = useCallback((canvas: DOMRect): PictureRect => {
    const l = left.current?.getBoundingClientRect();
    const r = right.current?.getBoundingClientRect();
    const inset = l === undefined ? 0 : l.left - canvas.left;
    const x = l === undefined ? 0 : l.right - canvas.left + inset;
    const end = r === undefined ? canvas.width : r.left - canvas.left - inset;
    return { x, y: inset, width: end - x, height: canvas.height - 2 * inset };
  }, []);

  return (
    <div
      data-slot="run-stage"
      className="relative min-h-120 flex-1 overflow-clip rounded-card border border-hairline bg-surface-sunken"
    >
      {board(freeArea)}
      <div
        ref={left}
        data-slot="run-hud-left"
        className="pointer-events-none absolute inset-y-3 left-3 z-hud flex w-aside flex-col gap-3"
      >
        <div
          data-slot="run-hud-strip"
          className={cn(hudScroller, "max-h-1/2 shrink-0 rounded-card shadow-3")}
        >
          {strip}
        </div>
        <div
          data-slot="run-hud-rolls"
          className={cn(hudScroller, "mt-auto flex min-h-0 flex-col gap-3")}
        >
          {rolls}
        </div>
      </div>
      <div
        ref={right}
        data-slot="run-hud-panel"
        className={cn(
          hudScroller,
          "absolute top-3 right-3 z-hud flex max-h-[calc(100%-var(--spacing)*6)] w-aside flex-col gap-3",
        )}
      >
        {panel}
      </div>
    </div>
  );
}

/** A floating region that scrolls inside itself and hands the wheel to nobody. */
const hudScroller = "pointer-events-auto overflow-y-auto overscroll-contain";

/**
 * The board on the canvas: the same board, tokens and switches as the card
 * (`RunBoardCard.tsx`, through `useRunBoard`), with the card's header and
 * footer gathered into the tool dock floating at the bottom of the stage.
 */
export function RunBoardStage({
  freeArea,
  ...props
}: RunBoardProps & { readonly freeArea: (canvas: DOMRect) => PictureRect }) {
  const { resource, reload, over, hostileTokensHidden, hiding, onHideHostile } = props;
  const { board, gridShown, setGrid, hint, withBoard } = useRunBoard(props);
  const controls = useRef<CanvasControls | null>(null);
  const dock = useRef<HTMLDivElement>(null);

  // Above the dock as well as between the columns.
  const clear = useCallback(
    (canvas: DOMRect): PictureRect => {
      const area = freeArea(canvas);
      const top = dock.current?.getBoundingClientRect().top;
      if (top === undefined) return area;
      const bottom = Math.min(area.y + area.height, top - canvas.top - area.y);
      return { ...area, height: bottom - area.y };
    },
    [freeArea],
  );

  if (resource.state === "failed") {
    return (
      <div className="absolute inset-0 grid place-items-center p-panel">
        <div className="w-full max-w-md">
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      </div>
    );
  }
  if (board === null || withBoard === undefined) return null;

  const plane = battleMapPlane(board, board.image);
  return (
    <section aria-label="Battle map" data-slot="run-board" className="absolute inset-0">
      <BoardCanvas
        plane={plane}
        cellPx={board.alignment.cellPx}
        freeArea={clear}
        controlsRef={controls}
      >
        <BattleMapBoard
          map={{ ...board, grid: gridShown ? "square" : "none" }}
          className="box-content"
        >
          <RunTokens {...withBoard} />
        </BattleMapBoard>
      </BoardCanvas>
      <div className="pointer-events-none absolute inset-x-[calc(var(--spacing-aside)+var(--spacing)*6)] bottom-3 z-hud flex justify-center">
        <div
          ref={dock}
          data-slot="run-hud-tools"
          className="pointer-events-auto max-w-full min-w-0 rounded-card border border-strong bg-surface-card shadow-3"
        >
          <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-2">
            <BoardToggles
              gridShown={gridShown}
              setGrid={setGrid}
              over={over}
              hostileTokensHidden={hostileTokensHidden}
              hiding={hiding}
              onHideHostile={onHideHostile}
            />
            <CanvasZoom controls={controls} />
          </div>
          <p
            role="status"
            className="mb-0 border-t border-hairline px-3 py-2 text-body-s leading-snug text-muted-foreground"
          >
            {hint}
          </p>
          <TokenTray {...withBoard} />
          <p className="mb-0 border-t border-hairline px-3 py-2 text-caption leading-body text-muted-foreground">
            {boardCaption(board)}
          </p>
        </div>
      </div>
    </section>
  );
}
