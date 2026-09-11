import type {
  NpcAwarenessCandidate,
  NpcFollowUpItem,
  NpcFollowUpProposal,
  NpcProposal,
  NpcProposalContent,
} from "@taverns/api";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { Badge, Button, Card, cn, Icon, tabsTriggerVariants } from "@taverns/ui";
import { useEffect, useState, type ReactNode } from "react";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { EmptyState } from "../ui/states";
import { npcFollowUpAtom } from "./load";
import { NpcAvatar } from "./NpcCard";

type FollowUpTab = "all" | "proposals" | "awareness";

const TABS: ReadonlyArray<{ readonly id: FollowUpTab; readonly label: string }> = [
  { id: "all", label: "All" },
  { id: "proposals", label: "Proposals" },
  { id: "awareness", label: "Hob research" },
];

const tabForHash = (hash: string): FollowUpTab =>
  TABS.some((tab) => tab.id === hash) ? (hash as FollowUpTab) : "all";

const contentOf = (
  content: NpcProposalContent,
): { readonly title: string; readonly body: string } => {
  switch (content.kind) {
    case "memory":
      return { title: "Memory proposal", body: content.body };
    case "note":
      return {
        title: `${content.noteKind === "read_aloud" ? "Read-aloud note" : "Note"}: ${content.title}`,
        body: content.body,
      };
    case "beat":
      return { title: "Campaign beat", body: content.body };
  }
};

const tabbed = (
  items: ReadonlyArray<NpcFollowUpItem>,
  tab: FollowUpTab,
): ReadonlyArray<NpcFollowUpItem> => {
  if (tab === "proposals") return items.filter((item) => item.itemKind === "proposal");
  if (tab === "awareness") return items.filter((item) => item.itemKind === "awareness");
  return items;
};

export function NpcFollowUpScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const locationHash = useLocation({ select: (location) => location.hash });
  const [tab, setTab] = useState<FollowUpTab>(() => tabForHash(locationHash));

  useEffect(() => setTab(tabForHash(locationHash)), [locationHash]);

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="NPC follow-up"
      extra={npcFollowUpAtom(campaignId)}
      subtitle={({ extra }) => {
        const total = extra.proposalCount + extra.awarenessCount;
        return total === 0
          ? "Review NPC conversation proposals and Hob research after play"
          : `${String(total)} NPC follow-up ${total === 1 ? "item" : "items"} waiting`;
      }}
      tabs={({ extra }) => (
        <nav aria-label="NPC follow-up sections" className="flex items-stretch gap-1">
          {TABS.map((item) => {
            const count =
              item.id === "proposals"
                ? extra.proposalCount
                : item.id === "awareness"
                  ? extra.awarenessCount
                  : extra.proposalCount + extra.awarenessCount;
            return (
              <Button
                key={item.id}
                variant="ghost"
                className={cn(tabsTriggerVariants(), "gap-1.5")}
                data-active={tab === item.id ? "true" : undefined}
                nativeButton={false}
                render={
                  <Link
                    to="/campaigns/$campaignId/cast/follow-up"
                    params={{ campaignId }}
                    hash={item.id}
                  />
                }
              >
                {item.label}
                {count > 0 && <Badge variant="outline">{count}</Badge>}
              </Button>
            );
          })}
        </nav>
      )}
    >
      {({ extra }) => {
        const shown = tabbed(extra.items, tab);
        return (
          <div className="@container">
            {extra.items.length === 0 ? (
              <EmptyState icon="sparkles" title="No NPC follow-up waiting">
                Rehearsal and shared table conversations can suggest memory, note or beat review
                rows. Campaign Hob can also queue awareness candidates. When either happens, the
                pending work appears here without exposing private player-direct transcripts.
              </EmptyState>
            ) : shown.length === 0 ? (
              <EmptyState icon="check" title="Nothing waiting in this section">
                The other follow-up section may still have work. Accepted NPC-memory proposals and
                Hob memory candidates remain memory drafts until you approve them on the NPC.
              </EmptyState>
            ) : (
              <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]">
                <div className="flex flex-col gap-3">
                  {shown.map((item) =>
                    item.itemKind === "proposal" ? (
                      <ProposalFollowUp key={`proposal-${item.proposal.id}`} item={item} />
                    ) : (
                      <AwarenessFollowUp key={`awareness-${item.candidate.id}`} item={item} />
                    ),
                  )}
                </div>
                <Card tone="sunken" className="h-fit gap-4 p-card">
                  <div>
                    <h2 className="font-display text-title leading-title font-semibold text-heading">
                      After the session
                    </h2>
                    <p className="mt-1 text-body-s leading-body text-muted-foreground">
                      This queue gathers existing review rows across the Cast. It does not summarize
                      transcripts, call a model, or accept anything here.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <CountBox label="Conversation proposals" value={extra.proposalCount} />
                    <CountBox label="Hob research" value={extra.awarenessCount} />
                  </div>
                  <p className="text-caption leading-body text-muted-foreground">
                    Use each row's review link for the authoritative flow: proposals accept stored
                    content by id, and Hob research candidates approve stored content by version.
                  </p>
                </Card>
              </div>
            )}
          </div>
        );
      }}
    </CampaignChrome>
  );
}

function CountBox({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-card border border-subtle bg-surface-card p-3">
      <p className="text-title font-semibold text-heading">{value}</p>
      <p className="text-caption leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}

function FollowUpShell({
  npc,
  eyebrow,
  title,
  body,
  children,
}: {
  readonly npc: NpcFollowUpItem["npc"];
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly children: ReactNode;
}) {
  return (
    <Card className="gap-3 p-card">
      <div className="flex items-start gap-3">
        <NpcAvatar name={npc.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-title leading-title font-semibold text-heading">
              {npc.name}
            </h2>
            {npc.role !== "" && <Badge variant="outline">{npc.role}</Badge>}
            {npc.archivedAt !== null && <Badge variant="outline">Archived NPC</Badge>}
          </div>
          <p className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
            {eyebrow}
          </p>
        </div>
      </div>
      <div className="rounded-card border border-subtle bg-surface-sunken p-3">
        <p className="text-body-s leading-body font-medium text-heading">{title}</p>
        {body !== "" && (
          <p className="mt-2 text-body-s leading-body whitespace-pre-wrap text-foreground">
            {body}
          </p>
        )}
      </div>
      {children}
    </Card>
  );
}

function ProposalFollowUp({ item }: { readonly item: NpcFollowUpProposal }) {
  const content = contentOf(item.proposal.content);
  return (
    <FollowUpShell
      npc={item.npc}
      eyebrow={`${item.proposal.kind} proposal · ${item.source.label}`}
      title={content.title}
      body={content.body}
    >
      <FooterLine proposal={item.proposal} />
      <Button
        variant="secondary"
        size="sm"
        className="w-fit"
        nativeButton={false}
        render={
          <Link
            to="/campaigns/$campaignId/cast/$npcId"
            params={{ campaignId: item.proposal.campaignId, npcId: item.npc.id }}
            hash="proposals"
          />
        }
      >
        <Icon name="sparkles" size={13} />
        Review in NPC Proposals
      </Button>
    </FollowUpShell>
  );
}

function FooterLine({ proposal }: { readonly proposal: NpcProposal }) {
  return (
    <p className="text-caption leading-body text-muted-foreground">
      Source turn {proposal.npcTurnId.slice(0, 8)} · accept uses the stored proposal only
      {proposal.kind === "memory" ? " and creates a memory draft first" : ""}.
    </p>
  );
}

function AwarenessFollowUp({
  item,
}: {
  readonly item: Extract<NpcFollowUpItem, { readonly itemKind: "awareness" }>;
}) {
  const candidate: NpcAwarenessCandidate = item.candidate;
  return (
    <FollowUpShell
      npc={item.npc}
      eyebrow={`${candidate.kind} candidate · Hob research · ${candidate.sourceKind}${
        candidate.sourceLabel === "" ? "" : ` · ${candidate.sourceLabel}`
      }`}
      title={candidate.kind === "knowledge" ? "Knowledge candidate" : "Memory candidate"}
      body={candidate.body}
    >
      {candidate.sourceExcerpt !== "" && (
        <p className="text-caption leading-body whitespace-pre-wrap text-muted-foreground">
          Source copy: {candidate.sourceExcerpt}
        </p>
      )}
      {candidate.rationale !== "" && (
        <p className="text-caption leading-body text-muted-foreground">
          Rationale: {candidate.rationale}
        </p>
      )}
      <Button
        variant="secondary"
        size="sm"
        className="w-fit"
        nativeButton={false}
        render={
          <Link
            to="/campaigns/$campaignId/cast/$npcId"
            params={{ campaignId: candidate.campaignId, npcId: item.npc.id }}
            hash="awareness"
          />
        }
      >
        <Icon name="refresh-cw" size={13} />
        Review in Hob research
      </Button>
    </FollowUpShell>
  );
}
