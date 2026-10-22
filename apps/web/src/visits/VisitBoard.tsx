import {
  BOARD_CELL_PX,
  type BoardDoorUpdate,
  type BoardSquare,
  type CampaignCharacterId,
  type DiagonalRule,
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
  /** The part of the stage no panel covers. */
  readonly freeArea: (canvas: DOMRect) => PlaneRect;
  /** Stand a seat's token on a square; settles once the server answers. */
  readonly onMove: (seatId: CampaignCharacterId, to: BoardSquare) => Promise<unknown>;
  readonly onFog: (edit: FogEdit) => Promise<void>;
  readonly onDoor: (wallId: LevelPartId, update: Omit<BoardDoorUpdate, "requestId">) => void;
  readonly onLight: (lightId: LevelPartId, lit: boolean) => void;
  readonly onRegion: (regionId: LevelPartId, revealed: boolean) => void;
}

interface SeatToken extends LayerToken {
  readonly seatId: CampaignCharacterId;
}

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
 */
export function VisitBoard({
  visit,
  diagonals,
  partyView,
  freeArea,
  onMove,
  onFog,
  onDoor,
  onLight,
  onRegion,
}: VisitBoardProps) {
  const [chosen, setChosen] = useState<BoardTool>("move");
  const tool = chosen;
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

  const tokens = visit.tokens.map((token): SeatToken => ({
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
  const labels = useMemo(
    () =>
      labelsInOrder(visit.tokens.map((token) => ({ id: token.seatId, displayName: token.name }))),
    [visit.tokens],
  );
  const first = tokens[0]?.position;
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
                disabled={false}
                onTool={setChosen}
                shape="sphere"
                feet={0}
                onShape={() => undefined}
                onStep={() => undefined}
                fog={<FogActions onWhole={fogTool.whole} />}
              />
              <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-hairline" />
              <CameraBar
                camera={camera}
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
          <TokenLayer
            board={board}
            tokens={tokens}
            labels={labels}
            selected={tokens.find((token) => token.seatId === selectedId)}
            activeId={null}
            feetLeftOf={() => undefined}
            diagonals={diagonals}
            movable={() => tool === "move"}
            names="all"
            fog={{ squares: fogTool.fog, veil: "dim" }}
            rangeShown={false}
            onSelect={(token) => setSelectedId(token.seatId)}
            onTarget={undefined}
            onMove={(token, to) => (to === null ? Promise.resolve() : onMove(token.seatId, to))}
          />
          {tool === "move" && (
            <LevelSwitches
              level={level}
              columns={columns}
              rows={rows}
              disabled={false}
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
