import type { Encounter, Note } from "@taverns/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon } from "@taverns/ui";

/**
 * The Notes tab.
 *
 * One `note` table with a `kind`, so read-aloud is a note set differently rather
 * than a second thing (`Note.ts`). The register shift is the whole point:
 * read-aloud is the only prose in the product that is not UI voice, and the
 * readme asks for it in italic Alegreya at `--fs-body-l` / `--lh-loose` — that
 * is `--type-read-aloud`, spelled here in the theme's names.
 *
 * `READ ALOUD` is uppercase on purpose and is one of the two places the system
 * allows it (the 12.5px micro-label; the other is `STR` / `DEX`).
 */
export function NoteCard({
  note,
  encounter,
  onEdit,
}: {
  readonly note: Note;
  readonly encounter: Encounter | undefined;
  readonly onEdit: () => void;
}) {
  const readAloud = note.kind === "read_aloud";

  return (
    <Card>
      <CardHeader>
        {readAloud && (
          <span className="text-caption leading-snug font-medium tracking-caps uppercase text-faint">
            Read aloud
          </span>
        )}
        <div className="flex flex-wrap items-start gap-2.5">
          <CardTitle className="flex-1">{note.title}</CardTitle>
          {note.visibility === "shared" && <Badge variant="info">Shared</Badge>}
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-1 size-7 shrink-0"
            aria-label={`Edit ${note.title}`}
            onClick={onEdit}
          >
            <Icon name="pencil" size={14} />
          </Button>
        </div>
        {encounter !== undefined && (
          <span className="flex items-center gap-1.5 text-body-s leading-body text-muted-foreground">
            <Icon name="swords" size={14} />
            {encounter.name}
          </span>
        )}
      </CardHeader>
      {note.body !== "" && (
        <CardContent>
          <p
            className={
              readAloud
                ? "max-w-measure font-serif text-body-l leading-loose font-normal text-slate-300 italic"
                : "max-w-measure text-body leading-body text-foreground"
            }
          >
            {note.body}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

export function NotesList({
  notes,
  encounters,
  onEdit,
}: {
  readonly notes: ReadonlyArray<Note>;
  readonly encounters: ReadonlyArray<Encounter>;
  readonly onEdit: (note: Note) => void;
}) {
  const byId = new Map(encounters.map((encounter) => [encounter.id, encounter]));

  return (
    <div className="flex flex-col gap-4">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          encounter={note.attachedTo === null ? undefined : byId.get(note.attachedTo.id)}
          onEdit={() => onEdit(note)}
        />
      ))}
    </div>
  );
}
