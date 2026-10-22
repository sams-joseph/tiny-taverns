import { RegistryContext, useAtomSet } from "@effect/atom-react";
import type {
  BoardDoorUpdate,
  BoardSquare,
  CampaignCharacterId,
  CampaignId,
  LevelPartId,
  LevelVisit,
  LevelVisitId,
  SessionId,
} from "@taverns/api";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  Button,
  EmptyState,
  Icon,
  Loading,
  Toaster,
  TooltipProvider,
  cn,
  toast,
} from "@taverns/ui";
import { Effect, Result } from "effect";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { useCallback, useContext, useRef, useState } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom } from "../api/atoms";
import type { TavernsClient } from "../api/client";
import { useMutation } from "../api/mutation";
import { campaignAtom } from "../campaign/load";
import { CanvasTitle } from "../run/CanvasTitle";
import { type FogEdit, fogPayload } from "../run/fog";
import { HudIconSwitch, hudSurface } from "../run/hud";
import { RunStage } from "../run/RunStage";
import { useStage } from "../run/stage";
import { newRequestId } from "../run/state";
import { useVisitStream } from "../run/stream";
import { useFullscreen } from "../shell/slots";
import { TopBar } from "../shell/TopBar";
import { levelVisitAtom, tableVisitWrites } from "./load";
import { VisitBoard } from "./VisitBoard";
import { WaitingHere } from "./WaitingHere";

/**
 * A level visit's stage: the DM exploring the dungeon with no fight on
 * (`LevelVisit.ts`). The runner's canvas (`RunStage.tsx`) with only what a
 * visit has: the title and the way back, the switches over the table (*On the
 * table*, *Party's view*), the board (`VisitBoard.tsx`) with the encounters
 * placed on the level over it, and the *Waiting here* drawer listing them
 * (`WaitingHere.tsx`). No order, no turn, no rolls. It holds the window as the runner does (`useFullscreen`)
 * and is the second screen, with the runner, that does not scroll with it.
 *
 * Every write answers with the visit and is written straight into its atom,
 * in one line with the doorbell's re-reads, so an older answer never lands
 * over a newer one (the runner's board line, `RunScreen.tsx`). While a night
 * is open the visit's stream rings when another tab writes, and the visit is
 * read again. Below the canvas's width there is no stage, and it says so.
 */
export function VisitScreen() {
  const { campaignId, visitId } = useParams({
    from: "/_shell/campaigns/$campaignId/levels/$visitId",
  });
  const path = { campaignId, visitId };
  const atom = levelVisitAtom(path);
  const [resource, reload] = useApiAtom(atom);
  const writeVisit = useAtomSet(atom);
  const [campaign] = useApiAtom(campaignAtom(campaignId));
  const registry = useContext(RegistryContext);
  const stage = useStage();
  const [partyView, setPartyView] = useState(false);
  const navigate = useNavigate();
  const writes = useMutation();
  const tabling = useMutation();

  const visit = resource.state === "ready" ? resource.value : undefined;
  // The campaign says how a diagonal counts on the board, so the stage waits for it.
  const diagonals = campaign.state === "ready" ? campaign.value.diagonalRule : undefined;
  const onCanvas = visit !== undefined && diagonals !== undefined && stage.wide === true;
  useFullscreen(onCanvas);

  /** The visit's line: every write and every re-read, one at a time, in order. */
  const line = useRef<Promise<void>>(Promise.resolve());
  const inLine = useCallback((task: () => Promise<void>): Promise<void> => {
    const done = line.current.then(task).catch(() => undefined);
    line.current = done;
    return done;
  }, []);
  const reread = useCallback(
    () =>
      void inLine(async () => {
        reload();
        await Effect.runPromise(
          AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }),
        ).catch(() => undefined);
      }),
    [inLine, reload, registry, atom],
  );

  const night =
    campaign.state === "ready" ? (campaign.value.currentSessionId ?? undefined) : undefined;
  /** One exploring write: its answer is the visit, drawn at once; a refusal says so. */
  const explore = (
    write: (client: TavernsClient) => Effect.Effect<LevelVisit, unknown>,
    refused: string,
  ): Promise<void> =>
    inLine(async () => {
      const saved = await writes.submit(write, []).catch(() => undefined);
      if (saved !== undefined && Result.isSuccess(saved)) {
        writeVisit((current) => AsyncResult.map(current, () => saved.success));
        return;
      }
      toast.add({
        type: "destructive",
        title: refused,
        description:
          saved !== undefined && Result.isFailure(saved) && saved.failure.kind === "conflict"
            ? saved.failure.message
            : "That did not reach the server. The level shows what it holds.",
      });
    });

  const onMove = (seatId: CampaignCharacterId, to: BoardSquare) =>
    explore(
      (client) =>
        client.levelVisits.moveToken({
          params: { ...path, seatId },
          payload: { position: to, requestId: newRequestId() },
        }),
      "The token did not move",
    );
  const onFog = (edit: FogEdit) =>
    explore(
      (client) =>
        client.levelVisits.updateFog({
          params: path,
          payload: { ...fogPayload(edit), requestId: newRequestId() },
        }),
      "The fog did not change",
    );
  const onDoor = (wallId: LevelPartId, update: Omit<BoardDoorUpdate, "requestId">) =>
    void explore(
      (client) =>
        client.levelVisits.updateDoor({
          params: { ...path, wallId },
          payload: { ...update, requestId: newRequestId() },
        }),
      "The door did not change",
    );
  const onLight = (lightId: LevelPartId, lit: boolean) =>
    void explore(
      (client) =>
        client.levelVisits.updateLight({
          params: { ...path, lightId },
          payload: { lit, requestId: newRequestId() },
        }),
      lit ? "The light was not lit" : "The light was not snuffed",
    );
  const onRegion = (regionId: LevelPartId, revealed: boolean) =>
    void explore(
      (client) =>
        client.levelVisits.updateRegion({
          params: { ...path, regionId },
          payload: { revealed, requestId: newRequestId() },
        }),
      revealed ? "It was not revealed" : "It was not hidden again",
    );

  const setOnTable = (next: boolean) =>
    void inLine(async () => {
      const done = await tabling.submit(
        (client) =>
          next
            ? Effect.asVoid(
                client.levelVisits.putOnTable({ params: { campaignId }, payload: { visitId } }),
              )
            : client.levelVisits.takeOffTable({ params: { campaignId } }),
        tableVisitWrites(campaignId, [visitId]),
      );
      if (Result.isSuccess(done)) {
        writeVisit((current) => AsyncResult.map(current, (now) => ({ ...now, onTable: next })));
      }
    });

  const back = { to: "/campaigns/$campaignId/levels", params: { campaignId } } as const;
  const title = visit?.name ?? "Level";
  const subtitle = [
    campaign.state === "ready" ? campaign.value.name : undefined,
    visit === undefined ? undefined : visit.onTable ? "On the table" : "Not on the table",
  ]
    .filter((part) => part !== undefined)
    .join(" · ");

  const controls = visit !== undefined && (
    <>
      {night !== undefined && (
        <VisitDoorbell
          campaignId={campaignId}
          sessionId={night}
          visitId={visitId}
          onRing={reread}
        />
      )}
      <div className={cn(hudSurface, "flex items-center gap-0.5 p-1")}>
        <HudIconSwitch
          icon="map-pin"
          label="On the table"
          hint={visit.onTable ? "Take the level off the table" : "Put the level on the table"}
          checked={visit.onTable}
          disabled={tabling.busy}
          onCheckedChange={setOnTable}
        />
        <HudIconSwitch
          icon="eye"
          label="Party's view"
          hint="Draw the level as the party sees it"
          checked={partyView}
          disabled={false}
          onCheckedChange={setPartyView}
        />
      </div>
    </>
  );

  return (
    <TooltipProvider>
      <div data-slot="visit-screen" className={cn(onCanvas && "flex h-dvh flex-col")}>
        {stage.probe}
        {!onCanvas && <TopBar title={title} {...(subtitle === "" ? {} : { subtitle })} />}
        {resource.state === "loading" && <Loading label="Reading the level…" />}
        {resource.state === "failed" && (
          <div className="max-w-3xl">
            <ApiFailureNotice failure={resource.failure} onRetry={reload} />
          </div>
        )}
        {visit !== undefined && stage.wide === false && (
          <EmptyState icon="grid-3x3" title="The level needs a wider window">
            Explore it on a laptop or a larger screen, where the whole board fits.
            <span className="mt-3 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                nativeButton={false}
                render={<Link {...back} />}
              >
                Back to the levels
              </Button>
            </span>
          </EmptyState>
        )}
        {onCanvas && visit !== undefined && diagonals !== undefined && (
          <div className="flex min-h-0 flex-1 flex-col">
            <RunStage
              title={<CanvasTitle back={back} title={title} subtitle={subtitle} />}
              controls={controls}
              notices={null}
              rolling={null}
              party={null}
              turn={null}
              banner={undefined}
              drawers={[
                {
                  key: "waiting",
                  label: "Waiting here",
                  icon: "swords",
                  badge: visit.encounters.length === 0 ? undefined : visit.encounters.length,
                  content: <WaitingHere campaignId={campaignId} encounters={visit.encounters} />,
                },
              ]}
              rolls={null}
              board={(freeArea) => (
                <VisitBoard
                  visit={visit}
                  diagonals={diagonals}
                  partyView={partyView}
                  freeArea={freeArea}
                  onMove={onMove}
                  onFog={onFog}
                  onDoor={onDoor}
                  onLight={onLight}
                  onRegion={onRegion}
                  onOpenEncounter={(encounterId) =>
                    void navigate({
                      to: "/campaigns/$campaignId/encounters/$encounterId",
                      params: { campaignId, encounterId },
                      hash: "placement",
                    })
                  }
                />
              )}
            />
          </div>
        )}
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

/**
 * The visit's doorbell on the open night (`useVisitStream`): every line of
 * the visit, this tab's or another's, re-reads it. Says so only while it is
 * not listening.
 */
function VisitDoorbell({
  campaignId,
  sessionId,
  visitId,
  onRing,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly visitId: LevelVisitId;
  readonly onRing: () => void;
}) {
  const connection = useVisitStream({
    campaignId,
    sessionId,
    visitId,
    enabled: true,
    onEvent: onRing,
    onReconnected: onRing,
  });
  if (connection.status === "live" || connection.status === "connecting") return null;
  return (
    <Button variant="outline" size="sm" onClick={connection.reconnect}>
      <Icon name="octagon-x" size={13} />
      {connection.status === "stopped" ? "Not listening" : "Reconnecting…"}
    </Button>
  );
}
