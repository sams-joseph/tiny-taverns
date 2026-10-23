import { BOARD_CELL_PX, type PlaneRect, boardPlane, runLevelLayout } from "@taverns/api";
import { Icon, SectionHeading, cn } from "@taverns/ui";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { canDrawWebGL } from "./fx3d/support";
import { LevelBackdrop } from "./LevelBackdrop";
import { LevelSwitches } from "./LevelSwitches";
import { createPortal } from "react-dom";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { BoardCanvas, type Camera } from "./BoardCanvas";
import { centreOf, SQUARE_PX } from "./canvas";
import { AreaBanner, AreaLayer, BoardToolPicker, FIGHT_MOVE_HINT, ToolSurface } from "./BoardTools";
import { CameraBar } from "./CameraBar";
import { FogActions, FogBrush } from "./Fog";
import { typedEscape } from "./escape";
import { GridBoard } from "./GridBoard";
import { HudIconButton, StageDrawerButton, hudSurface } from "./hud";
import { type StageDrawer, StageDrawers, type StageDrawerState } from "./stageDrawers";
import { useRunBoard, type RunBoardProps } from "./runBoard";
import { RunTokens } from "./RunTokens";

/**
 * The fight at a desktop width: **a canvas, not a page.** The board fills the
 * whole window, the DM pans and zooms it (`BoardCanvas.tsx`), and everything
 * else floats over it on the `hud` rung as a game's screen does (the
 * maintainer's call of 2026-10-22, after `Encounter Canvas.dc.html`): small
 * pieces at the edges, and anything long in a drawer that is closed until it
 * is wanted. The screen holds the window through `useFullscreen`
 * (`shell/slots.ts`), so the shell draws no nav rows while it is up; the
 * title's back link is the way out.
 *
 * This is the one screen that does not scroll with the window: the stage is
 * bounded to the viewport, and each panel scrolls inside itself. A table's DM
 * keeps the board in view while reading a stat block, and a page that scrolled
 * would carry the board away with it.
 *
 * The regions:
 *
 * - **title** — top left: the way back, the fight's name and where it is.
 * - **target** — top centre: the target frame, while something other than
 *   whoever is up is selected (`TargetFrame.tsx`). The top row is three
 *   columns, the outer two of one width, so the frame stands on the window's
 *   centre however long the title is; a title too long for its column is cut.
 * - **controls** — top right: the icons over what the table sees, the
 *   *Initiative* drawer, Hob, and the way to end the fight. The order is a
 *   drawer, not a ribbon, so the board's top edge is the board's until the DM
 *   asks for it (the maintainer's call of 2026-10-22).
 * - **notices** — under the top row: the autopilot's line, an ended or behind
 *   fight's.
 * - **rolling** — *Roll initiative* (`InitiativePhase.tsx`), on the left in the
 *   party's place while the fight rolls: a box per row needs a column.
 * - **party** — the party's portraits down the left (`PartyRail.tsx`).
 * - **corner** — bottom left: the board's tools and camera, which the board
 *   portals in (`StageCorner`), since they are the board's state.
 * - **turn** — bottom centre: whoever is up as an action bar (`TurnCard.tsx`),
 *   with Hob's offer for the monster (**above**) and the attack's *Pick a
 *   target* banner over it.
 * - **rail** — the right edge: an icon per drawer (`StageDrawer`), opening it
 *   over the board beside the rail. A drawer stays mounted while closed, so
 *   what it watches (an NPC proposal's toast) keeps watching.
 * - **panel** — a right-hand column of cards instead of the rail: a seated
 *   player's table. Its drawers open beside the column, from the controls.
 * - **rolls** — bottom right: the *Rolls* feed (`RollsDock.tsx`).
 *
 * Below `@3xl` of `main` the board is too small to play on and the runner is
 * the window-scrolling grid it always was (`RunLayout.tsx`); `useStage` asks
 * that same container query (`stage.tsx`), so the canvas and the tokens' own `@3xl` cannot
 * disagree about which side of it the screen is on.
 */
export function RunStage({
  title,
  controls,
  notices,
  rolling,
  party,
  target = null,
  above = null,
  turn,
  banner,
  drawers = [],
  panel,
  rolls,
  board,
}: {
  readonly title: ReactNode;
  readonly controls: ReactNode;
  /** The lines under the top row. */
  readonly notices: ReactNode;
  /** *Roll initiative*, on the left; `null` once turns are taken. */
  readonly rolling: ReactNode | null;
  /** The party's portraits, on the left once turns are taken. */
  readonly party: ReactNode | null;
  /** The target frame, top centre; `null` with no target. */
  readonly target?: ReactNode | null;
  /** Over the turn: Hob's offer for the monster that is up. */
  readonly above?: ReactNode | null;
  /** Whoever is up, bottom centre; `null` while nobody is. */
  readonly turn: ReactNode | null;
  /** A line over the turn card while a tool asks for a square: the attack's target. */
  readonly banner: ReactNode | undefined;
  /** The stage's drawers: the rail's, or with a panel, only the controls'. */
  readonly drawers?: ReadonlyArray<StageDrawer>;
  /** A right-hand column of cards in the rail's place. */
  readonly panel?: ReactNode;
  readonly rolls: ReactNode;
  /** The board, told which part of the stage no panel covers. */
  readonly board: (freeArea: (canvas: DOMRect) => PlaneRect) => ReactNode;
}) {
  const top = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState<HTMLDivElement | null>(null);
  const [openKey, setOpenKey] = useState<string | undefined>(undefined);
  // A drawer that is gone (its NPCs closed) is not left open behind the rail.
  const open = drawers.some((drawer) => drawer.key === openKey) ? openKey : undefined;
  const drawerState = useMemo<StageDrawerState>(
    () => ({
      open,
      toggle: (key) => setOpenKey((now) => (now === key ? undefined : key)),
      show: setOpenKey,
    }),
    [open],
  );
  const railed = drawers.filter((drawer) => drawer.rail !== false);

  // Between the side columns, under the top row and over the bottom row,
  // inset as far as the HUD is from the stage's edge.
  const freeArea = useCallback((canvas: DOMRect): PlaneRect => {
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

  // Over the board beside the rail or the panel, as tall as the middle row.
  const drawerPanels = drawers.map((drawer) => (
    <aside
      key={drawer.key}
      aria-label={drawer.label}
      data-slot="run-drawer"
      data-drawer={drawer.key}
      hidden={drawer.key !== open}
      // Esc closes the drawer it is pressed in, and nothing else;
      // one typed into a field is the field's (`typedEscape`).
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (typedEscape(event.target)) return;
        event.preventDefault();
        setOpenKey(undefined);
      }}
      className={cn(
        "pointer-events-auto absolute top-0 right-full mr-3 flex max-h-full w-aside flex-col",
        drawer.bare !== true && cn(hudSurface, "bg-surface-card"),
      )}
    >
      {drawer.bare !== true && (
        <header className="flex shrink-0 items-center gap-2 border-b border-hairline py-1 pr-1 pl-card">
          <Icon name={drawer.icon} size={15} className="text-muted-foreground" />
          <SectionHeading as="h2" size="title" className="min-w-0 flex-1 truncate">
            {drawer.label}
          </SectionHeading>
          <HudIconButton
            icon="x"
            label={`Close ${drawer.label}`}
            onClick={() => setOpenKey(undefined)}
          />
        </header>
      )}
      <div
        className={cn(
          hudScroller,
          "flex min-h-0 flex-1 flex-col gap-3",
          drawer.bare !== true && "p-card",
        )}
      >
        {drawer.content}
      </div>
    </aside>
  ));

  return (
    <StageCorner.Provider value={corner}>
      <StageDrawers.Provider value={drawerState}>
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
              {/* Below `@6xl` the frame takes a row of its own under the title
                  and the controls, since three columns there would cut the
                  title to nothing. */}
              <div
                data-slot="run-hud-header"
                className={cn(
                  "grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-3",
                  target !== null &&
                    "@6xl/hud:grid-cols-[1fr_minmax(0,var(--spacing-run-target))_1fr]",
                )}
              >
                <div
                  data-slot="run-hud-title"
                  className="pointer-events-auto col-start-1 row-start-1 max-w-full min-w-0 justify-self-start"
                >
                  {title}
                </div>
                {target !== null && (
                  <div
                    data-slot="run-hud-target"
                    className="pointer-events-auto col-span-full row-start-2 flex w-full max-w-run-turn min-w-0 justify-self-center @6xl/hud:col-span-1 @6xl/hud:col-start-2 @6xl/hud:row-start-1"
                  >
                    {target}
                  </div>
                )}
                <div
                  data-slot="run-hud-controls"
                  className="pointer-events-auto col-end-[-1] row-start-1 flex flex-wrap items-center justify-end gap-2.5 justify-self-end empty:hidden"
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
                className={cn("flex shrink-0 flex-col gap-3", rolling !== null && "w-aside")}
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
              </div>
              <div data-slot="run-hud-centre" className="min-w-0 flex-1" />
              {panel !== undefined ? (
                <div
                  ref={right}
                  data-slot="run-hud-right"
                  className="relative flex w-aside shrink-0 flex-col justify-end gap-3"
                >
                  {drawerPanels}
                  <div
                    data-slot="run-hud-panel"
                    className={cn(hudScroller, "flex min-h-0 shrink flex-col gap-3")}
                  >
                    {panel}
                  </div>
                </div>
              ) : (
                drawers.length > 0 && (
                  <div data-slot="run-hud-right" className="relative flex shrink-0 items-start">
                    {railed.length > 0 && (
                      <nav
                        ref={right}
                        aria-label="Drawers"
                        data-slot="run-hud-rail"
                        className={cn(hudSurface, "pointer-events-auto flex flex-col gap-1 p-1")}
                      >
                        {railed.map((drawer) => (
                          <StageDrawerButton
                            key={drawer.key}
                            drawer={drawer.key}
                            icon={drawer.icon}
                            label={drawer.label}
                            badge={drawer.badge}
                            side="left"
                          />
                        ))}
                      </nav>
                    )}
                    {drawerPanels}
                  </div>
                )
              )}
            </div>
            <div
              data-slot="run-hud-bottom"
              className="flex min-w-0 shrink-0 flex-wrap items-end justify-between gap-3 @6xl/hud:flex-nowrap"
            >
              <div
                ref={setCorner}
                data-slot="run-hud-corner"
                className="pointer-events-auto flex shrink-0 flex-col gap-2 empty:hidden"
              />
              <div
                data-slot="run-hud-centre-foot"
                className="order-first flex min-w-0 basis-full flex-col items-center gap-2 @6xl/hud:order-none @6xl/hud:flex-1 @6xl/hud:basis-0"
              >
                {above !== null && (
                  <div
                    data-slot="run-hud-above"
                    className={cn(hudScroller, "max-h-80 w-full max-w-run-turn")}
                  >
                    {above}
                  </div>
                )}
                {banner !== undefined && (
                  <div data-slot="run-hud-banner" className="flex min-w-0 justify-center">
                    {banner}
                  </div>
                )}
                {turn !== null && (
                  <div
                    ref={foot}
                    data-slot="run-hud-turn"
                    className={cn(hudScroller, "w-full max-w-run-turn")}
                  >
                    {turn}
                  </div>
                )}
              </div>
              <div
                data-slot="run-hud-rolls"
                className={cn(hudScroller, "ml-auto flex max-h-80 w-aside shrink-0 flex-col gap-3")}
              >
                {rolls}
              </div>
            </div>
          </div>
        </div>
      </StageDrawers.Provider>
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
}: RunBoardProps & { readonly freeArea: (canvas: DOMRect) => PlaneRect }) {
  const { resource, reload, over } = props;
  const { board, gridShown, withBoard, tools, fogTool } = useRunBoard(props, true);
  const camera = useRef<Camera | null>(null);
  // The fight's level as the geometry and the renderer read it, kept while
  // the board's answer is the same (a re-read is a new one, and redraws).
  const level = board?.level ?? null;
  const layout = useMemo(
    () => (board === null || level === null ? null : runLevelLayout(board, level)),
    [board, level],
  );
  const [levelDrawable, setLevelDrawable] = useState(canDrawWebGL);
  const active = props.tokens.combatants.find(
    (combatant) => combatant.id === props.tokens.activeId,
  );
  const activeAt =
    board === null || active?.position == null ? undefined : centreOf(active.position);
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

  const plane = boardPlane(board);
  // A level fight draws its level under the board where the browser can; the
  // board box over it is then clear, its grid the renderer's.
  const drawsLevel = layout !== null && levelDrawable;
  return (
    <section aria-label="Battle map" data-slot="run-board" className="absolute inset-0">
      <BoardCanvas
        plane={plane}
        cellPx={BOARD_CELL_PX}
        freeArea={freeArea}
        focus={activeAt === undefined ? undefined : { at: activeAt, squarePx: SQUARE_PX.readable }}
        camera={camera}
        backdrop={
          drawsLevel
            ? (view) => (
                <LevelBackdrop
                  layout={layout}
                  cellPx={BOARD_CELL_PX}
                  view={view}
                  grid={gridShown}
                  onFailed={() => setLevelDrawable(false)}
                />
              )
            : undefined
        }
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
            {/* One strip, as a game's toolbar: the tools, then the camera. */}
            <div
              data-slot="run-hud-tools"
              className={cn(hudSurface, "flex min-w-0 flex-wrap items-center gap-1.5 p-1.5")}
            >
              <BoardToolPicker
                tool={tools.tool}
                disabled={!tools.usable}
                onTool={tools.choose}
                shape={tools.shape}
                feet={tools.feet}
                onShape={tools.pickShape}
                onStep={tools.step}
                fog={<FogActions onWhole={fogTool.whole} />}
                moveHint={FIGHT_MOVE_HINT}
              />
              <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-hairline" />
              <CameraBar
                camera={at}
                centreLabel="Centre on whoever is up"
                onCentre={activeAt === undefined ? undefined : () => at.centre(activeAt)}
              />
            </div>
          </InStageCorner>
        )}
      >
        <GridBoard
          board={board}
          grid={gridShown && !drawsLevel}
          className={cn("box-content", drawsLevel && "border-transparent bg-transparent")}
        >
          {tools.pinned !== null && <AreaLayer board={board} area={tools.pinned} state="pinned" />}
          {tools.preview !== undefined && (
            <AreaLayer board={board} area={tools.preview} state="preview" />
          )}
          <RunTokens {...withBoard} />
          {board.level !== null && tools.tool === "move" && (
            <LevelSwitches
              level={board.level}
              columns={board.columns}
              rows={board.rows}
              disabled={over}
              onDoor={(wallId, update) => void props.onDoor(wallId, update)}
              onLight={(lightId, lit) => void props.onLight(lightId, lit)}
              onRegion={(regionId, revealed) => void props.onRegion(regionId, revealed)}
            />
          )}
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
        </GridBoard>
      </BoardCanvas>
    </section>
  );
}
