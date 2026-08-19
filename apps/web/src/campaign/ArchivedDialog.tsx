import type { CampaignMembership } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from "@taverns/ui";
import { Result } from "effect";
import { apiAtom, useApiAtom } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { dayOf } from "../chronicle/format";
import { SaveFailure } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";

/**
 * The shelf: campaigns this account has archived, and the one press that brings
 * one back.
 *
 * ### Why a dialog, and why it is quiet
 *
 * A DM's archive is a place they visit twice a year. Given a screen of its own
 * it would need a nav item, and the shell's rule is that an item is earned by
 * something you reach for — this is reached for when you have already noticed
 * something is missing. So it hangs off one muted line at the foot of the
 * campaign list, in the shape `campaign/InviteDialog.tsx` established: a list
 * with one verb per row, read when it is opened and not before.
 *
 * **Nothing is requested until it is opened**, which is the same rule the Hob
 * panel follows. A count beside the opener would be honest and would cost a
 * second request on every load of the campaign list, for a number that is `0`
 * for almost everybody.
 *
 * ### Only what this account runs
 *
 * `GET /me/campaigns/archived` answers every archived table the credential
 * reaches, a player's included — it is the ordinary membership read over the
 * other shelf. This list narrows to `role === "dm"`, because the only thing on
 * offer here is restoring and restoring is `campaignWritable`'s question: a
 * *Restore* button on a table you only sit at would be a control that exists and
 * then 404s, which is worse than one that is absent. A player whose table has
 * been archived is looking at the DM's decision, and the way back is the DM's.
 *
 * ### There is no delete here, deliberately
 *
 * Permanent deletion is not something this product does — `Campaign.archivedAt`
 * has said so since `0001` — so there is no *Delete forever* on these rows and
 * adding one would be a new decision rather than a missing affordance.
 */

function ArchivedRow({
  membership,
  onRestored,
}: {
  readonly membership: CampaignMembership;
  readonly onRestored: () => void;
}) {
  const campaign = membership.campaign;
  const { busy, failure, submit } = useMutation();

  const restore = async () => {
    const done = await submit((client) =>
      client.campaigns.restore({ params: { campaignId: campaign.id }, payload: {} }),
    );
    if (Result.isSuccess(done)) onRestored();
  };

  return (
    <div className="flex flex-col gap-1.5 border-b border-hairline py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="min-w-0 flex-1 truncate text-body-s leading-body text-foreground">
          {campaign.name}
        </span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void restore()}>
          <Icon name="refresh-cw" size={14} />
          {busy ? "Bringing it back…" : "Restore"}
        </Button>
      </div>
      <span className="text-caption leading-body text-muted-foreground">
        {campaign.archivedAt === null
          ? "Back on your list."
          : `Archived ${dayOf(campaign.archivedAt)}. Restoring puts it back where it was.`}
      </span>
      {failure !== undefined && <SaveFailure failure={failure} />}
    </div>
  );
}

/**
 * The shelf, as an atom. No key: the read names no campaign — it is every
 * campaign this account has archived — so there is one of it.
 */
const archivedAtom = apiAtom((client) => client.me.archivedCampaigns());

export function ArchivedDialog({
  onClose,
  onRestored,
}: {
  readonly onClose: () => void;
  /** Re-reads the campaign list: a restored campaign belongs on it. */
  readonly onRestored: () => void;
}) {
  const [resource, reload] = useApiAtom(archivedAtom);

  const restored = () => {
    reload();
    onRestored();
  };

  // The list is the DM's own, for the reason in this file's doc block: the one
  // verb on a row is a write, and a write is `campaignWritable`'s question.
  const mine =
    resource.state === "ready" ? resource.value.filter((row) => row.role === "dm") : undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Archived campaigns">
        <DialogHeader>
          <DialogTitle>Archived campaigns</DialogTitle>
          <DialogDescription>
            Campaigns you have taken off your list. Everything in them is kept, and restoring one
            puts it back exactly as it was.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col overflow-y-auto px-gutter py-3">
          {resource.state === "loading" && <Loading label="Reading the shelf…" />}
          {resource.state === "failed" && (
            <FailureNotice failure={resource.failure} onRetry={reload} />
          )}
          {mine !== undefined &&
            (mine.length === 0 ? (
              <span className="py-3 text-body-s leading-body text-muted-foreground">
                Nothing here. A campaign you archive lands on this shelf, and stays until you bring
                it back.
              </span>
            ) : (
              mine.map((membership) => (
                <ArchivedRow
                  key={membership.campaign.id}
                  membership={membership}
                  onRestored={restored}
                />
              ))
            ))}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
