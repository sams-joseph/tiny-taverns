import type { SharedWorldMembership } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icon,
  EmptyState,
  Loading,
} from "@taverns/ui";
import { useState } from "react";
import { useApiAtom } from "../api/atoms";
import { ArchivedDialog } from "../campaign/ArchivedDialog";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { HobCover } from "../hob/HobCover";
import { TopBar } from "../shell/TopBar";
import { ArchivedSharedWorldsDialog } from "./ArchivedSharedWorldsDialog";
import { NewSharedWorldDialog } from "./NewSharedWorldDialog";
import { sharedWorldsAtom } from "./load";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * Every explicit Shared World this account belongs to. Campaigns remain home;
 * this is the optional cross-campaign context directory.
 *
 * Founding one (*New Shared World*, the bar's one primary) makes you its owner
 * and first member in one transaction (`sharedWorlds.create`) and lands on it;
 * campaigns can then be started inside it.
 *
 * There is no mode and no filter: an account's Shared Worlds are the explicit
 * contexts it belongs to, independently of its relation to any campaign.
 */

function SharedWorldRow({ membership }: { readonly membership: SharedWorldMembership }) {
  const sharedWorld = membership.sharedWorld;
  return (
    <Card className="overflow-hidden">
      <HobCover image={sharedWorld.image} pending={sharedWorld.imagePending} shape="card" />
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2.5">
          <CardTitle className="flex-1">
            <Link
              to="/worlds/$worldId"
              params={{ worldId: sharedWorld.id }}
              className="text-heading no-underline hover:text-link-hover"
            >
              {sharedWorld.name}
            </Link>
          </CardTitle>
          {membership.isOwner && <Badge variant="secondary">Yours</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-link"
            nativeButton={false}
            render={<Link to="/worlds/$worldId" params={{ worldId: sharedWorld.id }} />}
          >
            Open
            <Icon name="chevron-right" size={15} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SharedWorldsScreen() {
  const [resource, retry] = useApiAtom(sharedWorldsAtom);
  const [worldShelfOpen, setWorldShelfOpen] = useState(false);
  const [campaignShelfOpen, setCampaignShelfOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const memberships = resource.state === "ready" ? resource.value : undefined;
  // A world founded here, or promoted from a campaign, lands on this list while
  // Hob is still drawing its cover. Re-read until every card's has landed.
  useHobDrawingPolling(
    memberships?.some((membership) => membership.sharedWorld.imagePending) === true,
    retry,
  );

  return (
    <>
      <TopBar
        title="Shared Worlds"
        subtitle="Connected campaigns with one history and a shared memory for Hob."
      >
        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon name="plus" size={14} />
          New Shared World
        </Button>
      </TopBar>
      <div className="flex flex-col gap-6">
        {resource.state === "loading" && <Loading label="Looking for your Shared Worlds…" />}
        {resource.state === "failed" && (
          <ApiFailureNotice failure={resource.failure} onRetry={retry} />
        )}
        {memberships !== undefined && (
          <>
            {memberships.length === 0 ? (
              <EmptyState icon="map" title="No Shared World yet">
                Create one with <em>New Shared World</em> when two campaigns should share history
                and Hob's memory.
              </EmptyState>
            ) : (
              <div className="grid gap-4 @3xl:grid-cols-2">
                {memberships.map((membership) => (
                  <SharedWorldRow key={membership.sharedWorld.id} membership={membership} />
                ))}
              </div>
            )}
            {/* The way back for shelved tables, and deliberately the quietest
                thing on the page. It requests nothing until it is opened. */}
            <div className="flex flex-wrap gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setWorldShelfOpen(true)}
              >
                <Icon name="history" size={14} />
                Archived Shared Worlds
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setCampaignShelfOpen(true)}
              >
                <Icon name="history" size={14} />
                Archived campaigns
              </Button>
            </div>
          </>
        )}
      </div>

      {worldShelfOpen && <ArchivedSharedWorldsDialog onClose={() => setWorldShelfOpen(false)} />}
      {campaignShelfOpen && <ArchivedDialog onClose={() => setCampaignShelfOpen(false)} />}
      {creating && <NewSharedWorldDialog onClose={() => setCreating(false)} />}
    </>
  );
}
