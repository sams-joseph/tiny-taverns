import type { CampaignMembership, CampaignSharedWorld, SharedWorldMembership } from "@taverns/api";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  cardLinkClassName,
  CardHeader,
  CardTitle,
  Icon,
  EmptyState,
  Loading,
} from "@taverns/ui";
import { useState } from "react";
import { useApiAtom } from "../api/atoms";
import { TopBar } from "../shell/TopBar";
import { NewSharedWorldDialog } from "../shared-world/NewSharedWorldDialog";
import { sharedWorldsAtom } from "../shared-world/load";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { ArchivedDialog } from "./ArchivedDialog";
import { NewCampaignDialog } from "./NewCampaignDialog";
import { HobCover } from "../hob/HobCover";
import { membershipsAtom } from "./load";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * The campaign-first way into Taverns.
 *
 * A campaign is the task a new account arrived to do, so creation asks for
 * its name and lands inside it. The server still creates a private group in
 * the same transaction while Shared Worlds are built; none of that plumbing
 * belongs in this screen or in the user's first decision.
 */

/**
 * One table on the list: it opens the campaign from anywhere on its face and
 * carries nothing else to press. Everything a creator changes about a campaign
 * (its Shared World, archiving, deleting, the rest of its settings) is inside
 * the campaign, on its Overview (`CampaignChrome.tsx`); the list is for
 * choosing a table. The world's name is a link to the world, not a control.
 */
function CampaignRow({
  membership,
  world,
}: {
  readonly membership: CampaignMembership;
  readonly world: CampaignSharedWorld | null;
}) {
  const campaign = membership.campaign;
  return (
    <Card linked className="h-full overflow-hidden">
      <HobCover image={campaign.image} pending={campaign.imagePending} shape="card" />
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2.5">
          <CardTitle className="flex-1">
            <Link
              to="/campaigns/$campaignId"
              params={{ campaignId: campaign.id }}
              data-card-link
              className={cardLinkClassName}
            >
              {campaign.name}
            </Link>
          </CardTitle>
          <Badge variant={membership.relation === "creator" ? "secondary" : "info"}>
            {membership.relation === "creator" ? "Created by you" : "Playing"}
          </Badge>
        </div>
        {campaign.description !== null && (
          <p className="line-clamp-3 text-body-s leading-body text-muted-foreground">
            {campaign.description}
          </p>
        )}
      </CardHeader>
      {(campaign.partyName !== null || world !== null) && (
        <CardContent className="flex flex-wrap items-center gap-4">
          {campaign.partyName !== null && (
            <span className="text-body-s leading-body text-muted-foreground">
              {campaign.partyName}
            </span>
          )}
          {world !== null && (
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
          )}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Every Shared World this account belongs to, and the way to found one. That
 * press is this section's, so it lives in the section rather than the bar,
 * whose one primary is *New campaign*.
 */
function SharedWorldDirectory({
  worlds,
  onNew,
}: {
  readonly worlds: ReadonlyArray<SharedWorldMembership>;
  readonly onNew: () => void;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label="Shared Worlds">
      <span className="text-label leading-snug font-semibold text-heading">Shared Worlds</span>
      {worlds.length === 0 ? (
        <p className="text-body-s leading-body text-muted-foreground">
          Shared Worlds you create or join will appear here. Found one when several campaigns should
          share a history and Hob's memory.
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
      <Button variant="outline" size="sm" className="self-start" onClick={onNew}>
        <Icon name="plus" size={14} />
        New Shared World
      </Button>
    </section>
  );
}

export function CampaignsScreen() {
  const [resource, retry] = useApiAtom(membershipsAtom);
  const [worldsResource] = useApiAtom(sharedWorldsAtom);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [creating, setCreating] = useState<"campaign" | "world" | undefined>();
  const navigate = useNavigate();
  const memberships = resource.state === "ready" ? resource.value : undefined;
  const worlds = worldsResource.state === "ready" ? worldsResource.value : [];
  // While Hob draws a new campaign's cover, re-read until it lands.
  useHobDrawingPolling(
    memberships?.some((membership) => membership.campaign.imagePending) === true,
    retry,
  );

  return (
    <>
      <TopBar title="Campaigns" subtitle="The stories you run and the tables where you play.">
        <Button size="sm" onClick={() => setCreating("campaign")}>
          <Icon name="plus" size={14} />
          New campaign
        </Button>
      </TopBar>
      <div className="flex flex-col gap-6">
        {resource.state === "loading" && <Loading label="Looking for your campaigns…" />}
        {resource.state === "failed" && (
          <ApiFailureNotice failure={resource.failure} onRetry={retry} />
        )}
        {memberships !== undefined && (
          <>
            {memberships.length === 0 ? (
              <EmptyState icon="book-open" title="No campaign yet">
                Start one with <em>New campaign</em>, or follow an invitation from somebody running
                a game.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4">
                {memberships.map((membership) => (
                  <CampaignRow
                    key={membership.campaign.id}
                    membership={membership}
                    world={membership.sharedWorld}
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
            <SharedWorldDirectory worlds={worlds} onNew={() => setCreating("world")} />
          </>
        )}
      </div>

      {shelfOpen && <ArchivedDialog onClose={() => setShelfOpen(false)} />}
      {creating === "campaign" && (
        <NewCampaignDialog
          context={{ kind: "choose", worlds }}
          onClose={() => setCreating(undefined)}
          onCreated={(campaign) =>
            navigate({ to: "/campaigns/$campaignId", params: { campaignId: campaign.id } })
          }
        />
      )}
      {creating === "world" && <NewSharedWorldDialog onClose={() => setCreating(undefined)} />}
    </>
  );
}
