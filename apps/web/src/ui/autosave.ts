import { Effect, Result } from "effect";
import type { HttpClient } from "effect/http";
import { useCallback, useEffect, useRef } from "react";
import { useInvalidate } from "../api/atoms";
import { runApiResult, type TavernsClient } from "../api/client";
import type { ApiFailure } from "../api/failure";
import type { Invalidation } from "../api/keys";
import { useCredential } from "../auth/credential";

/**
 * Saving as you type, for a form with no *Save* — the Notes pane and the Cast's
 * NPC drawer. This is the timing, kept out of both components so it can be
 * tested without a screen; what a form's fields are and how they reach the
 * wire is each caller's (`campaign/noteAutosave.ts`, `cast/npcAutosave.ts`).
 *
 * - **Debounced.** Typing waits `AUTOSAVE_DELAY_MS` after the last keystroke;
 *   a discrete change (a toggle, a switch) and a blur, a close or leaving the
 *   tab save at once.
 * - **One request in flight per row.** A save asked for while one is on the
 *   wire waits for it and then sends whatever is still unsaved, so the edits
 *   coalesce and the server hears them in order.
 * - **Only what changed.** Each request carries the fields that differ from
 *   what the server last acknowledged, as the caller's `changes` names them.
 * - **Settled or not.** `changes` is told whether the debounce is asking
 *   (`settled: false`) or something that means the writer has finished — a
 *   blur, a discrete change, a close, *Retry*. A field that must never be sent
 *   half-typed answers only a settled ask.
 */
export const AUTOSAVE_DELAY_MS = 1000;

/**
 * `idle` until the first save; `saving` while one is waiting or on the wire;
 * `saved` once nothing is left unsaved; `failed` until the next attempt.
 */
export type SaveStatus =
  | { readonly state: "idle" }
  | { readonly state: "saving" }
  | { readonly state: "saved" }
  | { readonly state: "failed"; readonly failure: ApiFailure };

export interface AutoSaverOptions<F, P> {
  /** What differs between the draft and what the server holds, to be sent. Empty for nothing. */
  readonly changes: (draft: F, saved: F, settled: boolean) => P;
  readonly send: (patch: P) => Promise<Result.Result<unknown, ApiFailure>>;
  /**
   * A failure no retry can mend — the row moved on under the form. The saver
   * then sends nothing more, and a blur or a keystroke cannot turn the failure
   * back into *Saving…*: what it offers (a reload) stays on screen.
   */
  readonly halts?: (failure: ApiFailure) => boolean;
  readonly delay?: number;
}

export class AutoSaver<F extends object, P extends Partial<F> = Partial<F>> {
  #draft: F;
  #saved: F;
  #status: SaveStatus = { state: "idle" };
  #timer: ReturnType<typeof setTimeout> | undefined;
  #inFlight: Promise<void> | undefined;
  /** A save was asked for while one was on the wire, and whether it was settled. */
  #again: { readonly settled: boolean } | undefined;
  #stopped = false;
  readonly #listeners = new Set<() => void>();
  readonly #changes: (draft: F, saved: F, settled: boolean) => P;
  readonly #send: (patch: P) => Promise<Result.Result<unknown, ApiFailure>>;
  readonly #halts: (failure: ApiFailure) => boolean;
  readonly #delay: number;

  constructor(fields: F, options: AutoSaverOptions<F, P>) {
    this.#draft = fields;
    this.#saved = fields;
    this.#changes = options.changes;
    this.#send = options.send;
    this.#halts = options.halts ?? (() => false);
    this.#delay = options.delay ?? AUTOSAVE_DELAY_MS;
  }

  get draft(): F {
    return this.#draft;
  }

  get status(): SaveStatus {
    return this.#status;
  }

  /** For `useSyncExternalStore`: bound, so it can be handed over as it is. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getStatus = (): SaveStatus => this.#status;

  /** Typing: saved once it stops for `delay`. */
  type(fields: Partial<F>): void {
    this.#draft = { ...this.#draft, ...fields };
    if (this.#stopped) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.#flush(false), this.#delay);
    if (this.#status.state !== "saving" && this.#unsaved()) this.#set({ state: "saving" });
  }

  /** A discrete change: saved now, with anything typed before it. */
  set(fields: Partial<F>): Promise<void> {
    this.#draft = { ...this.#draft, ...fields };
    return this.flush();
  }

  /** Send whatever is unsaved now; also what a blur, a close and *Retry* do. */
  flush(): Promise<void> {
    return this.#flush(true);
  }

  /** The row is being deleted: nothing more is sent for it, until `resume`. */
  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /** The delete was refused: the row is still there, and still being written. */
  resume(): void {
    this.#stopped = false;
    void this.flush();
  }

  #flush(settled: boolean): Promise<void> {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#stopped) return Promise.resolve();
    if (this.#inFlight !== undefined) {
      this.#again = { settled: settled || (this.#again?.settled ?? false) };
      return this.#inFlight;
    }
    this.#inFlight = this.#run(settled).finally(() => {
      this.#inFlight = undefined;
    });
    return this.#inFlight;
  }

  /** Anything at all the server does not have, a held-back field included. */
  #unsaved(): boolean {
    return Object.keys(this.#changes(this.#draft, this.#saved, true)).length > 0;
  }

  async #run(first: boolean): Promise<void> {
    let ask: { readonly settled: boolean } | undefined = { settled: first };
    while (ask !== undefined && !this.#stopped) {
      this.#again = undefined;
      const patch = this.#changes(this.#draft, this.#saved, ask.settled);
      if (Object.keys(patch).length === 0) break;
      this.#set({ state: "saving" });
      const result = await this.#send(patch);
      if (Result.isFailure(result)) {
        if (this.#halts(result.failure)) this.stop();
        this.#set({ state: "failed", failure: result.failure });
        return;
      }
      this.#saved = { ...this.#saved, ...patch };
      ask = this.#takeAgain();
    }
    // Typing that landed while the last request was out is still waiting on
    // its own timer, or on the blur that settles it, and is still being saved.
    if (!this.#stopped && this.#unsaved()) this.#set({ state: "saving" });
    else if (this.#status.state !== "idle") this.#set({ state: "saved" });
  }

  /** The ask that came in while the last request was out, if one did. */
  #takeAgain(): { readonly settled: boolean } | undefined {
    const again = this.#again;
    this.#again = undefined;
    return again;
  }

  #set(status: SaveStatus): void {
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }
}

/** One write a saver sends: run with a fresh credential, and the reads it changed refreshed on success. */
export type SaveWrite = <A, E>(
  use: (client: TavernsClient) => Effect.Effect<A, E, HttpClient.HttpClient>,
  invalidates: Invalidation,
) => Promise<Result.Result<A, ApiFailure>>;

/**
 * One saver per row for as long as the screen is open, each made by `make`
 * the first time its row is asked for, and every one of them flushed when the
 * screen goes — so leaving mid-sentence still saves the sentence, with no
 * guard in the way. Hiding the page flushes too, the last moment a closing
 * tab gives.
 *
 * A saver outlives the pane or drawer that drew it, so closing one and coming
 * back finds what was typed, even while it is still on its way.
 */
export const useAutoSavers = <Id, Row, S extends { flush(): Promise<void>; stop(): void }>(
  idOf: (row: Row) => Id,
  make: (row: Row, write: SaveWrite) => S,
): {
  readonly saverFor: (row: Row) => S;
  /** The row is gone, or is to be read again: its saver goes with it. */
  readonly forget: (id: Id) => void;
} => {
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const savers = useRef(new Map<Id, S>());
  // Read at send time, so a saver made before a token refresh sends with the
  // current way of getting one.
  const latest = useRef({ fetchCredential, invalidate, idOf, make });
  latest.current = { fetchCredential, invalidate, idOf, make };

  const write = useCallback<SaveWrite>(async (use, invalidates) => {
    // Fetched per save, never held: a hosted session token lives a minute.
    const token = await latest.current.fetchCredential();
    const result = await runApiResult(use, token);
    if (Result.isSuccess(result) && invalidates.length > 0) latest.current.invalidate(invalidates);
    return result;
  }, []);

  const saverFor = useCallback(
    (row: Row): S => {
      const id = latest.current.idOf(row);
      const existing = savers.current.get(id);
      if (existing !== undefined) return existing;
      const saver = latest.current.make(row, write);
      savers.current.set(id, saver);
      return saver;
    },
    [write],
  );

  const forget = useCallback((id: Id) => {
    savers.current.get(id)?.stop();
    savers.current.delete(id);
  }, []);

  useEffect(() => {
    const all = savers.current;
    const flushAll = () => {
      for (const saver of all.values()) void saver.flush();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flushAll();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flushAll();
    };
  }, []);

  return { saverFor, forget };
};
