import type { Combatant, CombatantId, EncounterRun } from "@taverns/api";
import { Result } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import { runApiResult } from "../api/client";
import type { ApiFailure } from "../api/failure";
import { useCredential } from "../auth/credential";
import { loadLiveState, type LiveState, type RunPath } from "./load";

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

export function useRunState(path: RunPath, initial: LiveState | undefined): RunController {
  const fetchCredential = useCredential();
  const [state, setState] = useState<LiveState | undefined>(initial);
  const [pending, setPending] = useState<ReadonlyMap<CombatantId, Pending>>(() => new Map());
  const [staleness, setStaleness] = useState<ApiFailure | undefined>();

  // A fresh load — a different run, or a Try-again — replaces everything.
  // `initial`'s identity is what says "this is a new answer", exactly as it is
  // for `useApiResource`'s callback.
  useEffect(() => {
    setState(initial);
    setPending(new Map());
    setStaleness(undefined);
  }, [initial]);

  /**
   * One re-read at a time, and at most one more queued behind it.
   *
   * A burst of events — six goblins seeded, or a DM holding the space bar —
   * would otherwise open six identical requests whose answers could land out of
   * order and put an older list on screen than the one already there.
   *
   * **A failed re-read retries itself**, and that is not belt-and-braces. The
   * doorbell and the re-read travel over different connections: an established
   * stream can keep delivering events while a *new* request cannot get out at
   * all, which is exactly what a browser does the moment its wifi goes. Measured
   * in Chromium with the network cut: the event arrived, the re-read failed, and
   * without this the screen sat behind the server until something else happened
   * to ring the bell. Retrying makes it heal on its own instead.
   */
  const inFlight = useRef(false);
  const again = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;

    void (async () => {
      let failures = 0;
      do {
        again.current = false;
        const token = await fetchCredential();
        const result = await runApiResult(loadLiveState(path), token);
        if (!mounted.current) break;

        if (Result.isSuccess(result)) {
          failures = 0;
          setState(result.success);
          setStaleness(undefined);
        } else {
          // Keep what is on screen. A fight the DM can still read is better
          // than an error card where the initiative list was.
          setStaleness(result.failure);
          failures += 1;
          await new Promise((resume) =>
            setTimeout(resume, Math.min(RETRY_CEILING_MS, RETRY_BASE_MS * 2 ** (failures - 1))),
          );
          again.current = mounted.current;
        }
      } while (again.current);
      inFlight.current = false;
    })();
  }, [path, fetchCredential]);

  const applyRun = useCallback((run: EncounterRun) => {
    setState((current) => (current === undefined ? current : { ...current, run }));
  }, []);

  /** Swap one row in place — what our own write's answer is worth. */
  const merge = useCallback((row: Combatant) => {
    setState((current) =>
      current === undefined
        ? current
        : {
            ...current,
            combatants: current.combatants.map((other) => (other.id === row.id ? row : other)),
          },
    );
  }, []);

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
