import type { LevelSummary, LevelUse } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Loading,
} from "@taverns/ui";
import { Result } from "effect";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { levelUsesAtom } from "./load";

/**
 * Deleting one of the owner's levels: `DELETE /library/levels/:id`, after
 * asking. It takes every wall, prop, light and region on it, and takes the
 * level off every encounter that names it (each is fought on the plain grid),
 * so the confirmation names those first, read from `uses`, and waits for that
 * read before offering the delete. A fight already started keeps its own copy.
 */
export function DeleteLevelDialog({
  level,
  onClose,
  onDeleted,
}: {
  readonly level: LevelSummary;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}) {
  const [uses, retry] = useApiAtom(levelUsesAtom(level.id));
  const { busy, failure, submit } = useMutation();

  const remove = async () => {
    const campaigns =
      uses.state === "ready" ? [...new Set(uses.value.map((use) => use.campaignId))] : [];
    const done = await submit(
      (client) => client.libraryLevels.remove({ params: { levelId: level.id } }),
      // Each encounter that named it reads none now.
      [
        reads.libraryLevels,
        reads.libraryLevel(level.id),
        ...campaigns.map((campaignId) => reads.encounters(campaignId)),
      ],
    );
    if (Result.isSuccess(done)) onDeleted();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Delete ${level.name}`}>
        <DialogHeader>
          <DialogTitle>Delete {level.name}?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-gutter py-3 text-body-s leading-body text-muted-foreground">
          <p>The level and everything built on it are deleted.</p>
          {uses.state === "loading" && <Loading label="Finding where it is used…" />}
          {uses.state === "failed" && <ApiFailureNotice failure={uses.failure} onRetry={retry} />}
          {uses.state === "ready" &&
            (uses.value.length === 0 ? (
              <p>No encounter is played on it.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p>
                  These encounters will be fought on the plain grid. Fights already started keep
                  their own copy.
                </p>
                <ul data-slot="level-uses" className="flex flex-col gap-1">
                  {byCampaign(uses.value).map(([campaign, encounters]) => (
                    <li key={campaign.id} className="text-foreground">
                      {campaign.name}: {encounters.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
          <Button
            variant="destructive"
            size="sm"
            disabled={busy || uses.state !== "ready"}
            onClick={() => void remove()}
          >
            {busy ? "Deleting…" : "Delete level"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The uses grouped under their campaign, in the order the server sent them (by campaign). */
const byCampaign = (
  uses: ReadonlyArray<LevelUse>,
): ReadonlyArray<readonly [{ readonly id: string; readonly name: string }, Array<string>]> => {
  const groups = new Map<string, readonly [{ id: string; name: string }, Array<string>]>();
  for (const use of uses) {
    const group = groups.get(use.campaignId);
    if (group === undefined) {
      groups.set(use.campaignId, [
        { id: use.campaignId, name: use.campaignName },
        [use.encounterName],
      ]);
    } else {
      group[1].push(use.encounterName);
    }
  }
  return [...groups.values()];
};
