import type { CampaignMembership } from "@taverns/api";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon, Input } from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import type { TavernsClient } from "../api/client";
import { runApiResult, useApiResource } from "../api/resource";
import { useCredential } from "../auth/credential";
import { hrefFor, modeOf, type Route } from "../routes";
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
 *
 * ### It is two screens now, on one read
 *
 * **The role switch is a mode**, so this file answers two questions rather than
 * one: *the tables I run* at `#/campaigns`, and *the tables I sit at* at
 * `#/play`. One `useApiResource` and one endpoint serve both — `role` is on
 * every row already — and the split is a filter over the answer plus different
 * copy, different affordances and a different destination per row.
 *
 * That last one is the point of the whole step. A player's row goes to
 * `#/play/campaigns/:c`, not to the DM's campaign screen, which composes
 * `runs.list` and would answer them a 404 the first time they followed an
 * invitation. **The branch is the thing that stops a player landing on a broken
 * screen**, so it happens here — at the only place that knows the role — rather
 * than being discovered by the screen underneath.
 *
 * This is also where the switch is offered, because this is where the answer to
 * "is there a player side at all" is in hand. See `AppShell`'s `roleSwitch`.
 */

const listMemberships = (client: TavernsClient) => client.me.campaigns();

function CampaignRow({ membership }: { readonly membership: CampaignMembership }) {
  const campaign = membership.campaign;
  // A mode, not a filter: the row goes to the screen for the role you are at
  // this table in, and there is exactly one such screen.
  const open = hrefFor(
    membership.role === "player"
      ? { screen: "playCampaign", campaignId: campaign.id }
      : { screen: "campaign", campaignId: campaign.id },
  );
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2.5">
          <CardTitle className="flex-1">
            <a href={open} className="text-heading no-underline hover:text-link-hover">
              {campaign.name}
            </a>
          </CardTitle>
          {/* No `Player` badge any more, for the reason it earned one before:
              absence is what says "yours". Under a mode every row in a list has
              the same role, so a badge on all of them would say nothing — the
              nav and the pill are what carry which side you are looking at. */}
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
          render={<a href={open} />}
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

  const mode = modeOf(route);
  const player = mode === "player";

  const live =
    resource.state === "ready"
      ? resource.value.filter((row) => row.campaign.archivedAt === null)
      : undefined;
  const memberships = live?.filter((row) => (player ? row.role === "player" : row.role === "dm"));

  // Offered when there is a side to switch *to*, and always in player mode,
  // which is what keeps a bookmark into `#/play` from being a dead end. An
  // account that is a DM everywhere and a player nowhere — every account that
  // predates the invitation — is not shown a pill leading to an empty list.
  const roleSwitch = player || (live?.some((row) => row.role === "player") ?? false);

  return (
    <AppShell
      route={route}
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} />}
      roleSwitch={roleSwitch}
      topBar={
        <TopBar
          title={player ? "Tables" : "Campaigns"}
          subtitle={
            player
              ? "The tables you sit at. What you can read at each is whatever its DM has shared."
              : "The tables you run."
          }
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
            {/* Creating a campaign makes you its DM — `Campaigns.create` writes
                the owner's `dm` row in the same transaction — so the one write
                on the way in belongs to the DM side and nowhere else. Offering
                it here would be offering to leave the mode. */}
            {!player && <NewCampaign onCreated={reload} />}
            {memberships.length === 0 ? (
              player ? (
                // Two states behind one card, and neither can be told apart
                // from here without a second read: nobody has invited you, or
                // the DM of a table you joined has not shared it — a player
                // member of an unshared campaign reads nothing, which is the
                // master toggle working rather than a gap. So the copy covers
                // both rather than guessing at one.
                <EmptyState icon="user" title="No table yet">
                  Follow the link somebody sends you and their table appears here. A table you have
                  already joined shows up once its DM shares it.
                </EmptyState>
              ) : (
                <EmptyState icon="book-open" title="No campaigns yet">
                  Name the one you are running and it opens above. Tables you have been invited to
                  are on the player side.
                </EmptyState>
              )
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
