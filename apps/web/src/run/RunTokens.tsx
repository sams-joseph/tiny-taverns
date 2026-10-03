import {
  type BoardSquare,
  type Combatant,
  type CombatantId,
  type DiagonalRule,
  type EncounterRunBoard,
  type RulerReading,
  battleMapPlane,
  cellRect,
  reachableSquares,
  rulerReading,
  squareAt,
} from "@taverns/api";
import { Button, Toggle, Tooltip, TooltipContent, TooltipTrigger, cn } from "@taverns/ui";
import { type KeyboardEvent, type MouseEvent, type PointerEvent, useRef, useState } from "react";
import { FogLayer } from "./Fog";
import { TokenFace } from "./TokenFace";
import { type TokenNames, nameShown, percentOf, tokenState } from "./tokens";

/**
 * The fight's tokens, on the DM's board and in the tray beside it.
 *
 * A token is a combatant's square (`Combatant.position`), drawn as the
 * drawing's counter (`TokenFace.tsx`): ringed peach on whoever is up, ringed
 * white when selected, dashed when the players cannot see it, faded when it is
 * out of the fight, with its hit points under it, a count of its conditions and,
 * by the DM's preference, its name. A token nobody has put down is not on the
 * board at all; it waits in the tray (`TokenTray`), because a square the
 * product chose would be a guess.
 *
 * ### Moving is a drag, on a screen wide enough to hit a square
 *
 * From `@3xl` of `main` the DM drags a token to its square. A ruler follows the
 * drag from where it started, saying how far under the campaign's diagonal
 * rule and, for the creature whose turn it is, what that leaves of its speed;
 * letting go on a square someone else holds says *Occupied* and moves nobody
 * (the server would stack them; the drawing refuses, so the client does), and
 * a drag that ends where it began moves nobody either. A drop is the same move
 * as any other (`POST …/move`), and the token stays where it was dropped until
 * the server answers, then stands where the server has it. A press on a token
 * selects it; a press anywhere else is the canvas's pan (`BoardCanvas.tsx`), so
 * the two never fight over a pointer.
 *
 * A token in the tray goes down where the DM clicks once it is selected, and a
 * focused token walks a square at a time with the arrow keys: the board without
 * a pointer.
 *
 * Below `@3xl` a square is too small to hit on purpose (a 24 × 16 board is 13px
 * squares on a phone), so the board is a picture of where everyone stands — the
 * same tokens, rings and range, with nothing to press — and the initiative strip
 * is how the DM selects. The two are separate layers shown by the container
 * query rather than one layer with its pointer events switched off, so the
 * narrow one also has nothing to tab to.
 *
 * ### The range
 *
 * While the creature whose turn it is stands selected, the squares what is
 * left of its speed reaches are tinted: every square within the leading number
 * of its stat block's or sheet's speed less the feet the server has counted it
 * walking this turn (`feetLeftOf`), under the diagonal rule, less the squares
 * others hold (`reachableSquares`). A drag measures from where it started, and
 * its ruler's *left* or *over* is against the same feet, so the board and the
 * panel's *This turn* bar agree.
 *
 * ### Fog
 *
 * The squares the DM has put under fog are dimmed over the tokens (`Fog.tsx`):
 * the DM sees through it, and a token under it is plainly one the players do
 * not see. It takes no pointer; the Fog tool's brush lies over this layer.
 *
 * ### Where they sit
 *
 * Every token and range square is a `cellRect` in the plane the board is drawn
 * on (`BattleMapBoard.tsx`), laid out as percentages of it — so they sit on the
 * picture's squares at any width or zoom, and a token's button is its whole
 * square.
 */

export interface TokenProps {
  readonly board: EncounterRunBoard;
  /** The fight's rows, in initiative order. */
  readonly combatants: ReadonlyArray<Combatant>;
  readonly labels: ReadonlyMap<CombatantId, string>;
  readonly hpOf: (combatant: Combatant) => number;
  /** Whose card is open, following the turn when nobody was picked. */
  readonly selected: Combatant | undefined;
  readonly activeId: CombatantId | null;
  /** Feet the combatant can walk, when its sheet or stat block says. */
  readonly speedOf: (combatant: Combatant) => number | undefined;
  /**
   * What is left of that this turn (`run/turn.ts`, `feetLeft`): the speed less
   * the server's `feetMoved` for whoever is up, the whole speed for anyone
   * else, negative once past it. The range and the ruler read it.
   */
  readonly feetLeftOf: (combatant: Combatant) => number | undefined;
  /** How the campaign counts a diagonal step, as the server counts a move. */
  readonly diagonals: DiagonalRule;
  /** False once the fight is over or a dialog is open: tokens select, nothing moves. */
  readonly movable: boolean;
  /**
   * The map's *Hide from players*: every token but the party's is off the
   * players' board, so the DM's draws their rings dashed.
   */
  readonly hostileTokensHidden: boolean;
  /** Which tokens wear their name (`useTokenNames`). */
  readonly names: TokenNames;
  /** The squares under fog, as the Fog tool draws them: dimmed over the tokens, under the ruler. */
  readonly fog: ReadonlyArray<BoardSquare>;
  readonly onSelect: (combatant: Combatant) => void;
  /**
   * Set while an attack waits for its target: a token's click is the target
   * and nothing else, so no press selects, drags, steps or puts a token down.
   */
  readonly onTarget: ((combatant: Combatant) => void) | undefined;
  /** Put it on a square, or `null` to take it off the board; settles once the server answers. */
  readonly onMove: (combatant: Combatant, to: BoardSquare | null) => Promise<unknown>;
}

type Placed = Combatant & { readonly position: BoardSquare };

const placed = (combatants: ReadonlyArray<Combatant>): ReadonlyArray<Placed> =>
  combatants.filter((combatant): combatant is Placed => combatant.position !== null);

const same = (a: BoardSquare, b: BoardSquare): boolean => a.column === b.column && a.row === b.row;

/** A token being dragged: from its square, over the one under the pointer. */
interface Drag {
  readonly id: CombatantId;
  readonly pointerId: number;
  readonly from: BoardSquare;
  readonly over: BoardSquare;
}

/** The squares the selected creature can walk to, when it is the one whose turn it is. */
function Range({
  props,
  from,
  occupied,
}: {
  readonly props: TokenProps;
  readonly from: BoardSquare | null;
  readonly occupied: ReadonlyArray<BoardSquare>;
}) {
  const { board, selected, activeId, feetLeftOf, diagonals } = props;
  if (selected === undefined || selected.id !== activeId || from === null) return null;
  const left = feetLeftOf(selected);
  if (left === undefined) return null;
  const squares = reachableSquares(board, {
    from,
    feet: left,
    occupied,
    feetPerCell: board.feetPerCell,
    diagonals,
  });
  if (squares.length === 0) return null;
  const plane = battleMapPlane(board, board.image);
  return (
    <svg
      data-slot="token-range"
      aria-hidden
      viewBox={`0 0 ${String(plane.width)} ${String(plane.height)}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      {squares.map((square) => {
        const rect = cellRect(board, square);
        return (
          <rect
            key={`${String(square.column)}:${String(square.row)}`}
            data-slot="range-square"
            data-square={`${String(square.column)},${String(square.row)}`}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="fill-accent/10 stroke-accent/16"
          />
        );
      })}
    </svg>
  );
}

/** The ruler's colour by what it says: over or onto someone is a refusal, a turn's move is peach. */
const RULER_TONE: Readonly<Record<RulerReading["verdict"], string>> = {
  distance: "heading",
  left: "accent",
  over: "danger",
  occupied: "danger",
};

/**
 * The live ruler under a drag: a line from the square the token left to the
 * one under the pointer, a dot where it started, and its reading beside the far
 * end. Drawn in the starting square's own 40-unit box, as the token face is, so
 * it keeps the drawing's weight at any zoom.
 */
function Ruler({
  board,
  from,
  to,
  reading,
}: {
  readonly board: EncounterRunBoard;
  readonly from: BoardSquare;
  readonly to: BoardSquare;
  readonly reading: RulerReading;
}) {
  const plane = battleMapPlane(board, board.image);
  const end = { x: 20 + (to.column - from.column) * 40, y: 20 + (to.row - from.row) * 40 };
  const tone = RULER_TONE[reading.verdict];
  return (
    <div
      data-slot="token-ruler"
      className="pointer-events-none absolute z-lifted"
      // eslint-disable-next-line shadcn/no-inline-styles -- a box on the battle-map plane, computed from the board; no class can carry it.
      style={percentOf(cellRect(board, from), plane)}
    >
      <svg viewBox="0 0 40 40" aria-hidden className="size-full overflow-visible">
        <line
          x1={20}
          y1={20}
          x2={end.x}
          y2={end.y}
          strokeWidth={2}
          className={cn(
            tone === "heading" && "stroke-heading",
            tone === "accent" && "stroke-accent",
            tone === "danger" && "stroke-danger",
          )}
        />
        <circle
          cx={20}
          cy={20}
          r={4}
          className={cn(
            tone === "heading" && "fill-heading",
            tone === "accent" && "fill-accent",
            tone === "danger" && "fill-danger",
          )}
        />
        <foreignObject x={end.x + 16} y={end.y - 30} width={240} height={24}>
          <div className="flex">
            <span
              data-slot="ruler-reading"
              data-verdict={reading.verdict}
              className={cn(
                "rounded-xs border bg-surface-sunken px-1.75 py-0.75 font-mono text-label-s leading-tight font-medium whitespace-nowrap",
                tone === "heading" && "border-heading text-heading",
                tone === "accent" && "border-accent text-accent",
                tone === "danger" && "border-danger text-danger",
              )}
            >
              {reading.text}
            </span>
          </div>
        </foreignObject>
      </svg>
    </div>
  );
}

const STEP: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Everything that stands on the board, as a layer of the board's box. */
export function RunTokens(props: TokenProps) {
  const {
    board,
    combatants,
    labels,
    hpOf,
    selected,
    activeId,
    feetLeftOf,
    diagonals,
    movable,
    hostileTokensHidden,
    names,
    fog,
    onSelect,
    onTarget,
    onMove,
  } = props;
  const targeting = onTarget !== undefined;
  const plane = battleMapPlane(board, board.image);
  const layer = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>();
  /** A dropped token, held on its square until the server answers the move. */
  const [landing, setLanding] = useState<{ readonly id: CombatantId; readonly at: BoardSquare }>();

  const standing = placed(combatants);
  const squareOf = (combatant: Placed): BoardSquare =>
    drag?.id === combatant.id
      ? drag.over
      : landing?.id === combatant.id
        ? landing.at
        : combatant.position;
  /** The squares other tokens hold, where they are drawn. */
  const heldBesides = (id: CombatantId): ReadonlyArray<BoardSquare> =>
    standing.filter((other) => other.id !== id).map(squareOf);

  // A token in the tray goes down on the square clicked.
  const placing = movable && !targeting && selected !== undefined && selected.position === null;
  const at = (square: BoardSquare) => percentOf(cellRect(board, square), plane);

  /** The square under a point on the screen, or `undefined` off the board. */
  const squareUnder = (clientX: number, clientY: number): BoardSquare | undefined => {
    const box = layer.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || box.height === 0) return undefined;
    return squareAt(board, {
      x: ((clientX - box.left) / box.width) * plane.width,
      y: ((clientY - box.top) / box.height) * plane.height,
    });
  };

  const place = (event: MouseEvent<HTMLDivElement>) => {
    if (!placing) return;
    const square = squareUnder(event.clientX, event.clientY);
    if (square !== undefined) void onMove(selected, square);
  };

  const press = (combatant: Placed) => (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || targeting) return;
    onSelect(combatant);
    if (!movable) return;
    // Held by the token, so a pointer that outruns it still drags it.
    if ("setPointerCapture" in event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const from = squareOf(combatant);
    setDrag({ id: combatant.id, pointerId: event.pointerId, from, over: from });
  };

  const follow = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag === undefined || drag.pointerId !== event.pointerId) return;
    const square = squareUnder(event.clientX, event.clientY);
    if (square !== undefined && !same(square, drag.over)) setDrag({ ...drag, over: square });
  };

  const drop = (combatant: Placed) => (event: PointerEvent<HTMLButtonElement>) => {
    if (drag === undefined || drag.pointerId !== event.pointerId) return;
    setDrag(undefined);
    const to = drag.over;
    if (same(to, drag.from)) return;
    if (heldBesides(combatant.id).some((held) => same(held, to))) return;
    setLanding({ id: combatant.id, at: to });
    void onMove(combatant, to).finally(() =>
      setLanding((current) => (current?.id === combatant.id ? undefined : current)),
    );
  };

  const cancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag?.pointerId === event.pointerId) setDrag(undefined);
  };

  /** The arrow keys walk a focused token one square, which is the board without a pointer. */
  const step = (combatant: Placed) =>
    function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      const delta = STEP[event.key];
      if (delta === undefined || !movable || targeting) return;
      event.preventDefault();
      const to = {
        column: Math.min(board.columns - 1, Math.max(0, combatant.position.column + delta[0])),
        row: Math.min(board.rows - 1, Math.max(0, combatant.position.row + delta[1])),
      };
      onSelect(combatant);
      if (same(to, combatant.position)) return;
      void onMove(combatant, to);
    };

  const dragged = standing.find((combatant) => combatant.id === drag?.id);
  const reading =
    drag !== undefined && dragged !== undefined && !same(drag.over, drag.from)
      ? rulerReading({
          from: drag.from,
          to: drag.over,
          remaining: dragged.id === activeId ? (feetLeftOf(dragged) ?? null) : null,
          occupied: heldBesides(dragged.id).some((held) => same(held, drag.over)),
          feetPerCell: board.feetPerCell,
          diagonals,
        })
      : undefined;

  // The range measures from where the selected token stands, or from where its drag began.
  const rangeFrom =
    selected === undefined
      ? null
      : drag?.id === selected.id
        ? drag.from
        : (standing.find((combatant) => combatant.id === selected.id)?.position ?? null);
  const range = (
    <Range
      props={props}
      from={rangeFrom}
      occupied={selected === undefined ? [] : heldBesides(selected.id)}
    />
  );

  const look = (combatant: Placed) => {
    const state = tokenState(combatant, { hp: hpOf(combatant), hostileTokensHidden });
    const active = combatant.id === activeId;
    const isSelected = combatant.id === selected?.id;
    const dragging = combatant.id === drag?.id;
    return {
      active,
      dragging,
      fade: state.out ? "opacity-45" : state.hidden ? "opacity-70" : "",
      face: (
        <TokenFace
          party={combatant.kind === "pc"}
          label={labels.get(combatant.id) ?? "?"}
          selected={isSelected}
          active={active}
          hidden={state.hidden}
          struck={state.struck}
          health={state.health}
          conditions={combatant.conditions.length}
          name={
            nameShown(names, { active, selected: isSelected, dragging })
              ? combatant.displayName
              : undefined
          }
        />
      ),
    };
  };

  return (
    <>
      {/* Wide: the board takes a drag. */}
      <div ref={layer} data-slot="run-tokens" className="absolute inset-0 hidden @3xl:block">
        <div
          data-slot="run-board-squares"
          aria-hidden
          onClick={place}
          className={cn("absolute inset-0", (placing || targeting) && "cursor-crosshair")}
        />
        {range}
        {standing.map((combatant) => {
          const square = squareOf(combatant);
          const { active, dragging, fade, face } = look(combatant);
          return (
            <Tooltip key={combatant.id} disabled={drag !== undefined}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    data-slot="token"
                    aria-label={`${combatant.displayName}, column ${String(combatant.position.column + 1)}, row ${String(combatant.position.row + 1)}`}
                    aria-pressed={combatant.id === selected?.id}
                    onPointerDown={press(combatant)}
                    onPointerMove={follow}
                    onPointerUp={drop(combatant)}
                    onPointerCancel={cancel}
                    onClick={() => (onTarget ?? onSelect)(combatant)}
                    onKeyDown={step(combatant)}
                    className={cn(
                      "absolute rounded-circle outline-none focus-visible:ring-focus",
                      "transition-[left,top] duration-(--dur-fast) ease-out",
                      targeting
                        ? "cursor-crosshair"
                        : movable
                          ? dragging
                            ? "cursor-grabbing"
                            : "cursor-grab"
                          : "cursor-pointer",
                      (active || dragging) && "z-lifted",
                      fade,
                    )}
                    // eslint-disable-next-line shadcn/no-inline-styles -- a box on the battle-map plane, computed from the board; no class can carry it.
                    style={at(square)}
                  />
                }
              >
                {face}
              </TooltipTrigger>
              <TooltipContent>{combatant.displayName}</TooltipContent>
            </Tooltip>
          );
        })}
        <FogLayer board={board} squares={fog} veil="dim" />
        {drag !== undefined && reading !== undefined && (
          <Ruler board={board} from={drag.from} to={drag.over} reading={reading} />
        )}
      </div>

      {/* Narrow: the same board, to look at. */}
      <div
        data-slot="run-tokens-view"
        aria-hidden
        className="pointer-events-none absolute inset-0 @3xl:hidden"
      >
        {range}
        {standing.map((combatant) => {
          const { active, fade, face } = look(combatant);
          return (
            <span
              key={combatant.id}
              className={cn("absolute", active && "z-lifted", fade)}
              // eslint-disable-next-line shadcn/no-inline-styles -- a box on the battle-map plane, computed from the board; no class can carry it.
              style={at(squareOf(combatant))}
            >
              {face}
            </span>
          );
        })}
        <FogLayer board={board} squares={fog} veil="dim" />
      </div>
    </>
  );
}

/**
 * Who is not on the board yet — every token, until the DM puts it down — and,
 * for whoever is selected and standing, the way back off it.
 *
 * Wide, each name is a chip that selects its combatant, and the next square
 * clicked is where it goes. Narrow, it is the list, since there is no square to
 * click.
 */
export function TokenTray(props: TokenProps) {
  const { combatants, labels, selected, movable, onSelect, onMove } = props;
  const waiting = combatants.filter((combatant) => combatant.position === null);
  const standing = selected !== undefined && selected.position !== null ? selected : undefined;
  if (waiting.length === 0 && standing === undefined) return null;

  return (
    <div
      data-slot="token-tray"
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-hairline px-panel py-2.5"
    >
      {waiting.length > 0 && (
        <>
          <span className="text-label-s leading-none text-muted-foreground">Not on the board</span>
          <div
            role="group"
            aria-label="Not on the board"
            className="hidden flex-wrap gap-1.5 @3xl:flex"
          >
            {waiting.map((combatant) => (
              <Toggle
                key={combatant.id}
                size="sm"
                pressed={combatant.id === selected?.id}
                onPressedChange={() => onSelect(combatant)}
                aria-label={`${combatant.displayName}, not on the board`}
              >
                <span className="font-mono">{labels.get(combatant.id) ?? "?"}</span>
                {combatant.displayName}
              </Toggle>
            ))}
          </div>
          <span className="text-body-s leading-snug text-foreground @3xl:hidden">
            {waiting.map((combatant) => combatant.displayName).join(", ")}
          </span>
        </>
      )}
      {standing !== undefined && movable && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void onMove(standing, null)}
          className="ml-auto hidden @3xl:inline-flex"
        >
          Take {standing.displayName} off the board
        </Button>
      )}
    </div>
  );
}
