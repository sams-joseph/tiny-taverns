import type { CampaignId } from "@taverns/api";
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
import { useApiAtom } from "../api/atoms";
import { reads, type Invalidation } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { campaignAtom } from "./load";

/**
 * Taking a campaign off the list, the gentle alternative to deleting it, and
 * the dialog exists to say exactly how gentle.
 *
 * The write behind this button is `DELETE /campaigns/:c`, which stamps
 * `archived_at` and nothing else; the permanent delete is a separate act with
 * its own typed-name confirmation (`DeleteCampaignDialog.tsx`). So the whole
 * job of this dialog is to make the trade legible in the two seconds a DM
 * spends reading it: the campaign leaves the list, it is kept, and one press
 * brings it back. Three sentences and a button whose label is the act.
 *
 * ### Why a dialog, and where it is raised
 *
 * A confirmation that **names the campaign** is what makes the press
 * deliberate: the DM reads back the thing they are about to shelve. It is
 * raised from inside the campaign only (its Overview's actions menu and its
 * settings dialog, both in `CampaignChrome.tsx`), never from a card on a list,
 * so it is the creator's act by construction: a player's projection of the
 * campaign has neither, and `campaignWritable` refuses the write for anyone
 * else.
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
  alsoInvalidates,
  onClose,
  onArchived,
}: {
  /**
   * The campaign being shelved: the two fields the confirmation needs. Whether
   * a night is open is read from the campaign atom below rather than trusted
   * to the caller.
   */
  readonly campaign: {
    readonly id: CampaignId;
    readonly name: string;
  };
  /**
   * Extra reads the caller knows this shelving moves: the Shared World
   * directory, whose card says *Archived*.
   */
  readonly alsoInvalidates?: Invalidation;
  readonly onClose: () => void;
  /** Put the confirmation away. The row leaves the list on its own. */
  readonly onArchived: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  // Whether a night is open here: the campaign's own row, which the frame has
  // warm on every campaign screen. `null` while it settles, so the line simply
  // arrives when the answer does.
  const [row] = useApiAtom(campaignAtom(campaign.id));
  const currentSessionId = row.state === "ready" ? row.value.currentSessionId : null;

  const archive = async () => {
    const done = await submit(
      (client) => client.campaigns.archive({ params: { campaignId: campaign.id } }),
      // The shelf and the live list are one key — archiving moves a row from
      // one to the other, so a key per list would be a write that has to
      // remember both. The campaign row goes too: `archivedAt` is on it, and a
      // campaign screen left open behind this dialog draws from it.
      [reads.myCampaigns, reads.campaign(campaign.id), ...(alsoInvalidates ?? [])],
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
          {currentSessionId !== null && (
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
