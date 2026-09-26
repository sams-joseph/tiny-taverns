import type { Note, NoteKind } from "@taverns/api";
import { cn } from "@taverns/ui";
import { DateTime } from "effect";
import { agoOf } from "./when";

/**
 * How the Notes tab words and orders a note — shared by the list, the pane and
 * the encounter page's `NoteCard`, so the three say it the same way.
 */

/** What *New note* makes: the DM's alone, titled so the wire will take it. */
export const UNTITLED = "Untitled note";

/** The register a note is set in, as the pane's toggles and a row's foot say it. */
export const KINDS: ReadonlyArray<readonly [NoteKind, string]> = [
  ["note", "Note"],
  ["read_aloud", "Read aloud"],
];

export const kindLabel = (kind: NoteKind): string =>
  KINDS.find(([value]) => value === kind)?.[1] ?? "Note";

/**
 * A note's body as it is read: read-aloud in the prose face, the only text in
 * the product that is not UI voice, and a note's own words in the interface
 * face. Paragraphs are kept — a DM's blank line is a pause at the table.
 */
export const noteBodyClass = (kind: NoteKind): string =>
  cn(
    "m-0 max-w-measure whitespace-pre-line",
    kind === "read_aloud"
      ? "font-serif text-body-l leading-loose font-normal text-foreground italic"
      : "text-body leading-body text-foreground",
  );

/**
 * *Edited 3 days ago*, *Edited just now*, *Edited 12 March 2026*: `agoOf`'s
 * words, lowered to sit mid-sentence.
 */
export const editedAgo = (note: Note, now: number): string => {
  const ago = agoOf(note.updatedAt, now);
  return `Edited ${ago.charAt(0).toLowerCase()}${ago.slice(1)}`;
};

/**
 * Newest first, by when each note was made. Not by when it was edited: the
 * pane saves as the DM types, and a list that re-sorted on every save would
 * move the row being written out from under them.
 */
export const newestFirst = (notes: ReadonlyArray<Note>): ReadonlyArray<Note> =>
  [...notes].sort(
    (a, b) => DateTime.toEpochMillis(b.createdAt) - DateTime.toEpochMillis(a.createdAt),
  );

/** The first line with anything on it, which the row clamps to two. */
export const previewOf = (body: string): string =>
  body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "") ?? "";
