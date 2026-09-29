import {
  Actor,
  CampaignId,
  CurrentActor,
  NpcMemory,
  type NpcMemoryCreate,
  NpcMemoryId,
  type NpcMemoryUpdate,
  NpcId,
  type NpcThreadId,
  type NpcTurnId,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import { playerNpcReadable } from "./Npcs.js";
import { NPC, NPC_THREADS } from "./NpcThreads.js";
import {
  type AssistantOrigin,
  assistantColumns,
  classFromColumns,
  defined,
  dieOnSqlError,
  orNotFound,
  setClause,
  timestampColumns,
} from "./rows.js";
import {
  containedChildWritable,
  ensureContainedRowWritable,
  under,
  type Containment,
} from "./visibility.js";

/**
 * NPC memory as creator-governed state.
 *
 * Drafts can be edited and approved; approved active rows are the only memory
 * prompt assembly reads; retiring/forgetting stamps the row so the provenance
 * and source pointers remain useful without keeping it in context.
 */

export const NPC_MEMORIES: Containment = under("npc_memory", "npc_id", NPC);

/** An `npc_memory` row as the wire reads it, decoded off `npc_memory.*` by `SqlSchema`. */
export const NpcMemoryRow = classFromColumns(NpcMemory, {
  ...NpcMemory.fields,
  ...timestampColumns,
  approvedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
  retiredAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
});

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

export class NpcMemories extends Context.Service<
  NpcMemories,
  {
    readonly list: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcMemory>, NotFound, never>;
    readonly approvedForPrompt: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcMemory>, NotFound, never>;
    readonly draft: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      payload: NpcMemoryCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<NpcMemory, NotFound, never>;
    readonly update: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      id: NpcMemoryId,
      patch: NpcMemoryUpdate,
    ) => Effect.Effect<NpcMemory, NotFound, never>;
    readonly approve: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      id: NpcMemoryId,
    ) => Effect.Effect<NpcMemory, NotFound, never>;
    readonly retire: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      id: NpcMemoryId,
    ) => Effect.Effect<NpcMemory, NotFound, never>;
    readonly reset: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcMemory>, NotFound, never>;
    /** Approved, explicitly shared memories for player prompts; source ids stay private. */
    readonly playerSafeForPrompt: (
      campaignId: CampaignId,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcMemory>, NotFound, CurrentActor>;
  }
>()("NpcMemories") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const ensureSource = (
        creator: CampaignCreatorActor,
        npcId: NpcId,
        sourceThreadId: NpcThreadId | null | undefined,
        sourceTurnId: NpcTurnId | null | undefined,
      ) =>
        Effect.gen(function* () {
          if (sourceThreadId !== undefined && sourceThreadId !== null) {
            const threads = yield* sql<{ readonly id: NpcThreadId }>`
              select npc_thread.id from npc_thread
              where npc_thread.id = ${sourceThreadId}
                and npc_thread.channel in ('rehearsal', 'session_shared')
                and npc_thread.account_id is null
                and ${containedChildWritable(sql, NPC_THREADS, npcId, creator.campaign, creator.actor)}
            `;
            if (threads.length === 0) {
              return yield* new NotFound({ resource: "npc_thread", id: sourceThreadId });
            }
          }
          if (sourceTurnId !== undefined && sourceTurnId !== null) {
            const turns = yield* sql<{ readonly id: NpcTurnId }>`
              select npc_turn.id from npc_turn
              join npc_thread on npc_thread.id = npc_turn.thread_id
              where npc_turn.id = ${sourceTurnId}
                and npc_thread.channel in ('rehearsal', 'session_shared')
                and npc_thread.account_id is null
                and ${containedChildWritable(sql, NPC_THREADS, npcId, creator.campaign, creator.actor)}
            `;
            if (turns.length === 0) {
              return yield* new NotFound({ resource: "npc_turn", id: sourceTurnId });
            }
          }
        });

      const CreatorNpc = Schema.toType(Schema.Struct({ ...creatorFields, npcId: NpcId }));
      const CreatorMemory = Schema.toType(
        Schema.Struct({ ...creatorFields, npcId: NpcId, id: NpcMemoryId }),
      );
      const reachable = (campaign: CampaignId, actor: Actor, npcId: NpcId) =>
        containedChildWritable(sql, NPC_MEMORIES, npcId, campaign, actor);

      const all = SqlSchema.findAll({
        Request: CreatorNpc,
        Result: NpcMemoryRow,
        execute: ({ campaign, actor, npcId }) => sql`
          select npc_memory.* from npc_memory
          where ${reachable(campaign, actor, npcId)}
          order by npc_memory.created_at asc, npc_memory.id asc
        `,
      });
      const approved = SqlSchema.findAll({
        Request: CreatorNpc,
        Result: NpcMemoryRow,
        execute: ({ campaign, actor, npcId }) => sql`
          select npc_memory.* from npc_memory
          where ${reachable(campaign, actor, npcId)}
            and npc_memory.status = 'approved'
            and npc_memory.retired_at is null
          order by npc_memory.approved_at asc, npc_memory.id asc
        `,
      });
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: NpcMemoryRow,
        execute: (columns) => sql`insert into npc_memory ${sql.insert(columns)} returning *`,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, npcId: NpcId, id: NpcMemoryId, columns: Columns }),
        ),
        Result: NpcMemoryRow,
        execute: ({ campaign, actor, npcId, id, columns }) => sql`
          update npc_memory set ${setClause(sql, columns)}
          where npc_memory.id = ${id}
            and npc_memory.status <> 'retired'
            and ${reachable(campaign, actor, npcId)}
          returning *
        `,
      });
      const approve = SqlSchema.findOne({
        Request: CreatorMemory,
        Result: NpcMemoryRow,
        execute: ({ campaign, actor, npcId, id }) => sql`
          update npc_memory
          set status = 'approved', approved_at = coalesce(npc_memory.approved_at, now()), retired_at = null, updated_at = now()
          where npc_memory.id = ${id}
            and npc_memory.status <> 'retired'
            and ${reachable(campaign, actor, npcId)}
          returning *
        `,
      });
      const retire = SqlSchema.findOne({
        Request: CreatorMemory,
        Result: NpcMemoryRow,
        execute: ({ campaign, actor, npcId, id }) => sql`
          update npc_memory
          set status = 'retired', retired_at = coalesce(npc_memory.retired_at, now()), updated_at = now()
          where npc_memory.id = ${id} and ${reachable(campaign, actor, npcId)}
          returning *
        `,
      });
      const retireAll = SqlSchema.findAll({
        Request: CreatorNpc,
        Result: NpcMemoryRow,
        execute: ({ campaign, actor, npcId }) => sql`
          update npc_memory
          set status = 'retired', retired_at = coalesce(npc_memory.retired_at, now()), updated_at = now()
          where ${reachable(campaign, actor, npcId)} and npc_memory.status <> 'retired'
          returning *
        `,
      });
      /** A player's prompt's memories: approved, shared, of an NPC they may read, and no source pointers. */
      const playerSafe = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({ campaignId: CampaignId, npcId: NpcId, actor: Actor }),
        ),
        Result: NpcMemoryRow,
        execute: ({ campaignId, npcId, actor }) => sql`
          select npc_memory.id,
                 npc_memory.npc_id,
                 npc_memory.body,
                 npc_memory.status,
                 null::uuid as source_thread_id,
                 null::uuid as source_turn_id,
                 npc_memory.source_kind,
                 null::uuid as source_id,
                 npc_memory.source_label,
                 npc_memory.approved_at,
                 npc_memory.retired_at,
                 npc_memory.visibility,
                 npc_memory.origin,
                 npc_memory.assistant_turn_id,
                 npc_memory.created_at,
                 npc_memory.updated_at
          from npc_memory
          where npc_memory.npc_id = ${npcId}
            and npc_memory.status = 'approved'
            and npc_memory.retired_at is null
            and npc_memory.visibility = 'shared'
            and exists (select 1 from npc where npc.id = npc_memory.npc_id and ${playerNpcReadable(sql, campaignId, actor)})
          order by npc_memory.approved_at asc, npc_memory.id asc
        `,
      });

      return {
        list: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              return yield* all({ ...asked(creator), npcId });
            }),
          ),

        approvedForPrompt: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              return yield* approved({ ...asked(creator), npcId });
            }),
          ),

        draft: (creator, npcId, payload, from) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              yield* ensureSource(creator, npcId, payload.sourceThreadId, payload.sourceTurnId);
              // An insert answers with its row; not getting one is a defect.
              return yield* insert(
                defined({
                  npc_id: npcId,
                  body: payload.body,
                  source_thread_id: payload.sourceThreadId,
                  source_turn_id: payload.sourceTurnId,
                  source_kind: payload.sourceKind,
                  source_id: payload.sourceId,
                  source_label: payload.sourceLabel,
                  visibility: payload.visibility,
                  ...assistantColumns(from),
                }),
              ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
            }),
          ),

        update: (creator, npcId, id, patch) =>
          dieOnSqlError(
            change({
              ...asked(creator),
              npcId,
              id,
              columns: defined({
                body: patch.body,
                source_kind: patch.sourceKind,
                source_id: patch.sourceId,
                source_label: patch.sourceLabel,
                visibility: patch.visibility,
              }),
            }).pipe(orNotFound("npc_memory", id)),
          ),

        approve: (creator, npcId, id) =>
          dieOnSqlError(
            approve({ ...asked(creator), npcId, id }).pipe(orNotFound("npc_memory", id)),
          ),

        retire: (creator, npcId, id) =>
          dieOnSqlError(
            retire({ ...asked(creator), npcId, id }).pipe(orNotFound("npc_memory", id)),
          ),

        reset: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              return yield* retireAll({ ...asked(creator), npcId });
            }),
          ),

        playerSafeForPrompt: (campaignId, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* playerSafe({ campaignId, npcId, actor });
              if (rows.length === 0) {
                const npcs = yield* sql<{ readonly id: NpcId }>`
                  select npc.id from npc where npc.id = ${npcId} and ${playerNpcReadable(sql, campaignId, actor)}
                `;
                if (npcs.length === 0) return yield* new NotFound({ resource: "npc", id: npcId });
              }
              return rows;
            }),
          ),
      };
    }),
  );
}
