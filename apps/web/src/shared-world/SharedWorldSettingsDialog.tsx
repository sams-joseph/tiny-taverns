import { type SharedWorld, SHARED_WORLD_DESCRIPTION_MAX } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea } from "../ui/form";

/**
 * Owner-only edits: the name and the description every member reads. Changing
 * the description does not redraw the cover, which is drawn once. Archiving and
 * deleting each stay behind their own named confirmation.
 */
export function SharedWorldSettingsDialog({
  sharedWorld,
  onClose,
  onSaved,
  onArchive,
  onDelete,
}: {
  readonly sharedWorld: SharedWorld;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly onArchive: () => void;
  readonly onDelete: () => void;
}) {
  const [name, setName] = useState(sharedWorld.name);
  const [description, setDescription] = useState(sharedWorld.description ?? "");
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
          payload: {
            name: name.trim(),
            // An emptied description is no description: `null` clears it.
            description: description.trim() === "" ? null : description.trim(),
          },
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
            Rename or describe {sharedWorld.name}, archive it when its campaigns have left, or
            delete it.
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

          <Field
            label="Description"
            htmlFor="shared-world-description"
            hint="The land, as every member will read it."
          >
            <Textarea
              id="shared-world-description"
              className="min-h-20"
              maxLength={SHARED_WORLD_DESCRIPTION_MAX}
              value={description}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <div className="flex flex-col gap-1.5 border-t border-hairline pt-4">
            <span className="text-body-s leading-body font-semibold text-heading">
              Archive or delete
            </span>
            <span className="text-caption leading-body text-muted-foreground">
              A Shared World can be archived only after every campaign has moved elsewhere or become
              standalone. Deleting it removes its Chronicle and memory for good and makes each of
              its campaigns standalone.
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={busy} onClick={onArchive}>
                <Icon name="archive" size={14} />
                Archive Shared World
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-danger"
                disabled={busy}
                onClick={onDelete}
              >
                <Icon name="trash-2" size={14} />
                Delete permanently
              </Button>
            </div>
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
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
