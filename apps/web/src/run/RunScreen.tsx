import type {
  BoardSquare,
  Combatant,
  CombatantId,
  HobDirectResourceUpdate,
  Npc,
  NpcSessionMonitor,
  Roll,
  SessionEvent,
} from "@taverns/api";
import { Link, useParams, type LinkProps } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Icon,
  Label,
  Switch,
  Toaster,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
  SectionHeading,
  Loading,
} from "@taverns/ui";
import { Result } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { reads } from "../api/keys";
import { TopBar } from "../shell/TopBar";
import { SaveFailure } from "../ui/form";
import { sessionNpcProposalSummaryAtom } from "../cast/load";
import { partyAtom } from "../campaign/load";
import { CombatantDialog } from "./CombatantDialog";
import { CombatantPanel } from "./CombatantPanel";
import { useDmDice } from "./dice";
import { DmDiceCard } from "./DmDice";
import { EndRunDialog } from "./EndRunDialog";
import { InitiativeList } from "./InitiativeList";
import { InitiativePhase } from "./InitiativePhase";
import { RunBoardCard } from "./RunBoardCard";
import { RunLayout } from "./RunLayout";
import {
  combatantWrites,
  hasBoard,
  rollsAtom,
  runBoardAtom,
  runViewAtom,
  rollingLine,
  upLine,
  type RunPath,
} from "./load";
import { SessionLog } from "./SessionLog";
import { newRequestId, useRunState } from "./state";
import { useLiveStream } from "./stream";
import { leadingFeet, tokenLabels } from "./tokens";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * The encounter runner — the runner redesign's fight (`Campaign Overview.dc.html`),
 * against the real API and a real stream: a framed header with the round and
 * who is up, then initiative, the battle map and the selected creature's card
 * with the DM's own dice, laid out by `RunLayout.tsx`. Everything the drawing
 * leaves out that the runner already did — adding and editing combatants,
 * *Make it their turn*, Hob's spends and their undo, NPCs at the table, the
 * players' dice tray and the session log — stays, in the aside under the drawn
 * cards (the captain's call of 2026-09-25).
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

function ShareNpcCard({ path }: { readonly path: RunPath }) {
  const [resource, reload] = useApiAtom(runNpcsAtom(path));
  const { failure, submit, busy } = useMutation();
  const [selected, setSelected] = useState("");

  if (resource.state === "loading") {
    return (
      <section className="rounded-card border border-hairline bg-surface-card p-card">
        <p className="text-body-s text-muted-foreground">Reading the cast…</p>
      </section>
    );
  }
  if (resource.state === "failed")
    return <ApiFailureNotice failure={resource.failure} onRetry={reload} />;

  const shareable = resource.value.filter((npc: Npc) => npc.visibility === "shared");
  if (shareable.length === 0) {
    return (
      <section className="rounded-card border border-hairline bg-surface-card p-card">
        <SectionHeading as="h3" size="title">
          Open at the table
        </SectionHeading>
        <p className="mt-2 text-body-s text-muted-foreground">
          Make an NPC player-facing in Cast before opening them at the table.
        </p>
      </section>
    );
  }

  const chosen = shareable.find((npc) => npc.id === selected) ?? shareable[0]!;
  return (
    <section className="rounded-card border border-hairline bg-surface-card p-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <SectionHeading as="h3" size="title">
            Open at the table
          </SectionHeading>
          <p className="text-caption text-muted-foreground">
            Start the shared live-session conversation players see at the table.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            void submit(
              (client) =>
                client.npcs.openSession({
                  params: {
                    campaignId: path.campaignId,
                    sessionId: path.sessionId,
                    npcId: chosen.id,
                  },
                  payload: {},
                }),
              [reads.sessionNpcs(path.sessionId)],
            );
          }}
        >
          Open at the table
        </Button>
      </div>
      <select
        className="mt-3 w-full rounded-control border border-input bg-surface-sunken px-3 py-2 text-body-s text-foreground"
        value={chosen.id}
        onChange={(event) => setSelected(event.currentTarget.value)}
      >
        {shareable.map((npc) => (
          <option key={npc.id} value={npc.id}>
            {npc.name}
          </option>
        ))}
      </select>
      {failure !== undefined && <SaveFailure failure={failure} />}
    </section>
  );
}

function SessionNpcMonitorPanel({
  path,
  refreshToken,
}: {
  readonly path: RunPath;
  readonly refreshToken: number;
}) {
  const [resource, reload] = useApiAtom(sessionNpcMonitorAtom(path));
  const { failure, submit, busy } = useMutation();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (refreshToken > 0) reload();
  }, [refreshToken, reload]);

  if (resource.state === "loading") {
    return (
      <section className="rounded-card border border-hairline bg-surface-card p-card">
        <SectionHeading as="h3" size="title">
          Scene cast
        </SectionHeading>
        <p className="mt-2 text-body-s text-muted-foreground">Reading open NPC conversations…</p>
      </section>
    );
  }
  if (resource.state === "failed")
    return <ApiFailureNotice failure={resource.failure} onRetry={reload} />;

  const rows = resource.value;
  const selected = rows.find((row) => row.npc.id === selectedId) ?? rows[0];
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
    <section className="rounded-card border border-hairline bg-surface-card p-card">
      <div className="flex flex-col gap-3">
        <div>
          <SectionHeading as="h3" size="title">
            Scene cast
          </SectionHeading>
          <p className="text-caption leading-snug text-muted-foreground">
            Open NPCs, monitor shared table transcripts, and pause or close an NPC conversation
            without editing its history.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="text-body-s leading-body text-muted-foreground">
            No NPC conversation is open in this session yet. Choose one above to bring them into the
            scene.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {rows.map((row) => (
                <Button
                  key={row.thread.id}
                  size="sm"
                  variant={selected?.thread.id === row.thread.id ? "secondary" : "ghost"}
                  onClick={() => setSelectedId(row.npc.id)}
                >
                  {row.npc.name}
                  <Badge variant={badgeForSessionState(row.thread.sessionState)}>
                    {row.thread.sessionState}
                  </Badge>
                  {row.pendingProposals > 0 && (
                    <Badge variant="magic">{row.pendingProposals}</Badge>
                  )}
                </Button>
              ))}
            </div>
            {selected !== undefined && (
              <SessionNpcMonitorDetail
                row={selected}
                busy={busy}
                onPause={() => control(selected, "pause", "NPC conversation paused")}
                onResume={() => control(selected, "resume", "NPC conversation resumed")}
                onClose={() => control(selected, "close", "NPC conversation closed")}
              />
            )}
          </>
        )}
        {failure !== undefined && <SaveFailure failure={failure} />}
      </div>
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
    <div className="rounded-card border border-hairline bg-surface-sunken p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SectionHeading as="h4">{row.npc.name}</SectionHeading>
            <Badge variant={badgeForSessionState(state)}>{state}</Badge>
            <Badge variant={row.available ? "success" : "outline"}>
              {row.available ? "available" : "unavailable"}
            </Badge>
          </div>
          <p className="mt-1 text-caption leading-snug text-muted-foreground">
            {row.npc.role || "Cast NPC"} · {row.model ?? "no model configured"}
            {row.lastFailure === null ? "" : ` · ${row.lastFailure}`}
          </p>
        </div>
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
      <div className="mt-3 space-y-2 rounded-control border border-hairline bg-surface-card p-2">
        {row.turns.length === 0 ? (
          <p className="text-caption leading-body text-muted-foreground">
            No one has spoken in this shared conversation yet.
          </p>
        ) : (
          row.turns.map((turn) => (
            <div key={turn.id} className="rounded-control bg-surface-sunken px-2.5 py-2">
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

/** Space advances the turn — the prototype's own shortcut (`:127`). */
const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest("button, input, textarea, select, [role='switch'], [contenteditable='true']") !==
    null;

/**
 * Whether Hob may spend a character's resources in this fight without asking,
 * and every spend it made, each with its undo.
 */
function HobSpendsCard({
  allowed,
  over,
  updates,
  switchBusy,
  busy,
  onAllow,
  onUndo,
}: {
  readonly allowed: boolean;
  readonly over: boolean;
  readonly updates: ReadonlyArray<HobDirectResourceUpdate>;
  readonly switchBusy: boolean;
  readonly busy: boolean;
  readonly onAllow: (allowed: boolean) => void;
  readonly onUndo: (update: HobDirectResourceUpdate) => void;
}) {
  if (over && updates.length === 0) return null;
  return (
    <section
      aria-label="Hob's direct spends"
      className="rounded-card border border-hairline bg-surface-card shadow-1"
    >
      <div className="flex items-center gap-2 px-panel py-3">
        <Icon name="sparkles" size={13} className="text-magic-ink" />
        <SectionHeading as="h3" size="title" className="flex-1">
          Hob's spends
        </SectionHeading>
        {!over && (
          <span className="flex items-center gap-2">
            <Switch
              id="run-hob-direct-writes"
              checked={allowed}
              disabled={switchBusy}
              onCheckedChange={(next) => onAllow(next)}
            />
            <Label htmlFor="run-hob-direct-writes">Hob spends</Label>
          </span>
        )}
      </div>
      {updates.length === 0 ? (
        <p className="mb-0 border-t border-hairline px-panel py-3 text-caption leading-body text-muted-foreground">
          {allowed
            ? "Hob may spend a character's resources in this fight without asking. Each spend is listed here, with its undo."
            : "Off: Hob asks before it spends anything in this fight."}
        </p>
      ) : (
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
                  <p className="text-body-xs leading-body text-muted-foreground">
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
      )}
    </section>
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
  // The party's sheets, for a character's speed on the board. A miss is no
  // range box, never a guessed one.
  const [partyResource] = useApiAtom(partyAtom(campaignId));
  const dice = useDmDice();
  const view = resource.state === "ready" ? resource.value : undefined;
  const trayRolls = rollsResource.state === "ready" ? rollsResource.value : [];

  // The fight's own half, from the same atom the value above is built on — so
  // the rows the screen renders and the rows the controller writes into cannot
  // be two different answers.
  const controller = useRunState(path);
  const state = controller.state;

  const [log, setLog] = useState<ReadonlyArray<SessionEvent>>([]);
  const [selectedId, setSelectedId] = useState<CombatantId | undefined>();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Combatant | undefined>();
  const [ending, setEnding] = useState(false);
  const [npcProposalRefreshToken, setNpcProposalRefreshToken] = useState(0);

  const turn = useMutation();
  const share = useMutation();
  const direct = useMutation();
  const conditions = useMutation();
  const moves = useMutation();

  const refresh = controller.refresh;
  const onEvent = useCallback(
    (event: SessionEvent) => {
      // Newest first, bounded, deduplicated on `seq` — a reconnect that
      // overlapped by a row would otherwise show it twice.
      setLog((current) =>
        current.some((seen) => seen.seq === event.seq)
          ? current
          : [event, ...current].slice(0, LOG_KEPT),
      );
      refresh();
      reloadRolls();
      setNpcProposalRefreshToken((token) => token + 1);
    },
    [refresh, reloadRolls],
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
      reloadRolls();
      setNpcProposalRefreshToken((token) => token + 1);
    },
  });

  const dialogOpen = adding || editing !== undefined || ending;
  const frozen = over || dialogOpen;

  const active = state?.combatants.find((row) => row.id === state.run.activeCombatantId);
  // Rolling initiative: nobody is up, and round 1 waits until every row has a
  // number. `toRoll` is the count the header's button waits on.
  const rolling = state?.run.phase === "initiative";
  const selected =
    state?.combatants.find((row) => row.id === selectedId) ??
    (selectedId === undefined ? active : undefined);

  const advance = useCallback(async () => {
    if (state === undefined || turn.busy || state.run.phase === "initiative") return;
    // Nothing outside this screen is a function of whose turn it is, so this
    // names no reads — and must not name the fight itself: the runner learns
    // what it just did from the write's own answer, which is `applyRun` below.
    const moved = await turn.submit(
      (client) => client.runs.nextTurn({ params: path, payload: { requestId: newRequestId() } }),
      [],
    );
    if (Result.isSuccess(moved)) {
      controller.applyRun(moved.success);
      // Following the turn again: the DM asked for the next creature, so the
      // panel should be showing it rather than whoever they last read about.
      setSelectedId(undefined);
    }
  }, [state, turn, path, controller]);

  useEffect(() => {
    if (frozen || state === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      void advance();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [advance, frozen, state]);

  /** *Start round N*: out of the initiative phase, the marker on the first in the order. */
  const begin = async () => {
    if (state === undefined || turn.busy) return;
    const begun = await turn.submit(
      (client) => client.runs.begin({ params: path, payload: { requestId: newRequestId() } }),
      [],
    );
    if (Result.isSuccess(begun)) {
      controller.applyRun(begun.success);
      setSelectedId(undefined);
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

  const setShared = async (shared: boolean) => {
    if (state === undefined) return;
    const saved = await share.submit(
      (client) =>
        client.runs.update({ params: path, payload: { visibility: shared ? "shared" : "dm" } }),
      // What this changes is what a *player* sees, in another browser. There is
      // nothing of this DM's to refresh.
      [],
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
    if (Result.isSuccess(saved)) controller.applyRun(saved.success);
  };

  const damage = async (combatant: Combatant, amount: number) => {
    const before = controller.hpOf(combatant);
    const applied = await controller.applyDamage(combatant, amount);

    if (Result.isFailure(applied)) {
      toast.add({
        type: "destructive",
        title: `${combatant.displayName} is unchanged`,
        description: "That did not reach the server. The hit points are back to what it holds.",
      });
      return;
    }

    // The prototype's own toast, word for word (`:107`) — it is the product
    // saying out loud that zero hit points is not a removal. The variant is the
    // one thing changed: green for a monster going down is right at a table,
    // and wrong when it is somebody's paladin.
    if (applied.success.hpCurrent === 0 && before > 0) {
      toast.add({
        type: combatant.kind === "pc" ? "destructive" : "success",
        title: `${combatant.displayName} downed`,
        description: "Still in initiative — remove them when you're ready.",
      });
    }
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
   * How far someone walks, from the front of their speed: the stat block's for
   * a creature, the sheet's for a party member, nothing for a row the DM typed.
   */
  const party = partyResource.state === "ready" ? partyResource.value : [];
  const speedOf = (combatant: Combatant): number | undefined => {
    if (combatant.creatureId !== null) {
      return leadingFeet(view?.creatures.get(combatant.creatureId)?.statBlock.speed);
    }
    if (combatant.characterId === null) return undefined;
    const character = party.find((seat) => seat.character?.id === combatant.characterId)?.character;
    return leadingFeet(character?.sheet.identity?.speed);
  };
  const labels = useMemo(() => tokenLabels(state?.combatants ?? []), [state?.combatants]);

  const saved = useCallback(() => {
    setAdding(false);
    setEditing(undefined);
    refresh();
  }, [refresh]);

  const back: LinkProps = { to: "/campaigns/$campaignId", params: { campaignId } };

  return (
    <TooltipProvider>
      <TopBar
        framed
        title={state?.run.encounterName ?? "The fight"}
        {...(state !== undefined && {
          badge: (
            <Badge variant="secondary">
              {rolling && !over ? "Initiative" : `Round ${String(state.run.round)}`}
            </Badge>
          ),
          subtitle: over
            ? "This fight is over"
            : rolling
              ? rollingLine(state.combatants)
              : upLine(state.combatants, state.run.activeCombatantId),
        })}
      >
        {state !== undefined && !over && (
          <>
            {connection.status !== "live" && (
              <Button variant="outline" size="sm" onClick={connection.reconnect}>
                <Icon name="octagon-x" size={13} />
                {connection.status === "stopped" ? "Not listening" : "Reconnecting…"}
              </Button>
            )}
            <span className="flex items-center gap-2">
              <Switch
                id="run-share"
                checked={state.run.visibility === "shared"}
                disabled={share.busy}
                onCheckedChange={(next) => void setShared(next)}
              />
              <Label htmlFor="run-share">Share</Label>
            </span>
            {/* While rolling, the round's one start is the panel's *Start
                round N*, so the bar carries no second peach button. */}
            {!rolling && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button size="sm" disabled={turn.busy} onClick={() => void advance()}>
                      {turn.busy ? "Advancing…" : "Next turn"}
                      <Icon name="chevron-right" size={14} />
                    </Button>
                  }
                />
                <TooltipContent shortcut="SPACE">Advance initiative</TooltipContent>
              </Tooltip>
            )}
            <Button variant="destructive" size="sm" onClick={() => setEnding(true)}>
              End
            </Button>
          </>
        )}
        {over && (
          <Button variant="secondary" size="sm" nativeButton={false} render={<Link {...back} />}>
            Back to the campaign
          </Button>
        )}
      </TopBar>
      {resource.state === "loading" && <Loading label="Reading the fight…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {state !== undefined && view !== undefined && (
        <div className="flex flex-col gap-4">
          {over && (
            <p
              role="status"
              className="rounded-card border border-hairline bg-surface-card px-card py-2.5 text-body-s leading-body text-muted-foreground"
            >
              This fight came off the table. The order and the hit points below are how it finished
              — they are saved to Session {view.session.number}.
            </p>
          )}
          {controller.staleness !== undefined && (
            <p
              role="status"
              className="rounded-card border border-hairline bg-surface-card px-card py-2.5 text-body-s leading-body text-danger"
            >
              The last re-read did not answer, so this may be a moment behind. Everything below is
              the last thing the server said.
            </p>
          )}

          <RunLayout
            initiative={
              rolling && !over ? (
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
              ) : (
                <InitiativeList
                  run={state.run}
                  combatants={state.combatants}
                  hpOf={controller.hpOf}
                  selectedId={selected?.id}
                  disabled={frozen}
                  onSelect={(combatant) => setSelectedId(combatant.id)}
                  onAdd={() => setAdding(true)}
                  onReroll={() => void reroll()}
                />
              )
            }
            map={
              hasBoard(boardResource) ? (
                <RunBoardCard
                  resource={boardResource}
                  reload={reloadBoard}
                  over={over}
                  tokens={{
                    combatants: state.combatants,
                    labels,
                    hpOf: controller.hpOf,
                    selected,
                    activeId: state.run.activeCombatantId,
                    speedOf,
                    movable: !frozen,
                    onSelect: (combatant) => setSelectedId(combatant.id),
                    onMove: move,
                  }}
                />
              ) : null
            }
            card={
              <CombatantPanel
                combatant={selected}
                hp={selected === undefined ? 0 : controller.hpOf(selected)}
                creatures={view.creatures}
                active={selected !== undefined && selected.id === state.run.activeCombatantId}
                following={selectedId === undefined}
                disabled={frozen || share.busy}
                conditionsBusy={conditions.busy}
                rolling={rolling}
                onTheirTurn={() => selected !== undefined && void setActive(selected)}
                onEdit={() => setEditing(selected)}
                onFollow={() => setSelectedId(undefined)}
                onDamage={(amount) => selected !== undefined && void damage(selected, amount)}
                onConditions={(next) =>
                  selected !== undefined && void setConditions(selected, next)
                }
                onRoll={dice.roll}
              />
            }
            rest={
              <>
                <DmDiceCard dice={dice} />
                <HobSpendsCard
                  allowed={state.run.allowHobDirectWrites}
                  over={over}
                  updates={state.directUpdates}
                  switchBusy={direct.busy}
                  busy={direct.busy}
                  onAllow={(allowed) => void setHobDirectWrites(allowed)}
                  onUndo={(update) => void undoDirectUpdate(update)}
                />
                {!over && <ShareNpcCard path={path} />}
                {!over && (
                  <SessionNpcMonitorPanel path={path} refreshToken={npcProposalRefreshToken} />
                )}
                {!over && (
                  <SessionNpcProposalWatch path={path} refreshToken={npcProposalRefreshToken} />
                )}
                <DiceTray rolls={trayRolls} status={over ? "stopped" : connection.status} />
                <SessionLog
                  events={log}
                  combatants={state.combatants}
                  status={over ? "stopped" : connection.status}
                />
              </>
            }
          />
        </div>
      )}

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
      {ending && view !== undefined && (
        <EndRunDialog
          path={path}
          session={view.session}
          encounterName={state?.run.encounterName ?? "this fight"}
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
