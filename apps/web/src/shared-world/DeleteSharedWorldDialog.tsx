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
import { useState } from "react";
import { reads, type Invalidation } from "../api/keys";
import { useMutation } from "../api/mutation";
import { ConfirmNameField } from "../ui/confirmName";
import { confirmsName } from "../ui/confirmsName";
import { SaveFailure } from "../ui/form";

/**
 * Deleting a Shared World for good: `DELETE /worlds/:w/permanent`, the owner's
 * act, live or archived.
 *
 * The copy is the server's decision in plain words (`repo/Groups.ts`): the
 * world's own memory goes, and **no campaign goes with it**. Each one becomes
 * standalone and keeps its players, so the list of campaigns this account is at
 * moves too and is re-read. Archiving is named first as the reversible
 * alternative, with its one condition, since it is refused while campaigns
 * remain.
 */
export function DeleteSharedWorldDialog({
  sharedWorld,
  alsoInvalidates,
  onClose,
  onDeleted,
}: {
  readonly sharedWorld: Pick<SharedWorld, "id" | "name" | "archivedAt">;
  /** Extra reads the caller knows the delete moves, such as its campaigns' rows. */
  readonly alsoInvalidates?: Invalidation;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const [typed, setTyped] = useState("");
  const armed = confirmsName(sharedWorld.name, typed) && !busy;

  const remove = async () => {
    const done = await submit(
      (client) => client.sharedWorlds.deletePermanently({ params: { worldId: sharedWorld.id } }),
      // Both lists: the world leaves one, and every campaign that was in it
      // shows as standalone on the other.
      [reads.mySharedWorlds, reads.myCampaigns, ...(alsoInvalidates ?? [])],
    );
    if (Result.isSuccess(done)) onDeleted();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Delete a Shared World">
        <DialogHeader>
          <DialogTitle>Delete {sharedWorld.name} permanently?</DialogTitle>
          <DialogDescription>
            This cannot be undone.{" "}
            {sharedWorld.archivedAt === null
              ? "Archiving keeps everything and can be reversed, once no campaigns remain in it."
              : "Restoring it from the shelf keeps everything instead."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            Its Chronicle and Story So Far, its Hob conversation, its member list, its Library
            shares and its cover are deleted.
          </p>
          <p className="text-body-s leading-body text-muted-foreground">
            Its campaigns are not. Each one becomes a standalone campaign and keeps its players,
            content and Hob conversations. Library copies already made at those tables stay too.
          </p>
          <ConfirmNameField
            id="delete-shared-world-name"
            name={sharedWorld.name}
            value={typed}
            disabled={busy}
            onChange={setTyped}
          />
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
          <Button variant="destructive" size="sm" disabled={!armed} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
