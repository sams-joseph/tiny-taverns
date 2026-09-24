import type { SharedWorld, SharedWorldMembership } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  cardLinkClassName,
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
import { ActionsMenu } from "../ui/ActionsMenu";
import { ArchivedSharedWorldsDialog } from "./ArchivedSharedWorldsDialog";
import { ArchiveSharedWorldDialog } from "./ArchiveSharedWorldDialog";
import { DeleteSharedWorldDialog } from "./DeleteSharedWorldDialog";
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

/**
 * One world on the list: it opens the world from anywhere on its face. Its
 * owner also gets an overflow menu with *Archive* and *Delete permanently*,
 * each behind its own confirmation; the trigger is a button, so the linked card
 * lifts it above the link overlay and pressing it does not navigate. Anyone
 * else sees no menu, matching `groupWritable`, which refuses them underneath.
 */
function SharedWorldRow({
  membership,
  onArchive,
  onDelete,
}: {
  readonly membership: SharedWorldMembership;
  readonly onArchive: () => void;
  readonly onDelete: () => void;
}) {
  const sharedWorld = membership.sharedWorld;
  return (
    <Card linked className="overflow-hidden">
      <HobCover image={sharedWorld.image} pending={sharedWorld.imagePending} shape="card" />
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2.5">
          <CardTitle className="flex-1">
            <Link
              to="/worlds/$worldId"
              params={{ worldId: sharedWorld.id }}
              data-card-link
              className={cardLinkClassName}
            >
              {sharedWorld.name}
            </Link>
          </CardTitle>
          {membership.isOwner && <Badge variant="secondary">Yours</Badge>}
          {membership.isOwner && (
            <ActionsMenu
              label={`Actions for ${sharedWorld.name}`}
              items={[
                { label: "Archive", icon: "archive", onSelect: onArchive },
                {
                  label: "Delete permanently",
                  icon: "trash-2",
                  destructive: true,
                  onSelect: onDelete,
                },
              ]}
            />
          )}
        </div>
      </CardHeader>
    </Card>
  );
}

export function SharedWorldsScreen() {
  const [resource, retry] = useApiAtom(sharedWorldsAtom);
  const [worldShelfOpen, setWorldShelfOpen] = useState(false);
  const [campaignShelfOpen, setCampaignShelfOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<SharedWorld | undefined>();
  const [deleting, setDeleting] = useState<SharedWorld | undefined>();

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
                  <SharedWorldRow
                    key={membership.sharedWorld.id}
                    membership={membership}
                    onArchive={() => setArchiving(membership.sharedWorld)}
                    onDelete={() => setDeleting(membership.sharedWorld)}
                  />
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
      {archiving !== undefined && (
        <ArchiveSharedWorldDialog
          sharedWorld={archiving}
          onClose={() => setArchiving(undefined)}
          onArchived={() => setArchiving(undefined)}
        />
      )}
      {deleting !== undefined && (
        <DeleteSharedWorldDialog
          sharedWorld={deleting}
          onClose={() => setDeleting(undefined)}
          onDeleted={() => setDeleting(undefined)}
        />
      )}
    </>
  );
}
