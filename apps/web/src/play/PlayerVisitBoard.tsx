import {
  type BoardSquare,
  type CampaignCharacterId,
  type DiagonalRule,
  type PlaneRect,
  type PlayerLevelVisit,
  playerSight,
  playerWalk,
} from "@taverns/api";
import { Card, Icon, SectionHeading } from "@taverns/ui";
import { useMemo, useState } from "react";
import { centreOf } from "../run/canvas";
import { GridBoard } from "../run/GridBoard";
import { describeBoard } from "../run/runBoard";
import { type LayerToken, TokenLayer } from "../run/RunTokens";
import { labelsInOrder } from "../run/tokens";
import { PartyLevelStage } from "./PlayerBoard";

/**
 * The level visit on the table as a seated player sees it
 * (`PlayerLevelVisit`): the party exploring the dungeon with no fight on. The
 * same canvas and token layer a fight's player board uses
 * (`PlayerBoard.tsx`'s `PartyLevelStage`, `run/RunTokens.tsx`), with what a
 * visit has: the party's tokens the server sent, and nothing of a fight.
 *
 * **A player drags their own token** (`own`), and only theirs, with no turn
 * and no speed (`TokenLayer`'s `exploring`): the range is every square the
 * walk reaches over the party's view of the level (`playerWalk`, the walk the
 * server holds the move to), and the ruler reads the distance, or *No way
 * there*, and a walk it calls that is not sent (`walkBound`). The server is
 * the answer to every walk sent: a refused one puts the token back. The
 * level and the tokens are already narrowed by the server, so neither is
 * narrowed here.
 */
export interface PlayerVisitBoardProps {
  readonly visit: PlayerLevelVisit;
  readonly diagonals: DiagonalRule;
  /** Whether your own token may be moved now: nothing in flight. */
  readonly movable: boolean;
  /** Walk one of your own seats' tokens; settles once the server answers. */
  readonly onMove: (seatId: CampaignCharacterId, to: BoardSquare) => Promise<unknown>;
}

interface SeatToken extends LayerToken {
  readonly kind: "seat";
  readonly seatId: CampaignCharacterId;
  readonly own: boolean;
}

/**
 * A creature the party sees now on the level (`PlayerLevelVisit.creatures`),
 * drawn as a fight's player board draws a foe: its name and its square, and
 * nothing to press. The server sends no id, so its square is its key: two
 * never share one.
 */
interface CreatureToken extends LayerToken {
  readonly kind: "creature";
}

const creatureId = (creature: { readonly column: number; readonly row: number }) =>
  `creature:${String(creature.column)}:${String(creature.row)}`;

function VisitTokens({ visit, diagonals, movable, onMove }: PlayerVisitBoardProps) {
  const { columns, rows, feetPerCell, level, fog } = visit;
  const board = useMemo(() => ({ columns, rows, feetPerCell }), [columns, rows, feetPerCell]);
  const seats = visit.tokens.map((token): SeatToken => ({
    kind: "seat",
    seatId: token.seatId,
    own: token.own,
    id: token.seatId,
    displayName: token.name,
    position: { column: token.column, row: token.row },
    party: true,
    portrait: undefined,
    conditions: 0,
    health: undefined,
    out: false,
    struck: false,
    hidden: false,
    ...(token.own ? { spoken: " (you)" } : {}),
  }));
  const creatures = visit.creatures.map((creature): CreatureToken => ({
    kind: "creature",
    id: creatureId(creature),
    displayName: creature.name,
    position: { column: creature.column, row: creature.row },
    party: false,
    portrait: undefined,
    conditions: 0,
    health: undefined,
    out: false,
    struck: false,
    hidden: false,
  }));
  const tokens: ReadonlyArray<SeatToken | CreatureToken> = [...seats, ...creatures];
  const labels = useMemo(
    () =>
      labelsInOrder<string>([
        ...visit.tokens.map((token) => ({ id: token.seatId, displayName: token.name })),
        ...visit.creatures.map((creature) => ({
          id: creatureId(creature),
          displayName: creature.name,
        })),
      ]),
    [visit.tokens, visit.creatures],
  );
  const walk = useMemo(() => {
    const party = playerWalk(board, level);
    return { layout: party.layout, ends: party.ends, sight: playerSight(level) };
  }, [board, level]);
  const [picked, setPicked] = useState<CampaignCharacterId>();
  // Whoever was picked, while they still stand here; else your own token.
  const selected =
    seats.find((token) => token.seatId === picked) ?? seats.find((token) => token.own);
  return (
    <TokenLayer
      board={board}
      walk={walk}
      tokens={tokens}
      labels={labels}
      selected={selected}
      activeId={null}
      feetLeftOf={() => undefined}
      diagonals={diagonals}
      movable={(token) => movable && token.kind === "seat" && token.own}
      names="all"
      fog={{ squares: fog, veil: "opaque" }}
      rangeShown
      exploring
      walkBound
      onSelect={(token) => (token.kind === "seat" ? setPicked(token.seatId) : undefined)}
      onTarget={undefined}
      onMove={(token, to) =>
        to === null || token.kind !== "seat" ? Promise.resolve() : onMove(token.seatId, to)
      }
    />
  );
}

/** Where your own token stands, on the board's plane: where the camera looks first. */
const ownPoint = (visit: PlayerLevelVisit) => {
  const own = visit.tokens.find((token) => token.own);
  return own === undefined ? undefined : centreOf({ column: own.column, row: own.row });
};

/**
 * The visit on the canvas, as the fight's player board is
 * (`PlayerBoardStage`): it fills the stage, the player pans and zooms it, and
 * *Centre* finds their own token.
 */
export function PlayerVisitStage({
  freeArea,
  ...props
}: PlayerVisitBoardProps & { readonly freeArea: (canvas: DOMRect) => PlaneRect }) {
  const centre = ownPoint(props.visit);
  return (
    <PartyLevelStage
      label="Level"
      board={props.visit}
      centre={centre}
      focus={centre}
      freeArea={freeArea}
    >
      <VisitTokens {...props} />
    </PartyLevelStage>
  );
}

/**
 * The visit as a card, in the page's flow, below the canvas's width: where
 * everyone stands, with nothing to press (a square is too small to hit), as
 * the fight's board card is (`PlayerBoardCard`).
 */
export function PlayerVisitCard(props: PlayerVisitBoardProps) {
  const { visit } = props;
  return (
    <Card aria-label="Level" role="region" className="overflow-clip">
      <div className="flex items-center gap-2.5 border-b border-hairline px-panel py-2.5">
        <Icon name="map" size={15} className="text-muted-foreground" />
        <SectionHeading as="h2" size="title">
          Exploring
        </SectionHeading>
      </div>
      <GridBoard board={visit} grid>
        <VisitTokens {...props} />
      </GridBoard>
      <p className="mb-0 border-t border-hairline px-panel py-2.5 text-caption leading-body text-muted-foreground">
        {describeBoard(visit)} · walk your token on a wider screen
      </p>
    </Card>
  );
}
