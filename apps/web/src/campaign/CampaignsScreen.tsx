import type { Campaign } from "@taverns/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon, Input } from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import type { TavernsClient } from "../api/client";
import { runApiResult, useApiResource } from "../api/resource";
import { useCredential } from "../auth/credential";
import { hrefFor, type Route } from "../routes";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";

/**
 * The way in: every campaign this credential reaches.
 *
 * The designers drew no picker — their kit starts inside one campaign — so this
 * is the smallest shell that reaches `CampaignHome` and no more. It carries the
 * one write on the way in, because a picker that cannot create is a dead end on
 * a fresh database, and dropping to `curl` to see your own first screen is not a
 * product.
 */

const listCampaigns = (client: TavernsClient) => client.campaigns.list();

function CampaignRow({ campaign }: { readonly campaign: Campaign }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2.5">
          <CardTitle className="flex-1">
            <a
              href={hrefFor({ screen: "campaign", campaignId: campaign.id })}
              className="text-heading no-underline hover:text-link-hover"
            >
              {campaign.name}
            </a>
          </CardTitle>
          {campaign.visibility === "shared" && <Badge variant="info">Shared</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-1.5 text-body-s leading-body text-muted-foreground">
          <Icon name="users" size={15} className="text-faint" />
          {campaign.playerCount} {campaign.playerCount === 1 ? "player" : "players"}
        </span>
        {campaign.partyName !== null && campaign.partyName !== "" && (
          <span className="text-body-s leading-body text-muted-foreground">
            {campaign.partyName}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-link"
          nativeButton={false}
          render={<a href={hrefFor({ screen: "campaign", campaignId: campaign.id })} />}
        >
          Open
          <Icon name="chevron-right" size={15} />
        </Button>
      </CardContent>
    </Card>
  );
}

/** Names a new campaign. Everything else about it has a column default. */
function NewCampaign({ onCreated }: { readonly onCreated: () => void }) {
  const fetchCredential = useCredential();
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
    setName("");
    onCreated();
  }, [fetchCredential, name, onCreated]);

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

export function CampaignsScreen({ route }: { readonly route: Route }) {
  const [resource, reload] = useApiResource(listCampaigns);

  const campaigns =
    resource.state === "ready" ? resource.value.filter((c) => c.archivedAt === null) : undefined;

  return (
    <AppShell
      route={route}
      topBar={
        <TopBar
          title="Campaigns"
          subtitle="Every table this credential reaches. Pick the one you are running."
        />
      }
    >
      <div className="flex max-w-3xl flex-col gap-6">
        {resource.state === "loading" && <Loading label="Looking for your campaigns…" />}
        {resource.state === "failed" && (
          <FailureNotice failure={resource.failure} onRetry={reload} />
        )}
        {campaigns !== undefined && (
          <>
            <NewCampaign onCreated={reload} />
            {campaigns.length === 0 ? (
              <EmptyState icon="book-open" title="No campaigns yet">
                Name the one you are running and it opens above. Everything else — the party, the
                encounters, the checklist — hangs off it.
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-4">
                {campaigns.map((campaign) => (
                  <CampaignRow key={campaign.id} campaign={campaign} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
