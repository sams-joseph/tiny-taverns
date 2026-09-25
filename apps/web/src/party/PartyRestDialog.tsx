import type { CampaignId } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SectionHeading,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { newRequestId } from "../run/state";
import { SaveFailure } from "../ui/form";
import { partyRestWrites } from "./write";

/**
 * The party's long rest: `POST /campaigns/:c/party/rest`, the creator resting
 * every seated character at once by the owner's own rule.
 *
 * It asks first because nothing undoes it, and the lists say what the server
 * does (`nextResourcesForRest`, `withoutConcentration`) rather than what the
 * drawing did: the drawing cleared every condition, and the rule keeps all but
 * concentration. While a fight is on the table the server answers `Conflict`
 * and its sentence stands in the dialog's footer.
 *
 * One `requestId` per opening, so a retry after a dropped answer rests nobody
 * twice. The write names `reads.myCharacters` beside the party because the
 * creator's own seated character is on their *My characters* too.
 */
export function PartyRestDialog({
  campaignId,
  onClose,
}: {
  readonly campaignId: CampaignId;
  readonly onClose: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const [requestId] = useState(newRequestId);

  const rest = async () => {
    const done = await submit(
      (client) =>
        client.party.rest({ params: { campaignId }, payload: { kind: "long", requestId } }),
      partyRestWrites(campaignId),
    );
    if (Result.isSuccess(done)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Long rest">
        <DialogHeader>
          <DialogTitle>Long rest for the whole party?</DialogTitle>
          <DialogDescription>Every seated character rests at once.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-gutter py-3">
          <section aria-label="What changes" className="flex flex-col gap-2">
            <SectionHeading as="h3" size="label">
              What changes
            </SectionHeading>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-body-s leading-body text-muted-foreground">
              <li>Hit points back to full, and temporary hit points gone</li>
              <li>Spell slots and feature uses back</li>
              <li>Half their hit dice back</li>
              <li>Concentration ends</li>
            </ul>
          </section>
          <section aria-label="What it keeps" className="flex flex-col gap-2">
            <SectionHeading as="h3" size="label">
              What it keeps
            </SectionHeading>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-body-s leading-body text-muted-foreground">
              <li>Every other condition, until you clear it on the seat</li>
              <li>Inspiration</li>
            </ul>
          </section>
          <p className="text-body-s leading-body text-muted-foreground">There is no undo.</p>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Not yet
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void rest()}>
            {busy ? "Resting…" : "Long rest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
