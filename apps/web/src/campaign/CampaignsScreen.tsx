import type { CampaignMembership, CampaignSharedWorld, SharedWorldMembership } from "@taverns/api";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { runApiResult } from "../api/client";
import { reads } from "../api/keys";
import { useCredential } from "../auth/credential";
import { Hob, useHobPanel } from "../hob";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { sharedWorldsAtom } from "../shared-world/load";
import { ArchivedDialog } from "./ArchivedDialog";
import { membershipsAtom } from "./load";

/**
 * The campaign-first way into Taverns.
 *
 * A campaign is the task a new account arrived to do, so creation asks for
 * its name and lands inside it. The server still creates a private group in
 * the same transaction while Shared Worlds are built; none of that plumbing
 * belongs in this screen or in the user's first decision.
 */

function CampaignRow({
  membership,
  world,
  onConnect,
  onChangeWorld,
}: {
  readonly membership: CampaignMembership;
  readonly world: CampaignSharedWorld | null;
  readonly onConnect: (() => void) | undefined;
  readonly onChangeWorld: (() => void) | undefined;
}) {
  const campaign = membership.campaign;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2.5">
          <CardTitle className="flex-1">
            <Link
              to="/campaigns/$campaignId"
              params={{ campaignId: campaign.id }}
              className="text-heading no-underline hover:text-link-hover"
            >
              {campaign.name}
            </Link>
          </CardTitle>
          <Badge variant={membership.relation === "creator" ? "secondary" : "info"}>
            {membership.relation === "creator" ? "Created by you" : "Playing"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        {campaign.partyName !== null && (
          <span className="text-body-s leading-body text-muted-foreground">
            {campaign.partyName}
          </span>
        )}
        {world !== null ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="text-link"
              nativeButton={false}
              render={<Link to="/worlds/$worldId" params={{ worldId: world.id }} />}
            >
              <Icon name="map" size={14} />
              {world.name}
            </Button>
            {onChangeWorld !== undefined && (
              <Button variant="ghost" size="sm" onClick={onChangeWorld}>
                Change Shared World
              </Button>
            )}
          </>
        ) : (
          onConnect !== undefined && (
            <Button variant="ghost" size="sm" onClick={onConnect}>
              <Icon name="map" size={14} />
              Connect to Shared World
            </Button>
          )
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-link"
          nativeButton={false}
          render={<Link to="/campaigns/$campaignId" params={{ campaignId: campaign.id }} />}
        >
          Open
          <Icon name="chevron-right" size={15} />
        </Button>
      </CardContent>
    </Card>
  );
}

const STANDALONE = "standalone";

type SharedWorldTransition = "connect" | "change";

function SharedWorldTransitionDialog({
  mode,
  membership,
  worlds,
  onClose,
}: {
  readonly mode: SharedWorldTransition;
  readonly membership: CampaignMembership;
  readonly worlds: ReadonlyArray<SharedWorldMembership>;
  readonly onClose: () => void;
}) {
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [target, setTarget] = useState(
    mode === "change"
      ? (worlds[0]?.sharedWorld.id ?? STANDALONE)
      : (worlds[0]?.sharedWorld.id ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const campaign = membership.campaign;
  const source = membership.sharedWorld;

  const finish = async (world?: CampaignSharedWorld) => {
    invalidate([
      reads.myCampaigns,
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
          payload: { name: name.trim() },
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
              <Input
                aria-label="Shared World name"
                placeholder="The Salt Marches"
                value={name}
                onChange={(event) => setName(event.target.value)}
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

function NewCampaign({ worlds }: { readonly worlds: ReadonlyArray<SharedWorldMembership> }) {
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [target, setTarget] = useState(STANDALONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const create = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    const token = await fetchCredential();
    const world = worlds.find((candidate) => candidate.sharedWorld.id === target)?.sharedWorld;
    const result = await runApiResult(
      (client) =>
        world === undefined
          ? client.campaigns.create({ payload: { name: name.trim() } })
          : client.sharedWorlds.createCampaign({
              params: { worldId: world.id },
              payload: { name: name.trim() },
            }),
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

    invalidate([reads.myCampaigns]);
    if (world !== undefined) invalidate([reads.sharedWorld(world.id)]);
    await navigate({
      to: "/campaigns/$campaignId",
      params: { campaignId: result.success.id },
    });
  }, [fetchCredential, invalidate, name, navigate, target, worlds]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="New campaign name"
          placeholder="The Salt Road"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="max-w-xs"
        />
        {worlds.length > 0 && (
          <Select value={target} onValueChange={(value) => setTarget(String(value))}>
            <SelectTrigger aria-label="Campaign context" className="w-56">
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
        <Button onClick={() => void create()} disabled={busy || name.trim() === ""}>
          {busy ? "Working…" : "Start a campaign"}
        </Button>
      </div>
      {error !== undefined && (
        <p role="alert" className="text-body-s leading-body text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function SharedWorldDirectory({
  worlds,
}: {
  readonly worlds: ReadonlyArray<SharedWorldMembership>;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label="Shared Worlds">
      <span className="text-label leading-snug font-semibold text-heading">Shared Worlds</span>
      {worlds.length === 0 ? (
        <p className="text-body-s leading-body text-muted-foreground">
          Shared Worlds you create or join will appear here.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {worlds.map(({ sharedWorld, isOwner }) => (
            <Button
              key={sharedWorld.id}
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  to="/worlds/$worldId"
                  params={{ worldId: sharedWorld.id }}
                  aria-label={`Open Shared World ${sharedWorld.name}`}
                />
              }
            >
              <Icon name="map" size={14} />
              {sharedWorld.name}
              {isOwner && <Badge variant="outline">Yours</Badge>}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}

export function CampaignsScreen() {
  const [resource, retry] = useApiAtom(membershipsAtom);
  const [worldsResource] = useApiAtom(sharedWorldsAtom);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [transition, setTransition] = useState<
    { readonly mode: SharedWorldTransition; readonly membership: CampaignMembership } | undefined
  >();
  const hob = useHobPanel({ initialOpen: false });
  const memberships = resource.state === "ready" ? resource.value : undefined;
  const worlds = worldsResource.state === "ready" ? worldsResource.value : [];

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} />}
      topBar={
        <TopBar title="Campaigns" subtitle="The stories you run and the tables where you play." />
      }
    >
      <div className="flex flex-col gap-6">
        {resource.state === "loading" && <Loading label="Looking for your campaigns…" />}
        {resource.state === "failed" && (
          <FailureNotice failure={resource.failure} onRetry={retry} />
        )}
        {memberships !== undefined && (
          <>
            <NewCampaign worlds={worlds} />
            {memberships.length === 0 ? (
              <EmptyState icon="book-open" title="No campaign yet">
                Start one above, or follow an invitation from somebody running a game.
              </EmptyState>
            ) : (
              <div className="grid gap-4 @3xl:grid-cols-2">
                {memberships.map((membership) => (
                  <CampaignRow
                    key={membership.campaign.id}
                    membership={membership}
                    world={membership.sharedWorld}
                    onConnect={
                      worldsResource.state === "ready" &&
                      membership.relation === "creator" &&
                      membership.sharedWorld === null
                        ? () => setTransition({ mode: "connect", membership })
                        : undefined
                    }
                    onChangeWorld={
                      membership.relation === "creator" && membership.sharedWorld !== null
                        ? () => setTransition({ mode: "change", membership })
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground"
              onClick={() => setShelfOpen(true)}
            >
              <Icon name="history" size={14} />
              Archived campaigns
            </Button>
            <SharedWorldDirectory worlds={worlds} />
          </>
        )}
      </div>

      {shelfOpen && <ArchivedDialog onClose={() => setShelfOpen(false)} />}
      {transition !== undefined && (
        <SharedWorldTransitionDialog
          mode={transition.mode}
          membership={transition.membership}
          worlds={worlds.filter(
            (world) =>
              world.isOwner &&
              (transition.mode !== "change" ||
                world.sharedWorld.id !== transition.membership.sharedWorld?.id),
          )}
          onClose={() => setTransition(undefined)}
        />
      )}
    </AppShell>
  );
}
