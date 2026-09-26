import type { CampaignId, Note } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@taverns/ui";
import { Result } from "effect";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";

/**
 * Deleting a note: `DELETE /campaigns/:c/notes/:n`, after asking.
 *
 * A note is words a DM wrote and nothing else points at it, so the confirmation
 * says only that it cannot be undone — no typed-name gate. The pane stops
 * saving it before the request goes (`onDeleting`), so a save still waiting on
 * its timer cannot land on a row that is gone, and starts again if the delete
 * is refused (`onKept`).
 */
export function DeleteNoteDialog({
  campaignId,
  note,
  onDeleting,
  onKept,
  onClose,
  onDeleted,
}: {
  readonly campaignId: CampaignId;
  readonly note: Note;
  readonly onDeleting: () => void;
  readonly onKept: () => void;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const remove = async () => {
    onDeleting();
    const done = await submit(
      (client) => client.notes.remove({ params: { campaignId, noteId: note.id } }),
      // An attached note is an encounter's read-aloud, found over this list.
      [reads.notes(campaignId)],
    );
    if (Result.isSuccess(done)) onDeleted();
    else onKept();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Delete a note">
        <DialogHeader>
          <DialogTitle>Delete {note.title}?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>

        <div className="px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            {note.attachedTo === null
              ? "The note and everything written in it are deleted."
              : "The note and everything written in it are deleted, and its encounter no longer carries it."}
          </p>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
