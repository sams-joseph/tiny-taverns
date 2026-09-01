import type { CampaignId, Feat } from "@taverns/api";
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
import { featPrerequisiteLine } from "./feat";
import { featWritesAt } from "./load";

export function CopyFeatIn({
  campaignId,
  originals,
  onClose,
  onCopied,
}: {
  readonly campaignId: CampaignId;
  readonly originals: ReadonlyArray<Feat>;
  readonly onClose: () => void;
  readonly onCopied: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const copy = async (feat: Feat) => {
    const result = await submit(
      (client) =>
        client.feats.derive({
          params: { campaignId, featId: feat.id },
          payload: { visibility: "shared" },
        }),
      featWritesAt(campaignId),
    );
    if (Result.isSuccess(result)) onCopied();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Copy a feat into this campaign">
        <DialogHeader>
          <DialogTitle>Copy a feat into this campaign</DialogTitle>
          <DialogDescription>
            A copy is a snapshot. Editing the Library original later does not change this campaign.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-gutter py-3">
          {originals.length === 0 ? (
            <p className="text-body-s leading-body text-muted-foreground">
              Your Library has no feats yet. Write one in the Library, then copy it into this table.
            </p>
          ) : (
            originals.map((feat) => (
              <div
                key={feat.id}
                className="flex items-center justify-between gap-3 rounded-card border border-subtle bg-surface-card p-3"
              >
                <div className="min-w-0">
                  <h3 className="truncate font-display text-title leading-snug font-semibold text-heading">
                    {feat.name}
                  </h3>
                  <p className="text-caption leading-body text-muted-foreground">
                    {featPrerequisiteLine(feat)}
                  </p>
                </div>
                <Button size="sm" disabled={busy} onClick={() => void copy(feat)}>
                  Copy in
                </Button>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
