import type {
  BoardArea,
  BoardDoorUpdate,
  BoardSquare,
  CampaignId,
  Combatant,
  CombatantId,
  DeathSaves,
  EncounterRun,
  EncounterRunBoard,
  EncounterRunUpdate,
  HobDirectResourceUpdate,
  LevelPartId,
  LevelVisitId,
  Npc,
  NpcSessionMonitor,
  Roll,
  SessionEvent,
  Visibility,
} from "@taverns/api";
import {
  attackLands,
  attackModeAt,
  combineModes,
  coveredAc,
  coverLine,
  type LevelCover,
  rollFace,
  saveModifier,
  sightMode,
  walkingFeet,
} from "@taverns/api";
import { Link, useNavigate, useParams, type LinkProps } from "@tanstack/react-router";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  Label,
  Switch,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Toaster,
  TooltipProvider,
  toast,
  SectionHeading,
  Loading,
  cn,
} from "@taverns/ui";
import { RegistryContext, useAtomSet } from "@effect/atom-react";
import { Effect, Result } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { levelVisitAtom, levelVisitsAtom } from "../visits/load";
import type { TavernsClient } from "../api/client";
import { useMutation } from "../api/mutation";
import { reads } from "../api/keys";
import { useFullscreen, useShowHob } from "../shell/slots";
import { TopBar } from "../shell/TopBar";
import { HudIconButton, HudIconSwitch, StageDrawerButton, hudSurface } from "./hud";
import { HOB_DRAWER, INITIATIVE_DRAWER, SHEET_DRAWER, type StageDrawer } from "./stageDrawers";
import { TargetFrame } from "./TargetFrame";
import { SaveFailure } from "../ui/form";
import { sessionNpcProposalSummaryAtom } from "../cast/load";
import { campaignAtom, partyAtom } from "../campaign/load";
import { readAhead } from "../api/readAhead";
import { actionDetail, actionsOf, type ActionLine } from "./actions";
import { sensesOfSource, sightBetween, sightLines } from "./levelRules";
import {
  attackThrows,
  concentrationSave,
  concentrationThrow,
  resolveAttack,
  attacks,
  rollActionThrows,
  rolls,
  type AttackOutcome,
} from "./attack";
import { AttackResultCard, TargetBanner } from "./AttackResult";
import { CombatantDialog, RemoveCombatantDialog } from "./CombatantDialog";
import { CanvasTitle } from "./CanvasTitle";
import { CombatantPanel, DeathSaveBlock } from "./CombatantPanel";
import { autopilotDriverId, useAutopilot } from "../hob/autopilot";
import { useHobAvailable } from "../hob/fightTurn";
import { AutopilotBar } from "./AutopilotBar";
import { isWorking, type PilotCreature, type PilotFight } from "./autopilotLoop";
import { HobTurnCard, HobTurnCardView } from "./HobTurnCard";
import { isDmRoll, useDmDice } from "./dice";
import { EndRunDialog } from "./EndRunDialog";
import { useEscapeAway } from "./escape";
import { type FogEdit, fogPayload } from "./fog";
import { InitiativePhase } from "./InitiativePhase";
import { InitiativeStrip } from "./InitiativeStrip";
import { RunBoardCard } from "./RunBoardCard";
import type { RunBoardProps } from "./runBoard";
import { RunLayout } from "./RunLayout";
import { RunBoardStage, RunStage } from "./RunStage";
import { stageKey } from "./stageHandoff";
import { useStage } from "./stage";
import { runSceneAtom, sceneBadge, sceneNoun, sceneUpLine } from "./scene";
import { SceneRunner } from "./SceneRunner";
import {
  boardFogWrites,
  boardAreaWrites,
  boardLevelWrites,
  combatantVisibilityWrites,
  combatantWrites,
  deathSaveWrites,
  hasBoard,
  rollsAtom,
  runBoardAtom,
  runViewAtom,
  outOfTheFight,
  rollingLine,
  subtitleOf,
  upLine,
  type RunPath,
} from "./load";
import { PartyRail } from "./PartyRail";
import { RollsDock } from "./RollsDock";
import { TurnCard, type TurnTile } from "./TurnCard";
import { dockLines } from "./rollsLog";
import { actsOf, actsOfRolls } from "./effects";
import { SessionLog } from "./SessionLog";
import { newRequestId, useRunState } from "./state";
import { useLiveStream } from "./stream";
import { tokenLabels } from "./tokens";
import {
  areaFor,
  bandOfLine,
  deliveryFor,
  longRangeFor,
  momentsOf,
  multiattacksOf,
  type MultiattackRun,
  outOfRangeFor,
  rangeOptionsFor,
  runOptionsFor,
  type RunOptionsSource,
} from "./options";
import { patchFor, resourceRows, useResources } from "./resources";
import { feetLeft, isUp, useTurnTicks } from "./turn";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * The encounter runner — the runner redesign's fight (`Campaign Overview.dc.html`),
 * against the real API and a real stream: a framed header with the round and
 * who is up, then initiative, the battle map, the selected creature's card
 * (where whoever is up attacks, `attack.ts`) and the *Rolls* dock, which
 * merges the DM's own dice with the players' tray and the night's log
 * (`RollsDock.tsx`). At a desktop width the board is a canvas filling the
 * whole window, the header and the rest floating over it (`RunStage.tsx`,
 * from `Encounter Runner.dc.html`); narrower, or with no board, the cards are
 * the window-scrolling grid of `RunLayout.tsx`. Everything the drawings leave
 * out that the runner already did — adding and editing combatants, *Make it
 * their turn*, Hob's spends and their undo, NPCs at the table — stays, under
 * the drawn cards (the captain's call of 2026-09-25).
 *
 * **A run that is not a fight is run as its kind** (`EncounterRun.mode`): a
 * conversation, a skill challenge or a hazard takes no turns, so its body is
 * `SceneRunner.tsx` rather than the initiative list, and its header carries the
 * kind and the scene's progress instead of the round.
 *
 * This is the screen a DM keeps open while people wait, so three things are
 * arranged differently to every other screen in the app:
 *
 * **The route carries all three ids**, so a reload mid-fight lands back in the
 * fight. Nothing is kept in local storage and nothing has to be looked up.
 *
 * **The initial load and the live updates are separate, and the split is where
 * the atoms are cut.** `runFrameAtom` reads the campaign, the night and the
 * bestiary once; `liveStateAtom` is the fight, and is the only thing the
 * doorbell re-reads — which is why a hit costs the live slice and not the
 * campaign frame.
 * `runViewAtom` derives this screen's one value from both, and never puts the
 * screen back into "Loading…": an initiative list that blinks away every time a
 * goblin takes a hit would be unusable, and a failed *re*-read leaves the last
 * good list on screen with a line saying it may be behind. See `run/load.ts`.
 *
 * **Writes do not wait for the stream.** Every mutation here uses its own
 * answer to update the screen — the damage response, the run `nextTurn`
 * returns, the run the share switch returns. The stream is what keeps a
 * *second* tab honest and what catches up after a drop; it is not the only way
 * this tab learns what it just did. That is why the screen still works with the
 * connection down, which is the state it has to survive.
 */

/**
 * How much of the log the panel keeps.
 *
 * The stream replays this run's whole log on a fresh connection, which for a
 * long fight is hundreds of rows. The DM wants the last handful; keeping more
 * would be a list nobody scrolls holding memory all night.
 */
const LOG_KEPT = 40;

/** No rolls read yet: one value, so the DM's dice do not see a new list every render. */
const NO_ROLLS: ReadonlyArray<Roll> = [];

/** A row the DM typed in has no ability cells to read a save off. */
const NO_ABILITIES = { abilities: [] };

const runNpcsAtom = Atom.family((path: RunPath) =>
  apiAtom(
    (client) => client.npcs.list({ params: { campaignId: path.campaignId }, query: {} }),
    [reads.npcs(path.campaignId), reads.sessionNpcs(path.sessionId)],
  ),
);

const sessionNpcMonitorAtom = Atom.family((path: RunPath) =>
  apiAtom(
    (client) =>
      client.npcs.sessionMonitor({
        params: { campaignId: path.campaignId, sessionId: path.sessionId },
      }),
    [reads.sessionNpcs(path.sessionId)],
  ),
);

const rollFaces = (roll: Roll): string => {
  const faces = roll.dice.join(", ");
  const kept = roll.kept.length === roll.dice.length ? undefined : `kept ${roll.kept.join(", ")}`;
  return [roll.notation, `dice ${faces}`, kept, roll.mode].filter(Boolean).join(" · ");
};

const rollByline = (roll: Roll): string =>
  [roll.accountName, roll.characterName].filter((part) => part !== null && part !== "").join(" · ");

function SessionNpcProposalWatch({
  path,
  refreshToken,
}: {
  readonly path: RunPath;
  readonly refreshToken: number;
}) {
  const [resource, reload] = useApiAtom(sessionNpcProposalSummaryAtom(path));
  const lastTotal = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (refreshToken > 0) reload();
  }, [refreshToken, reload]);

  const rows = resource.state === "ready" ? resource.value : [];
  const pending = rows.reduce((total, row) => total + row.pendingProposals, 0);

  useEffect(() => {
    if (resource.state !== "ready") return;
    const before = lastTotal.current;
    lastTotal.current = pending;
    if (before !== undefined && pending > before) {
      toast.add({
        type: "magic",
        title: "NPC proposal waiting",
        description: "Review it from the Cast NPC's Proposals tab after the table settles.",
      });
    }
  }, [pending, resource.state]);

  if (resource.state !== "ready" || pending === 0) return null;

  return (
    <section className="rounded-card border border-accent/40 bg-accent-soft p-card text-accent-ink">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon name="sparkles" size={15} />
          <SectionHeading as="h3" size="title">
            NPC proposals waiting
          </SectionHeading>
        </div>
        <p className="text-body-s leading-body">
          {pending} {pending === 1 ? "proposal needs" : "proposals need"} creator review. Nothing
          has been written to the campaign yet.
        </p>
        <div className="flex flex-wrap gap-2">
          {rows
            .filter((row) => row.pendingProposals > 0)
            .map((row) => (
              <Button
                key={row.npc.id}
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    to="/campaigns/$campaignId/cast/$npcId"
                    params={{ campaignId: path.campaignId, npcId: row.npc.id }}
                    hash="proposals"
                  />
                }
              >
                {row.npc.name} · {row.pendingProposals} pending
              </Button>
            ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The NPCs the players can talk to in the table's shared chat (their side
 * calls it *Open at the table*): who is in it, a way to bring another in, and
 * for the one opened here its transcript with pause and close. The card is
 * absent while the campaign has no player-facing NPC and none was brought in,
 * which is most fights.
 */
function TableNpcsCard({
  path,
  refreshToken,
  titled = true,
}: {
  readonly path: RunPath;
  readonly refreshToken: number;
  /** `false` in the canvas's drawer, which titles it and is its surface. */
  readonly titled?: boolean;
}) {
  const [npcs, reloadNpcs] = useApiAtom(runNpcsAtom(path));
  const [monitor, reload] = useApiAtom(sessionNpcMonitorAtom(path));
  const { failure, submit, busy } = useMutation();
  const [openId, setOpenId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (refreshToken > 0) reload();
  }, [refreshToken, reload]);

  if (npcs.state === "failed")
    return <ApiFailureNotice failure={npcs.failure} onRetry={reloadNpcs} />;
  if (monitor.state === "failed")
    return <ApiFailureNotice failure={monitor.failure} onRetry={reload} />;
  if (npcs.state !== "ready" || monitor.state !== "ready") return null;

  const rows = monitor.value;
  const inScene = new Set(
    rows.filter((row) => row.thread.sessionState !== "closed").map((row) => row.npc.id),
  );
  const choosable = npcs.value.filter(
    (npc: Npc) => npc.visibility === "shared" && !inScene.has(npc.id),
  );
  if (rows.length === 0 && choosable.length === 0) return null;

  const bringIn = (npc: Npc) => {
    void submit(
      (client) =>
        client.npcs.openSession({
          params: { campaignId: path.campaignId, sessionId: path.sessionId, npcId: npc.id },
          payload: {},
        }),
      [reads.sessionNpcs(path.sessionId)],
    ).then((result) => {
      if (Result.isSuccess(result)) setOpenId(npc.id);
    });
  };
  const control = (row: NpcSessionMonitor, action: "pause" | "resume" | "close", label: string) => {
    void submit(
      (client) => {
        const params = {
          campaignId: path.campaignId,
          sessionId: path.sessionId,
          npcId: row.npc.id,
        };
        if (action === "pause") return client.npcs.pauseSession({ params, payload: {} });
        if (action === "resume") return client.npcs.resumeSession({ params, payload: {} });
        return client.npcs.closeSession({ params, payload: {} });
      },
      [reads.sessionNpcs(path.sessionId)],
    ).then((result) => {
      if (Result.isSuccess(result)) {
        reload();
        toast.add({ type: "success", title: label, description: `${row.npc.name} updated.` });
      }
    });
  };

  return (
    <section
      aria-label="NPCs at the table"
      className={cn(
        titled
          ? "rounded-card border border-hairline bg-surface-card shadow-1"
          : "-mx-card -mt-card",
      )}
    >
      <div className="flex items-start gap-2 px-panel py-3">
        <div className="min-w-0 flex-1">
          {titled && (
            <SectionHeading as="h3" size="title">
              NPCs at the table
            </SectionHeading>
          )}
          <p className="text-caption leading-snug text-muted-foreground">
            Players talk to these NPCs in the table chat.
          </p>
        </div>
        {choosable.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={busy} />}>
              <Icon name="plus" size={13} />
              Bring in
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {choosable.map((npc) => (
                <DropdownMenuItem key={npc.id} onClick={() => bringIn(npc)}>
                  {npc.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {rows.length > 0 && (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {rows.map((row) => {
            const expanded = openId === row.npc.id;
            return (
              <li key={row.thread.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpenId(expanded ? undefined : row.npc.id)}
                  className="flex w-full items-center gap-2 px-panel py-2.5 text-left hover:bg-surface-raised"
                >
                  <Icon
                    name={expanded ? "chevron-down" : "chevron-right"}
                    size={13}
                    className="text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate text-body-s font-semibold text-heading">
                    {row.npc.name}
                  </span>
                  {row.pendingProposals > 0 && (
                    <Badge variant="magic">{row.pendingProposals} to review</Badge>
                  )}
                  <Badge variant={badgeForSessionState(row.thread.sessionState)}>
                    {row.thread.sessionState}
                  </Badge>
                </button>
                {expanded && (
                  <SessionNpcMonitorDetail
                    row={row}
                    busy={busy}
                    onPause={() => control(row, "pause", "NPC conversation paused")}
                    onResume={() => control(row, "resume", "NPC conversation resumed")}
                    onClose={() => control(row, "close", "NPC conversation closed")}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {failure !== undefined && (
        <div className="border-t border-hairline px-panel py-3">
          <SaveFailure failure={failure} />
        </div>
      )}
    </section>
  );
}

function badgeForSessionState(
  state: NpcSessionMonitor["thread"]["sessionState"],
): "default" | "secondary" | "outline" {
  return state === "open" ? "default" : state === "paused" ? "secondary" : "outline";
}

function SessionNpcMonitorDetail({
  row,
  busy,
  onPause,
  onResume,
  onClose,
}: {
  readonly row: NpcSessionMonitor;
  readonly busy: boolean;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onClose: () => void;
}) {
  const state = row.thread.sessionState;
  return (
    <div className="space-y-3 px-panel pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-caption leading-snug text-muted-foreground">
          {row.npc.role || "Cast NPC"} · {row.model ?? "no model configured"}
          {row.available ? "" : " · unavailable"}
          {row.lastFailure === null ? "" : ` · ${row.lastFailure}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {state === "open" ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={onPause}>
              Pause
            </Button>
          ) : state === "paused" ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={onResume}>
              Resume
            </Button>
          ) : null}
          {state !== "closed" && (
            <Button size="sm" variant="destructive" disabled={busy} onClick={onClose}>
              Close
            </Button>
          )}
          {row.pendingProposals > 0 && (
            <Button
              size="sm"
              variant="ghost"
              nativeButton={false}
              render={
                <Link
                  to="/campaigns/$campaignId/cast/$npcId"
                  params={{ campaignId: row.npc.campaignId, npcId: row.npc.id }}
                  hash="proposals"
                />
              }
            >
              Review proposals
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-2 rounded-control border border-hairline bg-surface-sunken p-2">
        {row.turns.length === 0 ? (
          <p className="text-caption leading-body text-muted-foreground">
            No one has spoken to {row.npc.name} yet.
          </p>
        ) : (
          row.turns.map((turn) => (
            <div key={turn.id} className="rounded-control bg-surface-card px-2.5 py-2">
              <p className="text-micro leading-snug tracking-caps uppercase text-faint">
                {turn.who === "npc" ? row.npc.name : turn.speakerName || "Table participant"}
              </p>
              <p className="mt-1 text-body-s leading-body whitespace-pre-wrap text-foreground">
                {turn.text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** A scene's tray shows the players' newest dozen; the night's list reads as many as the dock keeps. */
const TRAY_SHOWN = 12;

function DiceTray({
  rolls,
  status,
}: {
  readonly rolls: ReadonlyArray<Roll>;
  readonly status: string;
}) {
  return (
    <section
      className="rounded-card border border-hairline bg-surface-card shadow-1"
      aria-label="Dice tray"
    >
      <div className="flex items-center gap-2 border-b border-hairline px-card py-2.5">
        <SectionHeading size="label" className="flex-1">
          Dice tray
        </SectionHeading>
        <Badge variant={status === "live" ? "success" : "outline"}>{status}</Badge>
      </div>
      <div className="space-y-2 p-card">
        {rolls.length === 0 ? (
          <p className="text-caption leading-body text-muted-foreground">
            No table rolls yet. Sheet rolls appear here once a player sends them during this
            session.
          </p>
        ) : (
          <ol className="space-y-2" aria-label="Dice tray rolls">
            {rolls.map((roll) => (
              <li
                key={roll.id}
                className="rounded-control border border-hairline bg-surface-sunken px-2.5 py-2"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-s leading-snug font-semibold text-heading">
                      {roll.label}
                    </p>
                    <p className="mt-0.5 truncate text-caption leading-snug text-muted-foreground">
                      {rollByline(roll)}
                    </p>
                    <p className="mt-0.5 font-mono text-micro leading-snug text-muted-foreground">
                      {rollFaces(roll)}
                    </p>
                  </div>
                  <span className="font-display text-title leading-none font-semibold text-accent-ink">
                    {roll.total}
                  </span>
                </div>
                {roll.critical !== null && (
                  <Badge
                    className="mt-2"
                    variant={roll.critical === "hit" ? "success" : "destructive"}
                  >
                    critical {roll.critical === "hit" ? "20" : "1"}
                  </Badge>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/**
 * Every spend Hob made without asking in this fight, each with its undo. The
 * switch that allows it is in the runner's controls (`HobSpendsSwitch`); the
 * card is absent until there is a spend to list.
 */
function HobSpendsCard({
  updates,
  busy,
  onUndo,
}: {
  readonly updates: ReadonlyArray<HobDirectResourceUpdate>;
  readonly busy: boolean;
  readonly onUndo: (update: HobDirectResourceUpdate) => void;
}) {
  if (updates.length === 0) return null;
  return (
    <section
      aria-label="Hob's direct spends"
      className="rounded-card border border-hairline bg-surface-card shadow-1"
    >
      <div className="flex items-center gap-2 px-panel py-3">
        <Icon name="sparkles" size={13} className="text-magic-ink" />
        <SectionHeading as="h3" size="title" className="flex-1">
          Spent by Hob
        </SectionHeading>
      </div>
      <div className="divide-y divide-hairline border-t border-hairline">
        {updates.map((update) => {
          const spent = update.afterUsed - update.beforeUsed;
          const left = update.resourceMax - update.afterUsed;
          return (
            <article
              key={update.id}
              className="flex items-start justify-between gap-3 px-panel py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-body-s font-semibold leading-body text-foreground">
                  {update.characterName} spent {spent} {update.resourceName}
                </p>
                <p className="text-caption leading-body text-muted-foreground">
                  {left} of {update.resourceMax} left
                  {update.undoneAt === null ? "" : " · undone"}
                </p>
              </div>
              {update.undoneAt === null && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onUndo(update)}
                  aria-label={`Undo ${update.resourceName} for ${update.characterName}`}
                >
                  <Icon name="refresh-cw" size={13} />
                  Undo
                </Button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** One of Hob's switches, with what it does in a line under it. */
type HobSwitch = {
  readonly on: boolean;
  readonly busy: boolean;
  readonly onChange: (on: boolean) => void;
};

/**
 * Hob's two switches over this fight, each with a line saying what it does:
 * the autopilot, which plays the monsters' turns, and whether Hob may mark a
 * character's resources spent without a proposal (`docs/internals/hob.md`).
 * Each is offered only with a model behind Hob, and once on can always be
 * turned off. The header's *Hob* popover and the canvas's Hob drawer list the
 * same rows.
 */
function HobSwitchRows({
  autopilot,
  spends,
}: {
  readonly autopilot: HobSwitch | undefined;
  readonly spends: HobSwitch | undefined;
}) {
  const row = (id: string, label: string, line: string, value: HobSwitch) => (
    <div className="flex items-start gap-3 rounded-control px-2 py-2">
      <div className="min-w-0 flex-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-0.5 text-caption leading-snug text-muted-foreground">{line}</p>
      </div>
      <Switch
        id={id}
        checked={value.on}
        disabled={value.busy}
        onCheckedChange={(next) => value.onChange(next)}
      />
    </div>
  );
  return (
    <>
      {autopilot !== undefined &&
        row(
          "run-hob-autopilot",
          "Autopilot",
          "Hob plays the monsters' turns on its own, one after another, until you stop it.",
          autopilot,
        )}
      {spends !== undefined &&
        row(
          "run-hob-direct-writes",
          "Hob spends",
          "Hob marks spell slots and other uses spent without asking you first. Each spend is listed with an undo.",
          spends,
        )}
    </>
  );
}

/** How many of Hob's switches are on: the count its button wears. */
const hobOn = (...switches: ReadonlyArray<HobSwitch | undefined>): number =>
  switches.filter((one) => one?.on === true).length;

/**
 * The header's *Hob* button: the switches behind one button, so the controls
 * stay narrow enough to leave the title its room. With neither on offer there
 * is no button.
 */
function HobSwitches({
  autopilot,
  spends,
}: {
  readonly autopilot: HobSwitch | undefined;
  readonly spends: HobSwitch | undefined;
}) {
  if (autopilot === undefined && spends === undefined) return null;
  const on = hobOn(autopilot, spends);
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" aria-label="Hob settings" />}>
        <Icon name="sparkles" size={13} className="text-magic-ink" />
        Hob
        {on > 0 && <Badge variant="magic">{on} on</Badge>}
        <Icon name="chevron-down" size={13} />
      </PopoverTrigger>
      {/* On the card surface: the switch's off track is the raised one's colour. */}
      <PopoverContent align="end" className="w-72 bg-surface-card">
        <HobSwitchRows autopilot={autopilot} spends={spends} />
      </PopoverContent>
    </Popover>
  );
}

export function RunScreen() {
  const { campaignId, sessionId, runId } = useParams({
    from: "/_shell/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
  });
  const path = useMemo<RunPath>(
    () => ({ campaignId, sessionId, runId }),
    [campaignId, sessionId, runId],
  );

  const [resource, reload] = useApiAtom(runViewAtom(path));
  const [rollsResource, reloadRolls] = useApiAtom(rollsAtom(path));
  const [boardResource, reloadBoard] = useApiAtom(runBoardAtom(path));
  const writeBoard = useAtomSet(runBoardAtom(path));
  const registry = useContext(RegistryContext);
  /**
   * The board's line: the Fog and Area tools' writes and the doorbell's
   * re-reads of the board go through it one at a time, in the order they were
   * asked for. So answers land in the order the server applied them, and a
   * re-read never lands an older board over a stroke or a pin this tab wrote
   * after it was asked for. A task that fails leaves the line open for the next.
   */
  const boardLine = useRef<Promise<void>>(Promise.resolve());
  const inBoardLine = useCallback((task: () => Promise<void>): Promise<void> => {
    const done = boardLine.current.then(task).catch(() => undefined);
    boardLine.current = done;
    return done;
  }, []);
  const rereadBoard = useCallback(
    () =>
      void inBoardLine(async () => {
        reloadBoard();
        await Effect.runPromise(
          AtomRegistry.getResult(registry, runBoardAtom(path), { suspendOnWaiting: true }),
        );
      }),
    [inBoardLine, reloadBoard, registry, path],
  );
  // The party's sheets, for a character's speed on the board. A miss is no
  // range, never a guessed one.
  const [partyResource] = useApiAtom(partyAtom(campaignId));
  const stage = useStage();
  const view = resource.state === "ready" ? resource.value : undefined;
  // The night's rolls: the DM's own, which their dice file and read back
  // (`dice.ts`), and the players' tray.
  const nightRolls = rollsResource.state === "ready" ? rollsResource.value : NO_ROLLS;
  const trayRolls = useMemo(() => nightRolls.filter((roll) => !isDmRoll(roll)), [nightRolls]);

  // The fight's own half, from the same atom the value above is built on — so
  // the rows the screen renders and the rows the controller writes into cannot
  // be two different answers.
  const controller = useRunState(path);
  const state = controller.state;
  // The server files a DM roll under the campaign's current night and its
  // active run, so the dice are out only on that run: not on an ended one, and
  // not on a past night's log.
  const dice = useDmDice(
    path,
    nightRolls,
    view !== undefined &&
      state !== undefined &&
      state.run.endedAt === null &&
      view.campaign.currentSessionId === sessionId &&
      view.session.activeEncounterRunId === runId,
  );
  // The *This turn* toggles, and `spendAction`, which an attack calls.
  const turnTicks = useTurnTicks(path, controller);
  const resources = useResources(path, controller);

  // A scene's own state, read only once the run says it is one; a fight reads
  // nothing here. The doorbell re-reads it with the fight.
  const mode = state?.run.mode;
  const scene = mode !== undefined && mode !== "combat" ? mode : undefined;
  const [sceneResource, reloadScene] = useApiAtom(
    runSceneAtom({ ...path, open: scene !== undefined }),
  );

  const [log, setLog] = useState<ReadonlyArray<SessionEvent>>([]);
  const [selectedId, setSelectedId] = useState<CombatantId | undefined>();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Combatant | undefined>();
  const [removing, setRemoving] = useState<Combatant | undefined>();
  const [ending, setEnding] = useState(false);
  const [npcProposalRefreshToken, setNpcProposalRefreshToken] = useState(0);
  // The canvas's NPC drawer is on the rail only while it has someone in it or
  // someone to bring in, and counts what waits for review: the card's own
  // reads (`TableNpcsCard`), shared through the atoms rather than fetched twice.
  const [tableNpcs] = useApiAtom(runNpcsAtom(path));
  const [npcMonitor] = useApiAtom(sessionNpcMonitorAtom(path));
  // The attack (`attack.ts`): the line whose target is being picked, then what
  // it came to. Both are this tab's, and both go when the turn moves.
  const [targeting, setTargeting] = useState<
    { readonly attackerId: CombatantId; readonly line: ActionLine } | undefined
  >();
  // A multiattack being run (`run/options.ts`): its attack rolls, and which
  // comes next once the DM has the last one's card. The turn's, like the pick.
  const [sequence, setSequence] = useState<
    | {
        readonly attackerId: CombatantId;
        readonly run: MultiattackRun;
        readonly next: number;
      }
    | undefined
  >();
  const [attack, setAttack] = useState<
    | {
        readonly attackerId: CombatantId;
        readonly targetId: CombatantId;
        readonly outcome: AttackOutcome;
        /** Where the target stood against the line's reach and range, when not plainly within. */
        readonly range: "out" | "long" | undefined;
        /** On a level: its cover and who could not see whom, as the roll took them. */
        readonly sight: ReadonlyArray<string>;
        /** What was sent, and the target's hit points before it. */
        readonly applied: { readonly amount: number; readonly hpBefore: number } | undefined;
        /** The concentration save the hit set up was rolled. */
        readonly saveRolled: boolean;
      }
    | undefined
  >();

  const turn = useMutation();
  const share = useMutation();
  const direct = useMutation();
  const conditions = useMutation();
  const hiding = useMutation();
  const saves = useMutation();
  const moves = useMutation();
  const mapShare = useMutation();
  const fogs = useMutation();
  const areas = useMutation();
  const levelSwitches = useMutation();

  const refresh = controller.refresh;
  const onEvent = useCallback(
    (event: SessionEvent) => {
      // Newest first, bounded, deduplicated on `seq` — a reconnect that
      // overlapped by a row would otherwise show it twice. A `roll-made` is
      // only the doorbell for a row the rolls read already carries, and every
      // DM throw rings one, so it never takes a place in the log.
      if (event.kind !== "roll-made")
        setLog((current) =>
          current.some((seen) => seen.seq === event.seq)
            ? current
            : [event, ...current].slice(0, LOG_KEPT),
        );
      refresh();
      reloadScene();
      reloadRolls();
      // The fog and the pinned area are the board's, which nothing else
      // re-reads: another of the DM's tabs painted or pinned them.
      if (event.kind.startsWith("board-")) rereadBoard();
      setNpcProposalRefreshToken((token) => token + 1);
    },
    [refresh, reloadScene, reloadRolls, rereadBoard],
  );

  const over = state !== undefined && state.run.endedAt !== null;
  const connection = useLiveStream({
    ...path,
    // Nothing to listen to before the first load, and nothing more will happen
    // once the fight is off the table.
    enabled: view !== undefined && !over,
    onEvent,
    // Catching up is two halves: the log resumes from the cursor, and the rows
    // are re-read. See `onReconnected` for why the second one is not implied by
    // the first.
    onReconnected: () => {
      refresh();
      reloadScene();
      reloadRolls();
      rereadBoard();
      setNpcProposalRefreshToken((token) => token + 1);
    },
  });

  // Ending the fight takes its pinned area off the board on the server, which
  // rings no `board-area-updated`: re-read the board once the run is over.
  useEffect(() => {
    if (over) rereadBoard();
  }, [over, rereadBoard]);

  const dialogOpen = adding || editing !== undefined || removing !== undefined || ending;
  const frozen = over || dialogOpen;

  const active = state?.combatants.find((row) => row.id === state.run.activeCombatantId);
  // Rolling initiative: nobody is up, and round 1 waits until every row has a
  // number. `toRoll` is the count the header's button waits on.
  const rolling = state?.run.phase === "initiative";
  const selected =
    state?.combatants.find((row) => row.id === selectedId) ??
    (selectedId === undefined ? active : undefined);
  // A target is picked only while the attacker is up and the screen takes
  // writes; a dialog or the fight ending puts the pick away.
  const picking =
    targeting !== undefined && !frozen && targeting.attackerId === active?.id
      ? targeting
      : undefined;

  // The turn options (`run/options.ts`), over what the screen already holds.
  const boardRead = boardResource.state === "ready" ? boardResource.value : undefined;
  const optionsSource = useMemo<RunOptionsSource | undefined>(
    () =>
      state === undefined || view === undefined
        ? undefined
        : {
            run: state.run,
            combatants: state.combatants,
            board: boardRead,
            diagonals: view.campaign.diagonalRule,
            statBlocks: new Map(
              [...view.creatures].map(([id, creature]) => [id, creature.statBlock] as const),
            ),
            senses: new Map(
              state.combatants.flatMap((row) => {
                if (row.kind !== "pc") return [];
                const sheet = (partyResource.state === "ready" ? partyResource.value : []).find(
                  (seat) => seat.character?.id === row.characterId,
                )?.character?.sheet;
                return [[row.id, sensesOfSource({ sheet })] as const];
              }),
            ),
          },
    [state, view, boardRead, partyResource],
  );
  const selectedOptions =
    optionsSource === undefined || selected === undefined
      ? undefined
      : runOptionsFor(optionsSource, selected);
  // While a target is picked: who the line's reach and range leave out, and
  // who it takes in only at long range, marked on the strip and the board.
  const pickingAttacker = state?.combatants.find((row) => row.id === picking?.attackerId);
  const pickOptions =
    optionsSource === undefined || pickingAttacker === undefined
      ? undefined
      : rangeOptionsFor(optionsSource, pickingAttacker);
  const marks =
    picking === undefined
      ? undefined
      : {
          out: outOfRangeFor(pickOptions, picking.line),
          long: longRangeFor(pickOptions, picking.line),
        };

  // The pick and the card are the turn's: whichever way the turn moves (this
  // tab's *Next turn*, *Make it their turn*, another tab's write), they go.
  const activeId = active?.id;
  useEffect(() => {
    setTargeting(undefined);
    setSequence(undefined);
    setAttack(undefined);
  }, [activeId]);

  /** Put the pick away, and with it the rest of a multiattack being run. */
  const cancelPick = () => {
    setTargeting(undefined);
    setSequence(undefined);
  };

  // Esc puts a pending target away.
  useEscapeAway(picking !== undefined, cancelPick);

  /** The marker moved under this tab's own advance. */
  const turnMoved = useCallback(
    (run: EncounterRun) => {
      controller.startTurn(run);
      // Following the turn again: the DM asked for the next creature, so the
      // panel should be showing it rather than whoever they last read about.
      setSelectedId(undefined);
      // And the last creature's attack is over with its turn.
      setTargeting(undefined);
      setSequence(undefined);
      setAttack(undefined);
    },
    [controller],
  );

  const advance = useCallback(async () => {
    if (state === undefined || turn.busy || state.run.phase === "initiative") return;
    // Nothing outside this screen is a function of whose turn it is, so this
    // names no reads — and must not name the fight itself: the runner learns
    // what it just did from the write's own answer, which is `startTurn` below.
    const moved = await turn.submit(
      (client) => client.runs.nextTurn({ params: path, payload: { requestId: newRequestId() } }),
      [],
    );
    if (Result.isSuccess(moved)) turnMoved(moved.success);
  }, [state, turn, path, turnMoved]);

  // Hob's autopilot (`hob/autopilot.ts`): on while the run names a driver,
  // driven here while it names this tab.
  const hobAvailable = useHobAvailable(campaignId);
  const showHob = useShowHob();
  const driverId = useMemo(autopilotDriverId, []);
  const pilotSwitch = useMutation();
  const pilotWrites = useMutation();
  const pilotDriver = state?.run.hobAutopilotDriver ?? null;
  const driving = pilotDriver === driverId && !over && scene === undefined;
  const statBlockOf = useCallback(
    (combatant: Combatant) =>
      combatant.creatureId === null
        ? undefined
        : view?.creatures.get(combatant.creatureId)?.statBlock,
    [view],
  );
  const pilotFight = useMemo<PilotFight | undefined>(() => {
    if (state === undefined || optionsSource === undefined) return undefined;
    const creatures = new Map<CombatantId, PilotCreature>();
    for (const row of state.combatants) {
      const options = runOptionsFor(optionsSource, row);
      if (options === undefined) continue;
      const moments = momentsOf(options);
      const lines = resourceRows(row, statBlockOf(row));
      creatures.set(row.id, {
        canTakeTurn: moments.includes("turn"),
        canActLegendary: moments.includes("legendary"),
        legendaryLeft: lines.find((line) => line.kind === "legendary")?.left ?? 0,
        recharging: lines.flatMap((line) =>
          line.kind === "recharge" && line.spent ? [line.key] : [],
        ),
      });
    }
    return {
      round: state.run.round,
      activeId: state.run.activeCombatantId,
      takingTurns:
        state.run.mode === "combat" && state.run.phase === "turns" && state.run.endedAt === null,
      order: state.combatants.map((row) => ({
        id: row.id,
        name: row.displayName,
        kind: row.kind === "pc" ? "pc" : "npc",
        out: row.kind !== "pc" && row.hpCurrent === 0,
      })),
      creatures,
    };
  }, [state, optionsSource, statBlockOf]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const rollRef = useRef(dice.roll);
  rollRef.current = dice.roll;
  /** The DM's own d6 for each spent recharge, as *Resources* rolls it, and one write for what came back. */
  const rollRecharge = useCallback(
    async (combatantId: CombatantId) => {
      const row = stateRef.current?.combatants.find((candidate) => candidate.id === combatantId);
      const roll = rollRef.current;
      if (row === undefined || roll === undefined) return;
      const back: string[] = [];
      for (const line of resourceRows(row, statBlockOf(row))) {
        if (line.kind !== "recharge" || !line.spent) continue;
        const rolled = roll(`${row.displayName} · ${line.label} recharge`, "1d6");
        if (rolled !== undefined && rolled.total >= line.on) back.push(line.key);
      }
      if (back.length === 0) return;
      const written = await pilotWrites.submit(
        (client) =>
          client.combatants.resources({
            params: { ...path, combatantId },
            payload: {
              rechargeSpent: row.rechargeSpent.filter((key) => !back.includes(key)),
              requestId: newRequestId(),
            },
          }),
        [],
      );
      if (Result.isSuccess(written)) controller.applyCombatant(written.success);
    },
    [statBlockOf, pilotWrites, path, controller],
  );
  /** `nextTurn` from whoever the loop saw up, so a second driver cannot skip a turn. */
  const advanceFrom = useCallback(
    async (expected: CombatantId): Promise<string | undefined> => {
      const moved = await pilotWrites.submit(
        (client) =>
          client.runs.nextTurn({
            params: path,
            payload: { requestId: newRequestId(), expectedActiveCombatantId: expected },
          }),
        [],
      );
      if (Result.isSuccess(moved)) {
        turnMoved(moved.success);
        return undefined;
      }
      return moved.failure.kind === "conflict"
        ? `${moved.failure.message}.`
        : "the turn did not move: the server did not answer.";
    },
    [pilotWrites, path, turnMoved],
  );
  const optionsFor = useCallback(
    (id: CombatantId) => {
      const row = state?.combatants.find((candidate) => candidate.id === id);
      return row === undefined || optionsSource === undefined
        ? undefined
        : runOptionsFor(optionsSource, row);
    },
    [state, optionsSource],
  );
  const momentsFor = useCallback(
    (id: CombatantId) => {
      const options = optionsFor(id);
      return options === undefined ? [] : momentsOf(options);
    },
    [optionsFor],
  );
  const nameOf = useCallback(
    (id: CombatantId) =>
      state?.combatants.find((row) => row.id === id)?.displayName ?? "The creature",
    [state],
  );
  // The runner's own writes, in flight: one mid-turn is the DM's hand.
  const busyByHand =
    turn.busy ||
    share.busy ||
    direct.busy ||
    conditions.busy ||
    hiding.busy ||
    saves.busy ||
    moves.busy ||
    mapShare.busy ||
    fogs.busy ||
    areas.busy ||
    resources.busy ||
    turnTicks.busy ||
    (state?.combatants.some((row) => controller.isPending(row.id)) ?? false);
  const pilot = useAutopilot({
    campaignId,
    sessionId,
    runId,
    driving,
    fight: pilotFight,
    connection: connection.status,
    busyByHand,
    momentsFor,
    rollRecharge,
    advance: advanceFrom,
    onChanged: refresh,
    nameOf,
  });
  const piloted = pilot.turn.combatantId;
  // The card follows whoever the loop acts for: a legendary creature as well
  // as whoever is up.
  useEffect(() => {
    if (piloted !== undefined) setSelectedId(piloted === activeId ? undefined : piloted);
    // Only when the loop turns to another creature, never on the DM's own pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piloted]);

  /** The switch, and *Drive here*: this tab's id on, `null` off. */
  const setAutopilot = async (on: boolean) => {
    const saved = await pilotSwitch.submit(
      (client) =>
        client.runs.update({
          params: path,
          payload: { hobAutopilotDriver: on ? driverId : null },
        }),
      [],
    );
    if (Result.isSuccess(saved)) controller.applyRun(saved.success);
  };

  /** *Start round N*: out of the initiative phase, the marker on the first in the order. */
  const begin = async () => {
    if (state === undefined || turn.busy) return;
    const begun = await turn.submit(
      (client) => client.runs.begin({ params: path, payload: { requestId: newRequestId() } }),
      [],
    );
    if (Result.isSuccess(begun)) {
      controller.startTurn(begun.success);
      setSelectedId(undefined);
      setTargeting(undefined);
      setSequence(undefined);
      setAttack(undefined);
    }
  };

  /** Back to rolling initiative, every number kept. */
  const reroll = async () => {
    if (state === undefined || turn.busy) return;
    const back = await turn.submit(
      (client) => client.runs.reroll({ params: path, payload: { requestId: newRequestId() } }),
      [],
    );
    if (Result.isSuccess(back)) controller.applyRun(back.success);
  };

  /**
   * The three switches over what the table sees: *Share* (the fight), *Share
   * map* and the map's *Hide from players*. Each changes only what a seated
   * player's table answers, so each names that read and nothing of the DM's —
   * a DM seated at their own table reads it too.
   */
  const setShown = async (
    mutation: ReturnType<typeof useMutation>,
    payload: Pick<EncounterRunUpdate, "visibility" | "mapShown" | "hostileTokensHidden">,
  ) => {
    if (state === undefined) return;
    const saved = await mutation.submit(
      (client) => client.runs.update({ params: path, payload }),
      [reads.playerTable(campaignId)],
    );
    if (Result.isSuccess(saved)) controller.applyRun(saved.success);
  };

  const setHobDirectWrites = async (allowed: boolean) => {
    if (state === undefined) return;
    const saved = await direct.submit(
      (client) => client.runs.update({ params: path, payload: { allowHobDirectWrites: allowed } }),
      [],
    );
    if (Result.isSuccess(saved)) controller.applyRun(saved.success);
  };

  const undoDirectUpdate = async (update: HobDirectResourceUpdate) => {
    const undone = await direct.submit(
      (client) =>
        client.runs.undoHobDirectUpdate({
          params: { ...path, updateId: update.id },
          payload: {},
        }),
      [],
    );
    if (Result.isSuccess(undone)) {
      refresh();
      return;
    }
    toast.add({
      type: "destructive",
      title: "Hob's spend was not undone",
      description: "The counter changed since Hob moved it. Adjust it on the sheet instead.",
    });
  };

  const setActive = async (combatant: Combatant) => {
    const saved = await share.submit(
      (client) =>
        client.runs.update({ params: path, payload: { activeCombatantId: combatant.id } }),
      [],
    );
    // Offered only for someone not up, so the marker always changes hands.
    if (Result.isSuccess(saved)) controller.startTurn(saved.success);
  };

  /** Resolves true once the server has the hit. */
  const damage = async (
    combatant: Combatant,
    amount: number,
    critical: boolean,
  ): Promise<boolean> => {
    const before = controller.hpOf(combatant);
    const applied = await controller.applyDamage(combatant, amount, critical);

    if (Result.isFailure(applied)) {
      toast.add({
        type: "destructive",
        title: `${combatant.displayName} is unchanged`,
        description: "That did not reach the server. The hit points are back to what it holds.",
      });
      return false;
    }

    // The prototype's own toast, word for word (`:107`) — it is the product
    // saying out loud that zero hit points is not a removal. The variant is the
    // one thing changed: green for a monster going down is right at a table,
    // and wrong when it is somebody's paladin.
    if (applied.success.hpCurrent === 0 && before > 0) {
      toast.add({
        type: combatant.side === "party" ? "destructive" : "success",
        title: `${combatant.displayName} downed`,
        description: "Still in initiative — remove them when you're ready.",
      });
    }
    return true;
  };

  /**
   * An attack resolved against a target, by the rule the server resolves a
   * Hob-run monster's with (`resolveAttack`), filed with the DM's dice. A hit
   * applies itself at once (the maintainer's call of 2026-10-17): the result
   * card says what was sent, with *Undo* and *Half instead*. The attacker
   * itself is no target.
   */
  const resolveOn = (attacker: Combatant, line: ActionLine, combatant: Combatant) => {
    if (combatant.id === attacker.id || dice.file === undefined) return;
    const options =
      optionsSource === undefined ? undefined : rangeOptionsFor(optionsSource, attacker);
    const out = outOfRangeFor(options, line);
    const long = longRangeFor(options, line);
    // On a level: total cover refuses the swing; cover adds to the AC, and
    // who cannot see whom sets the mode with the range (`LevelRules.ts`).
    const sight = sightOf(attacker, combatant);
    if (sight?.cover === "total") {
      toast.add({
        type: "destructive",
        title: `${combatant.displayName} cannot be targeted`,
        description: `It has total cover from ${attacker.displayName}: no line reaches it past the walls.`,
      });
      return;
    }
    const cover = sight?.cover ?? "none";
    const outcome = resolveAttack({
      attacker: attacker.displayName,
      line,
      target: {
        name: combatant.displayName,
        ac: coveredAc(combatant.ac, cover),
        conditions: combatant.conditions,
      },
      mode: combineModes([
        attackModeAt(long.has(combatant.id) ? "long" : undefined),
        sight === undefined ? "normal" : sightMode(sight),
      ]),
    });
    dice.file(
      attackThrows(outcome, {
        attackerId: attacker.id,
        targetId: combatant.id,
        delivery: deliveryFor(
          options,
          line,
          combatant.id,
          bandOfLine(
            line,
            attacker.position,
            combatant.position,
            boardRead == null
              ? undefined
              : {
                  feetPerCell: boardRead.feetPerCell,
                  diagonals: view?.campaign.diagonalRule ?? "five",
                },
          ),
        ),
      }),
    );
    setTargeting(undefined);
    const hit = attackLands(outcome.verdict) && outcome.amount > 0;
    const hpBefore = controller.hpOf(combatant);
    setAttack({
      attackerId: attacker.id,
      targetId: combatant.id,
      outcome,
      range: out.has(combatant.id) ? "out" : long.has(combatant.id) ? "long" : undefined,
      sight: [
        ...(coverLine(cover) === undefined ? [] : [`${coverLine(cover)!}.`]),
        ...(sight === undefined || sight.attackerSees
          ? []
          : [`${attacker.displayName} could not see ${combatant.displayName}: disadvantage.`]),
        ...(sight === undefined || sight.targetSees
          ? []
          : [`${combatant.displayName} could not see ${attacker.displayName}: advantage.`]),
      ],
      applied: hit ? { amount: outcome.amount, hpBefore } : undefined,
      saveRolled: false,
    });
    // A swing on its own turn is its action (`attackSpends`); off it, a
    // reaction is the DM's to tick.
    turnTicks.spendAction(attacker);
    if (hit) {
      void damage(combatant, outcome.amount, outcome.verdict === "critical").then((landed) => {
        if (!landed)
          setAttack((now) =>
            now !== undefined && now.outcome === outcome ? { ...now, applied: undefined } : now,
          );
      });
    }
  };

  /** The waiting attack against whoever was picked. */
  const strike = (combatant: Combatant) => {
    if (picking === undefined) return;
    const attacker = state?.combatants.find((row) => row.id === picking.attackerId);
    if (attacker !== undefined) resolveOn(attacker, picking.line, combatant);
  };

  /**
   * Whoever is up attacks with a line: at the selected creature at once when
   * one other than the attacker is selected (target first, as `Encounter
   * Canvas.dc.html` has it), otherwise by asking for a target.
   */
  const beginAttack = (attacker: Combatant, line: ActionLine) => {
    setAttack(undefined);
    const target = selected !== undefined && selected.id !== attacker.id ? selected : undefined;
    if (target !== undefined) resolveOn(attacker, line, target);
    else setTargeting({ attackerId: attacker.id, line });
  };

  /** A line with no target, to-hit and damage together, into the dock. */
  const rollLine = (combatant: Combatant, line: ActionLine) =>
    dice.file?.(
      rollActionThrows({
        attacker: combatant.displayName,
        attackerId: combatant.id,
        line,
        area: areaFor(
          optionsSource === undefined ? undefined : rangeOptionsFor(optionsSource, combatant),
          line,
          boardRead?.area,
        ),
      }),
    );

  /** A multiattack, strike by strike: the first now, each next from its result card. */
  const runMultiattack = (attacker: Combatant, run: MultiattackRun) => {
    const [first] = run.strikes;
    if (first === undefined) return;
    setSequence({ attackerId: attacker.id, run, next: 1 });
    beginAttack(attacker, first);
  };

  /** A row of the order: the attack's target while one is picked, otherwise the creature the panel shows. */
  const choose = (combatant: Combatant) => {
    if (picking === undefined) setSelectedId(combatant.id);
    else strike(combatant);
  };

  /**
   * The result card's *Apply*, *Half* or *Half instead*: the damage delta that
   * brings what the target lost to what the DM chose, with the critical flag a
   * natural 20 carries. A refused write puts the card back as it was.
   */
  const applyAttack = async (amount: number) => {
    if (attack === undefined) return;
    const target = state?.combatants.find((row) => row.id === attack.targetId);
    if (target === undefined) {
      toast.add({
        type: "destructive",
        title: `${attack.outcome.target} is no longer in the fight`,
        description: "Nothing was applied.",
      });
      return;
    }
    const before = attack.applied;
    const hpBefore = before?.hpBefore ?? controller.hpOf(target);
    const delta =
      before === undefined
        ? amount
        : Math.min(amount, hpBefore) - Math.min(before.amount, before.hpBefore);
    setAttack({ ...attack, applied: { amount, hpBefore } });
    if (delta === 0) return;
    const landed = await damage(target, delta, delta > 0 && attack.outcome.verdict === "critical");
    if (!landed) setAttack((now) => (now === undefined ? now : { ...now, applied: before }));
  };

  /**
   * The result card's *Undo*: heals back what the hit took, which is what was
   * sent less what the target did not have. Offered only for a target that
   * had hit points to lose, since a hit at zero is a death-save failure no
   * heal takes back.
   */
  const undoAttack = async () => {
    if (attack?.applied === undefined) return;
    const target = state?.combatants.find((row) => row.id === attack.targetId);
    if (target === undefined) return;
    const before = attack.applied;
    const lost = Math.min(before.amount, before.hpBefore);
    setAttack({ ...attack, applied: undefined, saveRolled: false });
    const landed = await damage(target, -lost, false);
    if (!landed) setAttack((now) => (now === undefined ? now : { ...now, applied: before }));
  };

  /** The concentration save the attack's hit set up, filed with the DM's dice; once per hit. */
  const rollConcentration = (target: Combatant, dc: number, modifier: number) => {
    if (dice.file === undefined) return;
    const save = concentrationThrow({
      target: target.displayName,
      targetId: target.id,
      dc,
      modifier,
    });
    if (save === undefined) return;
    dice.file([save]);
    setAttack((now) => (now === undefined ? now : { ...now, saveRolled: true }));
  };

  /**
   * The selected card's chips. Written through to the character by the server
   * (`repo/vitals.ts`), so this names the party; the fight itself takes the
   * row the write answers with.
   */
  const setConditions = async (combatant: Combatant, next: ReadonlyArray<string>) => {
    const written = await conditions.submit(
      (client) =>
        client.combatants.update({
          params: { ...path, combatantId: combatant.id },
          payload: { conditions: [...next] },
        }),
      combatantWrites(campaignId),
    );
    if (Result.isSuccess(written)) {
      controller.applyCombatant(written.success);
      return;
    }
    toast.add({
      type: "destructive",
      title: `${combatant.displayName}'s conditions are unchanged`,
      description: "That did not reach the server. The chips show what it holds.",
    });
  };

  /**
   * The panel's eye: hide a row from the players' table, or show it again
   * (`combatantVisibilityWrites` says what that changes). The fight takes the
   * row the write answers with.
   */
  const setVisibility = async (combatant: Combatant, visibility: Visibility) => {
    const written = await hiding.submit(
      (client) =>
        client.combatants.update({
          params: { ...path, combatantId: combatant.id },
          payload: { visibility },
        }),
      combatantVisibilityWrites(campaignId),
    );
    if (Result.isSuccess(written)) {
      controller.applyCombatant(written.success);
      return;
    }
    toast.add({
      type: "destructive",
      title: `${combatant.displayName} is ${combatant.visibility === "dm" ? "still hidden" : "still shown"}`,
      description: "That did not reach the server. The eye shows what it holds.",
    });
  };

  /**
   * A downed party member's dots, set outright and written through to the
   * character by the server. Not optimistic: a dot is pressed far less often
   * than a hit lands, and the row the write answers with is the server's
   * reading of it.
   */
  const setDeathSaves = async (combatant: Combatant, next: DeathSaves) => {
    const written = await saves.submit(
      (client) =>
        client.combatants.setDeathSaves({
          params: { ...path, combatantId: combatant.id },
          payload: { ...next, requestId: newRequestId() },
        }),
      deathSaveWrites(campaignId),
    );
    if (Result.isSuccess(written)) {
      controller.applyCombatant(written.success);
      return;
    }
    toast.add({
      type: "destructive",
      title: `${combatant.displayName}'s death saves are unchanged`,
      description: "That did not reach the server. The dots show what it holds.",
    });
  };

  /**
   * *Roll death save*: the d20 is rolled here and its face sent; the server
   * applies the rule (`deathSaveRolled`), so a natural 20 comes back with one
   * hit point. It is not in the DM's dice: the night's `death-save` line
   * carries the face and what it came to, and is the roll's one line.
   */
  const rollDeathSave = async (combatant: Combatant) => {
    const face = rollFace(20, Math.random);
    const written = await saves.submit(
      (client) =>
        client.combatants.rollDeathSave({
          params: { ...path, combatantId: combatant.id },
          payload: { face, requestId: newRequestId() },
        }),
      deathSaveWrites(campaignId),
    );
    if (Result.isSuccess(written)) {
      controller.applyCombatant(written.success);
      return;
    }
    toast.add({
      type: "destructive",
      title: `${combatant.displayName}'s death save was not counted`,
      description: "That did not reach the server. The dots show what it holds.",
    });
  };

  /**
   * Put a token on a square, move it, or take it off. Not optimistic: the token
   * slides when the server has the square, which on a table's network is the
   * blink of the slide itself, and a failed move leaves it where it stands.
   * Nothing outside the fight reads a position, so it names no reads.
   */
  const move = async (combatant: Combatant, to: BoardSquare | null): Promise<boolean> => {
    const moved = await moves.submit(
      (client) =>
        client.combatants.move({
          params: { ...path, combatantId: combatant.id },
          payload: { position: to, requestId: newRequestId() },
        }),
      [],
    );
    if (Result.isSuccess(moved)) {
      controller.applyCombatant(moved.success);
      return true;
    }
    toast.add({
      type: "destructive",
      title: `${combatant.displayName} did not move`,
      description: "That did not reach the server. The token is where the server has it.",
    });
    return false;
  };

  /**
   * One write of the Fog tool, in the board's line. Its answer is the board,
   * written straight into the board's atom as a turn's answer is into the
   * fight's, so the squares stay as painted. A write that never reached the
   * server is a refusal like any other.
   */
  const paintFog = (edit: FogEdit): Promise<void> =>
    inBoardLine(async () => {
      const saved = await fogs
        .submit(
          (client) =>
            client.runs.updateFog({
              params: path,
              payload: { ...fogPayload(edit), requestId: newRequestId() },
            }),
          boardFogWrites(campaignId),
        )
        .catch(() => undefined);
      if (saved !== undefined && Result.isSuccess(saved)) {
        writeBoard((current) => AsyncResult.map(current, () => saved.success));
        return;
      }
      toast.add({
        type: "destructive",
        title: "The fog did not change",
        description: "That did not reach the server. The board shows the fog it holds.",
      });
    });

  /**
   * The Area tool's write, in the board's line with the fog's: pin a template,
   * or clear it. Its answer is the board, written straight into the board's
   * atom, so the pin stays where it was put.
   */
  const pinArea = (area: BoardArea | null): Promise<void> =>
    inBoardLine(async () => {
      const saved = await areas
        .submit(
          (client) =>
            client.runs.setArea({
              params: path,
              payload: { area, requestId: newRequestId() },
            }),
          boardAreaWrites(campaignId),
        )
        .catch(() => undefined);
      if (saved !== undefined && Result.isSuccess(saved)) {
        writeBoard((current) => AsyncResult.map(current, () => saved.success));
        return;
      }
      toast.add({
        type: "destructive",
        title: area === null ? "The area is still pinned" : "The area was not pinned",
        description: "That did not reach the server. The board shows the area it holds.",
      });
    });

  /**
   * A door, a light or a secret region of the fight's level, in the board's
   * line with the fog's: its answer is the board, written straight into the
   * board's atom, so the door swings as soon as the server has it. A
   * player's table re-reads, since its level is narrowed through them.
   */
  const switchLevel = (
    write: (client: TavernsClient) => Effect.Effect<EncounterRunBoard, unknown>,
    refused: string,
  ): Promise<void> =>
    inBoardLine(async () => {
      const saved = await levelSwitches
        .submit(write, boardLevelWrites(campaignId))
        .catch(() => undefined);
      if (saved !== undefined && Result.isSuccess(saved)) {
        writeBoard((current) => AsyncResult.map(current, () => saved.success));
        return;
      }
      toast.add({
        type: "destructive",
        title: refused,
        description: "That did not reach the server. The board shows the level as it holds it.",
      });
    });
  const onDoor = (wallId: LevelPartId, update: Omit<BoardDoorUpdate, "requestId">) =>
    switchLevel(
      (client) =>
        client.runs.updateDoor({
          params: { ...path, wallId },
          payload: { ...update, requestId: newRequestId() },
        }),
      "The door did not change",
    );
  const onLight = (lightId: LevelPartId, lit: boolean) =>
    switchLevel(
      (client) =>
        client.runs.updateLight({
          params: { ...path, lightId },
          payload: { lit, requestId: newRequestId() },
        }),
      lit ? "The light was not lit" : "The light was not snuffed",
    );
  const onRegion = (regionId: LevelPartId, revealed: boolean) =>
    switchLevel(
      (client) =>
        client.runs.updateRegion({
          params: { ...path, regionId },
          payload: { revealed, requestId: newRequestId() },
        }),
      revealed ? "The table was not shown it" : "It was not hidden again",
    );

  /**
   * How far someone walks, from the front of their speed: the stat block's for
   * a creature, the sheet's for a party member, nothing for a row the DM typed.
   */
  const party = partyResource.state === "ready" ? partyResource.value : [];
  /** The stat block a row was seeded from, and the sheet, through reads the runner holds. */
  const sourceOf = (combatant: Combatant) => ({
    statBlock:
      combatant.creatureId === null
        ? undefined
        : view?.creatures.get(combatant.creatureId)?.statBlock,
    sheet:
      combatant.characterId === null
        ? undefined
        : party.find((seat) => seat.character?.id === combatant.characterId)?.character?.sheet,
  });
  /** On a level, how two combatants stand to each other (`levelRules.ts`). */
  const sightOf = (attacker: Combatant, target: Combatant) =>
    sightBetween(
      boardRead,
      { position: attacker.position, senses: sensesOfSource(sourceOf(attacker)) },
      { position: target.position, senses: sensesOfSource(sourceOf(target)) },
    );
  const speedOf = (combatant: Combatant): number | undefined => {
    const { statBlock, sheet } = sourceOf(combatant);
    return walkingFeet(statBlock?.speed ?? sheet?.identity?.speed);
  };
  /** What is left of that this turn, for the board's range (`feetLeft`). */
  const feetLeftOf = (combatant: Combatant): number | undefined =>
    state === undefined ? undefined : feetLeft(combatant, speedOf(combatant), state.run);
  const labels = useMemo(() => tokenLabels(state?.combatants ?? []), [state?.combatants]);
  // Only a fight shows a player its board (`boardShown`, the server's), and
  // only one that has a board; anywhere else the switch would move nothing.
  const boardReady = boardResource.state === "ready" && boardResource.value !== null;
  const mapToShare = state?.run.mode === "combat" && boardReady;

  const saved = useCallback(() => {
    setAdding(false);
    setEditing(undefined);
    refresh();
  }, [refresh]);

  const back: LinkProps = { to: "/campaigns/$campaignId", params: { campaignId } };

  /**
   * What the fight's aside keeps under the drawn cards, and a scene's does too:
   * the table's own cards, then the players' rolls and the log. On the canvas
   * the first go under the selected card and the second into the rolls dock.
   */
  const tableCards = state !== undefined && (
    <>
      <HobSpendsCard
        updates={state.directUpdates}
        busy={direct.busy}
        onUndo={(update) => void undoDirectUpdate(update)}
      />
      {!over && <TableNpcsCard path={path} refreshToken={npcProposalRefreshToken} />}
      {!over && <SessionNpcProposalWatch path={path} refreshToken={npcProposalRefreshToken} />}
    </>
  );
  const rollCards = state !== undefined && (
    <>
      <DiceTray
        rolls={trayRolls.slice(0, TRAY_SHOWN)}
        status={over ? "stopped" : connection.status}
      />
      <SessionLog
        events={log}
        combatants={state.combatants}
        noun={sceneNoun(state.run.mode)}
        status={over ? "stopped" : connection.status}
      />
    </>
  );
  const extras = (
    <>
      {tableCards}
      {rollCards}
    </>
  );

  // The canvas is for a fight with a board on a screen wide enough to play
  // on it; anything else is the grid, which closes the gap a missing board
  // leaves.
  const canvas = scene === undefined && stage.wide === true && hasBoard(boardResource);
  /**
   * The fight's pieces, which the canvas and the narrow grid each lay out:
   * *Roll initiative* while the fight rolls, and the strip once it takes turns
   * (or is over, when the strip is how it finished).
   */
  const rollPanel =
    state !== undefined && rolling && !over ? (
      <InitiativePhase
        path={path}
        run={state.run}
        combatants={state.combatants}
        selectedId={selected?.id}
        disabled={frozen}
        starting={turn.busy}
        onSelect={(combatant) => setSelectedId(combatant.id)}
        onAdd={() => setAdding(true)}
        onWritten={refresh}
        onBegin={() => void begin()}
      />
    ) : null;
  const strip =
    state !== undefined && rollPanel === null ? (
      <InitiativeStrip
        run={state.run}
        combatants={state.combatants}
        labels={labels}
        hpOf={controller.hpOf}
        selectedId={selected?.id}
        board={boardResource.state === "ready" && boardResource.value !== null}
        list={canvas}
        disabled={frozen}
        outOfRange={marks?.out}
        onSelect={choose}
        onAdd={() => setAdding(true)}
        onReroll={() => void reroll()}
      />
    ) : null;
  // The save follows what was sent, from the hit points it was sent against;
  // before that, the whole amount against the target as it stands.
  const struck = state?.combatants.find((row) => row.id === attack?.targetId);
  const owed =
    attack &&
    concentrationSave(
      attack.outcome,
      attack.applied?.amount ?? attack.outcome.amount,
      attack.applied?.hpBefore ?? (struck === undefined ? 0 : controller.hpOf(struck)),
    );
  // Once the hit is sent, the target rolls the save it owes off the Con save
  // its stat block or sheet holds; with none written, nothing is offered
  // rather than a guess.
  const struckSource = struck === undefined ? undefined : sourceOf(struck);
  const conSave =
    struckSource === undefined
      ? undefined
      : saveModifier(struckSource.statBlock ?? struckSource.sheet ?? NO_ABILITIES, "CON");
  const file = dice.file;
  const result = attack && {
    outcome: attack.outcome,
    applied: attack.applied !== undefined,
    sent: attack.applied?.amount,
    onUndo:
      attack.applied !== undefined && attack.applied.hpBefore > 0
        ? () => void undoAttack()
        : undefined,
    concentrationDc: owed,
    onRollSave:
      file !== undefined &&
      struck !== undefined &&
      owed !== undefined &&
      conSave !== undefined &&
      attack.applied !== undefined &&
      !attack.saveRolled
        ? () => rollConcentration(struck, owed, conSave)
        : undefined,
    range: attack.range,
    sight: attack.sight,
    next: (() => {
      if (sequence === undefined || sequence.attackerId !== attack.attackerId) return undefined;
      const line = sequence.run.strikes[sequence.next];
      if (line === undefined) return undefined;
      return {
        label: `Next: ${line.name} (${String(sequence.next + 1)} of ${String(sequence.run.strikes.length)})`,
        onNext: () => {
          const attacker = state?.combatants.find((row) => row.id === attack.attackerId);
          setSequence({ ...sequence, next: sequence.next + 1 });
          if (attacker !== undefined) beginAttack(attacker, line);
        },
      };
    })(),
  };
  // On the canvas whoever is up is the turn card's (`TurnCard.tsx`), so the
  // panel is the target's, or the up creature's details without its turn.
  const turnShown = canvas && state !== undefined && !over && !rolling && active !== undefined;
  const selectedIsTurn = turnShown && selected !== undefined && selected.id === active?.id;
  /** The selected creature's whole card: the grid's aside, the canvas's *Sheet* drawer. */
  const sheet = state !== undefined && view !== undefined && (
    <CombatantPanel
      campaignId={path.campaignId}
      combatant={selected}
      hp={selected === undefined ? 0 : controller.hpOf(selected)}
      label={selected === undefined ? "" : (labels.get(selected.id) ?? "")}
      speed={selected === undefined ? undefined : speedOf(selected)}
      // The target's cover from whoever is up, and who cannot see whom.
      sight={
        selected === undefined || active === undefined || selected.id === active.id
          ? []
          : sightLines(sightOf(active, selected), active.displayName)
      }
      // On the canvas whoever is up acts from the turn card.
      actions={selected === undefined || selectedIsTurn ? [] : actionsOf(sourceOf(selected))}
      multiattacks={selected === undefined || selectedIsTurn ? [] : multiattacksOf(selectedOptions)}
      onMultiattack={
        file === undefined ? undefined : (run) => selected && runMultiattack(selected, run)
      }
      creatures={view.creatures}
      active={selected !== undefined && selected.id === state.run.activeCombatantId}
      turn={
        selected !== undefined && !over && !selectedIsTurn && isUp(selected, state.run)
          ? {
              busy: turnTicks.busy,
              onTick: (ticks) => void turnTicks.tick(selected, ticks),
            }
          : undefined
      }
      resources={
        selected === undefined || over
          ? undefined
          : {
              busy: resources.busy,
              onSet: (patch) => void resources.set(selected, patch),
              // The DM's own d6, in the dock like every roll on this screen;
              // on the face the stat block names it is ready again.
              onRecharge:
                dice.roll === undefined
                  ? undefined
                  : (row) => {
                      const rolled = dice.roll?.(
                        `${selected.displayName} · ${row.label} recharge`,
                        "1d6",
                      );
                      if (rolled !== undefined && rolled.total >= row.on) {
                        void resources.set(selected, patchFor(selected, row, false));
                      }
                    },
            }
      }
      following={selectedId === undefined}
      disabled={frozen || share.busy}
      conditionsBusy={conditions.busy}
      deathSavesBusy={saves.busy}
      hiding={hiding.busy}
      rolling={rolling}
      onTheirTurn={() => selected !== undefined && void setActive(selected)}
      onEdit={() => setEditing(selected)}
      onFollow={() => setSelectedId(undefined)}
      onTakeOff={
        // Only a token standing on a board the DM can play on: below `@3xl`
        // the board is read-only, so its tokens stay where they stand.
        selected !== undefined && selected.position !== null && stage.wide === true && boardReady
          ? () => void move(selected, null)
          : undefined
      }
      onRemove={() => setRemoving(selected)}
      onDamage={(amount) => selected !== undefined && void damage(selected, amount, false)}
      onConditions={(next) => selected !== undefined && void setConditions(selected, next)}
      onVisibility={(next) => selected !== undefined && void setVisibility(selected, next)}
      onRoll={dice.roll}
      onDeathSaves={(next) => selected !== undefined && void setDeathSaves(selected, next)}
      onDeathSaveRoll={() => selected !== undefined && void rollDeathSave(selected)}
      targeting={
        picking !== undefined && picking.attackerId === selected?.id ? picking.line : undefined
      }
      result={
        attack !== undefined &&
        !turnShown &&
        attack.attackerId === selected?.id &&
        attack.attackerId === active?.id
          ? result
          : undefined
      }
      onAttack={
        file === undefined
          ? undefined
          : (line) => {
              if (selected === undefined) return;
              setSequence(undefined);
              beginAttack(selected, line);
            }
      }
      onRollAction={
        file === undefined
          ? undefined
          : (line) => selected !== undefined && rollLine(selected, line)
      }
      onApplyResult={(amount) => void applyAttack(amount)}
      onDismissResult={() => {
        setAttack(undefined);
        setSequence(undefined);
      }}
    />
  );
  /** Hob choosing what the selected monster does: under the card, or over the canvas's turn. */
  const hobOffer =
    state !== undefined && selected !== undefined && selectedOptions !== undefined && !over ? (
      <>
        {/* Hob choosing what the selected monster does: keyed by the creature,
      so a card never carries one creature's offer onto another. */}
        {pilot.turn.combatantId === selected.id && (
          // The autopilot's own hook, so what it asks and keeps is drawn here.
          <HobTurnCardView
            combatant={selected}
            options={selectedOptions}
            turn={{ ...pilot.turn, undo: pilot.undo }}
            disabled={frozen}
            driving={isWorking(pilot.loop)}
          />
        )}
        {pilot.turn.combatantId !== selected.id && (
          <HobTurnCard
            key={selected.id}
            campaignId={campaignId}
            sessionId={sessionId}
            runId={runId}
            combatant={selected}
            round={state.run.round}
            options={selectedOptions}
            disabled={frozen}
            onChanged={refresh}
          />
        )}
      </>
    ) : null;
  const card = (
    <>
      {sheet}
      {hobOffer}
    </>
  );
  const banner =
    picking === undefined ? undefined : (
      <TargetBanner
        action={
          sequence !== undefined && sequence.attackerId === picking.attackerId
            ? `${picking.line.name} (${String(sequence.next)} of ${String(sequence.run.strikes.length)})`
            : picking.line.name
        }
        onCancel={cancelPick}
      />
    );
  const rollsDock = state !== undefined && (
    <RollsDock
      variant={canvas ? "feed" : "card"}
      lines={dockLines({
        dm: dice.rolls,
        tray: trayRolls,
        events: log,
        combatants: state.combatants,
        noun: sceneNoun(state.run.mode),
      })}
      dice={dice}
    />
  );
  const partyRail = state !== undefined && (
    <PartyRail
      rows={state.combatants
        .filter((combatant) => combatant.side === "party")
        .map((combatant) => {
          const hp = controller.hpOf(combatant);
          return {
            id: combatant.id,
            displayName: combatant.displayName,
            label: labels.get(combatant.id) ?? "",
            portrait:
              combatant.kind === "pc" && combatant.portrait !== null
                ? combatant.portrait.thumbUrl
                : undefined,
            subtitle: subtitleOf(combatant),
            ac: combatant.ac,
            health: { hp, max: combatant.hpMax },
            conditions: combatant.conditions,
            out: outOfTheFight(combatant, hp),
          };
        })}
      activeId={state.run.activeCombatantId}
      selectedId={selected?.id}
      outOfRange={marks?.out}
      onSelect={(id) => {
        const combatant = state.combatants.find((row) => row.id === id);
        if (combatant !== undefined) choose(combatant);
      }}
    />
  );

  /** *Next turn*: the header's off the canvas, the turn card's on it. */
  const nextTurn = !rolling && scene === undefined && (
    // No key advances the turn: the table's own call (D13), so a stray key
    // press mid-fight never moves the marker.
    <Button
      size="sm"
      disabled={turn.busy || (driving && isWorking(pilot.loop) && pilot.loop.phase !== "counting")}
      onClick={() => {
        // Autopilot takes the legendary actions due first.
        if (driving && pilot.endTurn()) return;
        void advance();
      }}
    >
      {turn.busy ? "Advancing…" : "Next turn"}
      <Icon name="chevron-right" size={14} />
    </Button>
  );

  /** The canvas's *Next turn*: the action bar's round button, the one peach on it. */
  const nextTurnRound = !rolling && scene === undefined && (
    <Button
      aria-label="Next turn"
      className="size-20 flex-col gap-0.5 rounded-full text-label leading-tight"
      disabled={turn.busy || (driving && isWorking(pilot.loop) && pilot.loop.phase !== "counting")}
      onClick={() => {
        if (driving && pilot.endTurn()) return;
        void advance();
      }}
    >
      <Icon name="chevron-right" size={18} />
      {turn.busy ? "Advancing…" : "Next turn"}
    </Button>
  );

  /** The turn card's line for the target: its AC with its cover's bonus, or why it cannot be targeted. */
  const targetHint = (target: Combatant, cover: LevelCover): string => {
    if (cover === "total") {
      return `${target.displayName} has total cover from ${active?.displayName ?? "whoever is up"}: it cannot be targeted.`;
    }
    const ac = coveredAc(target.ac, cover);
    const covered =
      cover === "half"
        ? " (half cover)"
        : cover === "threeQuarters"
          ? " (three-quarters cover)"
          : "";
    return `Targeting ${target.displayName}${ac === null ? "" : `, AC ${String(ac)}${covered}`}. An attack resolves against them.`;
  };

  const resultCard = result !== undefined && (
    <AttackResultCard
      outcome={result.outcome}
      applied={result.applied}
      sent={result.sent}
      onUndo={result.onUndo}
      concentrationDc={result.concentrationDc}
      disabled={frozen}
      onRollSave={result.onRollSave}
      range={result.range}
      sight={result.sight}
      next={result.next}
      onApply={(amount) => void applyAttack(amount)}
      onDismiss={() => {
        setAttack(undefined);
        setSequence(undefined);
      }}
    />
  );
  const target =
    selected !== undefined && active !== undefined && selected.id !== active.id
      ? selected
      : undefined;
  const turnCard =
    turnShown && active !== undefined ? (
      <TurnCard
        name={active.displayName}
        label={labels.get(active.id) ?? ""}
        portrait={
          active.kind === "pc" && active.portrait !== null ? active.portrait.thumbUrl : undefined
        }
        subtitle={subtitleOf(active)}
        subtitleSerif={active.kind !== "pc"}
        health={{ hp: controller.hpOf(active), max: active.hpMax }}
        ac={active.ac}
        spent={active}
        speed={speedOf(active)}
        ticksDisabled={frozen || turnTicks.busy}
        onTick={(ticks) => void turnTicks.tick(active, ticks)}
        tiles={[
          ...multiattacksOf(
            optionsSource === undefined ? undefined : runOptionsFor(optionsSource, active),
          ).map((run): TurnTile => ({
            key: run.id,
            name: run.name,
            detail: run.summary,
            cost: "action",
            kind: "multiattack",
            label: `${run.name}: ${run.summary}`,
            pressed: picking !== undefined && sequence?.run.id === run.id,
            onPress: () => runMultiattack(active, run),
          })),
          ...actionsOf(sourceOf(active)).flatMap((line): ReadonlyArray<TurnTile> => {
            const common = {
              key: line.key,
              name: line.name,
              detail: actionDetail(line),
              cost: line.cost,
            };
            if (attacks(line))
              return [
                {
                  ...common,
                  kind: "attack",
                  label: `Attack with ${line.name}`,
                  pressed: picking?.line.key === line.key && sequence === undefined,
                  onPress: () => {
                    setSequence(undefined);
                    beginAttack(active, line);
                  },
                },
              ];
            if (rolls(line))
              return [
                {
                  ...common,
                  kind: "roll",
                  label: `Roll ${line.name}`,
                  onPress: () => rollLine(active, line),
                },
              ];
            return [];
          }),
        ]}
        tilesDisabled={frozen || file === undefined}
        result={attack?.attackerId === active.id ? resultCard : undefined}
        downed={
          active.deathSaves !== null && controller.hpOf(active) === 0 ? (
            <DeathSaveBlock
              name={active.displayName}
              saves={active.deathSaves}
              disabled={frozen || saves.busy}
              onSet={(next) => void setDeathSaves(active, next)}
              onRoll={() => void rollDeathSave(active)}
            />
          ) : undefined
        }
        hint={
          picking !== undefined
            ? `Pick a target for ${picking.line.name}: a token, a name in the order or the party.`
            : target !== undefined
              ? targetHint(target, sightOf(active, target)?.cover ?? "none")
              : "Select a creature to make it the target, or pick an attack and then its target. Drag a token to move it."
        }
        action={nextTurnRound}
      />
    ) : null;

  const boardProps: RunBoardProps | undefined =
    state === undefined || view === undefined
      ? undefined
      : {
          resource: boardResource,
          reload: reloadBoard,
          over,
          tokens: {
            combatants: state.combatants,
            labels,
            hpOf: controller.hpOf,
            selected,
            activeId: state.run.activeCombatantId,
            speedOf,
            feetLeftOf,
            diagonals: view.campaign.diagonalRule,
            movable: !frozen,
            onSelect: (combatant) => setSelectedId(combatant.id),
            // While a target is picked a token's click is the target, never a move or a selection.
            onTarget: picking === undefined ? undefined : strike,
            outOfRange: marks?.out,
            onMove: move,
            // The DM's own, with any still on their way, and the players' tray.
            acts: [...actsOf(dice.rolls), ...actsOfRolls(trayRolls)],
          },
          hostileTokensHidden: state.run.hostileTokensHidden,
          hiding: mapShare.busy,
          onHideHostile: (hidden) => void setShown(mapShare, { hostileTokensHidden: hidden }),
          onFog: paintFog,
          onArea: pinArea,
          onDoor,
          onLight,
          onRegion,
        };

  // On the canvas the screen holds the whole window: the shell puts its nav
  // rows away and the header floats over the board (`RunStage.tsx`).
  const onCanvas = canvas && state !== undefined && view !== undefined && boardProps !== undefined;
  useFullscreen(onCanvas);

  const title = state?.run.encounterName ?? "The fight";
  const subtitle =
    state === undefined
      ? undefined
      : scene !== undefined
        ? over
          ? `This ${sceneNoun(scene)} is over`
          : sceneResource.state === "ready" && sceneResource.value !== null
            ? sceneUpLine(scene, sceneResource.value)
            : undefined
        : over
          ? "This fight is over"
          : rolling
            ? rollingLine(state.combatants)
            : upLine(state.combatants, state.run.activeCombatantId);

  /** The switches over what the table sees, and the way out of the fight: the header's, or the canvas's top right. */
  // Hob's switches, offered only with a model behind Hob (and once on, always
  // there to turn off): the header's popover and the canvas's drawer list the
  // same two.
  const autopilotSwitch: HobSwitch | undefined =
    state !== undefined &&
    !over &&
    scene === undefined &&
    (hobAvailable === true || pilotDriver !== null)
      ? {
          on: pilotDriver !== null,
          busy: pilotSwitch.busy,
          onChange: (next) => void setAutopilot(next),
        }
      : undefined;
  const spendsSwitch: HobSwitch | undefined =
    state !== undefined && !over && (hobAvailable === true || state.run.allowHobDirectWrites)
      ? {
          on: state.run.allowHobDirectWrites,
          busy: direct.busy,
          onChange: (next) => void setHobDirectWrites(next),
        }
      : undefined;
  const reconnect = state !== undefined && !over && connection.status !== "live" && (
    <Button variant="outline" size="sm" onClick={connection.reconnect}>
      <Icon name="octagon-x" size={13} />
      {connection.status === "stopped" ? "Not listening" : "Reconnecting…"}
    </Button>
  );
  const backToCampaign = over && (
    <>
      {/* A fight that borrowed a level visit and resolved handed the dungeon
          back: the way on is the level, where the party now stands. */}
      {state !== undefined &&
        state.run.levelVisitId !== null &&
        state.run.endedReason === "resolved" && (
          <BackToLevel campaignId={campaignId} visitId={state.run.levelVisitId} />
        )}
      <Button variant="secondary" size="sm" nativeButton={false} render={<Link {...back} />}>
        Back to the campaign
      </Button>
    </>
  );

  /** The header's controls, off the canvas. */
  const controls = (
    <>
      {state !== undefined && !over && (
        <>
          {reconnect}
          <span className="flex items-center gap-2">
            <Switch
              id="run-share"
              checked={state.run.visibility === "shared"}
              disabled={share.busy}
              onCheckedChange={(next) =>
                void setShown(share, { visibility: next ? "shared" : "dm" })
              }
            />
            <Label htmlFor="run-share">Share</Label>
          </span>
          {mapToShare && (
            // A narrowing of *Share*, not a second way in: players see the
            // map only while they see the fight, so it waits for that. Off,
            // it keeps what the DM left it at for when the fight is shared.
            <span className="flex items-center gap-2">
              <Switch
                id="run-share-map"
                checked={state.run.mapShown}
                disabled={mapShare.busy || state.run.visibility !== "shared"}
                onCheckedChange={(next) => void setShown(mapShare, { mapShown: next })}
              />
              <Label htmlFor="run-share-map">Share map</Label>
            </span>
          )}
          <HobSwitches autopilot={autopilotSwitch} spends={spendsSwitch} />
          {/* While rolling, the round's one start is the panel's *Start
            round N*, so the bar carries no second peach button. */}
          {nextTurn}
          <Button variant="destructive" size="sm" onClick={() => setEnding(true)}>
            End
          </Button>
        </>
      )}
      {backToCampaign}
    </>
  );

  // Hob's drawer on the canvas: its switches, what it spent without asking,
  // and the way to ask it, since the nav's *Ask Hob* is put away with the nav
  // (⌘K still reaches the panel). While the fight is on it opens from the
  // controls; once over, the controls are gone, so the rail carries it.
  const askHob = hobAvailable === true && !over ? showHob : undefined;
  const hobShown =
    state !== undefined &&
    (autopilotSwitch !== undefined ||
      spendsSwitch !== undefined ||
      askHob !== undefined ||
      state.directUpdates.length > 0);

  /** The canvas's controls: icons in one cluster, Hob's switches in its drawer. */
  const canvasControls = (
    <>
      {reconnect}
      {state !== undefined && !over && (
        <div className={cn(hudSurface, "flex items-center gap-0.5 p-1")}>
          {strip !== null && (
            <>
              <StageDrawerButton
                drawer={INITIATIVE_DRAWER}
                icon="list-ordered"
                label="Initiative"
              />
              <span aria-hidden="true" className="mx-1 h-6 w-px bg-hairline" />
            </>
          )}
          <HudIconSwitch
            icon="eye"
            label="Share"
            hint="Share the fight with the players"
            checked={state.run.visibility === "shared"}
            disabled={share.busy}
            onCheckedChange={(next) => void setShown(share, { visibility: next ? "shared" : "dm" })}
          />
          {mapToShare && (
            // A narrowing of *Share*, as the header's is.
            <HudIconSwitch
              icon="map"
              label="Share map"
              hint="Show the players the map while they see the fight"
              checked={state.run.mapShown}
              disabled={mapShare.busy || state.run.visibility !== "shared"}
              onCheckedChange={(next) => void setShown(mapShare, { mapShown: next })}
            />
          )}
          {hobShown && (
            <>
              <span aria-hidden="true" className="mx-1 h-6 w-px bg-hairline" />
              <StageDrawerButton
                drawer={HOB_DRAWER}
                icon="sparkles"
                label="Hob"
                badge={hobOn(autopilotSwitch, spendsSwitch)}
              />
            </>
          )}
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-hairline" />
          <HudIconButton
            icon="flag"
            tone="danger"
            label="End"
            hint="End the fight"
            onClick={() => setEnding(true)}
          />
        </div>
      )}
      {backToCampaign}
    </>
  );

  /** On the canvas, what is selected when it is not whoever is up: the target frame's. */
  const framed = selected !== undefined && selected.id !== active?.id ? selected : undefined;
  const targetFrame = framed !== undefined && (
    <TargetFrame
      combatant={framed}
      hp={controller.hpOf(framed)}
      label={labels.get(framed.id) ?? ""}
      portrait={
        framed.kind === "pc" && framed.portrait !== null ? framed.portrait.thumbUrl : undefined
      }
      subtitle={subtitleOf(framed)}
      sight={active === undefined ? [] : sightLines(sightOf(active, framed), active.displayName)}
      disabled={frozen}
      onDamage={(amount) => void damage(framed, amount, false)}
      onClear={() => setSelectedId(undefined)}
    />
  );

  const npcRows = npcMonitor.state === "ready" ? npcMonitor.value : [];
  const npcsInScene = new Set(
    npcRows.filter((row) => row.thread.sessionState !== "closed").map((row) => row.npc.id),
  );
  const npcsToBringIn =
    tableNpcs.state === "ready"
      ? tableNpcs.value.filter((npc) => npc.visibility === "shared" && !npcsInScene.has(npc.id))
      : [];
  /** The canvas's drawers: the order, the selected card, the NPCs at the table, Hob. */
  const drawers: ReadonlyArray<StageDrawer> = [
    // The order opens from the controls while the fight is on, and from the
    // rail once it is over, as Hob's does.
    ...(strip !== null
      ? [
          {
            key: INITIATIVE_DRAWER,
            label: "Initiative",
            icon: "list-ordered" as const,
            rail: over,
            content: strip,
          },
        ]
      : []),
    ...(selected !== undefined && sheet !== false
      ? [
          {
            key: SHEET_DRAWER,
            label: "Sheet",
            icon: "scroll-text" as const,
            // The card is its own surface and names the creature.
            bare: true,
            content: sheet,
          },
        ]
      : []),
    ...(!over && (npcRows.length > 0 || npcsToBringIn.length > 0)
      ? [
          {
            key: "npcs",
            label: "NPCs at the table",
            icon: "message-circle" as const,
            badge: npcRows.reduce((total, row) => total + row.pendingProposals, 0),
            content: (
              <TableNpcsCard path={path} refreshToken={npcProposalRefreshToken} titled={false} />
            ),
          },
        ]
      : []),
    ...(hobShown && state !== undefined
      ? [
          {
            key: HOB_DRAWER,
            label: "Hob",
            icon: "sparkles" as const,
            rail: over,
            content: (
              <>
                {(autopilotSwitch !== undefined || spendsSwitch !== undefined) && (
                  <div className="-mx-2 flex flex-col">
                    <HobSwitchRows autopilot={autopilotSwitch} spends={spendsSwitch} />
                  </div>
                )}
                <HobSpendsCard
                  updates={state.directUpdates}
                  busy={direct.busy}
                  onUndo={(update) => void undoDirectUpdate(update)}
                />
                {askHob !== undefined && (
                  <Button variant="outline" size="sm" className="self-start" onClick={askHob}>
                    <Icon name="sparkles" size={13} className="text-magic-ink" />
                    Ask Hob
                  </Button>
                )}
              </>
            ),
          },
        ]
      : []),
  ];

  const header = (
    <TopBar
      framed
      title={title}
      {...(subtitle !== undefined && { subtitle })}
      {...(state !== undefined && {
        badge: (
          <Badge variant="secondary">
            {scene !== undefined
              ? sceneBadge(scene)
              : rolling && !over
                ? "Initiative"
                : `Round ${String(state.run.round)}`}
          </Badge>
        ),
      })}
    >
      {controls}
    </TopBar>
  );

  const canvasTitle = (
    <CanvasTitle
      back={back}
      title={title}
      subtitle={[
        view === undefined
          ? undefined
          : `${view.campaign.name} · Session ${String(view.session.number)}`,
        // The order is put away in its drawer, so the title keeps the round.
        state === undefined || strip === null || over || scene !== undefined
          ? undefined
          : `Round ${String(state.run.round)}`,
        subtitle,
      ]
        .filter((part) => part !== undefined)
        .join(" · ")}
    />
  );

  /** The lines under the header: an ended fight, the autopilot, a fight that fell behind. */
  const notices = (
    <>
      {over && view !== undefined && (
        <p
          role="status"
          className="rounded-card border border-hairline bg-surface-card px-card py-2.5 text-body-s leading-body text-muted-foreground"
        >
          {scene === undefined
            ? `This fight came off the table. The order and the hit points below are how it finished — they are saved to Session ${String(view.session.number)}.`
            : `This ${sceneNoun(scene)} came off the table. Its checks below are how it finished — they are saved to Session ${String(view.session.number)}.`}
        </p>
      )}
      {!over && scene === undefined && pilotDriver !== null && (
        <AutopilotBar
          mine={driving}
          loop={pilot.loop}
          status={pilot.status}
          countdown={pilot.countdown}
          busy={pilotSwitch.busy}
          onStop={pilot.stop}
          onResume={pilot.resume}
          onNextNow={pilot.nextNow}
          onDriveHere={() => void setAutopilot(true)}
        />
      )}
      {controller.staleness !== undefined && (
        <p
          role="status"
          className="rounded-card border border-hairline bg-surface-card px-card py-2.5 text-body-s leading-body text-danger"
        >
          The last re-read did not answer, so this may be a moment behind. Everything below is the
          last thing the server said.
        </p>
      )}
    </>
  );

  return (
    <TooltipProvider>
      {/* On the canvas the screen is the whole viewport and the stage all of
          it (`RunStage.tsx`); otherwise it is a document like every other
          screen. */}
      <div
        data-slot="run-screen"
        className={cn(
          onCanvas && "flex h-dvh flex-col",
          // Picking a target: whatever can be the target says so.
          picking !== undefined &&
            "[&_[data-slot=board-canvas]]:cursor-crosshair [&_[data-slot=run-board-squares]]:cursor-crosshair [&_[data-slot=token]]:cursor-crosshair [&_[data-combatant]]:cursor-crosshair",
        )}
      >
        {stage.probe}
        {!onCanvas && header}
        {resource.state === "loading" && <Loading label="Reading the fight…" />}
        {resource.state === "failed" && (
          <div className="max-w-3xl">
            <ApiFailureNotice failure={resource.failure} onRetry={reload} />
          </div>
        )}

        {state !== undefined && view !== undefined && stage.wide !== undefined && (
          <div className={cn("flex flex-col gap-4", onCanvas && "min-h-0 flex-1")}>
            {!onCanvas && notices}
            {scene !== undefined ? (
              <SceneRunner
                path={path}
                run={state.run}
                combatants={state.combatants}
                scene={sceneResource}
                reloadScene={reloadScene}
                over={over}
                dice={dice}
                conditionsBusy={conditions.busy}
                onConditions={(combatant, next) => void setConditions(combatant, next)}
                onEscalated={(run) => {
                  controller.applyRun(run);
                  // The rows seat into initiative order and the marker moves.
                  refresh();
                }}
                onEnd={() => setEnding(true)}
                extras={extras}
              />
            ) : onCanvas ? (
              <RunStage
                title={canvasTitle}
                controls={canvasControls}
                notices={
                  <>
                    {notices}
                    {!over && (
                      <SessionNpcProposalWatch path={path} refreshToken={npcProposalRefreshToken} />
                    )}
                  </>
                }
                rolling={rollPanel}
                party={partyRail || null}
                target={targetFrame || null}
                above={hobOffer}
                turn={turnCard}
                banner={banner}
                drawers={drawers}
                rolls={rollsDock}
                board={(freeArea) => (
                  <RunBoardStage
                    {...boardProps}
                    freeArea={freeArea}
                    handoff={
                      state.run.levelVisitId === null
                        ? undefined
                        : stageKey.visit(state.run.levelVisitId)
                    }
                  />
                )}
              />
            ) : (
              <>
                {banner}
                <RunLayout
                  initiative={strip ?? rollPanel}
                  strip={strip !== null}
                  map={
                    hasBoard(boardResource) && boardProps !== undefined ? (
                      <RunBoardCard {...boardProps} />
                    ) : null
                  }
                  card={card}
                  rest={
                    <>
                      {rollsDock}
                      {tableCards}
                    </>
                  }
                />
              </>
            )}
          </div>
        )}
      </div>

      {adding && (
        <CombatantDialog
          path={path}
          combatant={undefined}
          onClose={() => setAdding(false)}
          onSaved={saved}
        />
      )}
      {editing !== undefined && (
        <CombatantDialog
          key={editing.id}
          path={path}
          combatant={editing}
          onClose={() => setEditing(undefined)}
          onSaved={saved}
        />
      )}
      {removing !== undefined && (
        <RemoveCombatantDialog
          key={removing.id}
          path={path}
          combatant={removing}
          onClose={() => setRemoving(undefined)}
          onRemoved={() => {
            setRemoving(undefined);
            // Back to whoever is up: the row the panel was showing is gone.
            setSelectedId(undefined);
            refresh();
          }}
        />
      )}
      {ending && view !== undefined && (
        <EndRunDialog
          path={path}
          session={view.session}
          encounterName={state?.run.encounterName ?? "this fight"}
          mode={state?.run.mode ?? "combat"}
          levelVisitId={state?.run.levelVisitId ?? null}
          fight={state}
          hpOf={controller.hpOf}
          onClose={() => setEnding(false)}
          onEnded={() => {
            setEnding(false);
            reload();
          }}
        />
      )}

      {/* The runner's own manager, mounted with the screen. A toast raised
          here has to beat a dialog's backdrop, which is what `z-toast` above
          `z-dialog` is for. */}
      <Toaster />
    </TooltipProvider>
  );
}

/**
 * After a fight that borrowed a level visit resolves: back to the visit's
 * stage, named by the visit (the campaign's list of them, which the stage's
 * Levels tab reads too). Until the list is read it is *Back to the level*.
 */
function BackToLevel({
  campaignId,
  visitId,
}: {
  readonly campaignId: CampaignId;
  readonly visitId: LevelVisitId;
}) {
  const [visits] = useApiAtom(levelVisitsAtom(campaignId));
  const registry = useContext(RegistryContext);
  const navigate = useNavigate();
  const name =
    visits.state === "ready" ? visits.value.find((visit) => visit.id === visitId)?.name : undefined;
  // The level is read before going to it, so its stage takes this one's over
  // in one frame (`api/readAhead.ts`, `stageHandoff.ts`). A modified click
  // is the browser's own: a new tab reads it there.
  const back = async () => {
    await readAhead(registry, [levelVisitAtom({ campaignId, visitId }), campaignAtom(campaignId)]);
    void navigate({
      to: "/campaigns/$campaignId/levels/$visitId",
      params: { campaignId, visitId },
    });
  };
  return (
    <Button
      size="sm"
      nativeButton={false}
      render={
        <Link
          to="/campaigns/$campaignId/levels/$visitId"
          params={{ campaignId, visitId }}
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            void back();
          }}
        />
      }
    >
      {name === undefined ? "Back to the level" : `Back to ${name}`}
    </Button>
  );
}
