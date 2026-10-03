import type { PictureRect } from "@taverns/api";
import { cn } from "@taverns/ui";
import { battleMapPlane } from "@taverns/api";
import { type ReactNode, useCallback, useRef } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { BattleMapBoard } from "../campaign/BattleMapBoard";
import { BoardCanvas, CanvasZoom, type CanvasControls } from "./BoardCanvas";
import { AreaBanner, AreaLayer, BoardToolPicker, ToolSurface } from "./BoardTools";
import { FogActions, FogBrush } from "./Fog";
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
 * The regions, each a home a later piece of the redesign fills:
 *
 * - **strip** — the initiative strip across the top while the fight takes
 *   turns (`InitiativeStrip.tsx`); the columns start under it.
 * - **rolling** — *Roll initiative* (`InitiativePhase.tsx`), top left, in the
 *   strip's place while the fight rolls: a box per row needs a column, not a
 *   chip.
 * - **panel** — the right-hand column: the selected creature's card, then the
 *   table's own cards the drawing leaves out (Hob's spends, NPCs at the table).
 * - **rolls** — bottom left: the *Rolls* dock, the DM's dice with the
 *   players' tray and the night's log merged into it (`RollsDock.tsx`).
 * - **banner** — under the strip, between the columns, while a tool waits for
 *   a token: the attack's *Pick a target*.
 * - **tools** — bottom centre, over the board: the board's tools (*Move*,
 *   *Measure*, *Area* with its shapes and size, and *Fog* with its *Reveal
 *   all*, *Cover all* and *Reset fog*, `BoardTools.tsx`), *Grid*, *Names*,
 *   *Hide from players*, zoom, the hint and the tokens nobody has put down
 *   (`RunBoardStage`), with a pinned area's banner over it.
 *
 * Below `@3xl` of `main` the board is too small to play on and the runner is
 * the window-scrolling grid it always was (`RunLayout.tsx`); `useStage` asks
 * that same container query (`stage.tsx`), so the canvas and the tokens' own `@3xl` cannot
 * disagree about which side of it the screen is on.
 */
export function RunStage({
  strip,
  rolling,
  banner,
  panel,
  rolls,
  board,
}: {
  /** The initiative strip, across the top; `null` while the fight rolls. */
  readonly strip: ReactNode | null;
  /** *Roll initiative*, top left; `null` once turns are taken. */
  readonly rolling: ReactNode | null;
  /** A line over the board between the columns while a tool asks for a square: the attack's target. */
  readonly banner: ReactNode | undefined;
  readonly panel: ReactNode;
  readonly rolls: ReactNode;
  /** The board, told which part of the stage no panel covers. */
  readonly board: (freeArea: (canvas: DOMRect) => PictureRect) => ReactNode;
}) {
  const top = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);

  // Between the two columns and under the strip, inset as far as they are
  // from the stage's edge.
  const freeArea = useCallback((canvas: DOMRect): PictureRect => {
    const t = top.current?.getBoundingClientRect();
    const l = left.current?.getBoundingClientRect();
    const r = right.current?.getBoundingClientRect();
    const inset = l === undefined ? 0 : l.left - canvas.left;
    const x = l === undefined ? 0 : l.right - canvas.left + inset;
    const y = t === undefined ? inset : t.bottom - canvas.top + inset;
    const end = r === undefined ? canvas.width : r.left - canvas.left - inset;
    return { x, y, width: end - x, height: canvas.height - inset - y };
  }, []);

  return (
    <div
      data-slot="run-stage"
      className="relative min-h-120 flex-1 overflow-clip rounded-card border border-hairline bg-surface-sunken"
    >
      {board(freeArea)}
      <div
        data-slot="run-hud"
        className="pointer-events-none absolute inset-3 z-hud flex flex-col gap-3"
      >
        {strip !== null && (
          <div ref={top} data-slot="run-hud-strip" className="pointer-events-auto min-w-0 shrink-0">
            {strip}
          </div>
        )}
        <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
          <div
            ref={left}
            data-slot="run-hud-left"
            className="flex w-aside shrink-0 flex-col gap-3 self-stretch"
          >
            {rolling !== null && (
              <div
                data-slot="run-hud-rolling"
                className={cn(hudScroller, "max-h-1/2 shrink-0 rounded-card shadow-3")}
              >
                {rolling}
              </div>
            )}
            <div
              data-slot="run-hud-rolls"
              className={cn(hudScroller, "mt-auto flex min-h-0 flex-col gap-3")}
            >
              {rolls}
            </div>
          </div>
          {banner !== undefined && (
            <div data-slot="run-hud-banner" className="flex min-w-0 flex-1 justify-center">
              {banner}
            </div>
          )}
          <div
            ref={right}
            data-slot="run-hud-panel"
            className={cn(hudScroller, "flex max-h-full w-aside shrink-0 flex-col gap-3")}
          >
            {panel}
          </div>
        </div>
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
 *
 * The dock's tools are the canvas's alone, since only here does the board take
 * a pointer (`BoardTools.tsx`). While Measure, Area or Fog is on, a layer over
 * the tokens takes every press, so no token drags: Measure's ruler, Area's
 * pin, or Fog's brush (`Fog.tsx`), which paints the players' fog of war. Esc,
 * Move or anything else claiming the board (an attack's pick, a dialog) puts
 * the tool away; only Esc on Area or _Clear_ takes the pin off. The pinned area is drawn under the tokens whichever tool is
 * on, and its banner says who it catches.
 */
export function RunBoardStage({
  freeArea,
  ...props
}: RunBoardProps & { readonly freeArea: (canvas: DOMRect) => PictureRect }) {
  const { resource, reload, over, hostileTokensHidden, hiding, onHideHostile } = props;
  const { board, gridShown, setGrid, names, setNames, hint, withBoard, tools, fogTool } =
    useRunBoard(props, true);
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
          {tools.pinned !== null && <AreaLayer board={board} area={tools.pinned} state="pinned" />}
          {tools.preview !== undefined && (
            <AreaLayer board={board} area={tools.preview} state="preview" />
          )}
          <RunTokens {...withBoard} />
          {tools.tool === "fog" && <FogBrush board={board} stroke={fogTool.stroke} />}
          {(tools.tool === "measure" || tools.tool === "area") && (
            <ToolSurface
              board={board}
              tool={tools.tool}
              hovered={tools.hovered}
              ruler={tools.ruler}
              pointer={tools.pointer}
            />
          )}
        </BattleMapBoard>
      </BoardCanvas>
      <div className="pointer-events-none absolute inset-x-[calc(var(--spacing-aside)+var(--spacing)*6)] bottom-3 z-hud flex flex-col items-center gap-2 @container/tools">
        {tools.caught !== undefined && !over && (
          <AreaBanner line={tools.caught} onClear={tools.clear} />
        )}
        <div
          ref={dock}
          data-slot="run-hud-tools"
          className="pointer-events-auto max-w-full min-w-0 rounded-card border border-strong bg-surface-card shadow-3"
        >
          <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-2">
            <BoardToolPicker
              tool={tools.tool}
              disabled={!tools.usable}
              onTool={tools.choose}
              shape={tools.shape}
              feet={tools.feet}
              onShape={tools.pickShape}
              onStep={tools.step}
              fog={<FogActions onWhole={fogTool.whole} />}
            />
            <BoardToggles
              gridShown={gridShown}
              setGrid={setGrid}
              names={names}
              setNames={setNames}
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
