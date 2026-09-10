import type { SharedWorld } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure } from "../ui/form";

/** Owner-only edits. Archiving stays behind its own named confirmation. */
export function SharedWorldSettingsDialog({
  sharedWorld,
  onClose,
  onSaved,
  onArchive,
}: {
  readonly sharedWorld: SharedWorld;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly onArchive: () => void;
}) {
  const [name, setName] = useState(sharedWorld.name);
  const [showProblem, setShowProblem] = useState(false);
  const { busy, failure, submit } = useMutation();
  const empty = name.trim() === "";

  const save = async () => {
    setShowProblem(true);
    if (empty) return;

    const result = await submit(
      (client) =>
        client.sharedWorlds.update({
          params: { worldId: sharedWorld.id },
          payload: { name: name.trim() },
        }),
      [reads.mySharedWorlds, reads.sharedWorld(sharedWorld.id)],
    );
    if (Result.isSuccess(result)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Shared World settings">
        <DialogHeader>
          <DialogTitle>Shared World settings</DialogTitle>
          <DialogDescription>
            Rename {sharedWorld.name}, or move it to the archive when its campaigns have left.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 px-gutter py-3">
          <Field
            label="Name"
            htmlFor="shared-world-name"
            error={showProblem && empty ? "Give the Shared World a name." : undefined}
          >
            <Input
              id="shared-world-name"
              value={name}
              disabled={busy}
              aria-invalid={showProblem && empty}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <div className="flex flex-col gap-1.5 border-t border-hairline pt-4">
            <span className="text-body-s leading-body font-semibold text-heading">Archive</span>
            <span className="text-caption leading-body text-muted-foreground">
              A Shared World can be archived only after every campaign has moved elsewhere or become
              standalone.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={onArchive}
            >
              Archive Shared World
            </Button>
          </div>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || (showProblem && empty)} onClick={() => void save()}>
            {busy ? "Saving…" : "Save name"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
