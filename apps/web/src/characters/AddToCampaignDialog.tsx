import type { CampaignMembership, OwnedCharacter } from "@taverns/api";
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
import { useMemo } from "react";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { campaignsAvailableToJoin } from "./join";
import { characterJoinWritesAt, joinCharacterToCampaign } from "./write";

/**
 * Add an existing character to a campaign — the explicit `party.join` act.
 *
 * Creation uses a campaign as rules/Hob context only. This dialog is the first
 * campaign-side write: it lists the live memberships the account already has,
 * removes campaigns where the character already has a live seat, and asks for
 * an intentional press per campaign. A duplicate press is still safe because
 * the server's `party.join` is idempotent.
 */
export function AddToCampaignDialog({
  owned,
  memberships,
  onClose,
  onJoined,
}: {
  readonly owned: OwnedCharacter;
  readonly memberships: ReadonlyArray<CampaignMembership>;
  readonly onClose: () => void;
  readonly onJoined?: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const options = useMemo(() => campaignsAvailableToJoin(owned, memberships), [owned, memberships]);

  const join = async (membership: CampaignMembership) => {
    const result = await submit(
      (client) => joinCharacterToCampaign(client, membership.campaign.id, owned.character),
      characterJoinWritesAt(membership.campaign.id),
    );
    if (Result.isSuccess(result)) {
      onJoined?.();
      onClose();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Add to campaign">
        <DialogHeader>
          <DialogTitle>Add to campaign</DialogTitle>
          <DialogDescription>
            Choose a campaign to seat {owned.character.name}. The character stays yours and keeps
            one shared sheet; the campaign gets its own roster seat.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 px-gutter py-3">
          {options.length === 0 ? (
            <p className="text-body-s leading-body text-muted-foreground">
              This character is already at every campaign you can add them to.
            </p>
          ) : (
            options.map((membership) => (
              <Button
                key={membership.campaign.id}
                variant="secondary"
                className="justify-start"
                disabled={busy}
                onClick={() => void join(membership)}
              >
                <Icon name="book-open" size={14} className="shrink-0 text-accent-ink" />
                <span className="min-w-0 flex-1 truncate text-left">
                  Add to {membership.campaign.name}
                </span>
              </Button>
            ))
          )}
        </div>

        <DialogFooter>
          {failure !== undefined && <SaveFailure failure={failure} />}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
