import { useNavigate } from "@tanstack/react-router";
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
import { useInvalidate } from "../api/atoms";
import { runApiResult } from "../api/client";
import { reads } from "../api/keys";
import { useCredential } from "../auth/credential";
import { describedBy } from "../ui/describedBy";
import { NewSharedWorldDescription } from "../ui/description";

/**
 * A new Shared World's name and optional description — before the one cover
 * draw reads it. Everything else about a world has a column default.
 *
 * Both ways a world is made ask with these two boxes: founding one on its own
 * (`NewSharedWorldDialog`) and promoting a campaign into one (the Campaigns
 * screen's transition dialog).
 */
export function SharedWorldFields({
  name,
  onName,
  description,
  onDescription,
  disabled,
}: {
  readonly name: string;
  readonly onName: (value: string) => void;
  readonly description: string;
  readonly onDescription: (value: string) => void;
  readonly disabled?: boolean;
}) {
  return (
    <>
      <Input
        aria-label="Shared World name"
        placeholder="The Salt Marches"
        value={name}
        disabled={disabled}
        onChange={(event) => onName(event.target.value)}
      />
      <NewSharedWorldDescription
        value={description}
        onChange={onDescription}
        {...(disabled !== undefined && { disabled })}
      />
    </>
  );
}

/**
 * Founds a Shared World on its own (`POST /worlds`): its founder becomes owner
 * and first member in one transaction, and campaigns can then be started in it
 * or connected to it. Lands on the new world, whose screen re-reads until Hob's
 * cover has been drawn.
 */
export function NewSharedWorldDialog({ onClose }: { readonly onClose: () => void }) {
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const create = async () => {
    setBusy(true);
    setError(undefined);
    const token = await fetchCredential();
    const result = await runApiResult(
      (client) =>
        client.sharedWorlds.create({ payload: describedBy({ name: name.trim() }, description) }),
      token,
    );

    setBusy(false);
    if (Result.isFailure(result)) {
      setError(
        result.failure.kind === "unauthorized"
          ? "That credential is not good for this."
          : "That did not save. Try it again.",
      );
      return;
    }
    invalidate([reads.mySharedWorlds]);
    onClose();
    await navigate({ to: "/worlds/$worldId", params: { worldId: result.success.id } });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="New Shared World">
        <DialogHeader>
          <DialogTitle>New Shared World</DialogTitle>
          <DialogDescription>
            A history and a memory for Hob that several campaigns share. You will own it, and you
            can start campaigns in it or connect the ones you run.
          </DialogDescription>
        </DialogHeader>
        <form
          id="new-shared-world"
          className="flex flex-col gap-3 px-gutter py-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && name.trim() !== "") void create();
          }}
        >
          <SharedWorldFields
            name={name}
            onName={setName}
            description={description}
            onDescription={setDescription}
            disabled={busy}
          />
        </form>
        <DialogFooter>
          {error !== undefined && (
            <p role="alert" className="mr-auto text-body-s leading-body text-danger">
              {error}
            </p>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-shared-world"
            size="sm"
            disabled={busy || name.trim() === ""}
          >
            {busy ? "Creating…" : "Create Shared World"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
