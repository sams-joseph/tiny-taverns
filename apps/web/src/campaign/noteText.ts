import type { Note, NoteCategory, NoteKind } from "@taverns/api";
import { cn, type IconName } from "@taverns/ui";
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
 * What a note is about, as the drawing names and draws each: the pane's
 * toggle, the list's pill (plural, as a heading over many), and the glyph a
 * row and an Overview row carry. Independent of the register above.
 */
export const CATEGORIES: ReadonlyArray<{
  readonly value: NoteCategory;
  readonly label: string;
  readonly plural: string;
  readonly icon: IconName;
}> = [
  { value: "npc", label: "NPC", plural: "NPCs", icon: "user" },
  { value: "place", label: "Place", plural: "Places", icon: "map-pin" },
  { value: "lore", label: "Lore", plural: "Lore", icon: "book-open" },
  { value: "prep", label: "Prep", plural: "Prep", icon: "clock" },
  { value: "rules", label: "Rules", plural: "Rules", icon: "scale" },
];

const categoryOf = (category: NoteCategory | null) =>
  CATEGORIES.find((entry) => entry.value === category);

/**
 * The category and the register, only as far as either is set — *NPC*,
 * *Place · Read aloud*, *Read aloud*, or nothing: the words both a list row
 * and a shared note's micro-label build on.
 */
export const noteTags = (note: {
  readonly kind: NoteKind;
  readonly category: NoteCategory | null;
}): ReadonlyArray<string> =>
  [
    categoryOf(note.category)?.label,
    note.kind === "read_aloud" ? kindLabel(note.kind) : undefined,
  ].filter((word) => word !== undefined);

/** An uncategorised note wears the plain note glyph the Overview always drew. */
export const categoryIcon = (category: NoteCategory | null): IconName =>
  categoryOf(category)?.icon ?? "scroll-text";

/**
 * What a row's foot and the pane's head say a note is: `noteTags`, and *Note*
 * when it is neither categorised nor read aloud.
 */
export const noteLabel = (note: {
  readonly kind: NoteKind;
  readonly category: NoteCategory | null;
}): string => {
  const tags = noteTags(note);
  return tags.length === 0 ? kindLabel(note.kind) : tags.join(" · ");
};

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
 * Pinned first, then newest first by when each note was made. Not by when it
 * was edited: the pane saves as the DM types, and a list that re-sorted on
 * every save would move the row being written out from under them. Pinning is
 * the one press that moves a row, and it is the DM asking for exactly that.
 */
export const pinnedFirst = (notes: ReadonlyArray<Note>): ReadonlyArray<Note> =>
  [...notes].sort(
    (a, b) =>
      Number(b.pinnedAt !== null) - Number(a.pinnedAt !== null) ||
      DateTime.toEpochMillis(b.createdAt) - DateTime.toEpochMillis(a.createdAt),
  );

/** The first line with anything on it, which the row clamps to two. */
export const previewOf = (body: string): string =>
  body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "") ?? "";
