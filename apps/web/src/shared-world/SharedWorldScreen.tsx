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
  EmptyState,
  Icon,
  Loading,
  SectionHeading,
} from "@taverns/ui";
import { useCallback, useState } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { reads } from "../api/keys";
import { NewCampaignDialog } from "../campaign/NewCampaignDialog";
import { OverviewCard, OverviewHero, OverviewPage } from "../campaign/OverviewParts";
import { monthOf } from "../chronicle/format";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { TopBar } from "../shell/TopBar";
import { ActionsMenu } from "../ui/ActionsMenu";
import { ArchiveSharedWorldDialog } from "./ArchiveSharedWorldDialog";
import { DeleteSharedWorldDialog } from "./DeleteSharedWorldDialog";
import { SharedWorldSettingsDialog } from "./SharedWorldSettingsDialog";
import { StorySoFarCard } from "./StorySoFarCard";
import { sharedWorldsAtom, sharedWorldViewAtom } from "./load";

/**
 * One Shared World: its Overview, on the campaign Overview's layout
 * (`campaign/OverviewParts.tsx`) over the world's own reads.
 *
 * The hero is the world's cover with its name as the page's `h1`, a meta line
 * of what the view already counts (campaigns, members) and how long the world
 * has existed, its description, and its actions. The main column is what is
 * played here — the campaign directory, then the *Story So Far* with the
 * newest Chronicle entries, whose *Read the chronicle* opens the whole
 * Chronicle on its own page (`SharedWorldChronicleScreen.tsx`). The aside is
 * who is here.
 *
 * **The directory is every campaign in the Shared World, with this reader's own
 * relation on each card** — `Created by you`, `Playing`, or a plain world
 * campaign they do not participate in. That last card is the participation
 * decision on screen: a member sees that the campaign exists and who runs it,
 * and nothing of its content until its creator seats them. So a card without a
 * relation is not a link — one that lands on a 404 is worse than none.
 *
 * **Founding a campaign is any live member's act** (the governance decision),
 * and it makes the founder its creator and sole DM, so *New campaign* is the
 * screen's one primary, in the hero, for every member — the place a player's
 * Overview puts its one door, *New character*. The owner's management sits
 * beside it as outline buttons, as the creator's does on a campaign. The
 * roster is context, not a second onboarding workflow: people enter through
 * campaign invitations, which also establish the eligibility rows this screen
 * reads.
 */

const relationBadge = (relation: SharedWorldCampaignCard["relation"]) => {
  if (relation === "creator") return <Badge variant="secondary">Created by you</Badge>;
  if (relation === "player") return <Badge variant="info">Playing</Badge>;
  return null;
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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

/** Who is here, as summary rows: informational, so a row opens nothing. */
function MembersCard({ members }: { readonly members: ReadonlyArray<SharedWorldMember> }) {
  return (
    <OverviewCard
      title="Members"
      meta={
        <span className="font-mono text-mono leading-none font-medium text-muted-foreground">
          {members.length}
        </span>
      }
    >
      <ul>
        {members.map((member) => (
          <li
            key={member.accountId}
            className="flex min-h-row items-center gap-2.5 border-t border-hairline px-card py-2 first:border-t-0"
          >
            <Icon
              name={member.isOwner ? "crown" : "user"}
              size={14}
              className="shrink-0 text-faint"
            />
            <span className="min-w-0 flex-1 truncate text-body-s leading-snug font-medium text-heading">
              {member.name}
            </span>
            {member.isOwner && <Badge variant="secondary">Owner</Badge>}
          </li>
        ))}
      </ul>
    </OverviewCard>
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

  // A world opens here the moment it is made, while Hob is still drawing its
  // cover. Re-read the world, and the list it came from, until it lands.
  const invalidate = useInvalidate();
  const rereadCover = useCallback(
    () => invalidate([reads.sharedWorld(worldId), reads.mySharedWorlds]),
    [invalidate, worldId],
  );
  useHobDrawingPolling(view?.sharedWorld.imagePending === true, rereadCover);

  const newCampaign = (
    <Button size="sm" onClick={() => setCreatingCampaign(true)}>
      <Icon name="plus" size={14} />
      New campaign
    </Button>
  );

  return (
    <>
      {view === undefined ? (
        // The hero's `h1` is the world's name, which is not known yet: until it
        // is, the ordinary bar holds the page's title.
        <>
          <TopBar title="Shared World" />
          {resource.state === "failed" ? (
            <ApiFailureNotice failure={resource.failure} onRetry={retry} />
          ) : (
            <Loading label="Reading the Shared World…" />
          )}
        </>
      ) : (
        <OverviewPage
          lead={
            <OverviewHero
              image={view.sharedWorld.image}
              imagePending={view.sharedWorld.imagePending}
              meta={[
                count(view.campaigns.length, "campaign", "campaigns"),
                count(view.members.length, "member", "members"),
                `Since ${monthOf(view.sharedWorld.createdAt)}`,
              ]}
              name={view.sharedWorld.name}
              description={view.sharedWorld.description}
            >
              {newCampaign}
              {ownsWorld && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
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
            </OverviewHero>
          }
          main={
            <>
              <section className="flex flex-col gap-3" aria-label="Campaigns">
                <SectionHeading size="title">Campaigns</SectionHeading>
                {view.campaigns.length === 0 ? (
                  <EmptyState icon="book-open" title="Nothing being played yet">
                    Any member can start a campaign, and whoever starts one runs it.
                  </EmptyState>
                ) : (
                  <div className="grid gap-4 @2xl:grid-cols-2">
                    {view.campaigns.map((card) => (
                      <CampaignCard key={card.id} card={card} />
                    ))}
                  </div>
                )}
              </section>
              <StorySoFarCard worldId={worldId} />
            </>
          }
          aside={<MembersCard members={view.members} />}
        />
      )}

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
