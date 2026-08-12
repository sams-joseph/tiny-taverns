import type { CampaignMembership } from "@taverns/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon, Input } from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import type { TavernsClient } from "../api/client";
import { runApiResult, useApiResource } from "../api/resource";
import { useCredential } from "../auth/credential";
import { hrefFor, type Route } from "../routes";
import { Hob, useHobPanel } from "../hob";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";

/**
 * The way in: every table this credential reaches, and what you are at each.
 *
 * The designers drew no picker — their kit starts inside one campaign — so this
 * is the smallest shell that reaches `CampaignHome` and no more. It carries the
 * one write on the way in, because a picker that cannot create is a dead end on
 * a fresh database, and dropping to `curl` to see your own first screen is not a
 * product.
 *
 * **It reads `GET /me/campaigns` rather than `GET /campaigns`, and the
 * difference is one field.** Since the invite landed, an account can be at a
 * table it does not run, and this is the screen where that first shows: the
 * membership carries the role, which the campaign row cannot, because a role is
 * a fact about the pair. Both reads compose the same predicate (see
 * `CampaignMembership`), so the switch cannot change *which* campaigns appear —
 * only what the screen can say about them.
 */

const listMemberships = (client: TavernsClient) => client.me.campaigns();

function CampaignRow({ membership }: { readonly membership: CampaignMembership }) {
  const campaign = membership.campaign;
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
          {/* A player earns a badge and a DM does not, for the reason a
              creature's `authored` origin earns none: absence is what says
              "yours", and a badge on every row would say nothing. */}
          {membership.role === "player" && <Badge variant="secondary">Player</Badge>}
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
  const [resource, reload] = useApiResource(listMemberships);
  // Closed, against the hook's own `true` default, and its doc says why the
  // choice is the shell's: a 400px panel that opens itself is worse than a
  // button that opens it when you ask. This screen passes no campaign either —
  // Hob's tools all hang off one, so here it says so rather than offering a
  // composer with nowhere to send.
  const hob = useHobPanel({ initialOpen: false });

  const memberships =
    resource.state === "ready"
      ? resource.value.filter((row) => row.campaign.archivedAt === null)
      : undefined;

  return (
    <AppShell
      route={route}
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} />}
      topBar={
        <TopBar
          title="Campaigns"
          subtitle="Every table this credential reaches — the ones you run, and the ones you sit at."
        />
      }
    >
      {/* No page-wide `max-w`: the rail's 260px came back to this column, and a
          measure cap would have banked it as empty space on the right. The rows
          spread into two columns once the column is wide enough for a pair —
          the same rule, and the same `@3xl` turn-over, as the encounter grid. */}
      <div className="flex flex-col gap-6">
        {resource.state === "loading" && <Loading label="Looking for your campaigns…" />}
        {resource.state === "failed" && (
          <FailureNotice failure={resource.failure} onRetry={reload} />
        )}
        {memberships !== undefined && (
          <>
            <NewCampaign onCreated={reload} />
            {memberships.length === 0 ? (
              // Two states behind one card, and the second is new: an account
              // that has been invited nowhere is a legitimate steady state now,
              // and so is one whose DM has not shared the table yet — a player
              // member of an unshared campaign reads nothing, which is the
              // master toggle working rather than a gap. Neither can be told
              // apart from here without a second read, so the copy covers both
              // rather than guessing at one.
              <EmptyState icon="book-open" title="No tables yet">
                Name the one you are running and it opens above. If you have followed an invitation,
                the table appears here once its DM shares it.
              </EmptyState>
            ) : (
              <div className="grid gap-4 @3xl:grid-cols-2">
                {memberships.map((membership) => (
                  <CampaignRow key={membership.campaign.id} membership={membership} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
