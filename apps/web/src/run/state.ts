import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import type { Combatant, CombatantId, EncounterRun } from "@taverns/api";
import { Option, Result } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { asResource } from "../api/atoms";
import { runApiResult } from "../api/client";
import type { ApiFailure } from "../api/failure";
import { useCredential } from "../auth/credential";
import { liveStateAtom, type LiveState, type RunPath } from "./load";

/**
 * The fight, as this screen holds it: the server's rows, plus the hits that
 * have not been answered yet.
 *
 * ### What is optimistic, and what is not
 *
 * **Hit points move before the round trip. The turn marker does not.** Damage
 * is the write that happens every few seconds while four people watch, and a
 * number that waits 200ms to change reads as a tool that is thinking. Whose
 * turn it is gets *read aloud*: guessing it and being wrong means saying the
 * wrong name at the table, which is worse than the wait, and the guess is not
 * free either — the order is `initiative desc, created_at asc, id asc` and
 * reproducing it here would be a second implementation of the thing the server
 * walks in `nextTurn`.
 *
 * ### When the optimistic value and the server disagree, the server wins — and
 * this is exactly how
 *
 * Every optimistic hit puts an entry in `pending`, keyed by combatant, holding
 * the hit points this screen believes in and a count of its own outstanding
 * writes. The rules are three lines:
 *
 *  - **A row with an outstanding write of ours renders `pending`.** Not the
 *    server's row, and not a delta applied on top of it — a delta would
 *    double-count for the moment between the server applying the hit and our
 *    own response landing, and the DM would see 11 flash where 16 belongs.
 *  - **Only our own response clears it**, and only when it is the last one
 *    outstanding. A stream refresh arriving mid-flight is merged into the
 *    server rows underneath and changes nothing on screen until then.
 *  - **A failure clears it too, with nothing to replace it.** The number snaps
 *    back to what the server actually holds and a toast says so. That is the
 *    honest outcome: `CombatantDamage` carries a `requestId` so a *repeat* is
 *    safe, but a silent auto-retry would leave the DM unsure whether the ogre's
 *    12 landed, and unsure is worse than told.
 *
 * The damage endpoint takes a **delta**, which is what makes all of this sound
 * rather than merely quick: "the ogre hits for 12" stays true whatever anyone's
 * screen last showed, so a hit computed from a stale row still applies the
 * right amount. An absolute `hpCurrent` write would not.
 *
 * `run/optimistic.test.tsx` pins every one of those rules through the screen.
 *
 * ### The rows are the registry's; the pending map is this screen's
 *
 * **The fight lives in `liveStateAtom` and nowhere else.** This hook used to
 * hold a `useState` copy of it, seeded from the screen's own read and re-read by
 * a request loop of its own — two copies of one fight, which is the divergence a
 * registry exists to prevent. What it holds now is the half that is genuinely
 * local: **which of this browser's writes have not been answered yet.** That is
 * form state, not shared state, for the reason `api/mutation.ts` gives about its
 * busy flag — and one step further, because an optimistic value that outlived
 * the mount would show a hit on a fight the DM had navigated away from and back
 * to.
 *
 * The three things the atom could not do on its own, and how each is expressed:
 *
 *  - **The doorbell must not multiply requests.** `useAtomRefresh` interrupts
 *    the read in flight and starts another, so six events arriving in one
 *    network chunk would be six requests where the contract is one, and at most
 *    one behind it. `refresh` below is that coalescer, over `AsyncResult`'s own
 *    `waiting` rather than over a hand-rolled in-flight flag.
 *  - **A failed re-read has to heal itself.** An atom does not retry, and the
 *    doorbell and the re-read travel over different connections — an established
 *    stream keeps delivering while a new request cannot leave at all, which is
 *    exactly what a browser does the moment its wifi goes. Measured in Chromium.
 *    So a failure schedules the next attempt, doubling to a ceiling.
 *  - **A write's own answer is newer than any read.** `applyRun` and `merge`
 *    write it straight into the atom; see `writableApiAtom` for why the atom is
 *    writable at all.
 *
 * ### `Atom.optimistic` is the library's own answer here, and it is the wrong one
 *
 * Checked against the four rules above rather than assumed, because it is the
 * first thing anyone will reach for next time. It holds two of them — the
 * pending value composes over the optimistic current rather than the server's
 * row, and a failure rolls back with nothing to replace it — and misses the two
 * that make this screen work at a table:
 *
 *  - **It settles a transition by refreshing the source atom.** The runner
 *    settles by *using the answer it already has*, which is what keeps hit
 *    points right with the stream down. Under `optimistic` every hit would cost
 *    a re-read on top of the one the doorbell is already about to cause, and
 *    with the connection down it would cost a re-read that fails.
 *  - **It has no per-row pending flag**, because its value is the whole atom.
 *    `isPending` is per combatant, and so is the rule it states: two hits on two
 *    monsters are two independent windows, not one.
 */

/** One combatant's unanswered hit points, and how many writes are outstanding. */
interface Pending {
  readonly hpCurrent: number;
  readonly outstanding: number;
}

const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, value));

/** How long a failed re-read waits before trying again, doubling to a ceiling. */
const RETRY_BASE_MS = 500;
const RETRY_CEILING_MS = 5_000;

/**
 * A key the server deduplicates on, per run.
 *
 * Not offline-first design: it stops a double-tapped damage button taking ten
 * hit points instead of five, which on a laptop trackpad at a table is a matter
 * of when rather than whether.
 */
let fallbackRequests = 0;
export const newRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `req-${String(++fallbackRequests)}-${String(Date.now())}`;

export interface RunController {
  /** The fight, or `undefined` until the first load has produced one. */
  readonly state: LiveState | undefined;
  /** What to draw in the bar: the optimistic value while one is outstanding. */
  readonly hpOf: (combatant: Combatant) => number;
  /** True while this screen has an unanswered write for that combatant. */
  readonly isPending: (id: CombatantId) => boolean;
  /**
   * Re-read the run and its combatants. Safe to call as often as the doorbell
   * rings: overlapping calls collapse into one more request, not a queue.
   */
  readonly refresh: () => void;
  /**
   * Take the run a write just answered with, without waiting for the doorbell.
   *
   * `nextTurn`, the share switch and moving the marker by hand all return the
   * new run, and it is later than anything on screen. Using it keeps those
   * three instant when the stream is down, which is the state this screen has
   * to stay usable in.
   */
  readonly applyRun: (run: EncounterRun) => void;
  /** Positive damages, negative heals. Clamped into `[0, hpMax]` both ends. */
  readonly applyDamage: (
    combatant: Combatant,
    amount: number,
  ) => Promise<Result.Result<Combatant, ApiFailure>>;
  /** The last failed re-read, if the screen is showing rows older than it should. */
  readonly staleness: ApiFailure | undefined;
}

export function useRunState(path: RunPath): RunController {
  const fetchCredential = useCredential();
  const atom = liveStateAtom(path);
  const live = useAtomValue(atom);
  const write = useAtomSet(atom);
  const refreshLive = useAtomRefresh(atom);

  const [pending, setPending] = useState<ReadonlyMap<CombatantId, Pending>>(() => new Map());

  /**
   * The rows, and whether they are as new as they should be — two questions,
   * two answers, and the difference between them is this screen's whole
   * failure story.
   *
   * `AsyncResult.value` is the *last good* fight, so a failed re-read keeps the
   * initiative list on screen: a fight the DM can still read beats an error
   * card where the list was. `asResource` is then what says the read failed at
   * all, and it is the one place an interrupted read — a refresh that landed on
   * top of another — is told apart from a real failure. Memoised on the
   * `AsyncResult`, which is stable per registry value, because the retry effect
   * keys on it and an identity that changed every render would restart the
   * timer every render. Same rule `useApiAtom` follows.
   */
  const state = useMemo(() => Option.getOrUndefined(AsyncResult.value(live)), [live]);
  const resource = useMemo(() => asResource(live), [live]);
  const staleness = resource.state === "failed" ? resource.failure : undefined;

  /**
   * One re-read at a time, and at most one more queued behind it.
   *
   * A burst of events — six goblins seeded, or a DM holding the space bar —
   * would otherwise open six identical requests. The registry answers a refresh
   * during a read by interrupting it and starting again, so those six would be
   * six round trips of which five are abandoned; the contract is one, plus one.
   *
   * `busy` is set on the way *in* rather than read off the last render, because
   * a chunk carrying several events rings this six times before React renders
   * once.
   */
  const busy = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(() => {
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    refreshLive();
  }, [refreshLive]);

  useEffect(() => {
    if (live.waiting) return;
    busy.current = false;
    if (!again.current) return;
    again.current = false;
    refresh();
  }, [live, refresh]);

  /**
   * A failed re-read retries itself, and that is not belt-and-braces.
   *
   * The doorbell and the re-read travel over different connections: an
   * established stream can keep delivering events while a *new* request cannot
   * get out at all, which is exactly what a browser does the moment its wifi
   * goes. Measured in Chromium with the network cut: the event arrived, the
   * re-read failed, and without this the screen sat behind the server until
   * something else happened to ring the bell. Retrying makes it heal on its own.
   *
   * Only a *settled* failure schedules one — a failure that is `waiting` is the
   * attempt already under way — and only a success clears the count, so the
   * backoff grows across a run of failures rather than restarting on each.
   *
   * **The count is raised once per distinct failure, not once per effect run**,
   * and that is not defensive: `main.tsx` mounts the app in `StrictMode`, which
   * invokes every effect twice in development, so a bare `+= 1` climbs the
   * backoff at double speed there and at single speed in a build — a difference
   * measured in a real browser before this line existed. Keying on the
   * `AsyncResult` itself is what makes the step a property of the failure rather
   * than of how many times React chose to run this.
   */
  const failures = useRef(0);
  const counted = useRef<unknown>(undefined);
  useEffect(() => {
    if (AsyncResult.isSuccess(live)) {
      failures.current = 0;
      return;
    }
    if (!AsyncResult.isFailure(live) || live.waiting) return;
    if (counted.current !== live) {
      counted.current = live;
      failures.current += 1;
    }
    const wait = Math.min(RETRY_CEILING_MS, RETRY_BASE_MS * 2 ** (failures.current - 1));
    const timer = setTimeout(refresh, wait);
    return () => clearTimeout(timer);
  }, [live, refresh]);

  /**
   * Edit the rows in place, keeping whatever state the read is in.
   *
   * Guarded on the mount because a write outlives the screen: a DM who leaves
   * mid-hit still has a damage response to land, and `useAtomSet` reads the
   * atom to apply a functional update — which on an atom the registry has
   * already disposed would *rebuild* it, so leaving the fight would cost a
   * request nobody is watching. It was a no-op through `setState` before.
   */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const edit = useCallback(
    (update: (current: LiveState) => LiveState) => {
      if (!mounted.current) return;
      write((current) => AsyncResult.map(current, update));
    },
    [write],
  );

  const applyRun = useCallback(
    (run: EncounterRun) => edit((current) => ({ ...current, run })),
    [edit],
  );

  /** Swap one row in place — what our own write's answer is worth. */
  const merge = useCallback(
    (row: Combatant) =>
      edit((current) => ({
        ...current,
        combatants: current.combatants.map((other) => (other.id === row.id ? row : other)),
      })),
    [edit],
  );

  const applyDamage = useCallback(
    async (combatant: Combatant, amount: number) => {
      const from = pending.get(combatant.id)?.hpCurrent ?? combatant.hpCurrent;
      const next = clamp(from - amount, combatant.hpMax);

      setPending((current) => {
        const map = new Map(current);
        map.set(combatant.id, {
          hpCurrent: next,
          outstanding: (current.get(combatant.id)?.outstanding ?? 0) + 1,
        });
        return map;
      });

      const token = await fetchCredential();
      const result = await runApiResult(
        (client) =>
          client.combatants.damage({
            params: { ...path, combatantId: combatant.id },
            payload: { amount, requestId: newRequestId() },
          }),
        token,
      );

      // Merge before releasing, so the row underneath is already right when the
      // optimistic value is taken away. With the stream down this is the only
      // thing that keeps the screen correct, which is why it is not left to the
      // doorbell.
      if (Result.isSuccess(result)) merge(result.success);

      setPending((current) => {
        const held = current.get(combatant.id);
        if (held === undefined) return current;
        const map = new Map(current);
        if (held.outstanding <= 1) map.delete(combatant.id);
        else map.set(combatant.id, { ...held, outstanding: held.outstanding - 1 });
        return map;
      });

      return result;
    },
    [path, fetchCredential, pending, merge],
  );

  const hpOf = useCallback(
    (combatant: Combatant) => pending.get(combatant.id)?.hpCurrent ?? combatant.hpCurrent,
    [pending],
  );

  const isPending = useCallback((id: CombatantId) => pending.has(id), [pending]);

  return { state, hpOf, isPending, refresh, applyRun, applyDamage, staleness };
}
