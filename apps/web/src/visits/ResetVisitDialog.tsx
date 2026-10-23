import type { CampaignId, LevelVisitSummary } from "@taverns/api";
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
import { tableVisitWrites } from "./load";

/**
 * *Reset level*: the visit's delete, asked first. Everything the party did
 * there goes with it; the level in the Library is untouched, and opening it
 * again starts from it fresh. A fight being played on it refuses the reset,
 * and says so.
 */
export function ResetVisitDialog({
  campaignId,
  visit,
  onClose,
  onReset,
}: {
  readonly campaignId: CampaignId;
  readonly visit: LevelVisitSummary;
  readonly onClose: () => void;
  readonly onReset: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const reset = async () => {
    const done = await submit(
      (client) => client.levelVisits.remove({ params: { campaignId, visitId: visit.id } }),
      tableVisitWrites(campaignId, [visit.id]),
    );
    if (Result.isSuccess(done)) onReset();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Reset ${visit.name}`}>
        <DialogHeader>
          <DialogTitle>Reset {visit.name}?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-gutter py-3 text-body-s leading-body text-muted-foreground">
          <p className="mb-0">
            The party's progress on this level is lost: where they stand, the doors they opened, the
            lights, the secrets found and everything they have seen. Your level in the Library stays
            as it is, and opening it again starts fresh.
          </p>
          {visit.fight?.carried === true && (
            <p className="mb-0">
              {visit.fight.name} was carried over here. It keeps its own copy of the level, and when
              you pick it up and it ends, nothing is handed back.
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
            Keep it
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void reset()}>
            {busy ? "Resetting…" : "Reset level"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
