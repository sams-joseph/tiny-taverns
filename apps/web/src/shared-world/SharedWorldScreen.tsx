import type { SharedWorldCampaignCard, SharedWorldId, SharedWorldMember } from "@taverns/api";
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
import { useCallback, useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { reads } from "../api/keys";
import { NewCampaignDialog } from "../campaign/NewCampaignDialog";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { HobCover } from "../hob/HobCover";
import { useShowHob } from "../shell/slots";
import { TopBar } from "../shell/TopBar";
import { Description } from "../ui/description";
import { ActionsMenu } from "../ui/ActionsMenu";
import { ArchiveSharedWorldDialog } from "./ArchiveSharedWorldDialog";
import { DeleteSharedWorldDialog } from "./DeleteSharedWorldDialog";
import { SharedWorldChronicle } from "./SharedWorldChronicle";
import { SharedWorldSettingsDialog } from "./SharedWorldSettingsDialog";
import { sharedWorldsAtom, sharedWorldViewAtom } from "./load";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * One Shared World: its cover, its campaign directory, and its people.
 *
 * **The directory is every campaign in the Shared World, with this reader's own
 * relation on each card** — `Created by you`, `Playing`, or a plain world
 * campaign they do not participate in. That last card is the participation
 * decision on screen: a member sees that the campaign exists and who runs it,
 * and nothing of its content until its creator seats them. So a card without a
 * relation is not a link — one that lands on a 404 is worse than none.
 *
 * **Founding a campaign is any live member's act** (the governance decision),
 * and it makes the founder its creator and sole DM. The roster is context,
 * not a second onboarding workflow: people enter through campaign invitations,
 * which also establish the eligibility rows this screen reads.
 */

const relationBadge = (relation: SharedWorldCampaignCard["relation"]) => {
  if (relation === "creator") return <Badge variant="secondary">Created by you</Badge>;
  if (relation === "player") return <Badge variant="info">Playing</Badge>;
  return null;
};

/**
 * One campaign in the directory. A card this reader participates in opens the
 * campaign from anywhere on its face; a card for a table they do not sit at is
 * not linked, since a link that lands on a 404 is worse than none. It carries
 * no campaign controls: archiving, deleting and moving a campaign are its
 * creator's acts inside the campaign (`CampaignChrome.tsx`), as on the
 * campaign list.
 */
function CampaignCard({ card }: { readonly card: SharedWorldCampaignCard }) {
  const open = card.relation !== "none";
  return (
    <Card linked={open}>
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2.5">
          <CardTitle className="flex-1">
            {open ? (
              <Link
                to="/campaigns/$campaignId"
                params={{ campaignId: card.id }}
                data-card-link
                className={cardLinkClassName}
              >
                {card.name}
              </Link>
            ) : (
              card.name
            )}
          </CardTitle>
          {relationBadge(card.relation)}
          {card.archivedAt !== null && <Badge variant="outline">Archived</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <span className="flex items-center gap-1.5 text-body-s leading-body text-muted-foreground">
          <Icon name="crown" size={14} className="text-faint" />
          Run by {card.creatorName}
        </span>
      </CardContent>
    </Card>
  );
}

function MemberRow({ member }: { readonly member: SharedWorldMember }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-hairline py-2.5 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-body-s leading-body text-foreground">
        {member.name}
      </span>
      {member.isOwner && <Badge variant="secondary">Owner</Badge>}
    </div>
  );
}

export function SharedWorldScreen({ worldId }: { readonly worldId: SharedWorldId }) {
  const [resource, retry] = useApiAtom(sharedWorldViewAtom(worldId));
  const [worldsResource] = useApiAtom(sharedWorldsAtom);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [worldArchiveOpen, setWorldArchiveOpen] = useState(false);
  const [worldDeleteOpen, setWorldDeleteOpen] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const navigate = useNavigate();

  const view = resource.state === "ready" ? resource.value : undefined;
  const ownsWorld =
    worldsResource.state === "ready" &&
    worldsResource.value.some(
      (membership) => membership.sharedWorld.id === worldId && membership.isOwner,
    );

  // The panel is the layout's, and its Shared World scope is the route's.
  const askHob = useShowHob();

  // A world opens here the moment it is made, while Hob is still drawing its
  // cover. Re-read the world, and the list it came from, until it lands.
  const invalidate = useInvalidate();
  const rereadCover = useCallback(
    () => invalidate([reads.sharedWorld(worldId), reads.mySharedWorlds]),
    [invalidate, worldId],
  );
  useHobDrawingPolling(view?.sharedWorld.imagePending === true, rereadCover);

  return (
    <>
      <TopBar
        title={view?.sharedWorld.name ?? "Shared World"}
        subtitle={
          view === undefined
            ? undefined
            : `${view.members.length} ${view.members.length === 1 ? "member" : "members"} · ${view.campaigns.length} ${view.campaigns.length === 1 ? "campaign" : "campaigns"}`
        }
      >
        {/* The owner's screen action, so it is the bar's — never a button
            right-aligned above the body. */}
        {ownsWorld && view !== undefined && (
          <>
            <Button size="sm" onClick={() => setSettingsOpen(true)}>
              <Icon name="pencil" size={14} />
              Shared World settings
            </Button>
            <ActionsMenu
              label="Shared World actions"
              items={[
                {
                  label: "Archive Shared World",
                  icon: "archive",
                  onSelect: () => setWorldArchiveOpen(true),
                },
                {
                  label: "Delete permanently",
                  icon: "trash-2",
                  destructive: true,
                  onSelect: () => setWorldDeleteOpen(true),
                },
              ]}
            />
          </>
        )}
      </TopBar>
      <div className="flex flex-col gap-8">
        {resource.state === "loading" && <Loading label="Reading the Shared World…" />}
        {resource.state === "failed" && (
          <ApiFailureNotice failure={resource.failure} onRetry={retry} />
        )}
        {view !== undefined && (
          <>
            {/* The cover, when there is one, above everything the page is about. */}
            <HobCover
              image={view.sharedWorld.image}
              pending={view.sharedWorld.imagePending}
              shape="band"
            />
            <Description text={view.sharedWorld.description} />
            <section className="flex flex-col gap-4" aria-label="Campaigns">
              {/* The section's own verb, so it lives in the section; the bar's
                  one primary is the owner's settings. */}
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setCreatingCampaign(true)}
              >
                <Icon name="plus" size={14} />
                New campaign
              </Button>
              {view.campaigns.length === 0 ? (
                <EmptyState icon="book-open" title="Nothing being played yet">
                  Any member can start a campaign, and whoever starts one runs it.
                </EmptyState>
              ) : (
                <div className="grid gap-4 @3xl:grid-cols-2">
                  {view.campaigns.map((card) => (
                    <CampaignCard key={card.id} card={card} />
                  ))}
                </div>
              )}
            </section>

            <SharedWorldChronicle worldId={worldId} onAskHob={askHob} />

            <section className="flex max-w-2xl flex-col" aria-label="Members">
              <span className="pb-1 text-label leading-snug font-semibold text-heading">
                Members
              </span>
              {view.members.map((member) => (
                <MemberRow key={member.accountId} member={member} />
              ))}
            </section>
          </>
        )}
      </div>

      {creatingCampaign && view !== undefined && (
        <NewCampaignDialog
          context={{ kind: "world", world: view.sharedWorld }}
          onClose={() => setCreatingCampaign(false)}
          onCreated={() => undefined}
        />
      )}

      {settingsOpen && view !== undefined && (
        <SharedWorldSettingsDialog
          sharedWorld={view.sharedWorld}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setSettingsOpen(false)}
          onArchive={() => {
            setSettingsOpen(false);
            setWorldArchiveOpen(true);
          }}
          onDelete={() => {
            setSettingsOpen(false);
            setWorldDeleteOpen(true);
          }}
        />
      )}

      {worldArchiveOpen && view !== undefined && (
        <ArchiveSharedWorldDialog
          sharedWorld={view.sharedWorld}
          onClose={() => setWorldArchiveOpen(false)}
          onArchived={() => {
            setWorldArchiveOpen(false);
            void navigate({ to: "/worlds" });
          }}
        />
      )}

      {worldDeleteOpen && view !== undefined && (
        <DeleteSharedWorldDialog
          sharedWorld={view.sharedWorld}
          // Each campaign here moves to a context of its own, and its row
          // carries that context.
          alsoInvalidates={view.campaigns.map((card) => reads.campaign(card.id))}
          onClose={() => setWorldDeleteOpen(false)}
          onDeleted={() => {
            setWorldDeleteOpen(false);
            void navigate({ to: "/worlds" });
          }}
        />
      )}
    </>
  );
}
