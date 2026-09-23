import type { Campaign, SharedWorld, SharedWorldMembership } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useInvalidate } from "../api/atoms";
import { runApiResult } from "../api/client";
import { reads } from "../api/keys";
import { useCredential } from "../auth/credential";
import { describedBy } from "../ui/describedBy";
import { NewCampaignDescription } from "../ui/description";

const STANDALONE = "standalone";

/**
 * Starts a campaign: a name, where it lives, and the pitch its one cover is
 * drawn from. The founder becomes its creator and sole DM.
 *
 * The one form for both places a campaign is started. From the campaign list
 * it may go anywhere — standalone (`POST /campaigns`) or into one of the
 * reader's Shared Worlds — so `context` is the worlds to offer; from a Shared
 * World's screen it is that world, and there is no choice to draw.
 *
 * What happens after is the caller's (`onCreated`): the campaign list opens
 * the new table, a world's screen stays and grows a card.
 */
export function NewCampaignDialog({
  context,
  onClose,
  onCreated,
}: {
  readonly context:
    | { readonly kind: "choose"; readonly worlds: ReadonlyArray<SharedWorldMembership> }
    | { readonly kind: "world"; readonly world: Pick<SharedWorld, "id" | "name"> };
  readonly onClose: () => void;
  readonly onCreated: (campaign: Campaign) => void | Promise<void>;
}) {
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState(context.kind === "world" ? context.world.id : STANDALONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const worlds = context.kind === "choose" ? context.worlds : [];

  const create = async () => {
    setBusy(true);
    setError(undefined);
    const token = await fetchCredential();
    const world =
      context.kind === "world"
        ? context.world
        : worlds.find((candidate) => candidate.sharedWorld.id === target)?.sharedWorld;
    const payload = describedBy({ name: name.trim() }, description);
    const result = await runApiResult(
      (client) =>
        world === undefined
          ? client.campaigns.create({ payload })
          : client.sharedWorlds.createCampaign({ params: { worldId: world.id }, payload }),
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
    // The founder gains a membership row, and a world's directory gains a
    // card: the creator's participation is written in the same transaction.
    invalidate([reads.myCampaigns, ...(world === undefined ? [] : [reads.sharedWorld(world.id)])]);
    onClose();
    await onCreated(result.success);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="New campaign">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            {context.kind === "world"
              ? `A new table in ${context.world.name}. You will run it, and its members can see its name.`
              : "A new table. You will run it, and can invite players once it exists."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="new-campaign"
          className="flex flex-col gap-3 px-gutter py-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && name.trim() !== "") void create();
          }}
        >
          <Input
            aria-label="New campaign name"
            placeholder="The Salt Road"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          {worlds.length > 0 && (
            <Select value={target} onValueChange={(value) => setTarget(String(value))}>
              <SelectTrigger aria-label="Campaign context" disabled={busy}>
                <SelectValue>
                  {(value) =>
                    value === STANDALONE
                      ? "Standalone campaign"
                      : (worlds.find((candidate) => candidate.sharedWorld.id === value)?.sharedWorld
                          .name ?? "Shared World")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STANDALONE}>Standalone campaign</SelectItem>
                {worlds.map(({ sharedWorld }) => (
                  <SelectItem key={sharedWorld.id} value={sharedWorld.id}>
                    {sharedWorld.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <NewCampaignDescription value={description} onChange={setDescription} disabled={busy} />
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
          <Button type="submit" form="new-campaign" size="sm" disabled={busy || name.trim() === ""}>
            {busy ? "Working…" : "Start a campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
