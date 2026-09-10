import type { SharedWorld } from "@taverns/api";
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

/** A deliberate, reversible retirement of an empty Shared World. */
export function ArchiveSharedWorldDialog({
  sharedWorld,
  onClose,
  onArchived,
}: {
  readonly sharedWorld: SharedWorld;
  readonly onClose: () => void;
  readonly onArchived: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const archive = async () => {
    const result = await submit(
      (client) => client.sharedWorlds.archive({ params: { worldId: sharedWorld.id } }),
      [reads.mySharedWorlds, reads.sharedWorld(sharedWorld.id)],
    );
    if (Result.isSuccess(result)) onArchived();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Archive a Shared World">
        <DialogHeader>
          <DialogTitle>Archive {sharedWorld.name}?</DialogTitle>
          <DialogDescription>
            This works only when no campaigns remain here, including archived campaigns. Move each
            campaign to another Shared World or make it standalone first.
          </DialogDescription>
        </DialogHeader>

        <div className="px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            The Chronicle, Hob conversation, members, and Library shares are all preserved. You can
            restore the Shared World from the archived shelf whenever you need it again.
          </p>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep it active
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void archive()}>
            {busy ? "Archiving…" : "Archive it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
