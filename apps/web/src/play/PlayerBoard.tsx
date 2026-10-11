import {
  type BoardSquare,
  type CombatantId,
  type DiagonalRule,
  type PictureRect,
  type PlayerLiveBoard,
  type PlayerLiveCombatant,
  battleMapPlane,
} from "@taverns/api";
import { Card, Icon, SectionHeading } from "@taverns/ui";
import { BattleMapBoard, describeBoard } from "../campaign/BattleMapBoard";
import { BoardCanvas } from "../run/BoardCanvas";
import { AreaLayer } from "../run/BoardTools";
import { type LayerToken, TokenLayer } from "../run/RunTokens";
import { tableRowState } from "./tableRows";

/**
 * The fight's battle map as a seated player sees it, once the DM has turned on
 * *Share map* — built from the DM's own parts (the captain's call: the
 * picture, the grid, and tokens for everyone the players can already see in
 * initiative).
 *
 * It draws `PlayerLiveBoard`, a schema of its own with no setting line and no
 * "Hob is drawing", so the board is handed those as absent rather than the
 * wide type narrowed here: the picture's alt text is the generic one, and a
 * picture not drawn yet is the grid alone.
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
  readonly onMove: (to: BoardSquare) => Promise<unknown>;
}

interface TableToken extends LayerToken {
  readonly row: PlayerLiveCombatant;
}

/** The DM's token layer, over a player's board. */
function PlayerTokens(props: PlayerBoardProps & { readonly map: DrawnMap }) {
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
  return (
    <TokenLayer
      board={props.map}
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
      onSelect={(token) => props.onSelect(token.row)}
      onTarget={undefined}
      onMove={(_token, to) => (to === null ? Promise.resolve() : props.onMove(to))}
    />
  );
}

type DrawnMap = ReturnType<typeof drawn>;

/** The player's board as the battle map draws it: no setting line, no picture still coming. */
const drawn = (board: PlayerLiveBoard) => ({ ...board, setting: null, imagePending: false });

/** The board as a card, in the page's flow: below the canvas's width, or anywhere it has none. */
export function PlayerBattleMap(props: PlayerBoardProps) {
  const map = drawn(props.board);
  return (
    <Card aria-label="Battle map" role="region" className="overflow-clip">
      <div className="flex items-center gap-2.5 border-b border-hairline px-panel py-2.5">
        <Icon name="map" size={15} className="text-muted-foreground" />
        <SectionHeading as="h2" size="title">
          Battle map
        </SectionHeading>
      </div>
      <BattleMapBoard map={map}>
        {props.board.area !== null && (
          <AreaLayer board={map} area={props.board.area} state="pinned" />
        )}
        <PlayerTokens {...props} map={map} />
      </BattleMapBoard>
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
 * their own token.
 */
export function PlayerBoardStage({
  freeArea,
  ...props
}: PlayerBoardProps & { readonly freeArea: (canvas: DOMRect) => PictureRect }) {
  const map = drawn(props.board);
  return (
    <section aria-label="Battle map" data-slot="run-board" className="absolute inset-0">
      <BoardCanvas
        plane={battleMapPlane(map, map.image)}
        cellPx={map.alignment.cellPx}
        freeArea={freeArea}
      >
        <BattleMapBoard map={map} className="box-content">
          {props.board.area !== null && (
            <AreaLayer board={map} area={props.board.area} state="pinned" />
          )}
          <PlayerTokens {...props} map={map} />
        </BattleMapBoard>
      </BoardCanvas>
    </section>
  );
}
