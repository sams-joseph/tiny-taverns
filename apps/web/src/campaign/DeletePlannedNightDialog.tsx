import type { CampaignId, Session } from "@taverns/api";
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
 * Deleting a planned night: `DELETE /campaigns/:c/sessions/:s`, for a night
 * that has neither started nor ended (`plannedNightOf`), so nothing was played
 * in it. A night that was played is not deleted from here.
 *
 * The copy says what goes and what stays in the server's terms
 * (`repo/Sessions.ts`, `remove`): the checklist cascades with the night; an act
 * names its night by number, not by row, so it stays with its title. The
 * nights move, and with them the planned night and what *Start the night*
 * opens; so does the night's own checklist.
 */
export function DeletePlannedNightDialog({
  campaignId,
  night,
  onClose,
}: {
  readonly campaignId: CampaignId;
  readonly night: Session;
  readonly onClose: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const name = night.title ?? `Session ${String(night.number)}`;

  const remove = async () => {
    const done = await submit(
      (client) => client.sessions.remove({ params: { campaignId, sessionId: night.id } }),
      [reads.sessions(campaignId), reads.prep(night.id), reads.acts(campaignId)],
    );
    if (Result.isSuccess(done)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Delete the planned night">
        <DialogHeader>
          <DialogTitle>Delete {name}?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            The planned night and its checklist are deleted. Start the night makes a new one.
          </p>
          <p className="text-body-s leading-body text-muted-foreground">
            An act that starts at session {night.number} is kept, with its title.
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
            {busy ? "Deleting…" : "Delete night"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
