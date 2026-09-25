import type { PartySeat } from "@taverns/api";
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
 * Retiring a seat: `DELETE /campaigns/:c/party/:seat`, the creator clearing it.
 *
 * The copy says what the server does (`party.leave`): it stamps `left_at` and
 * deletes nothing, so the owner keeps the character, the record keeps the
 * seat, and coming back is the owner seating them again as a new seat. There
 * is no restore, which is why it asks.
 *
 * It names `reads.myCharacters` beside the party because the seat leaves the
 * owner's roster row too (`OwnedCharacter.seats`), and the creator's own
 * character is on their *My characters*.
 */
export function RetireSeatDialog({
  row,
  onClose,
  onRetired,
}: {
  readonly row: PartySeat;
  readonly onClose: () => void;
  readonly onRetired: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const name = row.character?.name ?? row.seat.displayName;

  const retire = async () => {
    const done = await submit(
      (client) =>
        client.party.leave({
          params: { campaignId: row.seat.campaignId, campaignCharacterId: row.seat.id },
        }),
      [reads.party(row.seat.campaignId), reads.myCharacters],
    );
    if (Result.isSuccess(done)) onRetired();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Retire a seat">
        <DialogHeader>
          <DialogTitle>Retire {name}&rsquo;s seat?</DialogTitle>
          <DialogDescription>{name} leaves this table.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            Their player keeps the character, and what happened while they sat here stays in the
            record. To come back, their player seats them again, as a new seat.
          </p>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep the seat
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void retire()}>
            {busy ? "Retiring…" : "Retire seat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
