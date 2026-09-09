import {
  NpcFollowUp,
  NpcFollowUpAwarenessCandidate,
  NpcFollowUpNpc,
  NpcFollowUpProposal,
  type AccountId,
  type BeatId,
  type CampaignId,
  type NoteId,
  type NpcAwarenessCandidateId,
  type NpcAwarenessCandidateKind,
  type NpcAwarenessCandidateState,
  type NpcChannel,
  type NpcId,
  type NpcKnowledgeFactId,
  type NpcKnowledgeSourceKind,
  type NpcMemoryId,
  type NpcProposalContent,
  type NpcProposalId,
  type NpcProposalKind,
  type NpcProposalState,
  type NpcThreadId,
  type NpcTurnId,
  type SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { toNpcAwarenessCandidate } from "./NpcAwareness.js";
import { toNpcProposal } from "./NpcProposals.js";
import { dieOnSqlError, type ProvenanceColumns } from "./rows.js";
import { rowWritable } from "./visibility.js";

interface NpcSummaryRow {
  readonly npc_id: NpcId;
  readonly npc_name: string;
  readonly npc_role: string;
  readonly npc_archived_at: Date | null;
}

interface FollowUpProposalRow extends ProvenanceColumns, NpcSummaryRow {
  readonly id: NpcProposalId;
  readonly campaign_id: CampaignId;
  readonly npc_id: NpcId;
  readonly thread_id: NpcThreadId;
  readonly npc_turn_id: NpcTurnId;
  readonly proposed_by_account_id: AccountId | null;
  readonly kind: NpcProposalKind;
  readonly content: NpcProposalContent;
  readonly state: NpcProposalState;
  readonly decided_by_account_id: AccountId | null;
  readonly decided_at: Date | null;
  readonly rejection_reason: string | null;
  readonly accepted_memory_id: NpcMemoryId | null;
  readonly accepted_note_id: NoteId | null;
  readonly accepted_beat_id: BeatId | null;
  readonly channel: NpcChannel;
  readonly session_id: SessionId | null;
  readonly session_number: number | null;
}

interface FollowUpCandidateRow extends ProvenanceColumns, NpcSummaryRow {
  readonly id: NpcAwarenessCandidateId;
  readonly campaign_id: CampaignId;
  readonly npc_id: NpcId;
  readonly kind: NpcAwarenessCandidateKind;
  readonly body: string;
  readonly source_kind: NpcKnowledgeSourceKind;
  readonly source_id: string | null;
  readonly source_label: string;
  readonly source_excerpt: string;
  readonly rationale: string;
  readonly version: number;
  readonly state: NpcAwarenessCandidateState;
  readonly decided_by_account_id: AccountId | null;
  readonly decided_at: Date | null;
  readonly rejection_reason: string | null;
  readonly accepted_knowledge_fact_id: NpcKnowledgeFactId | null;
  readonly accepted_memory_id: NpcMemoryId | null;
}

const npcSummary = (row: NpcSummaryRow): NpcFollowUpNpc =>
  new NpcFollowUpNpc({
    id: row.npc_id,
    name: row.npc_name,
    role: row.npc_role,
    archivedAt: row.npc_archived_at === null ? null : DateTime.fromDateUnsafe(row.npc_archived_at),
  });

const sourceLabel = (row: FollowUpProposalRow): string => {
  if (row.channel === "session_shared") {
    return row.session_number === null
      ? "Shared table conversation"
      : `Shared table conversation · Session ${String(row.session_number)}`;
  }
  if (row.channel === "rehearsal") return "Creator rehearsal";
  return "Private player chat";
};

const proposalItem = (row: FollowUpProposalRow): NpcFollowUpProposal =>
  new NpcFollowUpProposal({
    itemKind: "proposal",
    npc: npcSummary(row),
    proposal: toNpcProposal(row),
    source: {
      channel: row.channel,
      sessionId: row.session_id,
      sessionNumber: row.session_number,
      label: sourceLabel(row),
    },
  });

const candidateItem = (row: FollowUpCandidateRow): NpcFollowUpAwarenessCandidate =>
  new NpcFollowUpAwarenessCandidate({
    itemKind: "awareness",
    npc: npcSummary(row),
    candidate: toNpcAwarenessCandidate(row),
  });

/**
 * Campaign-wide NPC follow-up.
 *
 * A narrow read over the two durable review queues the product already has:
 * NPC conversation proposals and Hob awareness candidates. It creates no review
 * lifecycle of its own, selects no NPC transcripts, and includes only the
 * thread channel/session needed to route a creator to the authoritative Cast
 * tabs.
 */
export class NpcFollowUps extends Context.Service<
  NpcFollowUps,
  {
    readonly pending: (creator: CampaignCreatorActor) => Effect.Effect<NpcFollowUp, never, never>;
  }
>()("NpcFollowUps") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        pending: (creator) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const proposalRows = yield* sql<FollowUpProposalRow>`
                select npc_proposal.*,
                       npc.name as npc_name,
                       npc.role as npc_role,
                       npc.archived_at as npc_archived_at,
                       npc_thread.channel,
                       npc_thread.session_id,
                       session.number as session_number
                from npc_proposal
                join npc on npc.id = npc_proposal.npc_id
                join npc_thread on npc_thread.id = npc_proposal.thread_id
                left join session on session.id = npc_thread.session_id
                where npc_proposal.campaign_id = ${creator.campaign}
                  and npc_proposal.state = 'pending'
                  and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
                order by npc_proposal.created_at desc, npc_proposal.id desc
              `;
              const candidateRows = yield* sql<FollowUpCandidateRow>`
                select npc_awareness_candidate.*,
                       npc.campaign_id,
                       npc.name as npc_name,
                       npc.role as npc_role,
                       npc.archived_at as npc_archived_at
                from npc_awareness_candidate
                join npc on npc.id = npc_awareness_candidate.npc_id
                where npc.campaign_id = ${creator.campaign}
                  and npc_awareness_candidate.state = 'pending'
                  and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
                order by npc_awareness_candidate.created_at desc, npc_awareness_candidate.id desc
              `;
              const items = [
                ...proposalRows.map(proposalItem),
                ...candidateRows.map(candidateItem),
              ].sort((a, b) => {
                const aTime =
                  a.itemKind === "proposal" ? a.proposal.createdAt : a.candidate.createdAt;
                const bTime =
                  b.itemKind === "proposal" ? b.proposal.createdAt : b.candidate.createdAt;
                return DateTime.toEpochMillis(bTime) - DateTime.toEpochMillis(aTime);
              });
              return new NpcFollowUp({
                campaignId: creator.campaign,
                proposalCount: proposalRows.length,
                awarenessCount: candidateRows.length,
                items,
              });
            }),
          ),
      };
    }),
  );
}
