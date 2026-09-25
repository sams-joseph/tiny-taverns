import {
  type BoardSquare,
  type Combatant,
  type CombatantId,
  type EncounterRunBoard,
  battleMapPlane,
  cellRect,
  squareAt,
} from "@taverns/api";
import { Button, Toggle, cn } from "@taverns/ui";
import type { KeyboardEvent, MouseEvent } from "react";
import { percentOf, reachRect } from "./tokens";

/**
 * The fight's tokens, on the DM's board and in the tray beside it.
 *
 * A token is a combatant's square (`Combatant.position`), drawn as the drawing's
 * round counter with its initials: the party in the info colour, everyone else
 * in the danger colour, the one whose turn it is ringed, the one the DM has
 * selected ringed twice, and anyone at zero hit points faded — still on the
 * board, as they are still in the order. A token nobody has put down is not on
 * the board at all; it waits in the tray (`TokenTray`), because a square the
 * product chose would be a guess.
 *
 * ### Moving is for a screen wide enough to hit a square
 *
 * From `@3xl` of `main` the board takes clicks: a token selects its combatant,
 * and a square moves whoever is selected there. Below it a square is too small
 * to hit on purpose (a 24 × 16 board is 13px squares on a phone), so the board
 * is a picture of where everyone stands — the same tokens, rings and range, with
 * nothing to press — and the initiative list is how the DM selects. The two are
 * separate layers shown by the container query rather than one layer with its
 * pointer events switched off, so the narrow one also has nothing to tab to.
 *
 * ### Where they sit
 *
 * Every token and the range box are `cellRect`s in the plane the board is drawn
 * on (`BattleMapBoard.tsx`), laid out as percentages of it — so they sit on the
 * picture's squares at any width, and a token's button is its whole square.
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
  /** False once the fight is over or a dialog is open: tokens select, nothing moves. */
  readonly movable: boolean;
  readonly onSelect: (combatant: Combatant) => void;
  /** Put it on a square, or `null` to take it off the board. */
  readonly onMove: (combatant: Combatant, to: BoardSquare | null) => void;
}

/**
 * The counter itself, in a 100-unit box that fills its square: a disc 86 across
 * (the drawing's), and the rings outside it. Strokes keep their pixel width at
 * any size, so a ring reads the same on a small board and a large one.
 */
function TokenFace({
  combatant,
  label,
  selected,
  active,
}: {
  readonly combatant: Combatant;
  readonly label: string;
  readonly selected: boolean;
  readonly active: boolean;
}) {
  const party = combatant.kind === "pc";
  return (
    <svg viewBox="0 0 100 100" aria-hidden className="size-full overflow-visible">
      {(selected || active) && (
        <circle
          cx={50}
          cy={50}
          r={selected ? 50 : 46}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          className="stroke-accent"
        />
      )}
      <circle
        cx={50}
        cy={50}
        r={43}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        className={party ? "fill-info/40 stroke-info" : "fill-danger/40 stroke-danger"}
      />
      <text
        x={50}
        y={50}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={label.length > 2 ? 30 : 38}
        className="fill-heading font-sans font-semibold"
      >
        {label}
      </text>
    </svg>
  );
}

const placed = (
  combatants: ReadonlyArray<Combatant>,
): ReadonlyArray<Combatant & { readonly position: BoardSquare }> =>
  combatants.filter(
    (combatant): combatant is Combatant & { readonly position: BoardSquare } =>
      combatant.position !== null,
  );

/** The dashed box around the selected token: the squares its speed reaches. */
function Reach({ props }: { readonly props: TokenProps }) {
  const { board, selected, speedOf } = props;
  if (selected === undefined || selected.position === null) return null;
  const speed = speedOf(selected);
  const rect = speed === undefined ? undefined : reachRect(board, selected.position, speed);
  if (rect === undefined) return null;
  const plane = battleMapPlane(board, board.image);
  return (
    <div
      data-slot="token-reach"
      aria-hidden
      className="pointer-events-none absolute rounded-xs border border-dashed border-accent bg-accent/5"
      style={percentOf(rect, plane)}
    />
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
  const { board, combatants, labels, hpOf, selected, activeId, movable, onSelect, onMove } = props;
  const plane = battleMapPlane(board, board.image);
  const standing = placed(combatants);
  const canMove = movable && selected !== undefined;

  const face = (combatant: Combatant) => (
    <TokenFace
      combatant={combatant}
      label={labels.get(combatant.id) ?? "?"}
      selected={combatant.id === selected?.id}
      active={combatant.id === activeId}
    />
  );
  const fade = (combatant: Combatant) => (hpOf(combatant) === 0 ? "opacity-45" : "");
  const at = (square: BoardSquare) => percentOf(cellRect(board, square), plane);

  /** A click on the board: the square under it, in the plane's pixels. */
  const moveTo = (event: MouseEvent<HTMLDivElement>) => {
    if (!canMove) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const square = squareAt(board, {
      x: ((event.clientX - box.left) / box.width) * plane.width,
      y: ((event.clientY - box.top) / box.height) * plane.height,
    });
    if (square === undefined) return;
    const from = selected.position;
    if (from !== null && from.column === square.column && from.row === square.row) return;
    onMove(selected, square);
  };

  /** The arrow keys walk a focused token one square, which is the board without a pointer. */
  const step = (combatant: Combatant & { readonly position: BoardSquare }) =>
    function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      const delta = STEP[event.key];
      if (delta === undefined || !movable) return;
      event.preventDefault();
      const to = {
        column: Math.min(board.columns - 1, Math.max(0, combatant.position.column + delta[0])),
        row: Math.min(board.rows - 1, Math.max(0, combatant.position.row + delta[1])),
      };
      onSelect(combatant);
      if (to.column === combatant.position.column && to.row === combatant.position.row) return;
      onMove(combatant, to);
    };

  return (
    <>
      {/* Wide: the board takes clicks. */}
      <div data-slot="run-tokens" className="absolute inset-0 hidden @3xl:block">
        <div
          data-slot="run-board-squares"
          aria-hidden
          onClick={moveTo}
          className={cn("absolute inset-0", canMove && "cursor-crosshair")}
        />
        <Reach props={props} />
        {standing.map((combatant) => (
          <button
            key={combatant.id}
            type="button"
            data-slot="token"
            aria-label={`${combatant.displayName}, column ${String(combatant.position.column + 1)}, row ${String(combatant.position.row + 1)}`}
            aria-pressed={combatant.id === selected?.id}
            onClick={() => onSelect(combatant)}
            onKeyDown={step(combatant)}
            className={cn(
              "absolute cursor-pointer rounded-circle outline-none focus-visible:ring-focus",
              "transition-[left,top] duration-(--dur-base) ease-out",
              fade(combatant),
            )}
            style={at(combatant.position)}
          >
            {face(combatant)}
          </button>
        ))}
      </div>

      {/* Narrow: the same board, to look at. */}
      <div
        data-slot="run-tokens-view"
        aria-hidden
        className="pointer-events-none absolute inset-0 @3xl:hidden"
      >
        <Reach props={props} />
        {standing.map((combatant) => (
          <span
            key={combatant.id}
            className={cn("absolute", fade(combatant))}
            style={at(combatant.position)}
          >
            {face(combatant)}
          </span>
        ))}
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
          onClick={() => onMove(standing, null)}
          className="ml-auto hidden @3xl:inline-flex"
        >
          Take {standing.displayName} off the board
        </Button>
      )}
    </div>
  );
}
