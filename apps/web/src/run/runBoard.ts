import {
  type AreaShape,
  type BoardArea,
  type BoardSquare,
  type Combatant,
  type EncounterRunBoard,
  rulerReading,
} from "@taverns/api";
import { useEffect, useRef, useState } from "react";
import type { Resource } from "../api/failure";
import { describeBoard } from "../campaign/BattleMapBoard";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import {
  areaAt,
  areaName,
  caughtBy,
  caughtLine,
  sameArea,
  squaresOf,
  startingFeet,
  stepFeet,
} from "./area";
import type { BoardTool, ToolPointer } from "./BoardTools";
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
    "board" | "onMove" | "hostileTokensHidden" | "names" | "fog" | "rangeShown"
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
  /**
   * The Area tool's write: pin a template, or clear it with `null`. In the same
   * line as the fog's; resolves once settled, and never rejects.
   */
  readonly onArea: (area: BoardArea | null) => Promise<void>;
}

/**
 * What both forms of the board share — the card below `@3xl` and the canvas
 * above it (`RunStage.tsx`): the board itself, the local *Grid* and *Names*,
 * the hint and the last move's line, the tokens' props with the move wired
 * through it, the fog with the Fog tool's strokes on their way laid over it,
 * and the dock's tools (`useBoardTools`), which only the canvas offers but
 * whose pinned area both draw.
 */
export function useRunBoard(
  { resource, reload, over, tokens, hostileTokensHidden, onFog, onArea }: RunBoardProps,
  /** The canvas: the board takes a pointer, so the dock's tools are offered. */
  canvas: boolean,
) {
  const board = resource.state === "ready" ? resource.value : null;
  // A fight started straight after its encounter was made may begin before
  // Hob finishes the picture.
  useHobDrawingPolling(board?.imagePending === true, reload);
  const [grid, setGrid] = useState<boolean>();
  const [lastMove, setLastMove] = useState<string>();
  const [names, setNames] = useTokenNames();

  const gridShown = grid ?? board?.grid === "square";
  const { selected } = tokens;
  const tools = useBoardTools({
    board,
    // One tool at a time: an attack waiting for its target, a dialog or the
    // fight ending puts Measure, Area and Fog away. The card below the canvas
    // has none.
    usable: canvas && !over && tokens.movable && tokens.onTarget === undefined,
    tokens,
    onArea,
  });
  const fogTool = useFogTool({ board, on: tools.tool === "fog", onFog });
  const hint = over
    ? "Where everyone stood when it ended."
    : tools.tool === "fog"
      ? "Click or drag to hide squares from the players. Start on fog to reveal."
      : (tools.hint ??
        lastMove ??
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
      : {
          ...tokens,
          board,
          onMove,
          hostileTokensHidden,
          names,
          fog: fogTool.fog,
          rangeShown: tools.tool === "move",
        };
  return { board, gridShown, setGrid, names, setNames, hint, withBoard, tools, fogTool };
}

/**
 * The dock's tools (`BoardTools.tsx`): which one is on — Move, Measure, Area
 * or Fog — the ruler Measure has laid, the square under the pointer, Area's
 * shape and size, and the template pinned on the board. Fog's brush is
 * `useFogTool`'s; this says only when it is on.
 *
 * The pin is the server's (`EncounterRunBoard.area`), and the players see it.
 * A pin or a clear is drawn from the moment it is sent, the last one sent
 * standing in for the board's until its answer arrives. `onArea` sends each in
 * the board's line, after the one before it has settled, so an older answer
 * never lands over a newer one; a refused write leaves the board showing what
 * the server holds.
 */
function useBoardTools({
  board,
  usable,
  tokens,
  onArea,
}: {
  readonly board: EncounterRunBoard | null;
  readonly usable: boolean;
  readonly tokens: RunBoardProps["tokens"];
  readonly onArea: (area: BoardArea | null) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<BoardTool>("move");
  const tool: BoardTool = usable && board !== null ? chosen : "move";
  const [shape, setShape] = useState<AreaShape>("sphere");
  const [feet, setFeet] = useState(() => startingFeet("sphere"));
  const [measure, setMeasure] = useState<{
    readonly from: BoardSquare;
    readonly to: BoardSquare;
  }>();
  const [hovered, setHovered] = useState<BoardSquare>();
  const [sending, setSending] = useState<{
    readonly id: number;
    readonly area: BoardArea | null;
  }>();
  const sent = useRef(0);

  const pinned: BoardArea | null = sending !== undefined ? sending.area : (board?.area ?? null);

  const send = (area: BoardArea | null) => {
    if (sameArea(area, pinned)) return;
    const id = ++sent.current;
    setSending({ id, area });
    void onArea(area).then(() =>
      setSending((current) => (current?.id === id ? undefined : current)),
    );
  };

  // Leaving it while something else needs the board leaves it on Move afterwards.
  useEffect(() => {
    if (!usable) setChosen("move");
  }, [usable]);
  // The ruler is the turn's, as the drawing has it: the turn moving takes it away.
  const { activeId } = tokens;
  useEffect(() => setMeasure(undefined), [activeId]);

  const choose = (next: BoardTool) => {
    setChosen(next);
    setMeasure(undefined);
    setHovered(undefined);
    // Back on Area with a template pinned, the dock says what it is.
    if (next === "area" && pinned !== null) {
      setShape(pinned.shape);
      setFeet(pinned.feet);
    }
  };

  // Esc puts the tool away, its ruler or brush with it; on Area it also clears the pinned area.
  useEscapeAway(usable && tool !== "move", () => {
    if (tool === "area") send(null);
    choose("move");
  });

  /** Where a cone or a line starts: the selected creature's square, else whoever is up. */
  const active = tokens.combatants.find((row) => row.id === activeId);
  const standing = (row: Combatant | undefined) =>
    row !== undefined && row.position !== null ? row : undefined;
  const source = standing(tokens.selected) ?? standing(active);
  const from = source?.position ?? null;

  const pointer: ToolPointer = {
    hover: (square) =>
      setHovered((current) =>
        current !== undefined &&
        square !== undefined &&
        current.column === square.column &&
        current.row === square.row
          ? current
          : square,
      ),
    measureFrom: (square) => setMeasure({ from: square, to: square }),
    measureTo: (square) =>
      setMeasure((current) =>
        current === undefined ||
        (current.to.column === square.column && current.to.row === square.row)
          ? current
          : { ...current, to: square },
      ),
    pin: (square) => {
      const area = areaAt({ shape, feet, at: square, from });
      if (area !== undefined) send(area);
    },
  };

  const preview =
    tool === "area" && pinned === null && hovered !== undefined
      ? areaAt({ shape, feet, at: hovered, from })
      : undefined;

  const ruler =
    board !== null &&
    tool === "measure" &&
    measure !== undefined &&
    (measure.from.column !== measure.to.column || measure.from.row !== measure.to.row)
      ? {
          ...measure,
          reading: rulerReading({
            from: measure.from,
            to: measure.to,
            remaining: null,
            occupied: false,
            feetPerCell: board.feetPerCell,
            diagonals: tokens.diagonals,
          }),
        }
      : undefined;

  const caught =
    board === null || pinned === null
      ? undefined
      : caughtLine(caughtBy(squaresOf(board, pinned), tokens.combatants, tokens.hpOf));

  const hint =
    tool === "measure"
      ? ruler === undefined
        ? "Drag on the grid to measure."
        : `${ruler.reading.text}. Drag again to measure, or press Esc.`
      : tool === "area"
        ? shape === "sphere" || shape === "cube"
          ? `Click a square to pin a ${areaName({ shape, feet })} there.`
          : source === undefined
            ? `A ${shape} starts at a creature: put whoever is up on the board first.`
            : `Click a square to aim a ${areaName({ shape, feet })} from ${source.displayName}.`
        : undefined;

  return {
    tool,
    usable: usable && board !== null,
    choose,
    shape,
    feet,
    /**
     * Switching shape starts it at its own size, or the pinned template's when
     * it is that shape; a pinned template stays on the board.
     */
    pickShape: (next: AreaShape) => {
      if (next === shape) return;
      setShape(next);
      setFeet(pinned !== null && pinned.shape === next ? pinned.feet : startingFeet(next));
      setHovered(undefined);
    },
    /** − and +: the size, and a pinned template's with it while it is the dock's shape. */
    step: (by: 1 | -1) => {
      const resizing = pinned !== null && pinned.shape === shape;
      const size = stepFeet(resizing ? pinned.feet : feet, by);
      setFeet(size);
      if (resizing) send({ ...pinned, feet: size });
    },
    hovered,
    pointer,
    ruler,
    pinned,
    preview,
    caught,
    clear: () => send(null),
    hint,
  };
}

/** A stroke of the brush: one of the two lists a fog write takes. */
type Stroke = FogEdit & { readonly kind: "hide" | "reveal" };

/**
 * The Fog tool's brush, while the dock has it on (`useBoardTools`): the stroke
 * being painted, and the fog to draw — the server's, with every write it has
 * not answered yet laid over it in the order they were sent, then the stroke
 * under the pointer. So a stroke stays painted from the moment it is drawn,
 * and nothing waits on the network.
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
  on,
  onFog,
}: {
  readonly board: EncounterRunBoard | null;
  readonly on: boolean;
  readonly onFog: (edit: FogEdit) => Promise<void>;
}) {
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
