import {
  type Actor,
  CampaignId,
  Conflict,
  CurrentActor,
  NpcProposal,
  type NpcProposalContent,
  NpcProposalId,
  type NpcProposalReject,
  NpcId,
  type NpcThreadId,
  type NpcTurnId,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import { Campaigns } from "./Campaigns.js";
import { Notes } from "./Notes.js";
import { Beats } from "./Beats.js";
import { NpcMemories } from "./NpcMemories.js";
import { NPC } from "./NpcThreads.js";
import {
  classFromColumns,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  timestampColumns,
} from "./rows.js";
import {
  campaignWritableById,
  containedChildWritable,
  ensureContainedRowWritable,
  rowReadable,
} from "./visibility.js";

/**
 * The fields of an `npc_proposal` row as the wire reads it, off
 * `npc_proposal.*`: the stored `content` document decodes through the wire's
 * union, so a row whose document is not one of its three kinds is a defect.
 * Exported for the follow-up queue, which reads the same row beside its NPC.
 */
export const npcProposalFields = {
  ...NpcProposal.fields,
  ...timestampColumns,
  decidedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
};

/** An `npc_proposal` row as the wire reads it, decoded by `SqlSchema`. */
const NpcProposalRow = classFromColumns(NpcProposal, npcProposalFields);

/** A proposal locked for review, with whether its NPC is archived beside it. */
const LockedProposalRow = fromColumns(
  Schema.Struct({
    ...npcProposalFields,
    npcArchivedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  }),
);
type LockedProposalRow = typeof LockedProposalRow.Type;

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

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

      const locked = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, npcId: NpcId, id: NpcProposalId }),
        ),
        Result: LockedProposalRow,
        execute: ({ campaign, actor, npcId, id }) => sql`
          select npc_proposal.*, npc.archived_at as npc_archived_at
          from npc_proposal
          join npc on npc.id = npc_proposal.npc_id
          where npc_proposal.id = ${id}
            and npc_proposal.npc_id = ${npcId}
            and npc_proposal.campaign_id = ${campaign}
            and ${containedChildWritable(sql, NPC, npcId, campaign, actor)}
          for update of npc_proposal
        `,
      });
      const proposalOne = (creator: CampaignCreatorActor, npcId: NpcId, id: NpcProposalId) =>
        locked({ ...asked(creator), npcId, id }).pipe(orNotFound("npc_proposal", id));
      /** A turn's proposal, recorded once: a retried turn answers the row it already wrote. */
      const upsert = SqlSchema.findOne({
        Request: Columns,
        Result: NpcProposalRow,
        execute: (columns) => sql`
          insert into npc_proposal ${sql.insert(columns)}
          on conflict (npc_turn_id) do update
          set updated_at = npc_proposal.updated_at
          returning *
        `,
      });
      const proposals = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ campaign: CampaignId, npcId: NpcId })),
        Result: NpcProposalRow,
        execute: ({ campaign, npcId }) => sql`
          select npc_proposal.* from npc_proposal
          where npc_proposal.npc_id = ${npcId}
            and npc_proposal.campaign_id = ${campaign}
          order by npc_proposal.created_at desc, npc_proposal.id desc
        `,
      });
      /** The acceptance, on a proposal `proposalOne` has just locked, pointing at what it became. */
      const accepted = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, id: NpcProposalId, destination: Columns }),
        ),
        Result: NpcProposalRow,
        execute: ({ actor, id, destination }) => sql`
          update npc_proposal
          set state = 'accepted',
              decided_by_account_id = ${actor.accountId},
              decided_at = now(),
              ${sql.update(destination)},
              updated_at = now()
          where npc_proposal.id = ${id}
          returning *
        `,
      });
      /** The rejection, on a proposal `proposalOne` has just locked. */
      const rejected = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, id: NpcProposalId, reason: Schema.String }),
        ),
        Result: NpcProposalRow,
        execute: ({ actor, id, reason }) => sql`
          update npc_proposal
          set state = 'rejected',
              decided_by_account_id = ${actor.accountId},
              decided_at = now(),
              rejection_reason = ${reason},
              updated_at = now()
          where npc_proposal.id = ${id}
          returning *
        `,
      });

      const materialise = (creator: CampaignCreatorActor, row: LockedProposalRow) => {
        switch (row.content.kind) {
          case "memory":
            return Effect.map(
              memories.draft(creator, row.npcId, {
                body: row.content.body,
                sourceThreadId: row.threadId,
                sourceTurnId: row.npcTurnId,
              }),
              (memory) => ({ accepted_memory_id: memory.id }),
            );
          case "note":
            return Effect.map(
              notes
                .create(row.campaignId, {
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
                .findById(row.campaignId)
                .pipe(Effect.provideService(CurrentActor, creator.actor));
              if (campaign.currentSessionId === null) return yield* noSession;
              const beat = yield* beats
                .create(row.campaignId, campaign.currentSessionId, { body: row.content.body })
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
              // An upsert answers with its row; not getting one is a defect.
              return yield* upsert({
                campaign_id: campaignId,
                npc_id: npcId,
                thread_id: threadId,
                npc_turn_id: npcTurnId,
                proposed_by_account_id: actor.accountId,
                kind: content.kind,
                content: JSON.stringify(content),
                origin: "assistant",
              }).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
            }),
          ),

        list: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              return yield* proposals({ campaign: creator.campaign, npcId });
            }),
          ),

        accept: (creator, npcId, id) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const row = yield* proposalOne(creator, npcId, id);
                if (row.npcArchivedAt !== null) return yield* archivedNpc;
                if (row.state === "accepted") return yield* alreadyAccepted;
                if (row.state === "rejected") return yield* alreadyRejected;
                const destination = yield* materialise(creator, row);
                // The row is locked and in reach; not getting it back is a defect.
                return yield* accepted({ ...asked(creator), id, destination }).pipe(
                  Effect.catchTag("NoSuchElementError", Effect.die),
                );
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
                // The row is locked and in reach; not getting it back is a defect.
                return yield* rejected({ ...asked(creator), id, reason }).pipe(
                  Effect.catchTag("NoSuchElementError", Effect.die),
                );
              }),
            ),
          ),
      };
    }),
  );
}
