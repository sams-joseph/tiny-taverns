import type { BoardSquare, Combatant, EncounterRunBoard } from "@taverns/api";
import { useState } from "react";
import type { Resource } from "../api/failure";
import { describeBoard } from "../campaign/BattleMapBoard";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import type { TokenProps } from "./RunTokens";
import { moveLine } from "./tokens";

export interface RunBoardProps {
  readonly resource: Resource<EncounterRunBoard | null>;
  readonly reload: () => void;
  /** The fight is off the table: the board is where everyone finished. */
  readonly over: boolean;
  /** Everything but the board, which this card reads. */
  readonly tokens: Omit<TokenProps, "board" | "onMove" | "hostileTokensHidden"> & {
    /** The move's write; resolves true once the server has the square. */
    readonly onMove: (combatant: Combatant, to: BoardSquare | null) => Promise<boolean>;
  };
  /** The map's *Hide from players*, as the fight holds it. */
  readonly hostileTokensHidden: boolean;
  /** Its write is in flight. */
  readonly hiding: boolean;
  readonly onHideHostile: (hidden: boolean) => void;
}

/**
 * What both forms of the board share — the card below `@3xl` and the canvas
 * above it (`RunStage.tsx`): the board itself, the local *Grid*, the hint and
 * the last move's line, and the tokens' props with the move wired through it.
 */
export function useRunBoard({
  resource,
  reload,
  over,
  tokens,
  hostileTokensHidden,
}: RunBoardProps) {
  const board = resource.state === "ready" ? resource.value : null;
  // A fight started straight after its encounter was made may begin before
  // Hob finishes the picture.
  useHobDrawingPolling(board?.imagePending === true, reload);
  const [grid, setGrid] = useState<boolean>();
  const [lastMove, setLastMove] = useState<string>();

  const gridShown = grid ?? board?.grid === "square";
  const { selected } = tokens;
  const hint = over
    ? "Where everyone stood when it ended."
    : (lastMove ??
      (selected === undefined
        ? "Select a token, then click a square to move it."
        : selected.position === null
          ? `Click a square to put ${selected.displayName} on the board.`
          : `Click a square to move ${selected.displayName}.`));

  const onMove = (combatant: Combatant, to: BoardSquare | null) => {
    if (board === null) return;
    const line = moveLine({
      name: combatant.displayName,
      from: combatant.position,
      to,
      feetPerCell: board.feetPerCell,
      speed: tokens.speedOf(combatant),
    });
    void tokens.onMove(combatant, to).then((moved) => {
      if (moved) setLastMove(line);
    });
  };
  const withBoard: TokenProps | undefined =
    board === null ? undefined : { ...tokens, board, onMove, hostileTokensHidden };
  return { board, gridShown, setGrid, hint, withBoard };
}

/** The board's size in the DM's units, and what a deleted encounter took with it. */
export const boardCaption = (board: EncounterRunBoard): string =>
  `${describeBoard(board)}${
    board.mapId === null
      ? ". This fight's encounter was deleted, and its picture with it. The board keeps its squares."
      : ""
  }`;
