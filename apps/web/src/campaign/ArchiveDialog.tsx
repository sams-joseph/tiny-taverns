import type { Campaign } from "@taverns/api";
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
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";

/**
 * Taking a campaign off the list — the nearest thing this product has to
 * deleting one, and the dialog exists to say exactly how near.
 *
 * **A campaign is never deleted.** `packages/api/src/Campaign.ts` has said so
 * since the first migration — *two years of Thursday nights* — and the write
 * behind this button is `DELETE /campaigns/:c`, which stamps `archived_at` and
 * nothing else. So the whole job of this dialog is to make that trade legible in
 * the two seconds a DM spends reading it: the campaign leaves the list, it is
 * kept, and one press brings it back. Saying less would read as a delete;
 * explaining the mechanism would be a lecture. Three sentences and a button
 * whose label is the act.
 *
 * ### Why a dialog rather than a button on the row
 *
 * `campaign/CampaignDialog.tsx` records the reasoning this inherits: archiving
 * is deliberately not behind the same button as renaming, because a campaign is
 * somebody's two years of Thursday nights and that is how it gets pressed by
 * accident. A confirmation that **names the campaign** is what makes the press
 * deliberate — the DM reads back the thing they are about to shelve, which is
 * the one check a row-level button cannot offer.
 *
 * It is the DM's act and nobody else's: `CampaignsScreen` renders the control
 * only on a row whose `role` is `dm`, and `campaignWritable` refuses the write
 * for anyone else — so a player at a table sees no button and could not spend
 * one if they did.
 *
 * ### A night in progress is named, not ended
 *
 * `campaign.currentSessionId` points at an open night — a finished session
 * cannot be current, which `campaign_current_session_id_fkey`
 * (`0006_session_finished.ts`) makes structural — so a non-null pointer here is
 * exactly *"there is a night open at this table"*. Archiving does not touch it,
 * and that is deliberate on the server side too: an archive that finished the
 * night would be a reversible act with an irreversible side effect, since a
 * finished session can never be pointed at again. See `repo/Campaigns.ts`.
 *
 * So the dialog says so rather than quietly leaving it, the same way
 * `FinishSessionDialog` names the fight it is about to carry. The session number
 * is deliberately absent: this screen reads `GET /me/campaigns`, which carries
 * the id and not the number, and a stubbed *"session 12"* would be worse than
 * the sentence that is true.
 */
export function ArchiveDialog({
  campaign,
  onClose,
  onArchived,
}: {
  readonly campaign: Campaign;
  readonly onClose: () => void;
  /** Re-reads the list. The row is gone from under the screen. */
  readonly onArchived: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const archive = async () => {
    const done = await submit((client) =>
      client.campaigns.archive({ params: { campaignId: campaign.id } }),
    );
    if (Result.isSuccess(done)) onArchived();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Archive a campaign">
        <DialogHeader>
          <DialogTitle>Archive {campaign.name}?</DialogTitle>
          <DialogDescription>
            It leaves your list of campaigns. Nothing in it is deleted — the sessions, the notes,
            the bestiary and the party stay exactly as they are.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            You can bring it back whenever you like, from{" "}
            <span className="text-heading">Archived campaigns</span> at the foot of the list.
          </p>
          {campaign.currentSessionId !== null && (
            <p className="text-body-s leading-body text-muted-foreground">
              A night is still open here. Archiving does not end it — it is waiting exactly where
              you left it when the campaign comes back.
            </p>
          )}
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep it here
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void archive()}>
            {busy ? "Archiving…" : "Archive it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
