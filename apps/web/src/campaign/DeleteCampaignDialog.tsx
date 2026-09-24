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
import { useState } from "react";
import { useApiAtom } from "../api/atoms";
import { reads, type Invalidation } from "../api/keys";
import { useMutation } from "../api/mutation";
import { ConfirmNameField } from "../ui/confirmName";
import { confirmsName } from "../ui/confirmsName";
import { SaveFailure } from "../ui/form";
import { campaignAtom } from "./load";

/**
 * Deleting a campaign for good: `DELETE /campaigns/:c/permanent`.
 *
 * Archiving is the gentle default and this dialog says so before anything else,
 * with *Archive instead* beside the button when the campaign is still live. The
 * delete itself is gated on typing the campaign's name, and the copy states
 * what goes and what stays in the server's terms (`repo/Campaigns.ts`): the
 * table's own record goes; characters and Chronicle entries a Shared World
 * already accepted stay.
 *
 * **An open night refuses it.** The server answers `Conflict` while
 * `currentSessionId` is set, so the dialog reads the campaign row, says so and
 * disarms the button rather than letting the press fail.
 */
export function DeleteCampaignDialog({
  campaign,
  alsoInvalidates,
  onArchiveInstead,
  onClose,
  onDeleted,
}: {
  readonly campaign: { readonly id: CampaignId; readonly name: string };
  /** Extra reads the caller knows the delete moves, such as the world's directory. */
  readonly alsoInvalidates?: Invalidation;
  /** Offered while the campaign is live: switch to the reversible act. */
  readonly onArchiveInstead?: () => void;
  readonly onClose: () => void;
  /** The campaign is gone; leave anywhere that drew it. */
  readonly onDeleted: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const [typed, setTyped] = useState("");
  const [row] = useApiAtom(campaignAtom(campaign.id));
  const nightOpen = row.state === "ready" && row.value.currentSessionId !== null;
  const archived = row.state === "ready" && row.value.archivedAt !== null;
  const armed = confirmsName(campaign.name, typed) && !nightOpen && !busy;

  const remove = async () => {
    const done = await submit(
      (client) => client.campaigns.deletePermanently({ params: { campaignId: campaign.id } }),
      // The lists it was on, and the characters that lost a seat. Not the
      // campaign's own row: it is gone, and a screen still drawing it is about
      // to be left.
      [reads.myCampaigns, reads.myCharacters, ...(alsoInvalidates ?? [])],
    );
    if (Result.isSuccess(done)) onDeleted();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Delete a campaign">
        <DialogHeader>
          <DialogTitle>Delete {campaign.name} permanently?</DialogTitle>
          <DialogDescription>
            This cannot be undone. {archived ? "Restoring" : "Archiving"} keeps everything and can
            be reversed{archived ? ", from the archived shelf" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            Every session and its beats, the notes, encounters and fights, the NPCs, anything made
            for this campaign alone, its Hob conversations, its invitations and its cover are
            deleted.
          </p>
          <p className="text-body-s leading-body text-muted-foreground">
            Characters belong to their players and are kept; they just leave this table. Entries a
            Shared World already added to its Chronicle stay there.
          </p>
          {nightOpen && (
            <p role="alert" className="text-body-s leading-body text-danger-ink">
              A night is still open here. Finish it before deleting the campaign.
            </p>
          )}
          <ConfirmNameField
            id="delete-campaign-name"
            name={campaign.name}
            value={typed}
            disabled={busy || nightOpen}
            onChange={setTyped}
          />
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
          {onArchiveInstead !== undefined && !archived && (
            <Button variant="outline" size="sm" disabled={busy} onClick={onArchiveInstead}>
              Archive instead
            </Button>
          )}
          <Button variant="destructive" size="sm" disabled={!armed} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
