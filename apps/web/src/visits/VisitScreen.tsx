import { RegistryContext, useAtomSet } from "@effect/atom-react";
import type {
  BoardDoorUpdate,
  BoardSquare,
  CampaignCharacterId,
  CampaignId,
  EncounterId,
  LevelPartId,
  LevelVisit,
  LevelVisitEncounter,
  LevelVisitFight,
  LevelVisitId,
  SessionEvent,
  SessionId,
} from "@taverns/api";
import { VisitEncounterNoticedPayload } from "@taverns/api";
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
import { Effect, Option, Result, Schema } from "effect";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { useCallback, useContext, useRef, useState } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom } from "../api/atoms";
import type { TavernsClient } from "../api/client";
import { useMutation } from "../api/mutation";
import { useCampaignAct } from "../campaign/act";
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
 *
 * While a fight holds the visit (`LevelVisit.fight`), live or carried, the
 * stage is the dungeon as the fight found it, read-only, under a banner that
 * goes to the fight; the fight's start, carry and end are lines on the
 * visit's stream, so the stage turns on its own.
 *
 * **The prompt.** When the party comes to notice an encounter placed here
 * (`LevelVisitEncounter.noticed`), the stage asks over the board whether to
 * start it (`NoticedPrompt`): *Start* opens the campaign's ordinary start
 * flow with it picked (`useCampaignAct`), where the DM still confirms, and
 * *Not yet* only closes the prompt. Which encounters were answered is this
 * tab's alone and never stored: an encounter noticed when the stage loads
 * asks once, and its `visit-encounter-noticed` line, logged as the party
 * notices it afresh, asks again. The *Waiting here* drawer keeps it marked
 * *In sight* with a *Start* of its own, so nothing is lost by *Not yet*.
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
  const { run: startEncounter, dialogs } = useCampaignAct(campaignId);
  /** The noticed encounters this tab has answered, *Start* or *Not yet*. */
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const answer = (encounterId: EncounterId) => setAnswered((was) => new Set([...was, encounterId]));

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
  /** A line of the visit's: read it again, and an encounter noticed afresh asks again. */
  const onLine = useCallback(
    (event?: SessionEvent) => {
      const noticed =
        event?.kind === "visit-encounter-noticed" ? decodeNoticed(event.payload) : undefined;
      if (noticed !== undefined) {
        setAnswered((was) => {
          if (!was.has(noticed.encounterId)) return was;
          const next = new Set(was);
          next.delete(noticed.encounterId);
          return next;
        });
      }
      reread();
    },
    [reread],
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
  /** The fight borrowing the visit, while one is on: the dungeon is its until it ends. */
  const fight = visit?.fight ?? null;
  /** The first noticed encounter this tab has not answered, while no fight holds the visit. */
  const asking =
    visit === undefined || fight !== null
      ? undefined
      : visit.encounters.find((encounter) => encounter.noticed && !answered.has(encounter.id));
  const start = (encounterId: EncounterId) => {
    answer(encounterId);
    startEncounter(encounterId);
  };
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
          onRing={onLine}
        />
      )}
      <div className={cn(hudSurface, "flex items-center gap-0.5 p-1")}>
        <HudIconSwitch
          icon="map-pin"
          label="On the table"
          hint={visit.onTable ? "Take the level off the table" : "Put the level on the table"}
          checked={visit.onTable}
          disabled={tabling.busy || fight !== null}
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
              notices={
                asking === undefined ? null : (
                  <NoticedPrompt
                    encounter={asking}
                    onStart={() => start(asking.id)}
                    onLater={() => answer(asking.id)}
                  />
                )
              }
              rolling={null}
              party={null}
              turn={null}
              banner={
                fight === null ? undefined : <FightBanner campaignId={campaignId} fight={fight} />
              }
              drawers={[
                {
                  key: "waiting",
                  label: "Waiting here",
                  icon: "swords",
                  badge: visit.encounters.length === 0 ? undefined : visit.encounters.length,
                  content: (
                    <WaitingHere
                      campaignId={campaignId}
                      encounters={visit.encounters}
                      onStart={fight === null ? start : undefined}
                    />
                  ),
                },
              ]}
              rolls={null}
              board={(freeArea) => (
                <VisitBoard
                  visit={visit}
                  diagonals={diagonals}
                  partyView={partyView}
                  frozen={fight !== null}
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
      {dialogs}
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
  readonly onRing: (event?: SessionEvent) => void;
}) {
  const connection = useVisitStream({
    campaignId,
    sessionId,
    visitId,
    enabled: true,
    onEvent: onRing,
    onReconnected: () => onRing(),
  });
  if (connection.status === "live" || connection.status === "connecting") return null;
  return (
    <Button variant="outline" size="sm" onClick={connection.reconnect}>
      <Icon name="octagon-x" size={13} />
      {connection.status === "stopped" ? "Not listening" : "Reconnecting…"}
    </Button>
  );
}

const decodeNoticed = (payload: unknown) =>
  Option.getOrUndefined(Schema.decodeUnknownOption(VisitEncounterNoticedPayload)(payload));

/**
 * The party has noticed an encounter placed here: start it, or not yet. Over
 * the board, under the top row, as the runner's notices are; the board stays
 * the DM's while it asks.
 */
function NoticedPrompt({
  encounter,
  onStart,
  onLater,
}: {
  readonly encounter: LevelVisitEncounter;
  readonly onStart: () => void;
  readonly onLater: () => void;
}) {
  return (
    <section
      aria-label={`${encounter.name} is in sight`}
      data-slot="visit-noticed"
      className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-card border border-danger bg-surface-raised py-2 pr-2 pl-3.5 shadow-3"
    >
      <Icon name="eye" size={16} className="shrink-0 text-danger" />
      <span className="min-w-0 flex-1 text-label leading-snug font-medium text-heading">
        {encounter.name} — the party has seen them. Start it?
      </span>
      <span className="flex items-center gap-1.5">
        <Button size="sm" onClick={onStart}>
          Start
        </Button>
        <Button variant="secondary" size="sm" onClick={onLater}>
          Not yet
        </Button>
      </span>
    </section>
  );
}

/**
 * Over a visit a fight holds: the fight's name and the way to it. The board
 * under it is read-only until the fight resolves and hands the dungeon back;
 * a carried one is picked up from the campaign's encounters, so it says so.
 */
function FightBanner({
  campaignId,
  fight,
}: {
  readonly campaignId: CampaignId;
  readonly fight: LevelVisitFight;
}) {
  return (
    <div
      role="status"
      data-slot="visit-fight-banner"
      className="pointer-events-auto flex items-center gap-3 rounded-card border border-danger bg-surface-raised py-1.5 pr-1.5 pl-3.5 shadow-3"
    >
      <Icon name="swords" size={16} className="shrink-0 text-danger" />
      <span className="min-w-0 text-label leading-snug font-medium text-heading">
        {fight.carried
          ? `${fight.name} was carried over. The level is the fight's until you pick it up and it ends.`
          : `${fight.name} is being played here. The level is the fight's until it ends.`}
      </span>
      <Button
        variant="secondary"
        size="sm"
        nativeButton={false}
        render={
          <Link
            to="/campaigns/$campaignId/sessions/$sessionId/runs/$runId"
            params={{ campaignId, sessionId: fight.sessionId, runId: fight.runId }}
          />
        }
      >
        Go to the fight
      </Button>
    </div>
  );
}
