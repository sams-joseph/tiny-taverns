import type { PictureRect } from "@taverns/api";
import { cn } from "@taverns/ui";
import { battleMapPlane } from "@taverns/api";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { BattleMapBoard } from "../campaign/BattleMapBoard";
import { BoardCanvas, type Camera } from "./BoardCanvas";
import { centreOf } from "./canvas";
import { AreaBanner, AreaLayer, BoardToolPicker, ToolSurface } from "./BoardTools";
import { CameraBar } from "./CameraBar";
import { FogActions, FogBrush } from "./Fog";
import { useRunBoard, type RunBoardProps } from "./runBoard";
import { RunTokens } from "./RunTokens";

/**
 * The fight at a desktop width: **a canvas, not a page.** The board fills the
 * whole window, the DM pans and zooms it (`BoardCanvas.tsx`), and everything
 * else floats over it on the `hud` rung, laid out as the maintainer's
 * `Encounter Canvas.dc.html` draws it (2026-10-17). The screen holds the
 * window through `useFullscreen` (`shell/slots.ts`), so the shell draws no nav
 * rows while it is up; the title's back link is the way out.
 *
 * This is the one screen that does not scroll with the window: the stage is
 * bounded to the viewport, and each panel scrolls inside itself. A table's DM
 * keeps the board in view while reading a stat block, and a page that scrolled
 * would carry the board away with it.
 *
 * The regions:
 *
 * - **title** — top left: the way back, the fight's name and where it is.
 * - **strip** — top centre: the initiative ribbon while the fight takes turns
 *   (`InitiativeStrip.tsx`, `compact`).
 * - **controls** — top right: the switches over what the table sees, and the
 *   way to end the fight.
 * - **notices** — under the top row: the autopilot's line, an ended or behind
 *   fight's.
 * - **rolling** — *Roll initiative* (`InitiativePhase.tsx`), on the left in the
 *   party rail's place while the fight rolls: a box per row needs a column.
 * - **party** — the party rail down the left (`PartyRail.tsx`).
 * - **corner** — bottom left: the camera (`CameraBar.tsx`) and the board's
 *   tools, which the board portals in (`StageCorner`), since they are the
 *   board's state.
 * - **turn** — bottom centre: whoever is up (`TurnCard.tsx`), with the attack's
 *   *Pick a target* banner over it while one is picked.
 * - **panel** — the right-hand column: the selected creature's card, then the
 *   table's own cards the drawing leaves out (Hob's spends, NPCs at the table).
 * - **rolls** — bottom right: the *Rolls* dock (`RollsDock.tsx`).
 *
 * Below `@3xl` of `main` the board is too small to play on and the runner is
 * the window-scrolling grid it always was (`RunLayout.tsx`); `useStage` asks
 * that same container query (`stage.tsx`), so the canvas and the tokens' own `@3xl` cannot
 * disagree about which side of it the screen is on.
 */
export function RunStage({
  title,
  strip,
  controls,
  notices,
  rolling,
  party,
  turn,
  banner,
  panel,
  rolls,
  board,
}: {
  readonly title: ReactNode;
  /** The initiative ribbon, top centre; `null` while the fight rolls. */
  readonly strip: ReactNode | null;
  readonly controls: ReactNode;
  /** The lines under the top row. */
  readonly notices: ReactNode;
  /** *Roll initiative*, on the left; `null` once turns are taken. */
  readonly rolling: ReactNode | null;
  /** The party rail, on the left once turns are taken. */
  readonly party: ReactNode | null;
  /** Whoever is up, bottom centre; `null` while nobody is. */
  readonly turn: ReactNode | null;
  /** A line over the turn card while a tool asks for a square: the attack's target. */
  readonly banner: ReactNode | undefined;
  readonly panel: ReactNode;
  readonly rolls: ReactNode;
  /** The board, told which part of the stage no panel covers. */
  readonly board: (freeArea: (canvas: DOMRect) => PictureRect) => ReactNode;
}) {
  const top = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState<HTMLDivElement | null>(null);

  // Between the two columns, under the top row and over the turn card, inset
  // as far as the HUD is from the stage's edge.
  const freeArea = useCallback((canvas: DOMRect): PictureRect => {
    const t = top.current?.getBoundingClientRect();
    const l = left.current?.getBoundingClientRect();
    const r = right.current?.getBoundingClientRect();
    const f = foot.current?.getBoundingClientRect();
    const inset = t === undefined ? 0 : t.left - canvas.left;
    const x = l === undefined || l.width === 0 ? inset : l.right - canvas.left + inset;
    const y = t === undefined ? inset : t.bottom - canvas.top + inset;
    const end =
      r === undefined || r.width === 0 ? canvas.width - inset : r.left - canvas.left - inset;
    const bottom =
      f === undefined || f.height === 0 ? canvas.height - inset : f.top - canvas.top - inset;
    return { x, y, width: end - x, height: bottom - y };
  }, []);

  return (
    <StageCorner.Provider value={corner}>
      <div
        data-slot="run-stage"
        className="relative min-h-120 flex-1 overflow-clip bg-surface-sunken"
      >
        {board(freeArea)}
        <div
          data-slot="run-hud"
          className="pointer-events-none absolute inset-3 z-hud flex flex-col gap-3 @container/hud"
        >
          <div ref={top} className="flex min-w-0 shrink-0 flex-col gap-3">
            {/* The ribbon sits between the title and the controls where there is
                room, and on a row of its own under them where there is not. */}
            <div
              data-slot="run-hud-header"
              className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3"
            >
              <div data-slot="run-hud-title" className="pointer-events-auto min-w-0 shrink">
                {title}
              </div>
              {strip !== null && (
                <div
                  data-slot="run-hud-strip"
                  className="order-last flex min-w-0 basis-full justify-center *:pointer-events-auto @6xl/hud:order-none @6xl/hud:flex-1 @6xl/hud:basis-0"
                >
                  {strip}
                </div>
              )}
              <div
                data-slot="run-hud-controls"
                className="pointer-events-auto flex shrink-0 flex-wrap items-center justify-end gap-2.5"
              >
                {controls}
              </div>
            </div>
            <div
              data-slot="run-hud-notices"
              className="flex flex-col items-center gap-2 empty:hidden *:pointer-events-auto *:w-full *:max-w-run-turn"
            >
              {notices}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-stretch justify-between gap-3">
            {/* *Roll initiative* wants the inspector's width for a box per row. */}
            <div
              ref={left}
              data-slot="run-hud-left"
              className={cn(
                "flex shrink-0 flex-col gap-3",
                rolling !== null ? "w-aside" : "w-run-rail",
              )}
            >
              {rolling !== null ? (
                <div
                  data-slot="run-hud-rolling"
                  className={cn(hudScroller, "min-h-0 shrink rounded-card shadow-3")}
                >
                  {rolling}
                </div>
              ) : (
                party !== null && (
                  <div
                    data-slot="run-hud-party"
                    className={cn(hudScroller, "my-auto min-h-0 shrink")}
                  >
                    {party}
                  </div>
                )
              )}
              <div
                ref={setCorner}
                data-slot="run-hud-corner"
                className="pointer-events-auto mt-auto flex shrink-0 flex-col gap-2 empty:hidden"
              />
            </div>
            <div
              data-slot="run-hud-centre"
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
            >
              {banner !== undefined && (
                <div data-slot="run-hud-banner" className="flex min-w-0 justify-center">
                  {banner}
                </div>
              )}
              {turn !== null && (
                <div
                  ref={foot}
                  data-slot="run-hud-turn"
                  className={cn(hudScroller, "max-h-full w-full max-w-run-turn shrink-0")}
                >
                  {turn}
                </div>
              )}
            </div>
            <div
              ref={right}
              data-slot="run-hud-right"
              className="flex w-aside shrink-0 flex-col justify-end gap-3"
            >
              <div
                data-slot="run-hud-panel"
                className={cn(hudScroller, "flex min-h-0 shrink flex-col gap-3")}
              >
                {panel}
              </div>
              <div
                data-slot="run-hud-rolls"
                className={cn(hudScroller, "flex max-h-1/2 shrink-0 flex-col gap-3")}
              >
                {rolls}
              </div>
            </div>
          </div>
        </div>
      </div>
    </StageCorner.Provider>
  );
}

/**
 * The stage's bottom-left corner, where the board puts its camera and tools:
 * they are the board's state (`useRunBoard`), so the board renders them and
 * portals them here. `null` off the stage, where the board keeps them itself.
 */
const StageCorner = createContext<HTMLElement | null>(null);

/** Into the stage's corner, or where it stands when there is no stage around it. */
export function InStageCorner({
  children,
  fallback,
}: {
  readonly children: ReactNode;
  readonly fallback: (children: ReactNode) => ReactNode;
}) {
  const corner = useContext(StageCorner);
  return corner === null ? fallback(children) : createPortal(children, corner);
}

/** A floating region that scrolls inside itself and hands the wheel to nobody. */
const hudScroller = "pointer-events-auto overflow-y-auto overscroll-contain";

/**
 * The board on the canvas: the same board and tokens as the card
 * (`RunBoardCard.tsx`, through `useRunBoard`), with its camera and tool dock
 * in the stage's bottom-left corner (`InStageCorner`). The card's switches,
 * hint, tray and caption are the card's alone; the wheel zooms the canvas
 * (`BoardCanvas.tsx`), and the camera's buttons do it without one. When the
 * turn moves to a creature whose token is outside the free area, the camera
 * brings it in.
 *
 * The dock's tools are the canvas's alone, since only here does the board take
 * a pointer (`BoardTools.tsx`). While Measure, Area or Fog is on, a layer over
 * the tokens takes every press, so no token drags: Measure's ruler, Area's
 * pin, or Fog's brush (`Fog.tsx`), which paints the players' fog of war. Esc,
 * Move or anything else claiming the board (an attack's pick, a dialog) puts
 * the tool away; only Esc on Area or _Clear_ takes the pin off. The pinned area
 * is drawn under the tokens whichever tool is on, and its banner says who it
 * catches.
 */
export function RunBoardStage({
  freeArea,
  ...props
}: RunBoardProps & { readonly freeArea: (canvas: DOMRect) => PictureRect }) {
  const { resource, reload, over } = props;
  const { board, gridShown, withBoard, tools, fogTool } = useRunBoard(props, true);
  const camera = useRef<Camera | null>(null);
  const active = props.tokens.combatants.find(
    (combatant) => combatant.id === props.tokens.activeId,
  );
  const activeAt =
    board === null || active?.position == null ? undefined : centreOf(board, active.position);
  const activeKey = activeAt === undefined ? undefined : `${active?.id ?? ""}`;
  // Following the turn: the view opens on whoever is up, and once the DM has
  // moved it, the next one up is brought into view when they are not in it.
  const follow = useRef(activeAt);
  follow.current = activeAt;
  const followed = useRef(activeKey);
  useEffect(() => {
    if (followed.current === activeKey) return;
    followed.current = activeKey;
    if (activeKey === undefined || follow.current === undefined) return;
    camera.current?.reveal(follow.current);
  }, [activeKey]);

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
        freeArea={freeArea}
        focus={activeAt}
        camera={camera}
        controls={(at) => (
          <InStageCorner
            fallback={(children) => (
              <div className="absolute bottom-3 left-3 z-hud flex w-run-rail flex-col gap-2">
                {children}
              </div>
            )}
          >
            {tools.caught !== undefined && !over && (
              <AreaBanner line={tools.caught} onClear={tools.clear} />
            )}
            <div
              data-slot="run-hud-tools"
              className="flex flex-col gap-2 rounded-card border border-strong bg-surface-card p-2 shadow-3"
            >
              <CameraBar
                camera={at}
                onCentre={activeAt === undefined ? undefined : () => at.centre(activeAt)}
              />
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-t border-hairline pt-2">
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
              </div>
            </div>
          </InStageCorner>
        )}
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
    </section>
  );
}
