import type { CampaignMembership, GroupMembership } from "@taverns/api";
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
import { groupsAtom } from "../group/load";
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
  onPromote,
}: {
  readonly membership: CampaignMembership;
  readonly world: GroupMembership | undefined;
  readonly onPromote: (() => void) | undefined;
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
        {world !== undefined ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-link"
            nativeButton={false}
            render={<Link to="/worlds/$groupId" params={{ groupId: world.group.id }} />}
          >
            <Icon name="map" size={14} />
            {world.group.name}
          </Button>
        ) : (
          onPromote !== undefined && (
            <Button variant="ghost" size="sm" onClick={onPromote}>
              <Icon name="map" size={14} />
              Create Shared World
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

function SharedWorldDialog({
  campaign,
  onClose,
}: {
  readonly campaign: CampaignMembership["campaign"];
  readonly onClose: () => void;
}) {
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

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
    invalidate([reads.myGroups]);
    onClose();
    await navigate({ to: "/worlds/$groupId", params: { groupId: result.success.id } });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Create Shared World">
        <DialogHeader>
          <DialogTitle>Create a Shared World</DialogTitle>
          <DialogDescription>
            Give connected campaigns a shared history and a place where Hob can remember across
            them. {campaign.name} becomes its first campaign.
          </DialogDescription>
        </DialogHeader>
        <div className="px-gutter py-3">
          <Input
            aria-label="Shared World name"
            placeholder="The Salt Marches"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
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
          <Button size="sm" disabled={busy || name.trim() === ""} onClick={() => void promote()}>
            {busy ? "Creating…" : "Create Shared World"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewCampaign() {
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const create = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    const token = await fetchCredential();
    const result = await runApiResult(
      (client) => client.campaigns.create({ payload: { name: name.trim() } }),
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
    await navigate({
      to: "/campaigns/$campaignId",
      params: { campaignId: result.success.id },
    });
  }, [fetchCredential, invalidate, name, navigate]);

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

export function CampaignsScreen() {
  const [resource, retry] = useApiAtom(membershipsAtom);
  const [worldsResource] = useApiAtom(groupsAtom);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [promoting, setPromoting] = useState<CampaignMembership | undefined>();
  const hob = useHobPanel({ initialOpen: false });
  const memberships = resource.state === "ready" ? resource.value : undefined;

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
            <NewCampaign />
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
                    world={
                      worldsResource.state === "ready"
                        ? worldsResource.value.find(
                            (candidate) => candidate.group.id === membership.campaign.groupId,
                          )
                        : undefined
                    }
                    onPromote={
                      worldsResource.state === "ready" &&
                      membership.relation === "creator" &&
                      !worldsResource.value.some(
                        (candidate) => candidate.group.id === membership.campaign.groupId,
                      )
                        ? () => setPromoting(membership)
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
          </>
        )}
      </div>

      {shelfOpen && <ArchivedDialog onClose={() => setShelfOpen(false)} />}
      {promoting !== undefined && (
        <SharedWorldDialog campaign={promoting.campaign} onClose={() => setPromoting(undefined)} />
      )}
    </AppShell>
  );
}
