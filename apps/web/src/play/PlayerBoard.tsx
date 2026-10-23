import {
  type BoardSquare,
  type CombatantId,
  type DiagonalRule,
  type PlaneRect,
  type PlayerLiveBoard,
  type PlayerLiveCombatant,
  type PlayerLiveLevel,
  BOARD_CELL_PX,
  boardPlane,
  playerLevelLayout,
  playerWalk,
  playerSight,
} from "@taverns/api";
import { type ReactNode, useMemo, useState } from "react";
import { CameraBar } from "../run/CameraBar";
import { centreOf } from "../run/canvas";
import { canDrawWebGL } from "../run/fx3d/support";
import { LevelBackdrop } from "../run/LevelBackdrop";
import { InStageCorner } from "../run/RunStage";
import { Card, cn, Icon, SectionHeading } from "@taverns/ui";
import { BoardCanvas } from "../run/BoardCanvas";
import { AreaLayer } from "../run/BoardTools";
import type { Act } from "../run/effects";
import { GridBoard } from "../run/GridBoard";
import { describeBoard } from "../run/runBoard";
import { type LayerToken, TokenLayer } from "../run/RunTokens";
import { tableRowState } from "./tableRows";

/**
 * The fight's board as a seated player sees it, once the DM has turned on
 * *Share map* — built from the DM's own parts (the captain's call: the grid,
 * and tokens for everyone the players can already see in initiative).
 *
 * It draws `PlayerLiveBoard`, a schema of its own.
 *
 * A token is a row of the player's order standing on a square: the server
 * sends only those (`tokenShownTo`), so a hidden creature, every monster while
 * the DM hides them, and anyone under fog but the player is simply not here.
 * They are drawn by the DM's own layer (`run/RunTokens.tsx`' `TokenLayer`):
 * ringed in the party's colour or everyone else's, the one whose turn it is
 * ringed peach, the selected one ringed white, faded when out of the fight.
 * A press selects. **On their own turn a player drags their own token**, with
 * the DM's ruler and range against what is left of their speed, and the move
 * is `table.move`; no other token takes a drag.
 *
 * Fog of war covers its squares outright (`PlayerLiveBoard.fog`), under the
 * tokens, since the only token there is the player's own.
 *
 * **A fight on a level** draws the party's level on the canvas under the board
 * (`LevelBackdrop` in the party's view), as the DM's board draws the whole
 * one: lit by the lights the table was sent, what the party sees now in full,
 * what it has explored dimmed, the rest hatched. The server sends only what
 * the party has seen (`PlayerLiveLevel`), and a token only where the party
 * sees now, so neither is narrowed here.
 *
 * An area the DM has pinned is drawn under the tokens by the DM's own layer
 * (`run/BoardTools.tsx`), so the table sees where it lands and who stands in
 * it. Who it catches is not said here: the DM's banner names creatures this
 * player may not see.
 */
export interface PlayerBoardProps {
  readonly board: PlayerLiveBoard;
  /** The player's order, which every token is a row of. */
  readonly order: ReadonlyArray<PlayerLiveCombatant>;
  readonly labels: ReadonlyMap<CombatantId, string>;
  readonly upNextId: CombatantId | undefined;
  readonly selectedId: CombatantId | undefined;
  readonly diagonals: DiagonalRule;
  /** What is left of your speed this turn, for your range and ruler; absent when your sheet says none. */
  readonly feetLeft: number | undefined;
  /** Whether your own token may be moved now: your turn, and nothing in flight. */
  readonly movable: boolean;
  readonly onSelect: (row: PlayerLiveCombatant) => void;
  /** Set while your attack waits for its target: a token's click is the target, never yours. */
  readonly onTarget?: ((row: PlayerLiveCombatant) => void) | undefined;
  readonly onMove: (to: BoardSquare) => Promise<unknown>;
  /** What your table draws: the fight's acts you may see (`PlayerLiveFight.acts`). */
  readonly acts?: ReadonlyArray<Act>;
}

interface TableToken extends LayerToken {
  readonly row: PlayerLiveCombatant;
}

/** The DM's token layer, over a player's board. */
function PlayerTokens(props: PlayerBoardProps) {
  const { board, order, labels, upNextId, selectedId, diagonals, feetLeft, movable } = props;
  const positions = new Map(board.tokens.map((token) => [token.combatantId, token.position]));
  const tokens = order.flatMap((row): ReadonlyArray<TableToken> => {
    const position = positions.get(row.combatantId);
    if (position === undefined) return [];
    const state = tableRowState(row);
    return [
      {
        row,
        id: row.combatantId,
        displayName: row.displayName,
        position,
        party: row.kind !== "npc",
        portrait: row.kind !== "npc" && row.portrait !== null ? row.portrait.thumbUrl : undefined,
        conditions: row.conditions.length,
        out: state.out,
        struck: state.out,
        hidden: false,
        health: state.health,
        ...(row.kind === "you" ? { spoken: " (you)" } : {}),
      },
    ];
  });
  const mine = (token: TableToken) => token.row.kind === "you";
  // On a level, the range and the ruler walk the party's view of it as the
  // server holds a player's move to (`playerWalk`): over the squares the party
  // has seen, and one step into the dark beyond them, no further.
  const level = board.level;
  const { columns, rows, feetPerCell } = board;
  const walk = useMemo(() => {
    if (level === null) return undefined;
    const party = playerWalk({ columns, rows, feetPerCell }, level);
    return { layout: party.layout, ends: party.ends, sight: playerSight(level) };
  }, [level, columns, rows, feetPerCell]);
  return (
    <TokenLayer
      board={board}
      walk={walk}
      tokens={tokens}
      labels={labels}
      selected={tokens.find((token) => token.id === selectedId)}
      activeId={upNextId ?? null}
      feetLeftOf={(token) => (mine(token) ? feetLeft : undefined)}
      diagonals={diagonals}
      movable={(token) => movable && mine(token)}
      names="active"
      fog={{ squares: board.fog, veil: "opaque" }}
      rangeShown
      walkBound
      onSelect={(token) => props.onSelect(token.row)}
      onTarget={
        props.onTarget === undefined
          ? undefined
          : (token) => {
              if (token.row.kind !== "you") props.onTarget?.(token.row);
            }
      }
      {...(props.acts === undefined ? {} : { acts: props.acts })}
      onMove={(_token, to) => (to === null ? Promise.resolve() : props.onMove(to))}
    />
  );
}

/** The board as a card, in the page's flow: below the canvas's width, or anywhere it has none. */
export function PlayerBoardCard(props: PlayerBoardProps) {
  const map = props.board;
  return (
    <Card aria-label="Battle map" role="region" className="overflow-clip">
      <div className="flex items-center gap-2.5 border-b border-hairline px-panel py-2.5">
        <Icon name="map" size={15} className="text-muted-foreground" />
        <SectionHeading as="h2" size="title">
          Battle map
        </SectionHeading>
      </div>
      <GridBoard board={map} grid>
        {props.board.area !== null && (
          <AreaLayer board={map} area={props.board.area} state="pinned" />
        )}
        <PlayerTokens {...props} />
      </GridBoard>
      <p className="mb-0 border-t border-hairline px-panel py-2.5 text-caption leading-body text-muted-foreground">
        {describeBoard(map)}
      </p>
    </Card>
  );
}

/**
 * The board on the canvas, as the DM's runner has it (`run/RunStage.tsx`): it
 * fills the stage under the panels, and the player pans and zooms it. No tool
 * dock: the DM's tools write the board, and a player's board takes nothing but
 * their own token. The camera (`CameraBar.tsx`) is theirs, in the stage's corner.
 */
export function PlayerBoardStage({
  freeArea,
  ...props
}: PlayerBoardProps & { readonly freeArea: (canvas: DOMRect) => PlaneRect }) {
  const map = props.board;
  const up = props.order.find((row) => row.combatantId === props.upNextId);
  const upAt = props.board.tokens.find((token) => token.combatantId === up?.combatantId)?.position;
  return (
    <PartyLevelStage
      label="Battle map"
      board={map}
      centre={upAt === undefined ? undefined : centreOf(upAt)}
      freeArea={freeArea}
    >
      {props.board.area !== null && (
        <AreaLayer board={map} area={props.board.area} state="pinned" />
      )}
      <PlayerTokens {...props} />
    </PartyLevelStage>
  );
}

/**
 * A board a seated player is shown, on the canvas: the party's level drawn
 * under it where the browser can (`LevelBackdrop` in the party's view), as
 * the DM's board draws the whole one, and the player's own camera in the
 * stage's corner. What stands on it (`children`) is the caller's: a fight's
 * tokens (`PlayerBoardStage`) or a level visit's (`play/PlayerVisitBoard.tsx`).
 * `centre` is where *Centre* takes the camera, when there is somewhere;
 * `focus`, where the camera first looks (`BoardCanvas`), when not the middle.
 */
export function PartyLevelStage({
  label,
  board,
  centre,
  focus,
  freeArea,
  children,
}: {
  readonly label: string;
  readonly focus?: { readonly x: number; readonly y: number } | undefined;
  readonly board: {
    readonly columns: number;
    readonly rows: number;
    readonly feetPerCell: number;
    readonly level: PlayerLiveLevel | null;
  };
  readonly centre: { readonly x: number; readonly y: number } | undefined;
  readonly freeArea: (canvas: DOMRect) => PlaneRect;
  readonly children: ReactNode;
}) {
  // The party's level as the renderer reads it, kept while the board's
  // answer is the same (a re-read is a new one, and redraws).
  const { columns, rows, feetPerCell, level } = board;
  const layout = useMemo(
    () => (level === null ? null : playerLevelLayout({ columns, rows, feetPerCell }, level)),
    [level, columns, rows, feetPerCell],
  );
  const [levelDrawable, setLevelDrawable] = useState(canDrawWebGL);
  // A level draws under the board where the browser can, as the DM's board
  // does (`RunStage.tsx`); the board box over it is then clear, its grid the
  // renderer's.
  const drawsLevel = layout !== null && level !== null && levelDrawable;
  const map = { columns, rows, feetPerCell };
  return (
    <section aria-label={label} data-slot="run-board" className="absolute inset-0">
      <BoardCanvas
        plane={boardPlane(map)}
        cellPx={BOARD_CELL_PX}
        freeArea={freeArea}
        {...(focus === undefined ? {} : { focus })}
        backdrop={
          drawsLevel
            ? (view) => (
                <LevelBackdrop
                  layout={layout}
                  cellPx={BOARD_CELL_PX}
                  view={view}
                  grid
                  party={level}
                  onFailed={() => setLevelDrawable(false)}
                />
              )
            : undefined
        }
        controls={(camera) => (
          <InStageCorner
            fallback={(children) => (
              <div className="absolute bottom-3 left-3 z-hud w-run-rail">{children}</div>
            )}
          >
            <div className="rounded-card border border-strong bg-surface-card p-2 shadow-3">
              <CameraBar
                camera={camera}
                onCentre={centre === undefined ? undefined : () => camera.centre(centre)}
              />
            </div>
          </InStageCorner>
        )}
      >
        <GridBoard
          board={map}
          grid={!drawsLevel}
          className={cn("box-content", drawsLevel && "border-transparent bg-transparent")}
        >
          {children}
        </GridBoard>
      </BoardCanvas>
    </section>
  );
}
