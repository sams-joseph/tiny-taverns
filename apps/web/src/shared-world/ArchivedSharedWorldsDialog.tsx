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
} from "@taverns/ui";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { dayOf } from "../chronicle/format";
import { SaveFailure } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";

/** This atom is mounted only with the dialog, so the quiet shelf costs no directory read. */
const archivedSharedWorldsAtom = apiAtom(
  (client) => client.sharedWorlds.archived(),
  [reads.mySharedWorlds],
);

function ArchivedSharedWorldRow({ sharedWorld }: { readonly sharedWorld: SharedWorld }) {
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Archived Shared Worlds">
        <DialogHeader>
          <DialogTitle>Archived Shared Worlds</DialogTitle>
          <DialogDescription>
            Worlds you own and have taken off the active list. Restoring one brings its Chronicle,
            Hob memory, members, and Library shares back with it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col overflow-y-auto px-gutter py-3">
          {resource.state === "loading" && <Loading label="Reading the shelf…" />}
          {resource.state === "failed" && (
            <FailureNotice failure={resource.failure} onRetry={retry} />
          )}
          {worlds !== undefined &&
            (worlds.length === 0 ? (
              <span className="py-3 text-body-s leading-body text-muted-foreground">
                Nothing here. An empty Shared World you archive waits on this shelf until you bring
                it back.
              </span>
            ) : (
              worlds.map((sharedWorld) => (
                <ArchivedSharedWorldRow key={sharedWorld.id} sharedWorld={sharedWorld} />
              ))
            ))}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
