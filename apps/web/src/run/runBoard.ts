import type { BoardSquare, Combatant, EncounterRunBoard } from "@taverns/api";
import { useEffect, useRef, useState } from "react";
import type { Resource } from "../api/failure";
import { describeBoard } from "../campaign/BattleMapBoard";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { useEscapeAway } from "./escape";
import { type FogEdit, fogAfter, squareKey, squaresBetween } from "./fog";
import type { FogStroke } from "./Fog";
import type { TokenProps } from "./RunTokens";
import { useTokenNames } from "./tokenNames";
import { moveLine } from "./tokens";

export interface RunBoardProps {
  readonly resource: Resource<EncounterRunBoard | null>;
  readonly reload: () => void;
  /** The fight is off the table: the board is where everyone finished. */
  readonly over: boolean;
  /** Everything but the board, which this card reads. */
  readonly tokens: Omit<
    TokenProps,
    "board" | "onMove" | "hostileTokensHidden" | "names" | "fog"
  > & {
    /** The move's write; resolves true once the server has the square. */
    readonly onMove: (combatant: Combatant, to: BoardSquare | null) => Promise<boolean>;
  };
  /** The map's *Hide from players*, as the fight holds it. */
  readonly hostileTokensHidden: boolean;
  /** Its write is in flight. */
  readonly hiding: boolean;
  readonly onHideHostile: (hidden: boolean) => void;
  /**
   * One write of the Fog tool, sent after every write and re-read before it;
   * resolves once the board holds the server's answer, or once it failed, and
   * never rejects.
   */
  readonly onFog: (edit: FogEdit) => Promise<void>;
}

/**
 * What both forms of the board share — the card below `@3xl` and the canvas
 * above it (`RunStage.tsx`): the board itself, the local *Grid* and *Names*,
 * the hint and the last move's line, and the tokens' props with the move wired
 * through it, and the fog with the Fog tool's strokes on their way laid over it.
 */
export function useRunBoard({
  resource,
  reload,
  over,
  tokens,
  hostileTokensHidden,
  onFog,
}: RunBoardProps) {
  const board = resource.state === "ready" ? resource.value : null;
  // A fight started straight after its encounter was made may begin before
  // Hob finishes the picture.
  useHobDrawingPolling(board?.imagePending === true, reload);
  const [grid, setGrid] = useState<boolean>();
  const [lastMove, setLastMove] = useState<string>();
  const [names, setNames] = useTokenNames();

  const gridShown = grid ?? board?.grid === "square";
  const { selected } = tokens;
  const fogTool = useFogTool({
    board,
    // One tool at a time: an attack waiting for its target, a dialog or the
    // fight ending puts the brush away.
    usable: !over && tokens.movable && tokens.onTarget === undefined,
    onFog,
  });
  const hint = over
    ? "Where everyone stood when it ended."
    : fogTool.on
      ? "Click or drag to hide squares from the players. Start on fog to reveal."
      : (lastMove ??
        (selected === undefined
          ? "Drag a token to its square."
          : selected.position === null
            ? `Click a square to put ${selected.displayName} on the board.`
            : `Drag ${selected.displayName} to a square, or step with the arrow keys.`));

  const onMove = async (combatant: Combatant, to: BoardSquare | null) => {
    if (board === null) return;
    const line = moveLine({
      name: combatant.displayName,
      from: combatant.position,
      to,
      feetPerCell: board.feetPerCell,
      diagonals: tokens.diagonals,
      speed: tokens.speedOf(combatant),
    });
    if (await tokens.onMove(combatant, to)) setLastMove(line);
  };
  const withBoard: TokenProps | undefined =
    board === null
      ? undefined
      : { ...tokens, board, onMove, hostileTokensHidden, names, fog: fogTool.fog };
  return { board, gridShown, setGrid, names, setNames, hint, withBoard, fogTool };
}

/** A stroke of the brush: one of the two lists a fog write takes. */
type Stroke = FogEdit & { readonly kind: "hide" | "reveal" };

/**
 * The Fog tool: whether it is on, the stroke being painted, and the fog to
 * draw — the server's, with every write it has not answered yet laid over it
 * in the order they were sent, then the stroke under the pointer. So a stroke
 * stays painted from the moment it is drawn, and nothing waits on the network.
 *
 * `onFog` sends each write after the one before it has settled, so the board's
 * answers arrive in the order the server applied them and an older one never
 * lands over a newer one. A write leaves the queue only once its answer is the
 * board, so the squares it painted never blink back. A refused write, or one
 * that never reached the server, leaves the queue too, and the board shows the
 * fog the server holds.
 */
function useFogTool({
  board,
  usable,
  onFog,
}: {
  readonly board: EncounterRunBoard | null;
  readonly usable: boolean;
  readonly onFog: (edit: FogEdit) => Promise<void>;
}) {
  const [chosen, setChosen] = useState(false);
  const on = chosen && usable && board !== null;
  const [queued, setQueued] = useState<
    ReadonlyArray<{ readonly id: number; readonly edit: FogEdit }>
  >([]);
  // The stroke under the pointer: drawn from state, read back from the ref, so
  // letting go sends every square however fast the pointer outran a render.
  const [painting, setShownStroke] = useState<Stroke>();
  const held = useRef<Stroke | undefined>(undefined);
  const setPainting = (next: Stroke | undefined) => {
    held.current = next;
    setShownStroke(next);
  };
  const sent = useRef(0);

  const send = (edit: FogEdit) => {
    const id = ++sent.current;
    setQueued((current) => [...current, { id, edit }]);
    void onFog(edit).then(() => setQueued((current) => current.filter((entry) => entry.id !== id)));
  };

  const fog =
    board === null
      ? []
      : fogAfter(board, board.fog, [
          ...queued.map((entry) => entry.edit),
          ...(painting === undefined ? [] : [painting]),
        ]);

  // Putting the tool away mid-stroke paints nothing.
  useEffect(() => {
    if (on) return;
    held.current = undefined;
    setShownStroke(undefined);
  }, [on]);
  // Leaving it while something else needs the board leaves it off afterwards.
  useEffect(() => {
    if (!usable) setChosen(false);
  }, [usable]);
  useEscapeAway(on, () => setChosen(false));

  const fogged = new Set(fog.map(squareKey));
  const stroke: FogStroke = {
    start: (square) =>
      setPainting({ kind: fogged.has(squareKey(square)) ? "reveal" : "hide", squares: [square] }),
    extend: (from, to) => {
      const current = held.current;
      if (current === undefined) return;
      const had = new Set(current.squares.map(squareKey));
      const more = squaresBetween(from, to).filter((step) => !had.has(squareKey(step)));
      if (more.length > 0) setPainting({ ...current, squares: [...current.squares, ...more] });
    },
    end: () => {
      const done = held.current;
      setPainting(undefined);
      if (done !== undefined) send(done);
    },
    cancel: () => setPainting(undefined),
  };

  return {
    on,
    usable: usable && board !== null,
    setOn: setChosen,
    fog,
    stroke,
    whole: (kind: "revealAll" | "coverAll" | "reset") => send({ kind }),
  };
}

/** The board's size in the DM's units, and what a deleted encounter took with it. */
export const boardCaption = (board: EncounterRunBoard): string =>
  `${describeBoard(board)}${
    board.mapId === null
      ? ". This fight's encounter was deleted, and its picture with it. The board keeps its squares."
      : ""
  }`;
