import type { LevelSummary } from "@taverns/api";
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
 * Deleting one of the owner's levels: `DELETE /library/levels/:id`, after
 * asking. It takes every wall, prop, light and region on it. No encounter
 * points at a level yet, so there is nowhere else it is taken from to name.
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
  const { busy, failure, submit } = useMutation();

  const remove = async () => {
    const done = await submit(
      (client) => client.libraryLevels.remove({ params: { levelId: level.id } }),
      [reads.libraryLevels, reads.libraryLevel(level.id)],
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
        <p className="px-gutter py-3 text-body-s leading-body text-muted-foreground">
          The level and everything built on it are deleted.
        </p>
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
            {busy ? "Deleting…" : "Delete level"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
