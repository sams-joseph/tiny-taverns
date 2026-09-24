import type { CampaignMembership, CampaignSharedWorld, SharedWorldMembership } from "@taverns/api";
import { useNavigate } from "@tanstack/react-router";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { runApiResult } from "../api/client";
import { reads } from "../api/keys";
import { useCredential } from "../auth/credential";
import { SharedWorldFields } from "../shared-world/NewSharedWorldDialog";
import { sharedWorldsAtom } from "../shared-world/load";
import { describedBy } from "../ui/describedBy";
import { membershipsAtom } from "./load";

/**
 * A campaign's Shared World connection, changed from inside the campaign: its
 * creator connects a standalone campaign (to a world they own, or one they found
 * here from it), moves a connected one to another owned world, or makes it
 * standalone. These are campaign settings, so the campaign list's cards carry
 * none of them; the Overview's actions menu and the campaign settings dialog
 * open this (`CampaignChrome.tsx`). The four writes are the context moves in
 * `docs/internals/shared-worlds.md`.
 */

const STANDALONE = "standalone";

export type SharedWorldTransition = "connect" | "change";

function SharedWorldTransitionDialog({
  mode,
  membership,
  worlds: memberOf,
  onClose,
}: {
  readonly mode: SharedWorldTransition;
  readonly membership: CampaignMembership;
  /** Every world this account belongs to; the dialog offers only owned destinations. */
  readonly worlds: ReadonlyArray<SharedWorldMembership>;
  readonly onClose: () => void;
}) {
  const campaign = membership.campaign;
  const source = membership.sharedWorld;
  const worlds = memberOf.filter(
    (world) => world.isOwner && (mode !== "change" || world.sharedWorld.id !== source?.id),
  );
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState(
    mode === "change"
      ? (worlds[0]?.sharedWorld.id ?? STANDALONE)
      : (worlds[0]?.sharedWorld.id ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const finish = async (world?: CampaignSharedWorld) => {
    invalidate([
      reads.myCampaigns,
      // The campaign's own row carries its context, which every move changes.
      reads.campaign(campaign.id),
      reads.mySharedWorlds,
      ...(source === null ? [] : [reads.sharedWorld(source.id)]),
      ...(world === undefined ? [] : [reads.sharedWorld(world.id)]),
    ]);
    onClose();
    if (world !== undefined) {
      await navigate({ to: "/worlds/$worldId", params: { worldId: world.id } });
    }
  };

  const submit = async () => {
    const world = worlds.find((candidate) => candidate.sharedWorld.id === target)?.sharedWorld;
    const disconnecting = mode === "change" && target === STANDALONE;
    if (!disconnecting && world === undefined) return;
    setBusy(true);
    setError(undefined);
    const token = await fetchCredential();
    if (disconnecting) {
      const result = await runApiResult(
        (client) =>
          client.campaigns.disconnectSharedWorld({
            params: { campaignId: campaign.id },
            payload: {},
          }),
        token,
      );
      setBusy(false);
      if (Result.isFailure(result)) {
        setError("That did not save. Try it again.");
        return;
      }
      await finish();
      return;
    }
    if (world === undefined) return;

    const result =
      mode === "change"
        ? await runApiResult(
            (client) =>
              client.campaigns.moveSharedWorld({
                params: { campaignId: campaign.id },
                payload: { worldId: world.id },
              }),
            token,
          )
        : await runApiResult(
            (client) =>
              client.campaigns.connectSharedWorld({
                params: { campaignId: campaign.id },
                payload: { worldId: world.id },
              }),
            token,
          );
    setBusy(false);
    if (Result.isFailure(result)) {
      setError("That did not save. Try it again.");
      return;
    }
    await finish(world);
  };

  const promote = async () => {
    setBusy(true);
    setError(undefined);
    const token = await fetchCredential();
    const result = await runApiResult(
      (client) =>
        client.campaigns.promoteSharedWorld({
          params: { campaignId: campaign.id },
          payload: describedBy({ name: name.trim() }, description),
        }),
      token,
    );
    setBusy(false);
    if (Result.isFailure(result)) {
      setError("That did not save. Try it again.");
      return;
    }
    await finish(result.success);
  };

  const changing = mode === "change";
  const disconnecting = changing && target === STANDALONE;
  const title = changing ? `Change ${campaign.name}'s Shared World` : "Connect to a Shared World";
  const label = changing ? "Change campaign Shared World" : "Connect to Shared World";
  const submitLabel = changing
    ? disconnecting
      ? "Make standalone"
      : "Move campaign"
    : "Connect campaign";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={label}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {changing ? (
              <>
                Choose another Shared World or make the campaign standalone. Participants join a new
                destination, while everyone remains a member of {source?.name}. History already
                accepted there stays there. The campaign keeps its content, invitations, Hob
                conversations, and existing encounter instances.{" "}
                {disconnecting ? (
                  <>
                    As a standalone campaign, it will stop contributing future activity and using
                    Library sources shared through that world.
                  </>
                ) : (
                  <>It will switch to the destination world's Library shares.</>
                )}
              </>
            ) : (
              <>
                {campaign.name} keeps its table and becomes part of a shared history. Its current
                participants join the Shared World, and other world members can see its name in the
                campaign directory. Its campaign content remains visible only to its participants.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-gutter py-3">
          {(changing || worlds.length > 0) && (
            <div className="flex flex-col gap-2">
              <span className="text-label leading-snug font-semibold text-heading">
                {changing ? "New connection" : "Existing Shared World"}
              </span>
              <Select value={target} onValueChange={(value) => setTarget(String(value))}>
                <SelectTrigger
                  aria-label={changing ? "New Shared World connection" : "Existing Shared World"}
                  className="min-w-56"
                >
                  <SelectValue>
                    {(value) =>
                      worlds.find((candidate) => candidate.sharedWorld.id === value)?.sharedWorld
                        .name ?? "Choose a Shared World"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {changing && <SelectItem value={STANDALONE}>Standalone campaign</SelectItem>}
                  {worlds.map(({ sharedWorld }) => (
                    <SelectItem key={sharedWorld.id} value={sharedWorld.id}>
                      {sharedWorld.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {mode === "connect" && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <span className="text-label leading-snug font-semibold text-heading">
                {worlds.length > 0 ? "Or create a new Shared World" : "Create a Shared World"}
              </span>
              <SharedWorldFields
                name={name}
                onName={setName}
                description={description}
                onDescription={setDescription}
              />
            </div>
          )}
          {error !== undefined && (
            <p role="alert" className="pt-2 text-body-s leading-body text-danger">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {(changing || worlds.length > 0) && (
            <Button size="sm" disabled={busy || target === ""} onClick={() => void submit()}>
              {busy ? "Working…" : submitLabel}
            </Button>
          )}
          {mode === "connect" && (
            <Button size="sm" disabled={busy || name.trim() === ""} onClick={() => void promote()}>
              {busy ? "Creating…" : "Create Shared World"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The dialog for one campaign, reading what it needs itself: the membership row
 * that says which world the campaign is in (`membership.sharedWorld`, null for a
 * standalone one, which hides its hidden context) and the worlds this account
 * belongs to. Both reads are the campaign list's and are warm by the time a
 * campaign screen is open; until they answer, nothing is drawn.
 */
export function CampaignSharedWorldDialog({
  campaignId,
  onClose,
}: {
  readonly campaignId: string;
  readonly onClose: () => void;
}) {
  const [memberships] = useApiAtom(membershipsAtom);
  const [worlds] = useApiAtom(sharedWorldsAtom);
  if (memberships.state !== "ready" || worlds.state !== "ready") return null;
  const membership = memberships.value.find((row) => row.campaign.id === campaignId);
  if (membership === undefined) return null;
  return (
    <SharedWorldTransitionDialog
      mode={membership.sharedWorld === null ? "connect" : "change"}
      membership={membership}
      worlds={worlds.value}
      onClose={onClose}
    />
  );
}
