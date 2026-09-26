import type {
  CampaignId,
  Note,
  NoteAttachment,
  NoteId,
  NoteKind,
  NoteUpdate,
  Visibility,
} from "@taverns/api";
import { Result } from "effect";
import { useCallback, useEffect, useRef } from "react";
import { useInvalidate } from "../api/atoms";
import { runApiResult } from "../api/client";
import type { ApiFailure } from "../api/failure";
import { reads } from "../api/keys";
import { useCredential } from "../auth/credential";

/**
 * The Notes pane saves as you type — the captain's call over an explicit *Save*
 * — and this is the whole of how, kept out of the component so the timing can
 * be tested without a screen.
 *
 * - **Debounced.** Typing waits `AUTOSAVE_DELAY_MS` after the last keystroke;
 *   a discrete change (the register, the attachment, who can see it) and a
 *   blur, a switch to another note or leaving the tab save at once.
 * - **One request in flight per note.** A save asked for while one is on the
 *   wire waits for it and then sends whatever is still unsaved, so the edits
 *   coalesce and the server hears them in order.
 * - **Only what changed.** The PATCH carries the fields that differ from what
 *   the server last acknowledged, never the whole note.
 * - **The title is held back while it is empty.** `NoteUpdate.title` is a
 *   `NonEmptyString`, so an emptied title is not sent: the body and the rest
 *   still save, the note keeps its last title on the server, and the pane says
 *   so until one is typed.
 *
 * The draft lives here rather than in the pane, and one saver outlives the
 * pane that made it (`useNoteSavers`), so choosing another note and coming
 * back finds what was typed, even while it is still on its way.
 */
export const AUTOSAVE_DELAY_MS = 1000;

/** What the pane edits: the note's own fields, and nothing a list row derives. */
export interface NoteFields {
  readonly title: string;
  readonly body: string;
  readonly kind: NoteKind;
  readonly attachedTo: NoteAttachment | null;
  readonly visibility: Visibility;
}

export const fieldsOf = (note: Note): NoteFields => ({
  title: note.title,
  body: note.body,
  kind: note.kind,
  attachedTo: note.attachedTo,
  visibility: note.visibility,
});

/**
 * `idle` until the first save; `saving` while one is waiting or on the wire;
 * `saved` once nothing is left unsaved; `failed` until the next attempt.
 */
export type SaveStatus =
  | { readonly state: "idle" }
  | { readonly state: "saving" }
  | { readonly state: "saved" }
  | { readonly state: "failed"; readonly failure: ApiFailure };

/** What differs between the draft and what the server holds, as a PATCH says it. */
export const changesOf = (draft: NoteFields, saved: NoteFields): NoteUpdate => {
  const title = draft.title.trim();
  return {
    ...(title !== "" && title !== saved.title ? { title } : {}),
    ...(draft.body !== saved.body ? { body: draft.body } : {}),
    ...(draft.kind !== saved.kind ? { kind: draft.kind } : {}),
    ...(draft.attachedTo?.id !== saved.attachedTo?.id ? { attachedTo: draft.attachedTo } : {}),
    ...(draft.visibility !== saved.visibility ? { visibility: draft.visibility } : {}),
  };
};

export type SendPatch = (patch: NoteUpdate) => Promise<Result.Result<unknown, ApiFailure>>;

export class NoteSaver {
  #draft: NoteFields;
  #saved: NoteFields;
  #status: SaveStatus = { state: "idle" };
  #timer: ReturnType<typeof setTimeout> | undefined;
  #inFlight: Promise<void> | undefined;
  /** A save was asked for while one was on the wire. */
  #again = false;
  #stopped = false;
  readonly #listeners = new Set<() => void>();
  readonly #send: SendPatch;
  readonly #delay: number;

  constructor(note: NoteFields, send: SendPatch, delay: number = AUTOSAVE_DELAY_MS) {
    this.#draft = note;
    this.#saved = note;
    this.#send = send;
    this.#delay = delay;
  }

  get draft(): NoteFields {
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
  type(fields: Partial<NoteFields>): void {
    this.#draft = { ...this.#draft, ...fields };
    if (this.#stopped) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), this.#delay);
    if (this.#status.state !== "saving" && this.#unsaved()) this.#set({ state: "saving" });
  }

  /** A discrete change: saved now, with anything typed before it. */
  set(fields: Partial<NoteFields>): Promise<void> {
    this.#draft = { ...this.#draft, ...fields };
    return this.flush();
  }

  /** Send whatever is unsaved now; also what *Retry* does. */
  flush(): Promise<void> {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#stopped) return Promise.resolve();
    if (this.#inFlight !== undefined) {
      this.#again = true;
      return this.#inFlight;
    }
    this.#inFlight = this.#run().finally(() => {
      this.#inFlight = undefined;
    });
    return this.#inFlight;
  }

  /** The note is being deleted: nothing more is sent for it, until `resume`. */
  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /** The delete was refused: the note is still there, and still being written. */
  resume(): void {
    this.#stopped = false;
    void this.flush();
  }

  #unsaved(): boolean {
    return Object.keys(changesOf(this.#draft, this.#saved)).length > 0;
  }

  async #run(): Promise<void> {
    do {
      this.#again = false;
      const patch = changesOf(this.#draft, this.#saved);
      if (Object.keys(patch).length === 0) break;
      this.#set({ state: "saving" });
      const result = await this.#send(patch);
      if (Result.isFailure(result)) {
        this.#set({ state: "failed", failure: result.failure });
        return;
      }
      this.#saved = { ...this.#saved, ...patch };
    } while (this.#again && !this.#stopped);
    // Typing that landed while the last request was out is still waiting on
    // its own timer, and is still being saved.
    if (this.#timer !== undefined && this.#unsaved()) this.#set({ state: "saving" });
    else if (this.#status.state !== "idle") this.#set({ state: "saved" });
  }

  #set(status: SaveStatus): void {
    this.#status = status;
    for (const listener of this.#listeners) listener();
  }
}

/**
 * One saver per note for as long as the Notes tab is open, each sending its
 * own PATCH and naming `reads.notes`, and every one of them flushed when the
 * tab goes — so leaving mid-sentence still saves the sentence, with no guard
 * in the way. Hiding the page flushes too, the last moment a closing tab gives.
 */
export const useNoteSavers = (
  campaignId: CampaignId,
): {
  readonly saverFor: (note: Note) => NoteSaver;
  /** The note is gone: its saver goes with it. */
  readonly forget: (noteId: NoteId) => void;
} => {
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const savers = useRef(new Map<NoteId, NoteSaver>());
  // Read at send time, so a saver made before a token refresh sends with the
  // current way of getting one.
  const latest = useRef({ fetchCredential, invalidate });
  latest.current = { fetchCredential, invalidate };

  const saverFor = useCallback(
    (note: Note): NoteSaver => {
      const existing = savers.current.get(note.id);
      if (existing !== undefined) return existing;
      const saver = new NoteSaver(fieldsOf(note), async (patch) => {
        // Fetched per save, never held: a hosted session token lives a minute.
        const token = await latest.current.fetchCredential();
        const result = await runApiResult(
          (client) =>
            client.notes.update({ params: { campaignId, noteId: note.id }, payload: patch }),
          token,
        );
        // The notes, and nothing else: an encounter's read-aloud is found over
        // this list, so a moved attachment redraws with it (`NoteCard`).
        if (Result.isSuccess(result)) latest.current.invalidate([reads.notes(campaignId)]);
        return result;
      });
      savers.current.set(note.id, saver);
      return saver;
    },
    [campaignId],
  );

  const forget = useCallback((noteId: NoteId) => {
    savers.current.get(noteId)?.stop();
    savers.current.delete(noteId);
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
