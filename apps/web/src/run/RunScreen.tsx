import type { Combatant, CombatantId, SessionEvent } from "@taverns/api";
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { Hob, useHobPanel } from "../hob";
import { AppShell, TopBar } from "../shell/AppShell";
import { FailureNotice, Loading } from "../ui/states";
import { CombatantDialog } from "./CombatantDialog";
import { CombatantPanel } from "./CombatantPanel";
import { EndRunDialog } from "./EndRunDialog";
import { InitiativeList } from "./InitiativeList";
import { loadRunView, type RunPath } from "./load";
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
 * **The initial load and the live updates are separate.** The atom does
 * the first read and owns the loading and failed states, exactly as every other
 * screen does. After that the stream's doorbell drives `useRunState.refresh`,
 * which re-reads only the run and its combatants and never puts the screen back
 * into "Loading…" — an initiative list that blinks away every time a goblin
 * takes a hit would be unusable, and a failed *re*-read leaves the last good
 * list on screen with a line saying it may be behind.
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

/** Space advances the turn — the prototype's own shortcut (`:127`). */
const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest("button, input, textarea, select, [role='switch'], [contenteditable='true']") !==
    null;

/**
 * One fight, keyed on the three ids that name it.
 *
 * `RunPath` is already the record the route carries, and `Atom.family` compares
 * it structurally — so the `useMemo` above stops being load-bearing for the
 * read (it still is for `useRunState`, which takes the same object).
 */
const runViewAtom = Atom.family((path: RunPath) =>
  // **It names no reads, and that is load-bearing rather than an oversight.**
  // This atom's value is the controller's starting point (`initial`, below), so
  // a refresh of it *resets the optimistic layer* — the pending hit points, the
  // server-wins reconciliation, all of it. The live half of this screen is
  // `run/state.ts`'s own loop and `run/stream.ts`'s doorbell; a reactivity key
  // here would be a second thing re-reading a fight, fighting the first.
  apiAtom(loadRunView(path), []),
);

export function RunScreen() {
  const { campaignId, sessionId, runId } = useParams({
    from: "/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
  });
  const path = useMemo<RunPath>(
    () => ({ campaignId, sessionId, runId }),
    [campaignId, sessionId, runId],
  );

  const [resource, reload] = useApiAtom(runViewAtom(path));
  const view = resource.state === "ready" ? resource.value : undefined;

  // The half the fight changes, handed to the controller as its starting point.
  // A new `view` — a fresh load, or Try again — resets everything it holds.
  const initial = useMemo(
    () => (view === undefined ? undefined : { run: view.run, combatants: view.combatants }),
    [view],
  );
  const controller = useRunState(path, initial);
  const state = controller.state;

  const [log, setLog] = useState<ReadonlyArray<SessionEvent>>([]);
  const [selectedId, setSelectedId] = useState<CombatantId | undefined>();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Combatant | undefined>();
  const [ending, setEnding] = useState(false);

  const turn = useMutation();
  const share = useMutation();

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
    },
    [refresh],
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
    onReconnected: refresh,
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
