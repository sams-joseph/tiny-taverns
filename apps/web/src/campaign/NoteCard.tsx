import type { Note } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon } from "@taverns/ui";
import { noteBodyClass } from "./noteText";

/**
 * A note read in full, on the page of the encounter it is attached to.
 *
 * One `note` table with a `kind`, so read-aloud is a note set differently rather
 * than a second thing (`Note.ts`). The register shift is the whole point:
 * read-aloud is the only prose in the product that is not UI voice, set in
 * italic Alegreya at `--fs-body-l` / `--lh-loose`, and the Notes pane sets it
 * the same way (`noteBodyClass`).
 *
 * It is written in one place, the Notes pane, so the pencil opens it there
 * rather than raising a second editor with its own idea of saving.
 *
 * `READ ALOUD` is uppercase on purpose and is one of the two places the system
 * allows it (the 12.5px micro-label; the other is `STR` / `DEX`).
 */
export function NoteCard({ note }: { readonly note: Note }) {
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
            aria-label={`Edit ${note.title} in Notes`}
            nativeButton={false}
            render={
              <Link
                to="/campaigns/$campaignId/notes"
                params={{ campaignId: note.campaignId }}
                search={{ note: note.id }}
              />
            }
          >
            <Icon name="pencil" size={14} />
          </Button>
        </div>
      </CardHeader>
      {note.body !== "" && (
        <CardContent>
          <p className={noteBodyClass(note.kind)}>{note.body}</p>
        </CardContent>
      )}
    </Card>
  );
}
