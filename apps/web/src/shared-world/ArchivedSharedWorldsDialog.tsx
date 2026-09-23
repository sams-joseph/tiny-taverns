import type { SharedWorld } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Loading,
} from "@taverns/ui";
import { useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { dayOf } from "../chronicle/format";
import { SaveFailure } from "../ui/form";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { DeleteSharedWorldDialog } from "./DeleteSharedWorldDialog";

/** This atom is mounted only with the dialog, so the quiet shelf costs no directory read. */
const archivedSharedWorldsAtom = apiAtom(
  (client) => client.sharedWorlds.archived(),
  [reads.mySharedWorlds],
);

/**
 * One shelved world, with the owner's two ways off the shelf: *Restore*, or
 * *Delete permanently* through the same typed-name confirmation the world's
 * own screen uses (`DeleteSharedWorldDialog`), above this one.
 */
function ArchivedSharedWorldRow({
  sharedWorld,
  onDelete,
}: {
  readonly sharedWorld: SharedWorld;
  readonly onDelete: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const restore = async () => {
    await submit(
      (client) => client.sharedWorlds.restore({ params: { worldId: sharedWorld.id }, payload: {} }),
      [reads.mySharedWorlds, reads.sharedWorld(sharedWorld.id)],
    );
  };

  return (
    <div className="flex flex-col gap-1.5 border-b border-hairline py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="min-w-0 flex-1 truncate text-body-s leading-body text-foreground">
          {sharedWorld.name}
        </span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void restore()}>
          <Icon name="refresh-cw" size={14} />
          {busy ? "Restoring…" : "Restore"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          disabled={busy}
          aria-label={`Delete permanently: ${sharedWorld.name}`}
          onClick={onDelete}
        >
          <Icon name="trash-2" size={14} />
          Delete permanently
        </Button>
      </div>
      <span className="text-caption leading-body text-muted-foreground">
        {sharedWorld.archivedAt === null
          ? "Back in your Shared Worlds."
          : `Archived ${dayOf(sharedWorld.archivedAt)}. Its shared memory and history are kept.`}
      </span>
      {failure !== undefined && <SaveFailure failure={failure} />}
    </div>
  );
}

export function ArchivedSharedWorldsDialog({ onClose }: { readonly onClose: () => void }) {
  const [resource, retry] = useApiAtom(archivedSharedWorldsAtom);
  const worlds = resource.state === "ready" ? resource.value : undefined;
  const [deleting, setDeleting] = useState<SharedWorld | undefined>();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Archived Shared Worlds">
        <DialogHeader>
          <DialogTitle>Archived Shared Worlds</DialogTitle>
          <DialogDescription>
            Worlds you own and have taken off the active list. Restoring one brings its Chronicle,
            Hob memory, members, and Library shares back with it; deleting one removes them for
            good.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col overflow-y-auto px-gutter py-3">
          {resource.state === "loading" && <Loading label="Reading the shelf…" />}
          {resource.state === "failed" && (
            <ApiFailureNotice failure={resource.failure} onRetry={retry} />
          )}
          {worlds !== undefined &&
            (worlds.length === 0 ? (
              <span className="py-3 text-body-s leading-body text-muted-foreground">
                Nothing here. An empty Shared World you archive waits on this shelf until you bring
                it back.
              </span>
            ) : (
              worlds.map((sharedWorld) => (
                <ArchivedSharedWorldRow
                  key={sharedWorld.id}
                  sharedWorld={sharedWorld}
                  onDelete={() => setDeleting(sharedWorld)}
                />
              ))
            ))}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
      {deleting !== undefined && (
        <DeleteSharedWorldDialog
          sharedWorld={deleting}
          onClose={() => setDeleting(undefined)}
          onDeleted={() => setDeleting(undefined)}
        />
      )}
    </Dialog>
  );
}
