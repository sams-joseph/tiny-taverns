import type {
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
} from "@taverns/ui";
import { Effect, Result } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { reads } from "../api/keys";
import { Hob, useHobPanel } from "../hob";
import { AppShell, TopBar } from "../shell/AppShell";
import { SaveFailure } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";
import { sessionNpcProposalSummaryAtom } from "../cast/load";
import { CombatantDialog } from "./CombatantDialog";
import { CombatantPanel } from "./CombatantPanel";
import { EndRunDialog } from "./EndRunDialog";
import { InitiativeList } from "./InitiativeList";
import { rollsAtom, runViewAtom, type RunPath } from "./load";
import { SessionLog } from "./SessionLog";
import { newRequestId, useRunState } from "./state";
import { useLiveStream } from "./stream";

/**
 * The encounter runner — `ui_kits/dm-screen/EncounterRunner.jsx`, against the
 * real API and a real stream.
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
          <h3 className="text-title-s font-semibold">NPC proposals waiting</h3>
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
    return <FailureNotice failure={resource.failure} onRetry={reload} />;

  const shareable = resource.value.filter((npc: Npc) => npc.visibility === "shared");
  if (shareable.length === 0) {
    return (
      <section className="rounded-card border border-hairline bg-surface-card p-card">
        <h3 className="text-title-s font-semibold text-foreground">Open at the table</h3>
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
          <h3 className="text-title-s font-semibold text-foreground">Open at the table</h3>
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
        <h3 className="text-title-s font-semibold text-foreground">Scene cast</h3>
        <p className="mt-2 text-body-s text-muted-foreground">Reading open NPC conversations…</p>
      </section>
    );
  }
  if (resource.state === "failed")
    return <FailureNotice failure={resource.failure} onRetry={reload} />;

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
          <h3 className="text-title-s font-semibold text-foreground">Scene cast</h3>
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
            <h4 className="text-body-s font-semibold text-foreground">{row.npc.name}</h4>
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
      <div className="mt-3 max-h-80 space-y-2 overflow-auto rounded-control border border-hairline bg-surface-card p-2">
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
        <h2 className="flex-1 text-label-s leading-none font-semibold tracking-caps uppercase text-muted-foreground">
          Dice tray
        </h2>
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

function HobDirectUpdates({
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
      <div className="border-b border-hairline px-card py-3">
        <p className="flex items-center gap-2 text-label font-semibold uppercase tracking-label text-muted-foreground">
          <Icon name="sparkles" size={13} />
          Hob's direct spends
        </p>
      </div>
      <div className="divide-y divide-hairline">
        {updates.map((update) => {
          const spent = update.afterUsed - update.beforeUsed;
          const left = update.resourceMax - update.afterUsed;
          return (
            <article
              key={update.id}
              className="flex items-start justify-between gap-3 px-card py-3"
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
    </section>
  );
}

export function RunScreen() {
  const { campaignId, sessionId, runId } = useParams({
    from: "/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
  });
  const path = useMemo<RunPath>(
    () => ({ campaignId, sessionId, runId }),
    [campaignId, sessionId, runId],
  );

  const [resource, reload] = useApiAtom(runViewAtom(path));
  const [rollsResource, reloadRolls] = useApiAtom(rollsAtom(path));
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
  const selected =
    state?.combatants.find((row) => row.id === selectedId) ??
    (selectedId === undefined ? active : undefined);

  const advance = useCallback(async () => {
    if (state === undefined || turn.busy) return;
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

  /**
   * A d20 for every monster, in one submit.
   *
   * There is no roll endpoint and there should not be — a roll is not durable
   * state, only the number it produced is — so this is `combatants.update` per
   * monster, composed into one Effect for the reason every other multi-write in
   * this app is: one busy flag, one failure. The party are left alone; they
   * roll their own dice and the DM types what they say.
   */
  const rollInitiative = async () => {
    if (state === undefined) return;
    const monsters = state.combatants.filter((combatant) => combatant.kind === "npc");
    const rolled = await turn.submit(
      (client) =>
        Effect.all(
          monsters.map((combatant) =>
            client.combatants.update({
              params: { ...path, combatantId: combatant.id },
              payload: { initiative: 1 + Math.floor(Math.random() * 20) },
            }),
          ),
          { concurrency: "unbounded" },
        ),
      // Initiative is the fight's alone, and the fight is re-read by the
      // controller below rather than by an atom.
      [],
    );
    // The list reorders, so this is a re-read rather than a merge — the same
    // rule the campaign screen follows for anything that changes a list's shape.
    if (Result.isSuccess(rolled)) refresh();
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

  const saved = useCallback(() => {
    setAdding(false);
    setEditing(undefined);
    refresh();
  }, [refresh]);

  const back: LinkProps = { to: "/campaigns/$campaignId", params: { campaignId } };
  // Closed by default — see `CampaignsScreen`, and `useHobPanel`'s own note.
  // Doubly so here: mid-fight is the last moment to hand 400px to a panel that
  // cannot answer, and Esc already means "close the panel" only while it is open.
  const hob = useHobPanel({ initialOpen: false });

  return (
    <TooltipProvider>
      <AppShell
        fill
        onAskHob={hob.toggle}
        panel={<Hob hob={hob} campaignId={campaignId} />}
        // The campaign's name is the link back to prep, and the shell builds
        // that link itself now — a fight is inside a campaign, so the campaign
        // row is drawn with the way home already in it. The badge is the one
        // thing here the route cannot answer.
        campaignName={view?.campaign.name}
        campaignBadge={
          view === undefined ? undefined : (
            <Badge variant="secondary">Session {view.session.number}</Badge>
          )
        }
        topBar={
          <TopBar
            title={state?.run.encounterName ?? "The fight"}
            subtitle={
              state === undefined
                ? undefined
                : `Round ${String(state.run.round)} · ${
                    over
                      ? "this fight is over"
                      : active === undefined
                        ? "nobody is up"
                        : `${active.displayName} is up`
                  }`
            }
          >
            {state !== undefined && !over && (
              <>
                {connection.status !== "live" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-on-dark-muted"
                    onClick={connection.reconnect}
                  >
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
                <span className="flex items-center gap-2">
                  <Switch
                    id="run-hob-direct-writes"
                    checked={state.run.allowHobDirectWrites}
                    disabled={direct.busy}
                    onCheckedChange={(next) => void setHobDirectWrites(next)}
                  />
                  <Label htmlFor="run-hob-direct-writes">Hob spends</Label>
                </span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button size="sm" disabled={turn.busy} onClick={() => void advance()}>
                        {turn.busy ? "Advancing…" : "Next turn"}
                      </Button>
                    }
                  />
                  <TooltipContent shortcut="SPACE">Advance initiative</TooltipContent>
                </Tooltip>
                <Button variant="destructive" size="sm" onClick={() => setEnding(true)}>
                  End
                </Button>
              </>
            )}
            {over && (
              <Button
                variant="secondary"
                size="sm"
                nativeButton={false}
                render={<Link {...back} />}
              >
                Back to the campaign
              </Button>
            )}
          </TopBar>
        }
      >
        {resource.state === "loading" && <Loading label="Reading the fight…" />}
        {resource.state === "failed" && (
          <div className="max-w-3xl">
            <FailureNotice failure={resource.failure} onRetry={reload} />
          </div>
        )}

        {state !== undefined && view !== undefined && (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {over && (
              <p
                role="status"
                className="rounded-card border border-hairline bg-surface-card px-card py-2.5 text-body-s leading-body text-muted-foreground"
              >
                This fight came off the table. The order and the hit points below are how it
                finished — they are saved to Session {view.session.number}.
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

            {/* The column's width, not the viewport's — `main` is the container.
                `@3xl` (48rem = 768px) leaves the initiative list 412px beside a
                340px stat panel, and with the rail gone the column reaches that
                256px sooner than the `lg:` breakpoint it replaces did. */}
            <div className="grid min-h-0 flex-1 gap-4 @3xl:grid-cols-[1fr_var(--spacing-aside)]">
              <InitiativeList
                run={state.run}
                combatants={state.combatants}
                hpOf={controller.hpOf}
                selectedId={selected?.id}
                disabled={frozen}
                onSelect={(combatant) =>
                  setSelectedId((current) => (current === combatant.id ? undefined : combatant.id))
                }
                onDamage={(combatant, amount) => void damage(combatant, amount)}
                onAdd={() => setAdding(true)}
                onRoll={() => void rollInitiative()}
              />

              <div className="flex min-h-0 flex-col gap-4">
                <CombatantPanel
                  combatant={selected}
                  hp={selected === undefined ? 0 : controller.hpOf(selected)}
                  creatures={view.creatures}
                  active={selected !== undefined && selected.id === state.run.activeCombatantId}
                  following={selectedId === undefined}
                  disabled={frozen || share.busy}
                  onTheirTurn={() => selected !== undefined && void setActive(selected)}
                  onEdit={() => setEditing(selected)}
                  onFollow={() => setSelectedId(undefined)}
                />
                <HobDirectUpdates
                  updates={state.directUpdates}
                  busy={direct.busy}
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
              </div>
            </div>
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
      </AppShell>
    </TooltipProvider>
  );
}
