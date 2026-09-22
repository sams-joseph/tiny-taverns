import type { SharedWorldCampaignCard, SharedWorldId, SharedWorldMember } from "@taverns/api";
import { Link, useNavigate } from "@tanstack/react-router";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon, Input } from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { runApiResult } from "../api/client";
import { reads } from "../api/keys";
import { useCredential } from "../auth/credential";
import { ArchiveDialog } from "../campaign/ArchiveDialog";
import { useShowHob } from "../shell/slots";
import { TopBar } from "../shell/TopBar";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { ArchiveSharedWorldDialog } from "./ArchiveSharedWorldDialog";
import { SharedWorldChronicle } from "./SharedWorldChronicle";
import { SharedWorldSettingsDialog } from "./SharedWorldSettingsDialog";
import { sharedWorldsAtom, sharedWorldViewAtom } from "./load";

/**
 * One Shared World: its campaign directory, and its people.
 *
 * **The directory is every campaign in the Shared World, with this reader's own
 * relation on each card** — `Created by you`, `Playing`, or a plain world
 * campaign they do not participate in. That last card is the participation
 * decision on screen: a member sees that the campaign exists and who runs it,
 * and nothing of its content until its creator seats them. So a card without a
 * relation gets no *Open* — a link that lands on a 404 is worse than none.
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

function CampaignCard({
  card,
  onArchive,
}: {
  readonly card: SharedWorldCampaignCard;
  /** The creator's shelf control, absent on every other card. */
  readonly onArchive: (() => void) | undefined;
}) {
  const open = card.relation !== "none";
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2.5">
          <CardTitle className="flex-1">
            {open ? (
              <Link
                to="/campaigns/$campaignId"
                params={{ campaignId: card.id }}
                className="text-heading no-underline hover:text-link-hover"
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
        {open && (
          <div className="ml-auto flex items-center gap-1">
            {onArchive !== undefined && card.archivedAt === null && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={onArchive}
              >
                Archive
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-link"
              nativeButton={false}
              render={<Link to="/campaigns/$campaignId" params={{ campaignId: card.id }} />}
            >
              Open
              <Icon name="chevron-right" size={15} />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Names a new campaign in this Shared World; the founder becomes its creator. */
function NewCampaign({ worldId }: { readonly worldId: SharedWorldId }) {
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const create = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    const token = await fetchCredential();
    const result = await runApiResult(
      (client) =>
        client.sharedWorlds.createCampaign({
          params: { worldId: worldId },
          payload: { name: name.trim() },
        }),
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
    // The directory gains a card, and the founder gains a membership row — the
    // creator's participation is written in the same transaction, which is
    // what the campaign chrome reads the relation from.
    invalidate([reads.sharedWorld(worldId), reads.myCampaigns]);
  }, [fetchCredential, worldId, invalidate, name]);

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
  const [archiving, setArchiving] = useState<SharedWorldCampaignCard | undefined>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [worldArchiveOpen, setWorldArchiveOpen] = useState(false);
  const navigate = useNavigate();

  const view = resource.state === "ready" ? resource.value : undefined;
  const ownsWorld =
    worldsResource.state === "ready" &&
    worldsResource.value.some(
      (membership) => membership.sharedWorld.id === worldId && membership.isOwner,
    );

  // The panel is the layout's, and its Shared World scope is the route's.
  const askHob = useShowHob();

  return (
    <>
      <TopBar
        title={view?.sharedWorld.name ?? "Shared World"}
        subtitle={
          view === undefined
            ? undefined
            : `${view.members.length} ${view.members.length === 1 ? "member" : "members"} · ${view.campaigns.length} ${view.campaigns.length === 1 ? "campaign" : "campaigns"}`
        }
      />
      <div className="flex flex-col gap-8">
        {resource.state === "loading" && <Loading label="Reading the Shared World…" />}
        {resource.state === "failed" && (
          <FailureNotice failure={resource.failure} onRetry={retry} />
        )}
        {view !== undefined && (
          <>
            {ownsWorld && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                  <Icon name="pencil" size={14} />
                  Shared World settings
                </Button>
              </div>
            )}
            <section className="flex flex-col gap-4" aria-label="Campaigns">
              <NewCampaign worldId={worldId} />
              {view.campaigns.length === 0 ? (
                <EmptyState icon="book-open" title="Nothing being played yet">
                  Any member can start a campaign, and whoever starts one runs it.
                </EmptyState>
              ) : (
                <div className="grid gap-4 @3xl:grid-cols-2">
                  {view.campaigns.map((card) => (
                    <CampaignCard
                      key={card.id}
                      card={card}
                      // The shelf is the creator's — `campaignWritable`
                      // refuses anybody else underneath either way.
                      onArchive={card.relation === "creator" ? () => setArchiving(card) : undefined}
                    />
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

      {archiving !== undefined && (
        <ArchiveDialog
          campaign={{ id: archiving.id, name: archiving.name }}
          alsoInvalidates={[reads.sharedWorld(worldId)]}
          onClose={() => setArchiving(undefined)}
          onArchived={() => setArchiving(undefined)}
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
    </>
  );
}
