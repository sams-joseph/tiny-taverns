import type { BoardSquare, Combatant, EncounterRunBoard } from "@taverns/api";
import { Card, Icon, SectionHeading, Toggle } from "@taverns/ui";
import { useState } from "react";
import type { Resource } from "../api/failure";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { BattleMapBoard, describeBoard } from "../campaign/BattleMapBoard";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { RunTokens, TokenTray, type TokenProps } from "./RunTokens";
import { moveLine } from "./tokens";

/**
 * The fight's board: **open, and the DM's own.** The runner is the creator's
 * screen, so no player ever reaches this card; what the table sees of the map
 * is its own read, shown only while the header's *Share map* is on
 * (`PlayerLiveBoard`, drawn by `play/PlayerBoard.tsx`).
 *
 * The redesign puts it at the centre of the fight rather than in a band under
 * the list, so it is drawn open, as wide as its column (`RunLayout.tsx`), with
 * the fight's tokens on it (`RunTokens.tsx`).
 *
 * The board is the fight's own (`EncounterRunBoard`): its grid was copied when
 * the fight began, so it says nothing about the encounter's map as it stands.
 * A fight with no board — one whose encounter was gone before fights kept
 * boards — gets no card at all rather than an empty one, and the layout closes
 * the gap (the screen asks `hasBoard`, `load.ts`).
 *
 * *Grid* is the DM's view of it, not a write: it hides the lines on this screen
 * and nowhere else, and the squares still measure and still take a token.
 * *Hide from players* is a write (`EncounterRun.hostileTokensHidden`): every
 * token but the party's comes off the players' board at once, while their rows
 * stay in the players' order. It can be set before the map is shared, so a
 * fight can open with the monsters already hidden.
 */
export function RunBoardCard({
  resource,
  reload,
  over,
  tokens,
  hostileTokensHidden,
  hiding,
  onHideHostile,
}: {
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
}) {
  const board = resource.state === "ready" ? resource.value : null;
  // A fight started straight after its encounter was made may begin before
  // Hob finishes the picture.
  useHobDrawingPolling(board?.imagePending === true, reload);
  const [grid, setGrid] = useState<boolean>();
  const [lastMove, setLastMove] = useState<string>();

  if (resource.state === "loading") return null;
  if (resource.state === "ready" && board === null) return null;

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
  const withBoard = board === null ? undefined : { ...tokens, board, onMove, hostileTokensHidden };

  return (
    <Card aria-label="Battle map" role="region" data-slot="run-board" className="overflow-clip">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-hairline px-panel py-2.5">
        <Icon name="map" size={15} className="text-muted-foreground" />
        <SectionHeading as="h2" size="title">
          Battle map
        </SectionHeading>
        {board !== null && (
          <>
            {/* The hint has a line of its own under the title and the toggles,
                so a longer one after a selection or a move never rewraps the
                header and slides the board out from under the pointer. */}
            <span
              role="status"
              className="order-last hidden min-w-0 basis-full text-body-s leading-snug text-muted-foreground @3xl:block"
            >
              {hint}
            </span>
            <span className="order-last min-w-0 basis-full text-body-s leading-snug text-muted-foreground @3xl:hidden">
              {over
                ? "Where everyone stood when it ended."
                : "Select from the initiative list. Tokens move on a wider screen."}
            </span>
            <div className="ml-auto flex gap-1.5">
              <Toggle size="sm" pressed={gridShown} onPressedChange={(pressed) => setGrid(pressed)}>
                <Icon name="grid-3x3" size={13} />
                Grid
              </Toggle>
              <Toggle
                size="sm"
                pressed={hostileTokensHidden}
                disabled={over || hiding}
                onPressedChange={(pressed) => onHideHostile(pressed)}
              >
                <Icon name="eye-off" size={13} />
                Hide from players
              </Toggle>
            </div>
          </>
        )}
      </div>
      {resource.state === "failed" ? (
        <div className="p-panel">
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      ) : (
        board !== null &&
        withBoard !== undefined && (
          <>
            <BattleMapBoard map={{ ...board, grid: gridShown ? "square" : "none" }}>
              <RunTokens {...withBoard} />
            </BattleMapBoard>
            <TokenTray {...withBoard} />
            <p className="mb-0 border-t border-hairline px-panel py-2.5 text-caption leading-body text-muted-foreground">
              {describeBoard(board)}
              {board.mapId === null &&
                ". This fight's encounter was deleted, and its picture with it. The board keeps its squares."}
            </p>
          </>
        )
      )}
    </Card>
  );
}
