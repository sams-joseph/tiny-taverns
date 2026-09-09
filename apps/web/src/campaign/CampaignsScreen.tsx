import type { CampaignMembership } from "@taverns/api";
import { Link, useNavigate } from "@tanstack/react-router";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon, Input } from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { runApiResult } from "../api/client";
import { reads } from "../api/keys";
import { useCredential } from "../auth/credential";
import { Hob, useHobPanel } from "../hob";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
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

function CampaignRow({ membership }: { readonly membership: CampaignMembership }) {
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
  const [shelfOpen, setShelfOpen] = useState(false);
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
                  <CampaignRow key={membership.campaign.id} membership={membership} />
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
    </AppShell>
  );
}
