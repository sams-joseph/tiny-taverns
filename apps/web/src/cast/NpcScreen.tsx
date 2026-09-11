import type {
  Npc,
  NpcAwarenessCandidate,
  NpcKnowledgeFact,
  NpcMemory,
  NpcMemoryStatus,
  NpcProposal,
  NpcProposalContent,
  SessionId,
} from "@taverns/api";
import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { Badge, Button, Card, cn, Icon, Input, tabsTriggerVariants } from "@taverns/ui";
import { Result } from "effect";
import { useEffect, useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { DetailFacts, DetailSection } from "../ui/detail";
import { Field, SaveFailure, Textarea } from "../ui/form";
import { npcAtom, sessionNpcsAtom, type NpcDetail } from "./load";
import { NpcAvatar } from "./NpcCard";
import { NpcDialog } from "./NpcDialog";
import { useNpcRehearsal } from "./rehearsal";
import { RehearsalPanel } from "./RehearsalPanel";

/**
 * One NPC: the persona as the creator wrote it, the rehearsal beside it, and
 * a small inspector under the persona.
 *
 * ### Two columns wide, one narrow — on the column's width
 *
 * The document is its own `@container`: above `@3xl` the persona and the
 * rehearsal sit side by side, below it they stack with the rehearsal first,
 * because on a narrow column the thing you came to do is hear them. No
 * viewport breakpoint anywhere, for the rule every screen here follows.
 *
 * ### The inspector shows metadata, never the prompt
 *
 * Template version, an estimate of the persona's size in tokens, the model
 * behind it, and — once a line has been answered — what that reply's prompt
 * measured. The assembled prompt itself is never on the wire (it carries the
 * private material), so there is nothing here that could show it.
 *
 * ### Archive is reversible and says so
 *
 * An archived NPC keeps its transcripts and takes no new lines; the screen
 * still renders it, with *Restore* where *Archive* was, and the rehearsal
 * composer replaced by the reason.
 */
type NpcTab = "profile" | "rehearsal" | "knowledge" | "memory" | "awareness" | "proposals";

const NPC_TABS: ReadonlyArray<{ readonly id: NpcTab; readonly label: string }> = [
  { id: "profile", label: "Profile" },
  { id: "rehearsal", label: "Rehearsal" },
  { id: "knowledge", label: "Knowledge" },
  { id: "memory", label: "Memory" },
  { id: "awareness", label: "Hob research" },
  { id: "proposals", label: "Proposals" },
];

const tabForHash = (hash: string): NpcTab =>
  NPC_TABS.some((item) => item.id === hash) ? (hash as NpcTab) : "profile";

export function NpcScreen() {
  const { campaignId, npcId } = useParams({ from: "/_shell/campaigns/$campaignId/cast/$npcId" });
  const locationHash = useLocation({ select: (location) => location.hash });
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<NpcTab>(() => tabForHash(locationHash));

  useEffect(() => {
    const next = tabForHash(locationHash);
    if (next !== "profile") setTab(next);
  }, [locationHash]);

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Cast"
      extra={npcAtom({ campaignId, npcId })}
      subtitle={({ extra }) =>
        extra.npc.role === "" ? extra.npc.name : `${extra.npc.name} · ${extra.npc.role}`
      }
      tabs={() => <NpcTabs active={tab} onChange={setTab} />}
      actions={({ extra }) => (
        <>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to="/campaigns/$campaignId/cast" params={{ campaignId }} />}
          >
            <Icon name="chevron-left" size={14} />
            All NPCs
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Icon name="pencil" size={14} />
            Edit
          </Button>
          <ArchiveButton npc={extra.npc} />
        </>
      )}
    >
      {({ view, extra }) => (
        <>
          <NpcBody detail={extra} active={tab} currentSessionId={view.session?.id} />
          {editing && (
            <NpcDialog
              campaignId={campaignId}
              npc={extra.npc}
              onClose={() => setEditing(false)}
              onSaved={() => setEditing(false)}
            />
          )}
        </>
      )}
    </CampaignChrome>
  );
}

function NpcTabs({
  active,
  onChange,
}: {
  readonly active: NpcTab;
  readonly onChange: (tab: NpcTab) => void;
}) {
  return (
    <nav aria-label="NPC sections" className="flex items-stretch gap-1">
      {NPC_TABS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={cn(tabsTriggerVariants(), "h-auto self-stretch px-3.25")}
          data-state={active === item.id ? "active" : "inactive"}
          aria-current={active === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function NpcBody({
  detail,
  active,
  currentSessionId,
}: {
  readonly detail: NpcDetail;
  readonly active: NpcTab;
  readonly currentSessionId?: SessionId;
}) {
  const { npc, knowledge, memories, proposals, awarenessCandidates } = detail;
  const invalidate = useInvalidate();
  const rehearsal = useNpcRehearsal(npc.campaignId, npc.id, npc.name, () => {
    invalidate([
      reads.npcProposals(npc.id),
      reads.npcFollowUp(npc.campaignId),
      reads.npcMemories(npc.id),
      reads.npcRehearsal(npc.id),
    ]);
  });
  const archived = npc.archivedAt !== null;
  const usableRehearsal = archived
    ? {
        ...rehearsal,
        send: undefined,
        unavailable: `${npc.name} is archived. Restore them to rehearse again; the transcript is kept either way.`,
      }
    : rehearsal;

  if (active === "rehearsal") {
    return (
      <div className="flex min-h-[34rem] flex-col">
        <RehearsalPanel
          name={npc.name}
          rehearsal={usableRehearsal}
          reviewTarget={{ campaignId: npc.campaignId, npcId: npc.id }}
        />
      </div>
    );
  }

  if (active === "knowledge") return <KnowledgePanel npc={npc} facts={knowledge} />;
  if (active === "memory") return <MemoryPanel npc={npc} memories={memories} />;
  if (active === "awareness") {
    return <AwarenessPanel npc={npc} candidates={awarenessCandidates} />;
  }
  if (active === "proposals") return <ProposalPanel npc={npc} proposals={proposals} />;

  return (
    <div className="@container">
      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.45fr)]">
        <Card className="gap-4 p-card">
          <div className="flex items-start gap-3">
            <NpcAvatar name={npc.name} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-title leading-title font-semibold text-heading">
                {npc.name}
              </h2>
              {npc.role !== "" && (
                <p className="text-body-s leading-body text-muted-foreground">{npc.role}</p>
              )}
            </div>
            <NpcDetailStatus npc={npc} proposals={proposals} currentSessionId={currentSessionId} />
          </div>

          <Persona npc={npc} />
        </Card>

        <Inspector npc={npc} rehearsal={rehearsal} />
      </div>
    </div>
  );
}

function NpcDetailStatus({
  npc,
  proposals,
  currentSessionId,
}: {
  readonly npc: Npc;
  readonly proposals: ReadonlyArray<NpcProposal>;
  readonly currentSessionId?: SessionId;
}) {
  const pending = proposals.filter((proposal) => proposal.state === "pending").length;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {npc.archivedAt !== null ? (
        <Badge variant="outline">Archived</Badge>
      ) : npc.visibility === "shared" ? (
        <Badge variant="secondary">
          <Icon name="users" size={11} />
          Player-facing
        </Badge>
      ) : (
        <Badge variant="outline">
          <Icon name="eye-off" size={11} />
          Cast only
        </Badge>
      )}
      {currentSessionId !== undefined && (
        <NpcDetailOpenBadge npc={npc} sessionId={currentSessionId} />
      )}
      {pending > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-caption text-accent-ink"
          nativeButton={false}
          render={
            <Link
              to="/campaigns/$campaignId/cast/$npcId"
              params={{ campaignId: npc.campaignId, npcId: npc.id }}
              hash="proposals"
            />
          }
        >
          <Icon name="sparkles" size={11} />
          {pending} pending
        </Button>
      )}
    </div>
  );
}

function NpcDetailOpenBadge({
  npc,
  sessionId,
}: {
  readonly npc: Npc;
  readonly sessionId: SessionId;
}) {
  const [sessionNpcs] = useApiAtom(sessionNpcsAtom({ campaignId: npc.campaignId, sessionId }));
  if (sessionNpcs.state !== "ready" || !sessionNpcs.value.some((row) => row.id === npc.id)) {
    return null;
  }
  return (
    <Badge variant="secondary">
      <Icon name="mic" size={11} />
      Open at table
    </Badge>
  );
}

function AwarenessPanel({
  npc,
  candidates,
}: {
  readonly npc: Npc;
  readonly candidates: ReadonlyArray<NpcAwarenessCandidate>;
}) {
  const pending = candidates.filter((candidate) => candidate.state === "pending");
  const decided = candidates.filter((candidate) => candidate.state !== "pending");

  return (
    <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
      <Card className="gap-4 p-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-title leading-title font-semibold text-heading">
              Hob research candidates
            </h2>
            <p className="text-body-s leading-body text-muted-foreground">
              Campaign Hob can research notes, beats, recaps and Cast context for you. These rows
              are only candidates until you approve them here.
            </p>
          </div>
          <Badge variant="outline">{pending.length} pending</Badge>
        </div>
        <AwarenessList npc={npc} candidates={pending} empty="No Hob research waiting." />
      </Card>

      <Card tone="sunken" className="gap-4 p-card">
        <h3 className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
          Reviewed
        </h3>
        <AwarenessList
          npc={npc}
          candidates={decided}
          empty="No research candidates reviewed yet."
        />
      </Card>
    </div>
  );
}

function AwarenessList({
  npc,
  candidates,
  empty,
}: {
  readonly npc: Npc;
  readonly candidates: ReadonlyArray<NpcAwarenessCandidate>;
  readonly empty: string;
}) {
  if (candidates.length === 0) {
    return <p className="text-body-s leading-body text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {candidates.map((candidate) => (
        <AwarenessRow key={candidate.id} npc={npc} candidate={candidate} />
      ))}
    </div>
  );
}

function AwarenessRow({
  npc,
  candidate,
}: {
  readonly npc: Npc;
  readonly candidate: NpcAwarenessCandidate;
}) {
  const [current, setCurrent] = useState(candidate);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(candidate.body);
  const [sourceLabel, setSourceLabel] = useState(candidate.sourceLabel);
  const [sourceExcerpt, setSourceExcerpt] = useState(candidate.sourceExcerpt);
  const [rationale, setRationale] = useState(candidate.rationale);
  const { busy, failure, submit } = useMutation();
  const params = {
    campaignId: npc.campaignId,
    npcId: npc.id,
    candidateId: current.id,
  };
  const invalidate = [
    reads.npcAwarenessCandidates(npc.id),
    reads.npcFollowUp(npc.campaignId),
    reads.npcKnowledge(npc.id),
    reads.npcMemories(npc.id),
    reads.npcRehearsal(npc.id),
  ];

  useEffect(() => {
    if (editing) return;
    setCurrent((held) =>
      held.id !== candidate.id || candidate.version >= held.version ? candidate : held,
    );
  }, [candidate, editing]);

  const resetDraft = (next: NpcAwarenessCandidate) => {
    setBody(next.body);
    setSourceLabel(next.sourceLabel);
    setSourceExcerpt(next.sourceExcerpt);
    setRationale(next.rationale);
  };

  const save = async () => {
    const saved = await submit(
      (client) =>
        client.npcs.updateAwarenessCandidate({
          params,
          payload: {
            expectedVersion: current.version,
            body: body.trim(),
            sourceLabel: sourceLabel.trim(),
            sourceExcerpt: sourceExcerpt.trim(),
            rationale: rationale.trim(),
          },
        }),
      invalidate,
    );
    if (Result.isSuccess(saved)) {
      setCurrent(saved.success);
      resetDraft(saved.success);
      setEditing(false);
    }
  };

  const approve = async () => {
    const saved = await submit(
      (client) =>
        client.npcs.approveAwarenessCandidate({
          params,
          payload: { expectedVersion: current.version },
        }),
      invalidate,
    );
    if (Result.isSuccess(saved)) setCurrent(saved.success);
  };

  const reject = async () => {
    const saved = await submit(
      (client) =>
        client.npcs.rejectAwarenessCandidate({
          params,
          payload: {
            expectedVersion: current.version,
            reason: "Rejected from the Cast screen.",
          },
        }),
      invalidate,
    );
    if (Result.isSuccess(saved)) setCurrent(saved.success);
  };

  return (
    <div className="rounded-card border border-subtle bg-surface-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
            {current.kind} · {current.state} · {current.sourceKind}
            {current.sourceLabel === "" ? "" : ` · ${current.sourceLabel}`}
          </p>
          {editing ? (
            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <Field label="Candidate" htmlFor={`awareness-body-${current.id}`}>
                <Textarea
                  id={`awareness-body-${current.id}`}
                  rows={5}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </Field>
              <Field label="Source label" htmlFor={`awareness-source-${current.id}`}>
                <Input
                  id={`awareness-source-${current.id}`}
                  value={sourceLabel}
                  onChange={(event) => setSourceLabel(event.target.value)}
                />
              </Field>
              <Field label="Copied source excerpt" htmlFor={`awareness-excerpt-${current.id}`}>
                <Textarea
                  id={`awareness-excerpt-${current.id}`}
                  rows={3}
                  value={sourceExcerpt}
                  onChange={(event) => setSourceExcerpt(event.target.value)}
                />
              </Field>
              <Field label="Why Hob proposed it" htmlFor={`awareness-rationale-${current.id}`}>
                <Textarea
                  id={`awareness-rationale-${current.id}`}
                  rows={3}
                  value={rationale}
                  onChange={(event) => setRationale(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" disabled={busy}>
                  Save edits
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetDraft(current);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p className="mt-1 text-body-s leading-body whitespace-pre-wrap text-foreground">
                {current.body}
              </p>
              {current.sourceExcerpt !== "" && (
                <p className="mt-2 text-caption leading-body whitespace-pre-wrap text-muted-foreground">
                  Source copy: {current.sourceExcerpt}
                </p>
              )}
              {current.rationale !== "" && (
                <p className="mt-2 text-caption leading-body text-muted-foreground">
                  Rationale: {current.rationale}
                </p>
              )}
            </>
          )}
        </div>
        {current.state === "pending" && !editing && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Edit awareness candidate"
              disabled={busy}
              onClick={() => {
                resetDraft(current);
                setEditing(true);
              }}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Approve awareness candidate"
              disabled={busy}
              onClick={() => void approve()}
            >
              Approve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Reject awareness candidate"
              disabled={busy}
              onClick={() => void reject()}
            >
              Reject
            </Button>
          </div>
        )}
      </div>
      {current.state === "approved" && (
        <p className="mt-2 text-caption leading-body text-accent-ink">
          Approved as {current.kind === "knowledge" ? "a knowledge fact" : "a memory draft"}.
        </p>
      )}
      {current.state === "rejected" && (
        <p className="mt-2 text-caption leading-body text-muted-foreground">
          Rejected{current.rejectionReason === null ? "." : `: ${current.rejectionReason}`}
        </p>
      )}
      {failure !== undefined && <SaveFailure failure={failure} />}
    </div>
  );
}

function ProposalPanel({
  npc,
  proposals,
}: {
  readonly npc: Npc;
  readonly proposals: ReadonlyArray<NpcProposal>;
}) {
  const pending = proposals.filter((proposal) => proposal.state === "pending");
  const decided = proposals.filter((proposal) => proposal.state !== "pending");

  return (
    <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
      <Card className="gap-4 p-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-title leading-title font-semibold text-heading">
              Pending proposals
            </h2>
            <p className="text-body-s leading-body text-muted-foreground">
              NPC proposals are review records. Accepting one uses this stored content only; the
              accept button never sends replacement prose.
            </p>
          </div>
          <Badge variant="outline">{pending.length} pending</Badge>
        </div>
        <ProposalList npc={npc} proposals={pending} empty="No proposals waiting." />
      </Card>

      <Card tone="sunken" className="gap-4 p-card">
        <h3 className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
          Already reviewed
        </h3>
        <ProposalList npc={npc} proposals={decided} empty="Nothing accepted or rejected yet." />
      </Card>
    </div>
  );
}

function ProposalList({
  npc,
  proposals,
  empty,
}: {
  readonly npc: Npc;
  readonly proposals: ReadonlyArray<NpcProposal>;
  readonly empty: string;
}) {
  if (proposals.length === 0) {
    return <p className="text-body-s leading-body text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {proposals.map((proposal) => (
        <ProposalRow key={proposal.id} npc={npc} proposal={proposal} />
      ))}
    </div>
  );
}

function ProposalRow({ npc, proposal }: { readonly npc: Npc; readonly proposal: NpcProposal }) {
  const { busy, failure, submit } = useMutation();
  const params = { campaignId: npc.campaignId, npcId: npc.id, proposalId: proposal.id };
  const invalidate = [
    reads.npcProposals(npc.id),
    reads.npcFollowUp(npc.campaignId),
    reads.npcMemories(npc.id),
    reads.npcRehearsal(npc.id),
    reads.notes(npc.campaignId),
    reads.sessions(npc.campaignId),
  ];
  const content = proposalContent(proposal.content);
  return (
    <div className="rounded-card border border-subtle bg-surface-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
            {proposal.kind} · {proposal.state}
          </p>
          <p className="mt-1 text-body-s leading-body font-medium text-heading">{content.title}</p>
          {content.body !== "" && (
            <p className="mt-2 text-body-s leading-body whitespace-pre-wrap text-foreground">
              {content.body}
            </p>
          )}
          <p className="mt-2 text-caption leading-body text-muted-foreground">
            Source turn {proposal.npcTurnId.slice(0, 8)} · accept uses the stored proposal only
          </p>
        </div>
        {proposal.state === "pending" && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void submit(
                  (client) => client.npcs.acceptProposal({ params, payload: {} }),
                  invalidate,
                )
              }
            >
              Accept
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                void submit(
                  (client) =>
                    client.npcs.rejectProposal({
                      params,
                      payload: { reason: "Rejected from the Cast screen." },
                    }),
                  invalidate,
                )
              }
            >
              Reject
            </Button>
          </div>
        )}
      </div>
      {proposal.state === "accepted" && (
        <p className="mt-2 text-caption leading-body text-accent-ink">
          Accepted{proposal.acceptedMemoryId !== null ? " as a memory draft" : " into the campaign"}
          .
        </p>
      )}
      {proposal.state === "rejected" && (
        <p className="mt-2 text-caption leading-body text-muted-foreground">
          Rejected{proposal.rejectionReason === null ? "." : `: ${proposal.rejectionReason}`}
        </p>
      )}
      {failure !== undefined && <SaveFailure failure={failure} />}
    </div>
  );
}

function proposalContent(content: NpcProposalContent): {
  readonly title: string;
  readonly body: string;
} {
  switch (content.kind) {
    case "memory":
      return { title: "Memory draft", body: content.body };
    case "note":
      return {
        title: `${content.noteKind === "read_aloud" ? "Read-aloud note" : "Note"}: ${content.title}`,
        body: content.body,
      };
    case "beat":
      return { title: "Campaign beat", body: content.body };
  }
}

function KnowledgePanel({
  npc,
  facts,
}: {
  readonly npc: Npc;
  readonly facts: ReadonlyArray<NpcKnowledgeFact>;
}) {
  const [body, setBody] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceKind, setSourceKind] = useState<NpcKnowledgeFact["sourceKind"]>("manual");
  const [showProblem, setShowProblem] = useState(false);
  const { busy, failure, submit } = useMutation();
  const live = facts.filter((fact) => fact.retiredAt === null);
  const retired = facts.filter((fact) => fact.retiredAt !== null);
  const problem = body.trim() === "" ? "Write the fact first." : undefined;

  const save = async () => {
    setShowProblem(true);
    if (problem !== undefined) return;
    const saved = await submit(
      (client) =>
        client.npcs.createKnowledge({
          params: { campaignId: npc.campaignId, npcId: npc.id },
          payload: {
            body: body.trim(),
            sourceKind,
            sourceLabel: sourceLabel.trim(),
          },
        }),
      [reads.npcKnowledge(npc.id), reads.npcRehearsal(npc.id)],
    );
    if (Result.isSuccess(saved)) {
      setBody("");
      setSourceLabel("");
      setShowProblem(false);
    }
  };

  return (
    <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
      <Card className="gap-4 p-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-title leading-title font-semibold text-heading">
              Knowledge facts
            </h2>
            <p className="text-body-s leading-body text-muted-foreground">
              Facts copied into this NPC. Source links are provenance only; rehearsal never reads
              through them.
            </p>
          </div>
          <Badge variant="outline">{live.length} active</Badge>
        </div>
        <div className="flex flex-col gap-3">
          {live.length === 0 ? (
            <p className="text-body-s leading-body text-muted-foreground">
              No explicit knowledge yet. Add only facts this NPC should know in rehearsal.
            </p>
          ) : (
            live.map((fact) => <KnowledgeRow key={fact.id} npc={npc} fact={fact} />)
          )}
        </div>
      </Card>

      <Card tone="sunken" className="gap-4 p-card">
        <h3 className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
          Add a fact
        </h3>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field
            label="Fact"
            htmlFor="npc-knowledge-body"
            error={showProblem ? problem : undefined}
          >
            <Textarea
              id="npc-knowledge-body"
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          <div className="grid gap-3 @lg:grid-cols-2">
            <Field label="Source kind" htmlFor="npc-knowledge-source-kind">
              <select
                id="npc-knowledge-source-kind"
                className="h-10 rounded-control border border-subtle bg-surface-raised px-3 text-body-s text-foreground"
                value={sourceKind}
                onChange={(event) =>
                  setSourceKind(event.target.value as NpcKnowledgeFact["sourceKind"])
                }
              >
                <option value="manual">Manual</option>
                <option value="note">Note</option>
                <option value="beat">Beat</option>
                <option value="recap">Recap</option>
                <option value="group_history">Shared World Chronicle</option>
              </select>
            </Field>
            <Field label="Source label" htmlFor="npc-knowledge-source-label">
              <Input
                id="npc-knowledge-source-label"
                value={sourceLabel}
                onChange={(event) => setSourceLabel(event.target.value)}
                placeholder="Session 12 recap"
              />
            </Field>
          </div>
          {failure !== undefined && <SaveFailure failure={failure} />}
          <Button type="submit" disabled={busy}>
            <Icon name="plus" size={14} />
            Add fact
          </Button>
        </form>
        {retired.length > 0 && (
          <p className="text-caption leading-body text-muted-foreground">
            {retired.length} retired {retired.length === 1 ? "fact is" : "facts are"} kept for the
            audit trail and excluded from rehearsal.
          </p>
        )}
      </Card>
    </div>
  );
}

function KnowledgeRow({ npc, fact }: { readonly npc: Npc; readonly fact: NpcKnowledgeFact }) {
  const { busy, failure, submit } = useMutation();
  const retire = () =>
    submit(
      (client) =>
        client.npcs.retireKnowledge({
          params: { campaignId: npc.campaignId, npcId: npc.id, factId: fact.id },
          payload: {},
        }),
      [reads.npcKnowledge(npc.id), reads.npcRehearsal(npc.id)],
    );
  return (
    <div className="rounded-card border border-subtle bg-surface-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-s leading-body whitespace-pre-wrap text-foreground">
            {fact.body}
          </p>
          <p className="mt-2 text-caption leading-body text-muted-foreground">
            {fact.sourceKind}
            {fact.sourceLabel === "" ? "" : ` · ${fact.sourceLabel}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void retire()}>
          Retire
        </Button>
      </div>
      {failure !== undefined && <SaveFailure failure={failure} />}
    </div>
  );
}

function MemoryPanel({
  npc,
  memories,
}: {
  readonly npc: Npc;
  readonly memories: ReadonlyArray<NpcMemory>;
}) {
  const [body, setBody] = useState("");
  const [showProblem, setShowProblem] = useState(false);
  const { busy, failure, submit } = useMutation();
  const problem = body.trim() === "" ? "Write the memory first." : undefined;
  const approved = memories.filter(
    (memory) => memory.status === "approved" && memory.retiredAt === null,
  );
  const drafts = memories.filter(
    (memory) => memory.status === "draft" && memory.retiredAt === null,
  );
  const retired = memories.filter((memory) => memory.retiredAt !== null);

  const draft = async () => {
    setShowProblem(true);
    if (problem !== undefined) return;
    const saved = await submit(
      (client) =>
        client.npcs.draftMemory({
          params: { campaignId: npc.campaignId, npcId: npc.id },
          payload: { body: body.trim() },
        }),
      [reads.npcMemories(npc.id), reads.npcRehearsal(npc.id)],
    );
    if (Result.isSuccess(saved)) {
      setBody("");
      setShowProblem(false);
    }
  };

  const reset = () =>
    submit(
      (client) =>
        client.npcs.resetMemories({
          params: { campaignId: npc.campaignId, npcId: npc.id },
          payload: {},
        }),
      [reads.npcMemories(npc.id), reads.npcRehearsal(npc.id)],
    );

  return (
    <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
      <Card className="gap-4 p-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-title leading-title font-semibold text-heading">
              Approved memory
            </h2>
            <p className="text-body-s leading-body text-muted-foreground">
              Rehearsal sees only approved memories. Drafts are visible here until you approve or
              retire them.
            </p>
          </div>
          <Badge variant="outline">{approved.length} approved</Badge>
        </div>
        <MemoryList npc={npc} memories={approved} empty="No approved memories yet." />
        <DetailSection title="Drafts awaiting approval">
          <MemoryList npc={npc} memories={drafts} empty="No drafts waiting." />
        </DetailSection>
        {retired.length > 0 && (
          <p className="text-caption leading-body text-muted-foreground">
            {retired.length} retired {retired.length === 1 ? "memory is" : "memories are"} kept out
            of the prompt.
          </p>
        )}
      </Card>

      <Card tone="sunken" className="gap-4 p-card">
        <h3 className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
          Draft a memory
        </h3>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void draft();
          }}
        >
          <Field label="Memory" htmlFor="npc-memory-body" error={showProblem ? problem : undefined}>
            <Textarea
              id="npc-memory-body"
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
          {failure !== undefined && <SaveFailure failure={failure} />}
          <Button type="submit" disabled={busy}>
            <Icon name="plus" size={14} />
            Save draft
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || memories.length === 0}
            onClick={() => void reset()}
          >
            Retire all memories
          </Button>
        </form>
      </Card>
    </div>
  );
}

function MemoryList({
  npc,
  memories,
  empty,
}: {
  readonly npc: Npc;
  readonly memories: ReadonlyArray<NpcMemory>;
  readonly empty: string;
}) {
  if (memories.length === 0) {
    return <p className="text-body-s leading-body text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {memories.map((memory) => (
        <MemoryRow key={memory.id} npc={npc} memory={memory} />
      ))}
    </div>
  );
}

function memoryStatusLabel(status: NpcMemoryStatus): string {
  if (status === "approved") return "Approved";
  if (status === "retired") return "Retired";
  return "Draft";
}

function MemoryRow({ npc, memory }: { readonly npc: Npc; readonly memory: NpcMemory }) {
  const { busy, failure, submit } = useMutation();
  const params = { campaignId: npc.campaignId, npcId: npc.id, memoryId: memory.id };
  const invalidate = [reads.npcMemories(npc.id), reads.npcRehearsal(npc.id)];
  return (
    <div className="rounded-card border border-subtle bg-surface-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-s leading-body whitespace-pre-wrap text-foreground">
            {memory.body}
          </p>
          <p className="mt-2 text-caption leading-body text-muted-foreground">
            {memoryStatusLabel(memory.status)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {memory.status === "draft" && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void submit(
                  (client) => client.npcs.approveMemory({ params, payload: {} }),
                  invalidate,
                )
              }
            >
              Approve
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || memory.retiredAt !== null}
            onClick={() =>
              void submit((client) => client.npcs.retireMemory({ params, payload: {} }), invalidate)
            }
          >
            Retire
          </Button>
        </div>
      </div>
      {failure !== undefined && <SaveFailure failure={failure} />}
    </div>
  );
}

/** The persona, as the creator wrote it: the public half, then the private half, marked. */
function Persona({ npc }: { readonly npc: Npc }) {
  const identity = npc.persona.identity;
  const voice = npc.persona.voice;
  const intent = npc.persona.intent;
  const bounds = npc.persona.boundaries;
  const hasPrivate =
    (npc.privateMaterial.secrets ?? "") !== "" || (npc.privateMaterial.instructions ?? "") !== "";
  const written =
    identity !== undefined ||
    voice !== undefined ||
    intent !== undefined ||
    bounds !== undefined ||
    hasPrivate;

  if (!written) {
    return (
      <p className="text-body-s leading-body text-muted-foreground">
        No persona written yet. Press <span className="text-heading">Edit</span> to give them a
        voice — they will answer as a blank slate until you do.
      </p>
    );
  }

  return (
    <>
      {identity?.summary !== undefined && (
        <p className="text-body-s leading-body text-foreground">{identity.summary}</p>
      )}
      {(identity?.pronouns !== undefined || identity?.pronunciation !== undefined) && (
        <DetailFacts
          facts={[
            ...(identity.pronouns === undefined
              ? []
              : [{ label: "Pronouns", value: identity.pronouns }]),
            ...(identity.pronunciation === undefined
              ? []
              : [{ label: "Said", value: identity.pronunciation }]),
          ]}
        />
      )}
      {voice !== undefined && (
        <DetailSection title="Voice">
          {voice.manner !== undefined && <Prose>{voice.manner}</Prose>}
          <Lines label="Phrases" lines={voice.phrases} />
          <Lines label="Lines they have said" lines={voice.exampleLines} quoted />
        </DetailSection>
      )}
      {intent !== undefined && (
        <DetailSection title="Motives">
          <DetailFacts
            facts={[
              ...(intent.wants === undefined ? [] : [{ label: "Wants", value: intent.wants }]),
              ...(intent.fears === undefined ? [] : [{ label: "Fears", value: intent.fears }]),
              ...(intent.loyalties === undefined
                ? []
                : [{ label: "Loyal to", value: intent.loyalties }]),
              ...(intent.attitude === undefined
                ? []
                : [{ label: "Toward the party", value: intent.attitude }]),
            ]}
          />
        </DetailSection>
      )}
      {bounds !== undefined && (
        <DetailSection title="Boundaries">
          <Lines label="Dodges" lines={bounds.dodges} />
          <Lines label="Refuses" lines={bounds.refuses} />
          <Lines label="Says to ask the DM" lines={bounds.asksTheDm} />
        </DetailSection>
      )}
      {hasPrivate && (
        <DetailSection title="Private material">
          <p className="flex items-center gap-1.5 text-caption leading-body text-muted-foreground">
            <Icon name="lock" size={12} className="text-faint" />
            Only you see this. Your rehearsal uses it; a player channel never would.
          </p>
          {npc.privateMaterial.secrets !== undefined && (
            <Fact label="Secrets">{npc.privateMaterial.secrets}</Fact>
          )}
          {npc.privateMaterial.instructions !== undefined && (
            <Fact label="Instructions from you">{npc.privateMaterial.instructions}</Fact>
          )}
        </DetailSection>
      )}
    </>
  );
}

function Prose({ children }: { readonly children: string }) {
  return <p className="text-body-s leading-body whitespace-pre-wrap text-foreground">{children}</p>;
}

function Fact({ label, children }: { readonly label: string; readonly children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
        {label}
      </span>
      <Prose>{children}</Prose>
    </div>
  );
}

function Lines({
  label,
  lines,
  quoted = false,
}: {
  readonly label: string;
  readonly lines: ReadonlyArray<string> | undefined;
  readonly quoted?: boolean;
}) {
  if (lines === undefined || lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
        {label}
      </span>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {lines.map((line) => (
          <li
            key={line}
            className={
              quoted
                ? "font-serif text-body leading-body text-foreground italic"
                : "text-body-s leading-body text-foreground"
            }
          >
            {quoted ? `“${line}”` : line}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Prompt metadata, and nothing more. Small on purpose — the design's
 * "developer-ish diagnostics live in an inspector, not in the builder".
 */
function Inspector({
  npc,
  rehearsal,
}: {
  readonly npc: Npc;
  readonly rehearsal: ReturnType<typeof useNpcRehearsal>;
}) {
  const status = rehearsal.status;
  return (
    <Card tone="sunken" className="gap-3 p-card" aria-label="Prompt inspector">
      <h3 className="flex items-center gap-2 text-micro leading-snug font-medium tracking-caps text-faint uppercase">
        <Icon name="info" size={12} />
        Prompt inspector
      </h3>
      <DetailFacts
        facts={[
          {
            label: "Template",
            value: status === undefined ? "…" : status.templateVersion,
          },
          {
            label: "Persona size",
            value: status === undefined ? "…" : `about ${String(status.estimatedTokens)} tokens`,
          },
          {
            label: "Model",
            value: status === undefined ? "…" : (status.model ?? "none configured"),
          },
          {
            label: "Knowledge",
            value:
              status === undefined
                ? "…"
                : `${String(status.knowledgeIncluded)} of ${String(status.knowledgeTotal)} facts`,
          },
          {
            label: "Memory",
            value:
              status === undefined
                ? "…"
                : `${String(status.memoriesIncluded)} of ${String(status.memoriesTotal)} approved`,
          },
          ...(rehearsal.lastPrompt === undefined
            ? []
            : [
                {
                  label: "Last reply",
                  value: `about ${String(rehearsal.lastPrompt.estimatedTokens)} tokens sent, ${rehearsal.lastPrompt.templateVersion}`,
                },
              ]),
          { label: "Persona version", value: String(npc.version) },
        ]}
      />
      <p className="text-caption leading-body text-muted-foreground">
        The prompt itself is never shown or stored: it carries your private material.
      </p>
    </Card>
  );
}

/** Archive, or restore — the reversible soft delete, one press each way. */
function ArchiveButton({ npc }: { readonly npc: Npc }) {
  const { busy, failure, submit } = useMutation();
  const navigate = useNavigate();
  const archived = npc.archivedAt !== null;

  const press = async () => {
    const outcome = await submit(
      (client) =>
        archived
          ? client.npcs.restore({
              params: { campaignId: npc.campaignId, npcId: npc.id },
              payload: {},
            })
          : client.npcs.archive({
              params: { campaignId: npc.campaignId, npcId: npc.id },
              payload: {},
            }),
      [reads.npcs(npc.campaignId), reads.npc(npc.id)],
    );
    if (Result.isSuccess(outcome) && !archived) {
      void navigate({ to: "/campaigns/$campaignId/cast", params: { campaignId: npc.campaignId } });
    }
  };

  return (
    <span className="flex items-center gap-2">
      {failure !== undefined && <SaveFailure failure={failure} />}
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void press()}>
        <Icon name={archived ? "refresh-cw" : "eye-off"} size={14} />
        {archived ? "Restore" : "Archive"}
      </Button>
    </span>
  );
}
