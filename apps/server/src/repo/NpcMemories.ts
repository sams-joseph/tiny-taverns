import {
  type CampaignId,
  CurrentActor,
  NpcMemory,
  type NpcMemoryCreate,
  type NpcMemoryId,
  type NpcMemoryStatus,
  type NpcMemoryUpdate,
  type NpcId,
  type NpcThreadId,
  type NpcTurnId,
  NotFound,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { playerNpcReadable } from "./Npcs.js";
import { NPC, NPC_THREADS } from "./NpcThreads.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
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

interface MemoryRow extends ProvenanceColumns {
  readonly id: NpcMemoryId;
  readonly npc_id: NpcId;
  readonly body: string;
  readonly status: NpcMemoryStatus;
  readonly source_thread_id: NpcThreadId | null;
  readonly source_turn_id: NpcTurnId | null;
  readonly approved_at: Date | null;
  readonly retired_at: Date | null;
}

export const toNpcMemory = (row: MemoryRow): NpcMemory =>
  new NpcMemory({
    id: row.id,
    npcId: row.npc_id,
    body: row.body,
    status: row.status,
    sourceThreadId: row.source_thread_id,
    sourceTurnId: row.source_turn_id,
    approvedAt: row.approved_at === null ? null : DateTime.fromDateUnsafe(row.approved_at),
    retiredAt: row.retired_at === null ? null : DateTime.fromDateUnsafe(row.retired_at),
    ...provenanceOf(row),
  });

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

      const memoryReachable = (creator: CampaignCreatorActor, npcId: NpcId) =>
        containedChildWritable(sql, NPC_MEMORIES, npcId, creator.campaign, creator.actor);

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

      return {
        list: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              const rows = yield* sql<MemoryRow>`
                select npc_memory.* from npc_memory
                where ${memoryReachable(creator, npcId)}
                order by npc_memory.created_at asc, npc_memory.id asc
              `;
              return rows.map(toNpcMemory);
            }),
          ),

        approvedForPrompt: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              const rows = yield* sql<MemoryRow>`
                select npc_memory.* from npc_memory
                where ${memoryReachable(creator, npcId)}
                  and npc_memory.status = 'approved'
                  and npc_memory.retired_at is null
                order by npc_memory.approved_at asc, npc_memory.id asc
              `;
              return rows.map(toNpcMemory);
            }),
          ),

        draft: (creator, npcId, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              yield* ensureSource(creator, npcId, payload.sourceThreadId, payload.sourceTurnId);
              const rows = yield* sql<MemoryRow>`
                insert into npc_memory ${sql.insert(
                  defined({
                    npc_id: npcId,
                    body: payload.body,
                    source_thread_id: payload.sourceThreadId,
                    source_turn_id: payload.sourceTurnId,
                    visibility: payload.visibility,
                  }),
                )}
                returning *
              `;
              return toNpcMemory(rows[0]!);
            }),
          ),

        update: (creator, npcId, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<MemoryRow>`
                update npc_memory set ${setClause(
                  sql,
                  defined({ body: patch.body, visibility: patch.visibility }),
                )}
                where npc_memory.id = ${id}
                  and npc_memory.status <> 'retired'
                  and ${memoryReachable(creator, npcId)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc_memory", id });
              return toNpcMemory(rows[0]!);
            }),
          ),

        approve: (creator, npcId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<MemoryRow>`
                update npc_memory
                set status = 'approved', approved_at = coalesce(npc_memory.approved_at, now()), retired_at = null, updated_at = now()
                where npc_memory.id = ${id}
                  and npc_memory.status <> 'retired'
                  and ${memoryReachable(creator, npcId)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc_memory", id });
              return toNpcMemory(rows[0]!);
            }),
          ),

        retire: (creator, npcId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<MemoryRow>`
                update npc_memory
                set status = 'retired', retired_at = coalesce(npc_memory.retired_at, now()), updated_at = now()
                where npc_memory.id = ${id} and ${memoryReachable(creator, npcId)}
                returning *
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "npc_memory", id });
              return toNpcMemory(rows[0]!);
            }),
          ),

        reset: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              const rows = yield* sql<MemoryRow>`
                update npc_memory
                set status = 'retired', retired_at = coalesce(npc_memory.retired_at, now()), updated_at = now()
                where ${memoryReachable(creator, npcId)} and npc_memory.status <> 'retired'
                returning *
              `;
              return rows.map(toNpcMemory);
            }),
          ),

        playerSafeForPrompt: (campaignId, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<MemoryRow>`
                select npc_memory.id,
                       npc_memory.npc_id,
                       npc_memory.body,
                       npc_memory.status,
                       null::uuid as source_thread_id,
                       null::uuid as source_turn_id,
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
              `;
              if (rows.length === 0) {
                const reachable = yield* sql<{ readonly id: NpcId }>`
                  select npc.id from npc where npc.id = ${npcId} and ${playerNpcReadable(sql, campaignId, actor)}
                `;
                if (reachable.length === 0)
                  return yield* new NotFound({ resource: "npc", id: npcId });
              }
              return rows.map(toNpcMemory);
            }),
          ),
      };
    }),
  );
}
