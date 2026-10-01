import {
  NpcAwarenessCandidate,
  NpcChannel,
  NpcFollowUp,
  NpcFollowUpAwarenessCandidate,
  NpcFollowUpNpc,
  NpcFollowUpProposal,
  NpcProposal,
  SessionId,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import { npcAwarenessCandidateFields } from "./NpcAwareness.js";
import { npcImageColumns, npcImageFromId, type NpcImageSigner, npcImageSigner } from "./Npcs.js";
import { npcProposalFields } from "./NpcProposals.js";
import { dieOnSqlError, fromColumns } from "./rows.js";
import { rowWritable } from "./visibility.js";

/**
 * The NPC beside a queued item, as the creator's `rowWritable` returned it:
 * its name, role and shelf, and its portrait off {@link npcImageColumns}.
 */
const npcFields = (sign: NpcImageSigner | undefined) => ({
  npcName: NpcFollowUpNpc.fields.name,
  npcRole: NpcFollowUpNpc.fields.role,
  npcArchivedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  npcImage: npcImageFromId(sign),
});

/** A pending proposal, its NPC, and the thread it was proposed in. */
const followUpProposalRow = (sign: NpcImageSigner | undefined) =>
  fromColumns(
    Schema.Struct({
      ...npcProposalFields,
      ...npcFields(sign),
      channel: NpcChannel,
      sessionId: Schema.NullOr(SessionId),
      sessionNumber: Schema.NullOr(Schema.Int),
    }),
    { npcImage: "image_id" },
  );
type FollowUpProposalRow = ReturnType<typeof followUpProposalRow>["Type"];

/** A pending awareness candidate and its NPC. */
const followUpCandidateRow = (sign: NpcImageSigner | undefined) =>
  fromColumns(Schema.Struct({ ...npcAwarenessCandidateFields, ...npcFields(sign) }), {
    npcImage: "image_id",
  });
type FollowUpCandidateRow = ReturnType<typeof followUpCandidateRow>["Type"];

type NpcColumns = "npcName" | "npcRole" | "npcArchivedAt" | "npcImage";

const npcSummary = (
  id: NpcFollowUpNpc["id"],
  row: Pick<FollowUpProposalRow, NpcColumns>,
): NpcFollowUpNpc =>
  new NpcFollowUpNpc(
    {
      id,
      name: row.npcName,
      role: row.npcRole,
      archivedAt: row.npcArchivedAt,
      image: row.npcImage,
    },
    { disableChecks: true },
  );

const sourceLabel = (channel: NpcChannel, sessionNumber: number | null): string => {
  if (channel === "session_shared") {
    return sessionNumber === null
      ? "Shared table conversation"
      : `Shared table conversation · Session ${String(sessionNumber)}`;
  }
  if (channel === "rehearsal") return "Creator rehearsal";
  return "Private player chat";
};

/** A decoded proposal row as its queue item: the NPC, the proposal, and where it came from. */
const proposalItem = ({
  npcName,
  npcRole,
  npcArchivedAt,
  npcImage,
  channel,
  sessionId,
  sessionNumber,
  ...proposal
}: FollowUpProposalRow): NpcFollowUpProposal =>
  new NpcFollowUpProposal({
    itemKind: "proposal",
    npc: npcSummary(proposal.npcId, { npcName, npcRole, npcArchivedAt, npcImage }),
    proposal: new NpcProposal(proposal, { disableChecks: true }),
    source: { channel, sessionId, sessionNumber, label: sourceLabel(channel, sessionNumber) },
  });

/** A decoded candidate row as its queue item: the NPC and the candidate. */
const candidateItem = ({
  npcName,
  npcRole,
  npcArchivedAt,
  npcImage,
  ...candidate
}: FollowUpCandidateRow): NpcFollowUpAwarenessCandidate =>
  new NpcFollowUpAwarenessCandidate({
    itemKind: "awareness",
    npc: npcSummary(candidate.npcId, { npcName, npcRole, npcArchivedAt, npcImage }),
    candidate: new NpcAwarenessCandidate(candidate, { disableChecks: true }),
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
      const sign = yield* npcImageSigner;
      const CreatorRequest = Schema.toType(Schema.Struct(creatorFields));

      const pendingProposals = SqlSchema.findAll({
        Request: CreatorRequest,
        Result: followUpProposalRow(sign),
        execute: ({ campaign, actor }) => sql`
          select npc_proposal.*,
                 npc.name as npc_name,
                 npc.role as npc_role,
                 npc.archived_at as npc_archived_at,
                 ${npcImageColumns(sql)},
                 npc_thread.channel,
                 npc_thread.session_id,
                 session.number as session_number
          from npc_proposal
          join npc on npc.id = npc_proposal.npc_id
          join npc_thread on npc_thread.id = npc_proposal.thread_id
          left join session on session.id = npc_thread.session_id
          where npc_proposal.campaign_id = ${campaign}
            and npc_proposal.state = 'pending'
            and ${rowWritable(sql, "npc", campaign, actor)}
          order by npc_proposal.created_at desc, npc_proposal.id desc
        `,
      });
      const pendingCandidates = SqlSchema.findAll({
        Request: CreatorRequest,
        Result: followUpCandidateRow(sign),
        execute: ({ campaign, actor }) => sql`
          select npc_awareness_candidate.*,
                 npc.campaign_id,
                 npc.name as npc_name,
                 npc.role as npc_role,
                 npc.archived_at as npc_archived_at,
                 ${npcImageColumns(sql)}
          from npc_awareness_candidate
          join npc on npc.id = npc_awareness_candidate.npc_id
          where npc.campaign_id = ${campaign}
            and npc_awareness_candidate.state = 'pending'
            and ${rowWritable(sql, "npc", campaign, actor)}
          order by npc_awareness_candidate.created_at desc, npc_awareness_candidate.id desc
        `,
      });

      return {
        pending: (creator) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const proposalRows = yield* pendingProposals(asked(creator));
              const candidateRows = yield* pendingCandidates(asked(creator));
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
