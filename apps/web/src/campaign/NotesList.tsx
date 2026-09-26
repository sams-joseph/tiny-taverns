import type { Note } from "@taverns/api";
import { Badge, cn } from "@taverns/ui";
import { editedAgo, kindLabel, previewOf } from "./noteText";
import { useNow } from "./when";

/**
 * The Notes list, as the drawing draws its rows: the title, *Shared* beside it
 * when the players can read it (the default is the DM's alone, so the shared
 * ones are the ones marked), a two-line preview of the first line, and
 * *Read aloud · Edited 3 days ago* under it. Read-aloud previews in the prose
 * face, as it is read.
 *
 * **A row selects; it does not open.** It is a button that puts its note in
 * the pane beside it, as the Encounters list does, and the pane is the note.
 */
export function NotesList({
  notes,
  selected,
  onSelect,
}: {
  readonly notes: ReadonlyArray<Note>;
  readonly selected: Note["id"] | undefined;
  readonly onSelect: (note: Note) => void;
}) {
  const now = useNow();

  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0">
      {notes.map((note) => {
        const preview = previewOf(note.body);
        return (
          <li key={note.id}>
            <button
              type="button"
              aria-current={note.id === selected ? "true" : undefined}
              onClick={() => onSelect(note)}
              className="flex w-full cursor-pointer flex-col items-stretch rounded-md border border-transparent bg-transparent px-3.5 py-3 text-left font-sans transition-control outline-none hover:bg-surface-card focus-visible:ring-focus aria-current:border-accent aria-current:bg-surface-card"
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-body-s leading-snug font-semibold text-heading">
                  {note.title}
                </span>
                {note.visibility === "shared" && <Badge variant="info">Shared</Badge>}
              </span>
              <span
                className={cn(
                  "mt-1 line-clamp-2 text-body-s leading-snug",
                  preview === ""
                    ? "text-faint"
                    : note.kind === "read_aloud"
                      ? "font-serif text-muted-foreground italic"
                      : "text-muted-foreground",
                )}
              >
                {preview === "" ? "Empty note" : preview}
              </span>
              <span className="mt-1.5 text-caption leading-snug text-faint">
                {kindLabel(note.kind)} · {editedAgo(note, now)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
