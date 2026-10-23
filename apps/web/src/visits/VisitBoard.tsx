import {
  BOARD_CELL_PX,
  type BoardDoorUpdate,
  type BoardSquare,
  type CampaignCharacterId,
  type DiagonalRule,
  type EncounterId,
  type LevelPartId,
  type LevelVisit,
  type PlaneRect,
  boardPlane,
  runLevelLayout,
} from "@taverns/api";
import { cn } from "@taverns/ui";
import { useMemo, useState } from "react";
import { BoardCanvas } from "../run/BoardCanvas";
import { type BoardTool, BoardToolPicker } from "../run/BoardTools";
import { CameraBar } from "../run/CameraBar";
import { centreOf } from "../run/canvas";
import { useEscapeAway } from "../run/escape";
import { FogActions, FogBrush } from "../run/Fog";
import type { FogEdit } from "../run/fog";
import { canDrawWebGL } from "../run/fx3d/support";
import { GridBoard } from "../run/GridBoard";
import { hudSurface } from "../run/hud";
import { LevelBackdrop } from "../run/LevelBackdrop";
import { LevelSwitches } from "../run/LevelSwitches";
import { useFogTool } from "../run/runBoard";
import { InStageCorner } from "../run/RunStage";
import { type LayerToken, TokenLayer } from "../run/RunTokens";
import { labelsInOrder } from "../run/tokens";

/** The visit's two tools: the party's tokens and the level's switches, or the DM's fog. */
const VISIT_TOOLS: ReadonlyArray<BoardTool> = ["move", "fog"];

export interface VisitBoardProps {
  readonly visit: LevelVisit;
  /** How the campaign counts a diagonal step, for a drag's ruler. */
  readonly diagonals: DiagonalRule;
  /** Draw the level as the party sees it now, and what it has explored. */
  readonly partyView: boolean;
  /**
   * A fight is being played on the visit (`LevelVisit.fight`): the board is
   * the fight's until it ends, so nothing here writes. The level is drawn and
   * nothing drags, switches or paints.
   */
  readonly frozen: boolean;
  /** The part of the stage no panel covers. */
  readonly freeArea: (canvas: DOMRect) => PlaneRect;
  /** Stand a seat's token on a square; settles once the server answers. */
  readonly onMove: (seatId: CampaignCharacterId, to: BoardSquare) => Promise<unknown>;
  readonly onFog: (edit: FogEdit) => Promise<void>;
  readonly onDoor: (wallId: LevelPartId, update: Omit<BoardDoorUpdate, "requestId">) => void;
  readonly onLight: (lightId: LevelPartId, lit: boolean) => void;
  readonly onRegion: (regionId: LevelPartId, revealed: boolean) => void;
  /** Open a placed encounter, from one of its creatures on the level. */
  readonly onOpenEncounter: (encounterId: EncounterId) => void;
}

interface SeatToken extends LayerToken {
  readonly kind: "seat";
  readonly seatId: CampaignCharacterId;
}

/** A placed creature of an encounter waiting on the level: the DM's, not the table's. */
interface PlacedToken extends LayerToken {
  readonly kind: "placed";
  readonly encounterId: EncounterId;
}

type VisitToken = SeatToken | PlacedToken;

const placedId = (creature: { readonly encounterCreatureId: string; readonly ordinal: number }) =>
  `placed:${creature.encounterCreatureId}:${String(creature.ordinal)}`;

/**
 * A level visit on the stage: the runner's canvas over the visit's copy of
 * the level, built from the runner's parts (`BoardCanvas`, `LevelBackdrop`,
 * `TokenLayer`, `LevelSwitches`, the Fog brush and its dock), with nothing of
 * a fight: no order, no turn, no range. The party's tokens drag to any square
 * the DM likes (the server refuses one no token can stand on, and the token
 * goes back); the doors, lights and secret regions switch where they stand;
 * Fog paints the DM's fog, which the DM sees through.
 *
 * *Party's view* draws the level as the party sees it, so the DM watches the
 * vision move as a door opens or a token walks: the DM's whole level, read
 * through what the party sees now and has explored.
 *
 * While a fight borrows the visit (`frozen`) the board is the fight's: it is
 * drawn as the party left it and nothing on it writes, since the server would
 * refuse every write.
 */
export function VisitBoard({
  visit,
  diagonals,
  partyView,
  frozen,
  freeArea,
  onMove,
  onFog,
  onDoor,
  onLight,
  onRegion,
  onOpenEncounter,
}: VisitBoardProps) {
  const [chosen, setChosen] = useState<BoardTool>("move");
  // Frozen, only the hand: no fog brush to pick up.
  const tool = frozen ? "move" : chosen;
  const [selectedId, setSelectedId] = useState<CampaignCharacterId>();
  const { columns, rows, feetPerCell, fog, level } = visit;
  const board = useMemo(
    () => ({ columns, rows, feetPerCell, fog }),
    [columns, rows, feetPerCell, fog],
  );
  const fogTool = useFogTool({ board, on: tool === "fog", onFog });
  useEscapeAway(tool !== "move", () => setChosen("move"));

  const layout = useMemo(
    () => runLevelLayout({ columns, rows, feetPerCell }, level),
    [columns, rows, feetPerCell, level],
  );
  const sight = useMemo(
    () => (partyView ? { sees: visit.partySees, seen: visit.partySeen } : undefined),
    [partyView, visit.partySees, visit.partySeen],
  );
  const [levelDrawable, setLevelDrawable] = useState(canDrawWebGL);

  const seats = visit.tokens.map((token): SeatToken => ({
    kind: "seat",
    seatId: token.seatId,
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
  }));
  // Each placed creature drawn as the DM's hidden token, labelled by its
  // encounter's initials and numbered within it ("A1", "A2"), so the markers
  // group by encounter. One past the copy's edge has no square and is only
  // listed (the stage's *Waiting here* drawer).
  const placed = visit.encounters.flatMap((encounter) =>
    encounter.creatures
      .filter((creature) => creature.problem !== "offBoard")
      .map((creature): PlacedToken => ({
        kind: "placed",
        encounterId: encounter.id,
        id: placedId(creature),
        displayName: `${creature.name}, ${encounter.name}`,
        position: { column: creature.column, row: creature.row },
        party: false,
        portrait: undefined,
        conditions: 0,
        health: undefined,
        out: false,
        struck: false,
        hidden: true,
        spoken: creature.problem === "blocked" ? ", waiting, needs moving" : ", waiting",
      })),
  );
  const tokens: ReadonlyArray<VisitToken> = [...seats, ...placed];
  const labels = useMemo(
    () =>
      new Map<string, string>([
        ...labelsInOrder(
          visit.tokens.map((token) => ({ id: token.seatId, displayName: token.name })),
        ),
        ...labelsInOrder(
          visit.encounters.flatMap((encounter) =>
            encounter.creatures.map((creature) => ({
              id: placedId(creature),
              displayName: encounter.name,
            })),
          ),
        ),
      ]),
    [visit.tokens, visit.encounters],
  );
  const first = seats[0]?.position;
  const firstAt = first === undefined || first === null ? undefined : centreOf(first);

  return (
    <section aria-label="Level" data-slot="visit-board" className="absolute inset-0">
      <BoardCanvas
        plane={boardPlane(board)}
        cellPx={BOARD_CELL_PX}
        freeArea={freeArea}
        focus={firstAt}
        backdrop={
          levelDrawable
            ? (view) => (
                <LevelBackdrop
                  layout={layout}
                  cellPx={BOARD_CELL_PX}
                  view={view}
                  grid
                  vision={sight}
                  onFailed={() => setLevelDrawable(false)}
                />
              )
            : undefined
        }
        controls={(camera) => (
          <InStageCorner
            fallback={(children) => (
              <div className="absolute bottom-3 left-3 z-hud flex w-run-rail flex-col gap-2">
                {children}
              </div>
            )}
          >
            <div
              data-slot="run-hud-tools"
              className={cn(hudSurface, "flex min-w-0 flex-wrap items-center gap-1.5 p-1.5")}
            >
              <BoardToolPicker
                tool={tool}
                offered={VISIT_TOOLS}
                disabled={frozen}
                onTool={setChosen}
                shape="sphere"
                feet={0}
                onShape={() => undefined}
                onStep={() => undefined}
                fog={<FogActions onWhole={fogTool.whole} />}
                moveHint="Drag a party token to any square it may stand on."
              />
              <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-hairline" />
              <CameraBar
                camera={camera}
                centreLabel="Centre on the party"
                onCentre={firstAt === undefined ? undefined : () => camera.centre(firstAt)}
              />
            </div>
          </InStageCorner>
        )}
      >
        <GridBoard
          board={board}
          grid={!levelDrawable}
          className={cn("box-content", levelDrawable && "border-transparent bg-transparent")}
        >
          <PlacedOverlay visit={visit} />
          <TokenLayer
            board={board}
            tokens={tokens}
            labels={labels}
            selected={seats.find((token) => token.seatId === selectedId)}
            activeId={null}
            feetLeftOf={() => undefined}
            diagonals={diagonals}
            movable={(token) => !frozen && token.kind === "seat" && tool === "move"}
            names="all"
            fog={{ squares: fogTool.fog, veil: "dim" }}
            rangeShown={false}
            onSelect={(token) =>
              token.kind === "seat"
                ? setSelectedId(token.seatId)
                : onOpenEncounter(token.encounterId)
            }
            onTarget={undefined}
            onMove={(token, to) =>
              to === null || token.kind !== "seat" ? Promise.resolve() : onMove(token.seatId, to)
            }
          />
          {tool === "move" && (
            <LevelSwitches
              level={level}
              columns={columns}
              rows={rows}
              disabled={frozen}
              onDoor={onDoor}
              onLight={onLight}
              onRegion={onRegion}
            />
          )}
          {tool === "fog" && <FogBrush board={board} stroke={fogTool.stroke} />}
        </GridBoard>
      </BoardCanvas>
    </section>
  );
}

const percent = (fraction: number) => `${String(fraction * 100)}%`;

/**
 * Under the tokens, the DM's marks of the encounters waiting on the level:
 * each one's trigger area, tinted, and a ring on a placed creature the copy
 * cannot hold there (`problem`), so the DM sees it needs moving. Nothing here
 * is the table's: a player's read has no placement at all.
 */
function PlacedOverlay({ visit }: { readonly visit: LevelVisit }) {
  const { columns, rows } = visit;
  return (
    <div data-slot="visit-placements" aria-hidden className="pointer-events-none absolute inset-0">
      {visit.encounters.flatMap((encounter) =>
        (encounter.trigger ?? []).map((square) => (
          <span
            key={`${encounter.id}:${String(square.column)}:${String(square.row)}`}
            data-trigger={encounter.id}
            className="absolute border border-magic bg-magic-soft opacity-60"
            style={{
              left: percent(square.column / columns),
              top: percent(square.row / rows),
              width: percent(1 / columns),
              height: percent(1 / rows),
            }}
          />
        )),
      )}
      {visit.encounters.flatMap((encounter) =>
        encounter.creatures
          .filter((creature) => creature.problem === "blocked")
          .map((creature) => (
            <span
              key={placedId(creature)}
              data-needs-moving
              className="absolute rounded-full border-2 border-danger"
              style={{
                left: percent(creature.column / columns),
                top: percent(creature.row / rows),
                width: percent(1 / columns),
                height: percent(1 / rows),
              }}
            />
          )),
      )}
    </div>
  );
}
