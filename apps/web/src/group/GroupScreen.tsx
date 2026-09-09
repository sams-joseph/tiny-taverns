import type { GroupCampaignCard, GroupId, GroupMember } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon, Input } from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { runApiResult } from "../api/client";
import { reads } from "../api/keys";
import { useCredential } from "../auth/credential";
import { ArchiveDialog } from "../campaign/ArchiveDialog";
import { InviteDialog } from "../campaign/InviteDialog";
import { Hob, useHobPanel } from "../hob";
import { useMutation } from "../api/mutation";
import { AppShell, TopBar } from "../shell/AppShell";
import { SaveFailure } from "../ui/form";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { GroupChronicle } from "./GroupChronicle";
import { groupViewAtom } from "./load";

/**
 * One group: its campaign directory, and its people.
 *
 * **The directory is every campaign in the group, with this reader's own
 * relation on each card** — `Created by you`, `Playing`, or a plain group
 * campaign they do not participate in. That last card is the participation
 * decision on screen: a member sees that the campaign exists and who runs it,
 * and nothing of its content until its creator seats them. So a card without a
 * relation gets no *Open* — a link that lands on a 404 is worse than none.
 *
 * **Founding a campaign is any live member's act** (the governance decision),
 * and it makes the founder its creator and sole DM. Managing the group —
 * invitations, removals, the name — is the owner's alone, so that chrome is
 * keyed on `isOwner` and absent for everybody else.
 */

const relationBadge = (relation: GroupCampaignCard["relation"]) => {
  if (relation === "creator") return <Badge variant="secondary">Created by you</Badge>;
  if (relation === "player") return <Badge variant="info">Playing</Badge>;
  return null;
};

function CampaignCard({
  card,
  onArchive,
}: {
  readonly card: GroupCampaignCard;
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

/** Names a new campaign in this group; the founder becomes its creator. */
function NewCampaign({ groupId }: { readonly groupId: GroupId }) {
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
        client.groups.createCampaign({ params: { groupId }, payload: { name: name.trim() } }),
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
    invalidate([reads.group(groupId), reads.myCampaigns]);
  }, [fetchCredential, groupId, invalidate, name]);

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

function MemberRow({
  member,
  groupId,
  removable,
}: {
  readonly member: GroupMember;
  readonly groupId: GroupId;
  /** The owner's control, absent for everybody else and for the owner's own row. */
  readonly removable: boolean;
}) {
  const { busy, failure, submit } = useMutation();

  const remove = async () => {
    await submit(
      (client) => client.groupMembers.remove({ params: { groupId, accountId: member.accountId } }),
      // Removal retires their campaign participations in the same transaction,
      // so every roster this account was on moved with it.
      [reads.group(groupId), reads.myCampaigns],
    );
  };

  return (
    <div className="flex flex-col gap-1 border-b border-hairline py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="min-w-0 flex-1 truncate text-body-s leading-body text-foreground">
          {member.name}
        </span>
        {member.isOwner && <Badge variant="secondary">Owner</Badge>}
        {removable && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>
            <Icon name="x" size={14} />
            Remove
          </Button>
        )}
      </div>
      {failure !== undefined && <SaveFailure failure={failure} />}
    </div>
  );
}

export function GroupScreen({ groupId }: { readonly groupId: GroupId }) {
  const [resource, retry] = useApiAtom(groupViewAtom(groupId));
  const [inviting, setInviting] = useState(false);
  const [archiving, setArchiving] = useState<GroupCampaignCard | undefined>();
  const hob = useHobPanel({ initialOpen: false });

  const view = resource.state === "ready" ? resource.value : undefined;

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} />}
      topBar={
        <TopBar
          title={view?.group.name ?? "Shared World"}
          subtitle={
            view === undefined
              ? undefined
              : `${view.members.length} ${view.members.length === 1 ? "member" : "members"} · ${view.campaigns.length} ${view.campaigns.length === 1 ? "campaign" : "campaigns"}`
          }
        >
          {view?.isOwner === true && (
            <Button variant="secondary" size="sm" onClick={() => setInviting(true)}>
              <Icon name="user-plus" size={14} />
              Invite
            </Button>
          )}
        </TopBar>
      }
    >
      <div className="flex flex-col gap-8">
        {resource.state === "loading" && <Loading label="Reading the group…" />}
        {resource.state === "failed" && (
          <FailureNotice failure={resource.failure} onRetry={retry} />
        )}
        {view !== undefined && (
          <>
            <section className="flex flex-col gap-4" aria-label="Campaigns">
              <NewCampaign groupId={groupId} />
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

            <GroupChronicle groupId={groupId} />

            <section className="flex max-w-2xl flex-col" aria-label="Members">
              <span className="pb-1 text-label leading-snug font-semibold text-heading">
                Members
              </span>
              {view.members.map((member) => (
                <MemberRow
                  key={member.accountId}
                  member={member}
                  groupId={groupId}
                  removable={view.isOwner && !member.isOwner}
                />
              ))}
            </section>
          </>
        )}
      </div>

      {inviting && view !== undefined && (
        <InviteDialog groupId={groupId} onClose={() => setInviting(false)} />
      )}
      {archiving !== undefined && (
        <ArchiveDialog
          campaign={{ id: archiving.id, name: archiving.name }}
          alsoInvalidates={[reads.group(groupId)]}
          onClose={() => setArchiving(undefined)}
          onArchived={() => setArchiving(undefined)}
        />
      )}
    </AppShell>
  );
}
