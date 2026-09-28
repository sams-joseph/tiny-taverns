import type {
  CampaignId,
  Note,
  NoteAttachment,
  NoteCategory,
  NoteId,
  NoteKind,
  NoteUpdate,
  Visibility,
} from "@taverns/api";
import { Result } from "effect";
import type { ApiFailure } from "../api/failure";
import { reads } from "../api/keys";
import { AUTOSAVE_DELAY_MS, AutoSaver, type SaveStatus, useAutoSavers } from "../ui/autosave";

/**
 * The Notes pane saves as you type — the captain's call over an explicit *Save*.
 * The timing (the debounce, the one request in flight, only what changed) is
 * the shared `AutoSaver` (`ui/autosave.ts`); this is what a note adds to it:
 *
 * - **The title is held back while it is empty.** `NoteUpdate.title` is a
 *   `NonEmptyString`, so an emptied title is not sent: the body and the rest
 *   still save, the note keeps its last title on the server, and the pane says
 *   so until one is typed.
 * - **One saver per note outlives the pane that made it** (`useNoteSavers`),
 *   so choosing another note and coming back finds what was typed, even while
 *   it is still on its way.
 */
export { AUTOSAVE_DELAY_MS, type SaveStatus };

/** What the pane edits: the note's own fields, and nothing a list row derives. */
export interface NoteFields {
  readonly title: string;
  readonly body: string;
  readonly kind: NoteKind;
  readonly category: NoteCategory | null;
  readonly attachedTo: NoteAttachment | null;
  readonly visibility: Visibility;
}

export const fieldsOf = (note: Note): NoteFields => ({
  title: note.title,
  body: note.body,
  kind: note.kind,
  category: note.category,
  attachedTo: note.attachedTo,
  visibility: note.visibility,
});

/** What differs between the draft and what the server holds, as a PATCH says it. */
export const changesOf = (draft: NoteFields, saved: NoteFields): NoteUpdate => {
  const title = draft.title.trim();
  return {
    ...(title !== "" && title !== saved.title ? { title } : {}),
    ...(draft.body !== saved.body ? { body: draft.body } : {}),
    ...(draft.kind !== saved.kind ? { kind: draft.kind } : {}),
    ...(draft.category !== saved.category ? { category: draft.category } : {}),
    ...(draft.attachedTo?.id !== saved.attachedTo?.id ? { attachedTo: draft.attachedTo } : {}),
    ...(draft.visibility !== saved.visibility ? { visibility: draft.visibility } : {}),
  };
};

export type SendPatch = (patch: NoteUpdate) => Promise<Result.Result<unknown, ApiFailure>>;

/** One note's saver: the shared timing (`ui/autosave.ts`) over the note's fields. */
export class NoteSaver extends AutoSaver<NoteFields, NoteUpdate> {
  constructor(note: NoteFields, send: SendPatch, delay: number = AUTOSAVE_DELAY_MS) {
    super(note, { changes: changesOf, send, delay });
  }
}

/**
 * One saver per note for as long as the Notes tab is open (`useAutoSavers`),
 * each sending its own PATCH.
 */
export const useNoteSavers = (campaignId: CampaignId) =>
  useAutoSavers(
    (note: Note): NoteId => note.id,
    (note, write) =>
      new NoteSaver(fieldsOf(note), (patch) =>
        write(
          (client) =>
            client.notes.update({ params: { campaignId, noteId: note.id }, payload: patch }),
          // The notes, and nothing else: an encounter's read-aloud is found over
          // this list, so a moved attachment redraws with it (`NoteCard`).
          [reads.notes(campaignId)],
        ),
      ),
  );
