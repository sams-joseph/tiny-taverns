import {
  type AccountId,
  type Actor,
  type BeatId,
  type CampaignId,
  Conflict,
  CurrentActor,
  type NoteId,
  NpcProposal,
  type NpcProposalContent,
  type NpcProposalId,
  type NpcProposalKind,
  type NpcProposalReject,
  type NpcProposalState,
  type NpcId,
  type NpcMemoryId,
  type NpcThreadId,
  type NpcTurnId,
  NotFound,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { Campaigns } from "./Campaigns.js";
import { Notes } from "./Notes.js";
import { Beats } from "./Beats.js";
import { NpcMemories } from "./NpcMemories.js";
import { NPC } from "./NpcThreads.js";
import { dieOnSqlError, type ProvenanceColumns, provenanceOf } from "./rows.js";
import {
  campaignWritableById,
  containedChildWritable,
  ensureContainedRowWritable,
  rowReadable,
} from "./visibility.js";

interface ProposalRow extends ProvenanceColumns {
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
  readonly npc_archived_at?: Date | null;
}

export const toNpcProposal = (row: ProposalRow): NpcProposal =>
  new NpcProposal({
    id: row.id,
    campaignId: row.campaign_id,
    npcId: row.npc_id,
    threadId: row.thread_id,
    npcTurnId: row.npc_turn_id,
    proposedByAccountId: row.proposed_by_account_id,
    kind: row.kind,
    content: row.content,
    state: row.state,
    decidedByAccountId: row.decided_by_account_id,
    decidedAt: row.decided_at === null ? null : DateTime.fromDateUnsafe(row.decided_at),
    rejectionReason: row.rejection_reason,
    acceptedMemoryId: row.accepted_memory_id,
    acceptedNoteId: row.accepted_note_id,
    acceptedBeatId: row.accepted_beat_id,
    ...provenanceOf(row),
  });

const alreadyAccepted = new Conflict({ message: "that NPC proposal has already been accepted" });
const alreadyRejected = new Conflict({ message: "that NPC proposal has already been rejected" });
const archivedNpc = new Conflict({
  message: "that NPC is archived; restore them before accepting their pending proposal",
});
const noSession = new Conflict({
  message: "there is no session in progress to file a beat against — start one first",
});

export class NpcProposals extends Context.Service<
  NpcProposals,
  {
    readonly record: (
      campaignId: CampaignId,
      npcId: NpcId,
      threadId: NpcThreadId,
      npcTurnId: NpcTurnId,
      content: NpcProposalContent,
    ) => Effect.Effect<NpcProposal, NotFound, CurrentActor>;
    readonly list: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcProposal>, NotFound, never>;
    readonly accept: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      id: NpcProposalId,
    ) => Effect.Effect<NpcProposal, NotFound | Conflict, CurrentActor>;
    readonly reject: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      id: NpcProposalId,
      payload: NpcProposalReject,
    ) => Effect.Effect<NpcProposal, NotFound | Conflict, never>;
  }
>()("NpcProposals") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const campaigns = yield* Campaigns;
      const notes = yield* Notes;
      const beats = yield* Beats;
      const memories = yield* NpcMemories;

      const activeSeat = (campaignId: CampaignId, actor: Actor) => sql`
        exists (select 1 from campaign_character
                where campaign_character.campaign_id = ${campaignId}
                  and campaign_character.account_id = ${actor.accountId}
                  and campaign_character.left_at is null
                  and campaign_character.character_id is not null)
      `;

      const threadMayPropose = (
        campaignId: CampaignId,
        npcId: NpcId,
        threadId: NpcThreadId,
        actor: Actor,
      ) =>
        sql.and([
          sql`npc_thread.id = ${threadId}`,
          sql`npc_thread.npc_id = ${npcId}`,
          sql`npc_thread.channel <> 'player_direct'`,
          sql`exists (select 1 from npc where npc.id = npc_thread.npc_id and npc.campaign_id = ${campaignId} and npc.archived_at is null)`,
          sql.or([
            sql.and([
              sql`npc_thread.channel = 'rehearsal'`,
              sql`npc_thread.account_id is null`,
              sql`npc_thread.session_id is null`,
              campaignWritableById(sql, campaignId, actor),
            ]),
            sql.and([
              sql`npc_thread.channel = 'session_shared'`,
              sql`npc_thread.session_id is not null`,
              sql`exists (select 1 from session
                         join campaign on campaign.current_session_id = session.id
                         where session.id = npc_thread.session_id
                           and session.campaign_id = ${campaignId}
                           and ${rowReadable(sql, "session", campaignId, actor)})`,
              sql.or([campaignWritableById(sql, campaignId, actor), activeSeat(campaignId, actor)]),
              sql`npc_thread.visibility = 'shared'`,
            ]),
          ]),
        ]);

      const proposalOne = (creator: CampaignCreatorActor, npcId: NpcId, id: NpcProposalId) =>
        Effect.gen(function* () {
          const rows = yield* sql<ProposalRow>`
            select npc_proposal.*, npc.archived_at as npc_archived_at
            from npc_proposal
            join npc on npc.id = npc_proposal.npc_id
            where npc_proposal.id = ${id}
              and npc_proposal.npc_id = ${npcId}
              and npc_proposal.campaign_id = ${creator.campaign}
              and ${containedChildWritable(sql, NPC, npcId, creator.campaign, creator.actor)}
            for update of npc_proposal
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "npc_proposal", id });
          return rows[0]!;
        });

      const materialise = (creator: CampaignCreatorActor, row: ProposalRow) => {
        switch (row.content.kind) {
          case "memory":
            return Effect.map(
              memories.draft(creator, row.npc_id, {
                body: row.content.body,
                sourceThreadId: row.thread_id,
                sourceTurnId: row.npc_turn_id,
              }),
              (memory) => ({ accepted_memory_id: memory.id }),
            );
          case "note":
            return Effect.map(
              notes
                .create(row.campaign_id, {
                  title: row.content.title,
                  body: row.content.body,
                  kind: row.content.noteKind,
                })
                .pipe(Effect.provideService(CurrentActor, creator.actor)),
              (note) => ({ accepted_note_id: note.id }),
            );
          case "beat":
            return Effect.gen(function* () {
              const campaign = yield* campaigns
                .findById(row.campaign_id)
                .pipe(Effect.provideService(CurrentActor, creator.actor));
              if (campaign.currentSessionId === null) return yield* noSession;
              const beat = yield* beats
                .create(row.campaign_id, campaign.currentSessionId, { body: row.content.body })
                .pipe(Effect.provideService(CurrentActor, creator.actor));
              return { accepted_beat_id: beat.id };
            });
        }
      };

      return {
        record: (campaignId, npcId, threadId, npcTurnId, content) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const threadRows = yield* sql<{ readonly id: NpcThreadId }>`
                select npc_thread.id from npc_thread
                where ${threadMayPropose(campaignId, npcId, threadId, actor)}
              `;
              if (threadRows.length === 0)
                return yield* new NotFound({ resource: "npc_thread", id: threadId });
              const rows = yield* sql<ProposalRow>`
                insert into npc_proposal ${sql.insert({
                  campaign_id: campaignId,
                  npc_id: npcId,
                  thread_id: threadId,
                  npc_turn_id: npcTurnId,
                  proposed_by_account_id: actor.accountId,
                  kind: content.kind,
                  content: JSON.stringify(content),
                  origin: "assistant",
                })}
                on conflict (npc_turn_id) do update
                set updated_at = npc_proposal.updated_at
                returning *
              `;
              return toNpcProposal(rows[0]!);
            }),
          ),

        list: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              const rows = yield* sql<ProposalRow>`
                select npc_proposal.* from npc_proposal
                where npc_proposal.npc_id = ${npcId}
                  and npc_proposal.campaign_id = ${creator.campaign}
                order by npc_proposal.created_at desc, npc_proposal.id desc
              `;
              return rows.map(toNpcProposal);
            }),
          ),

        accept: (creator, npcId, id) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const row = yield* proposalOne(creator, npcId, id);
                if (row.npc_archived_at !== null) return yield* archivedNpc;
                if (row.state === "accepted") return yield* alreadyAccepted;
                if (row.state === "rejected") return yield* alreadyRejected;
                const destination = yield* materialise(creator, row);
                const updated = yield* sql<ProposalRow>`
                  update npc_proposal
                  set state = 'accepted',
                      decided_by_account_id = ${creator.actor.accountId},
                      decided_at = now(),
                      ${sql.update(destination)},
                      updated_at = now()
                  where npc_proposal.id = ${id}
                  returning *
                `;
                return toNpcProposal(updated[0]!);
              }),
            ),
          ),

        reject: (creator, npcId, id, payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const row = yield* proposalOne(creator, npcId, id);
                if (row.state === "accepted") return yield* alreadyAccepted;
                if (row.state === "rejected") return yield* alreadyRejected;
                const reason = payload.reason?.trim() || "Rejected by the campaign creator.";
                const updated = yield* sql<ProposalRow>`
                  update npc_proposal
                  set state = 'rejected',
                      decided_by_account_id = ${creator.actor.accountId},
                      decided_at = now(),
                      rejection_reason = ${reason},
                      updated_at = now()
                  where npc_proposal.id = ${id}
                  returning *
                `;
                return toNpcProposal(updated[0]!);
              }),
            ),
          ),
      };
    }),
  );
}
