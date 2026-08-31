import type { CampaignId, CharacterOption } from "@taverns/api";
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
import { optionWritesAt } from "./load";

/**
 * Taking a class, a race or a background off this table's list.
 *
 * ### It removes the copy, and nothing else in the product notices
 *
 * That is the snapshot working rather than a gap, and it is why this needs no
 * `Conflict` and refuses nothing:
 *
 * - **Every character made from it keeps its numbers**, because a character
 *   stores its class as a *label* and never as a pointer. `seedFor` ran once,
 *   when the character was made, and nothing calls it again.
 * - **The Library original is untouched.** It is a different row, and this
 *   table's copy of it is the only thing that goes — so the same class is one
 *   press of *Copy from your library* away from being back.
 *
 * What is actually lost is the future: nobody at this table can pick it for a
 * *new* character. The confirmation says both halves, because the surprising
 * one is the first — a DM removing a class may well expect the two players
 * running it to be affected, and they are not.
 *
 * ### Its own dialog rather than a button that just does it
 *
 * `ArchiveDialog`'s rule: a control on a page full of other controls cannot
 * name the thing it is about, and this one is a row in a list of similar rows.
 * It is also not nested — the remove button is on the **card**, not inside the
 * reader, so there is no dialog over a dialog here (which is the reason
 * `CreatureForm` keeps its own delete inside the form instead).
 */
export function RemoveOptionDialog({
  campaignId,
  option,
  onClose,
  onRemoved,
}: {
  readonly campaignId: CampaignId;
  readonly option: CharacterOption;
  readonly onClose: () => void;
  readonly onRemoved: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const noun = option.kind;

  const remove = async () => {
    const done = await submit(
      (client) => client.options.remove({ params: { campaignId, optionId: option.id } }),
      optionWritesAt(campaignId),
    );
    if (Result.isSuccess(done)) onRemoved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Remove ${option.name}`}>
        <DialogHeader>
          <DialogTitle>Remove {option.name}?</DialogTitle>
          <DialogDescription>
            Nobody at this table will be able to pick this {noun} for a new character.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2.5 px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            Characters already made from it keep the numbers they were made with — a character
            stores its {noun} as a name, not as a link to this row.
          </p>
          <p className="text-body-s leading-body text-muted-foreground">
            Your library&rsquo;s original is not touched, so you can copy it back in at any time.
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
            {busy ? "Removing…" : `Remove ${noun}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
