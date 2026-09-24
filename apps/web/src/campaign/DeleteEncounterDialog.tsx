import type { CampaignId, Encounter, SessionId } from "@taverns/api";
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
 * Deleting an encounter: `DELETE /campaigns/:c/encounters/:e`.
 *
 * The copy says what goes and what stays in the server's terms
 * (`repo/Encounters.ts`, `remove`): the roster and the battle map cascade with
 * it; attached notes are detached, not deleted; fights already run keep their
 * record, and one on the table now keeps its board. No typed-name gate: an
 * encounter is a template a DM rebuilds in a minute, and nothing played is lost.
 *
 * The notes move (their attachment clears) and so does tonight's fight and
 * checklist when a night is open, so those keys are named beside the list.
 */
export function DeleteEncounterDialog({
  campaignId,
  encounter,
  openNight,
  attachedNotes,
  onClose,
  onDeleted,
}: {
  readonly campaignId: CampaignId;
  readonly encounter: Encounter;
  /** The campaign's open night, whose fights and checklist may point here. */
  readonly openNight: SessionId | undefined;
  readonly attachedNotes: number;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const remove = async () => {
    const done = await submit(
      (client) => client.encounters.remove({ params: { campaignId, encounterId: encounter.id } }),
      [
        reads.encounters(campaignId),
        reads.notes(campaignId),
        ...(openNight === undefined ? [] : [reads.prep(openNight), reads.runs(openNight)]),
      ],
    );
    if (Result.isSuccess(done)) onDeleted();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Delete an encounter">
        <DialogHeader>
          <DialogTitle>Delete {encounter.name}?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            The encounter, its creature list, and its battle map and picture are deleted.
          </p>
          <p className="text-body-s leading-body text-muted-foreground">
            {attachedNotes > 0
              ? attachedNotes === 1
                ? "The note attached to it stays on the Notes tab, no longer attached. "
                : `The ${attachedNotes} notes attached to it stay on the Notes tab, no longer attached. `
              : ""}
            Past fights and what happened in them are kept, and a fight on the table now keeps its
            board.
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
            {busy ? "Deleting…" : "Delete encounter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
