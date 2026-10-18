import {
  type AreaShape,
  type BattleMapBoard,
  type BattleMapImages,
  type BoardArea,
  type BoardSquare,
  type EncounterRunBoard,
  type RulerReading,
  battleMapPlane,
  cellRect,
  squareAt,
} from "@taverns/api";
import { Button, Icon, Toggle } from "@taverns/ui";
import { type PointerEvent, type ReactNode, useRef } from "react";
import { AREA_SHAPES, areaName, squaresOf } from "./area";
import { Ruler } from "./RunTokens";

/**
 * The board's tools beside Move, in the canvas's dock (`RunStage.tsx`): the
 * drawing's Measure and Area (`Encounter Runner.dc.html`, screens 17-21). Fog,
 * the fourth, is `Fog.tsx`'s; the dock offers the four one at a time.
 *
 * - **Measure** is the DM's alone and nobody's record: a drag on the grid lays
 *   a blue ruler with the distance under the campaign's diagonal rule, the
 *   square under the pointer outlined. It stays until the next drag, Esc, the
 *   tool being put away or the turn moving.
 * - **Area** pins a spell's template where the table can see it (decision D14,
 *   "player and dm and temporary"): a sphere or a cube centred on the square
 *   clicked, a cone or a line from the selected creature (else whoever is up)
 *   toward it. Hovering shows where it would land; a click pins it through
 *   `PUT …/board/area`, so a player's shared board draws it too
 *   (`play/PlayerBoard.tsx`), until *Clear*, Esc or the fight's end.
 *
 * The arithmetic is `area.ts`'s and the board's (`packages/api`); the state is
 * `runBoard.ts`'s.
 */

/** The dock's tools, one at a time. Fog's brush is `Fog.tsx`'s. */
export type BoardTool = "move" | "measure" | "area" | "fog";

export type DrawnBoard = BattleMapBoard & {
  readonly image: BattleMapImages | null;
  readonly feetPerCell: number;
};

/**
 * An area template on the board: the squares it covers, tinted the drawing's
 * violet. Drawn under the tokens, so who stands in it is plain. The DM's board
 * draws the pin, or the tool's preview under the pointer; a player's draws the
 * pin, named for a screen reader as the table would say it.
 */
export function AreaLayer({
  board,
  area,
  state,
}: {
  readonly board: DrawnBoard;
  readonly area: BoardArea;
  /** `pinned` is on the table; `preview` is where a click would pin it. */
  readonly state: "pinned" | "preview";
}) {
  const plane = battleMapPlane(board, board.image);
  const squares = squaresOf(board, area);
  return (
    <svg
      data-slot="board-area"
      data-state={state}
      data-squares={squares.length}
      role="img"
      aria-label={`${state === "pinned" ? "Pinned" : "Placing"}: a ${areaName(area)}`}
      viewBox={`0 0 ${String(plane.width)} ${String(plane.height)}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      {squares.map((square) => {
        const rect = cellRect(board, square);
        return (
          <rect
            key={`${String(square.column)}:${String(square.row)}`}
            data-slot="area-square"
            data-square={`${String(square.column)},${String(square.row)}`}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="fill-magic/22 stroke-magic/45"
          />
        );
      })}
    </svg>
  );
}

/** What the Measure and Area tools are told by the layer over the board. */
export interface ToolPointer {
  /** The square under the pointer, or `undefined` once it leaves the board. */
  readonly hover: (square: BoardSquare | undefined) => void;
  /** Measure: a press on a square starts a ruler there. */
  readonly measureFrom: (square: BoardSquare) => void;
  /** Measure: the held pointer is over another square. */
  readonly measureTo: (square: BoardSquare) => void;
  /** Area: a click on a square pins the template there. */
  readonly pin: (square: BoardSquare) => void;
}

/**
 * The layer Measure and Area lay over everything on the DM's board while
 * either is on: it takes the pointer, so a press on a token measures from its
 * square or pins there rather than dragging it.
 *
 * Measure's drag is the ruler's and never the canvas's pan
 * (`BoardCanvas.tsx` pans only a press that reaches it). Area's click is the
 * pin, and a drag still pans the board: the canvas swallows the click of a
 * press that travelled, so panning to the spot pins nothing. The wheel zooms
 * under both.
 */
export function ToolSurface({
  board,
  tool,
  hovered,
  ruler,
  pointer,
}: {
  readonly board: EncounterRunBoard;
  readonly tool: "measure" | "area";
  /** The square under the pointer, outlined while measuring. */
  readonly hovered: BoardSquare | undefined;
  /** The ruler Measure has laid, from where the press began. */
  readonly ruler:
    | { readonly from: BoardSquare; readonly to: BoardSquare; readonly reading: RulerReading }
    | undefined;
  readonly pointer: ToolPointer;
}) {
  const plane = battleMapPlane(board, board.image);
  const layer = useRef<HTMLDivElement>(null);
  /** The pointer laying a ruler, while it is held down. */
  const held = useRef<{ readonly pointerId: number } | undefined>(undefined);

  const squareUnder = (event: {
    readonly clientX: number;
    readonly clientY: number;
  }): BoardSquare | undefined => {
    const box = layer.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || box.height === 0) return undefined;
    return squareAt(board, {
      x: ((event.clientX - box.left) / box.width) * plane.width,
      y: ((event.clientY - box.top) / box.height) * plane.height,
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (tool !== "measure") return;
    // The ruler's, never the canvas's pan.
    event.stopPropagation();
    if (event.button !== 0 || event.isPrimary === false || held.current !== undefined) return;
    const square = squareUnder(event);
    if (square === undefined) return;
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    held.current = { pointerId: event.pointerId };
    pointer.measureFrom(square);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const square = squareUnder(event);
    pointer.hover(square);
    if (held.current?.pointerId === event.pointerId && square !== undefined) {
      pointer.measureTo(square);
    }
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (held.current?.pointerId === event.pointerId) held.current = undefined;
  };

  return (
    <div
      ref={layer}
      data-slot="board-tool"
      data-tool={tool}
      aria-hidden
      className="absolute inset-0 z-lifted cursor-crosshair"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={() => pointer.hover(undefined)}
      onClick={(event) => {
        if (tool !== "area") return;
        const square = squareUnder(event);
        if (square !== undefined) pointer.pin(square);
      }}
    >
      {tool === "measure" && hovered !== undefined && (
        <svg
          viewBox={`0 0 ${String(plane.width)} ${String(plane.height)}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <rect
            data-slot="tool-square"
            {...cellRect(board, hovered)}
            fill="none"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className="stroke-heading"
          />
        </svg>
      )}
      {ruler !== undefined && (
        <Ruler
          board={board}
          from={ruler.from}
          to={ruler.to}
          reading={ruler.reading}
          tone="info"
          slot="measure-ruler"
        />
      )}
    </div>
  );
}

/**
 * The dock's tools: Move, Measure, Area and Fog, one at a time; while Area is
 * on its shapes and its size beside them, and while Fog is on its board-wide
 * writes (`fog`). Switching shape starts it at its own size, or the pinned
 * template's when it is that shape; − and + step five feet between the
 * smallest and the largest, and resize a pinned template of the dock's shape
 * with them.
 */
export function BoardToolPicker({
  tool,
  disabled,
  onTool,
  shape,
  feet,
  onShape,
  onStep,
  fog,
}: {
  readonly tool: BoardTool;
  readonly disabled: boolean;
  readonly onTool: (tool: BoardTool) => void;
  readonly shape: AreaShape;
  readonly feet: number;
  readonly onShape: (shape: AreaShape) => void;
  readonly onStep: (by: 1 | -1) => void;
  /** Fog's own controls, drawn beside the tools while it is on. */
  readonly fog: ReactNode;
}) {
  const choice = (
    value: BoardTool,
    label: string,
    icon: "move" | "ruler" | "circle-dashed" | "cloud",
  ) => (
    <Toggle
      size="sm"
      pressed={tool === value}
      disabled={disabled}
      // A pressed tool stays on: another tool, or Esc, is the way off it.
      onPressedChange={() => onTool(value)}
      aria-label={label}
      title={TOOL_HINT[value]}
    >
      <Icon name={icon} size={13} />
      {/* Between the canvas's two columns at a laptop's width the dock is a
          thumb wide, and four labels would stack it over the board. */}
      <span className="hidden @xl/tools:inline">{label}</span>
    </Toggle>
  );
  return (
    <>
      <div
        role="group"
        aria-label="Tools"
        className="flex flex-wrap items-center justify-center gap-1.5"
      >
        {choice("move", "Move", "move")}
        {choice("measure", "Measure", "ruler")}
        {choice("area", "Area", "circle-dashed")}
        {choice("fog", "Fog", "cloud")}
      </div>
      {tool === "fog" && fog}
      {tool === "area" && (
        <div
          role="group"
          aria-label="Area"
          className="flex flex-wrap items-center justify-center gap-1"
        >
          <span aria-hidden className="mx-0.5 h-5 w-px bg-strong" />
          {AREA_SHAPES.map((entry) => (
            <Toggle
              key={entry.shape}
              size="sm"
              pressed={shape === entry.shape}
              onPressedChange={() => onShape(entry.shape)}
            >
              {entry.label}
            </Toggle>
          ))}
          <Button variant="ghost" size="sm" aria-label="Smaller" onClick={() => onStep(-1)}>
            <Icon name="minus" size={13} />
          </Button>
          <span
            aria-live="polite"
            className="min-w-12 text-center font-mono text-body-s leading-none text-foreground"
          >
            {feet} ft
          </span>
          <Button variant="ghost" size="sm" aria-label="Larger" onClick={() => onStep(1)}>
            <Icon name="plus" size={13} />
          </Button>
        </div>
      )}
    </>
  );
}

/** What each tool does, as its button's title says. */
const TOOL_HINT: Readonly<Record<BoardTool, string>> = {
  move: "Drag tokens. The active creature shows its range.",
  measure: "Drag on the grid to measure",
  area: "Click to place a spell area",
  fog: "Click or drag to hide and reveal squares",
};

/**
 * The pinned template's banner over the dock: who it catches (`caughtLine`),
 * and *Clear*, which takes it off the players' board too.
 */
export function AreaBanner({
  line,
  onClear,
}: {
  readonly line: string;
  readonly onClear: () => void;
}) {
  return (
    <div
      role="status"
      aria-label="Pinned area"
      data-slot="area-banner"
      className="pointer-events-auto flex max-w-full min-w-0 items-center gap-2.5 rounded-md border border-magic bg-surface-card py-1.5 pr-1.5 pl-3 shadow-3"
    >
      <Icon name="sparkles" size={15} className="shrink-0 text-magic" />
      <span className="min-w-0 text-body-s leading-snug text-foreground">{line}</span>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
