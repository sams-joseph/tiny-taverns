import {
  type CampaignId,
  CurrentActor,
  NpcKnowledgeFact,
  type NpcKnowledgeFactCreate,
  type NpcKnowledgeFactId,
  type NpcKnowledgeFactUpdate,
  type NpcKnowledgeSourceKind,
  type NpcId,
  NotFound,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { playerNpcReadable } from "./Npcs.js";
import { NPC } from "./NpcThreads.js";
import { defined, dieOnSqlError, type ProvenanceColumns, provenanceOf, setClause } from "./rows.js";
import {
  containedChildWritable,
  ensureContainedRowWritable,
  under,
  type Containment,
} from "./visibility.js";

/**
 * Explicit facts selected for one campaign NPC.
 *
 * A fact is copied text plus provenance. The `source_*` columns are never read
 * through when assembling a prompt; a source can be edited, deleted, or become
 * unreadable without changing what this NPC knows or leaking fresh content.
 */

export const NPC_KNOWLEDGE: Containment = under("npc_knowledge_fact", "npc_id", NPC);

interface FactRow extends ProvenanceColumns {
  readonly id: NpcKnowledgeFactId;
  readonly npc_id: NpcId;
  readonly body: string;
  readonly source_kind: NpcKnowledgeSourceKind;
  readonly source_id: string | null;
  readonly source_label: string;
  readonly retired_at: Date | null;
}

export const toNpcKnowledgeFact = (row: FactRow): NpcKnowledgeFact =>
  new NpcKnowledgeFact({
    id: row.id,
    npcId: row.npc_id,
    body: row.body,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    retiredAt: row.retired_at === null ? null : DateTime.fromDateUnsafe(row.retired_at),
    ...provenanceOf(row),
  });

export class NpcKnowledge extends Context.Service<
  NpcKnowledge,
  {
    readonly list: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcKnowledgeFact>, NotFound, never>;
    readonly activeForPrompt: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcKnowledgeFact>, NotFound, never>;
    readonly create: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      payload: NpcKnowledgeFactCreate,
    ) => Effect.Effect<NpcKnowledgeFact, NotFound, never>;
    readonly update: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      id: NpcKnowledgeFactId,
      patch: NpcKnowledgeFactUpdate,
    ) => Effect.Effect<NpcKnowledgeFact, NotFound, never>;
    readonly retire: (
      creator: CampaignCreatorActor,
      npcId: NpcId,
      id: NpcKnowledgeFactId,
    ) => Effect.Effect<NpcKnowledgeFact, NotFound, never>;
    /** Active, explicitly shared facts for a player prompt; source ids are not exposed. */
    readonly playerSafeForPrompt: (
      campaignId: CampaignId,
      npcId: NpcId,
    ) => Effect.Effect<ReadonlyArray<NpcKnowledgeFact>, NotFound, CurrentActor>;
  }
>()("NpcKnowledge") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const factReachable = (creator: CampaignCreatorActor, npcId: NpcId) =>
        containedChildWritable(sql, NPC_KNOWLEDGE, npcId, creator.campaign, creator.actor);

      return {
        list: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              const rows = yield* sql<FactRow>`
                select npc_knowledge_fact.* from npc_knowledge_fact
                where ${factReachable(creator, npcId)}
                order by npc_knowledge_fact.created_at asc, npc_knowledge_fact.id asc
              `;
              return rows.map(toNpcKnowledgeFact);
            }),
          ),

        activeForPrompt: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              const rows = yield* sql<FactRow>`
                select npc_knowledge_fact.* from npc_knowledge_fact
                where ${factReachable(creator, npcId)} and npc_knowledge_fact.retired_at is null
                order by npc_knowledge_fact.created_at asc, npc_knowledge_fact.id asc
              `;
              return rows.map(toNpcKnowledgeFact);
            }),
          ),

        create: (creator, npcId, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              const rows = yield* sql<FactRow>`
                insert into npc_knowledge_fact ${sql.insert(
                  defined({
                    npc_id: npcId,
                    body: payload.body,
                    source_kind: payload.sourceKind,
                    source_id: payload.sourceId,
                    source_label: payload.sourceLabel,
                    visibility: payload.visibility,
                  }),
                )}
                returning *
              `;
              return toNpcKnowledgeFact(rows[0]!);
            }),
          ),

        update: (creator, npcId, id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<FactRow>`
                update npc_knowledge_fact set ${setClause(
                  sql,
                  defined({
                    body: patch.body,
                    source_kind: patch.sourceKind,
                    source_id: patch.sourceId,
                    source_label: patch.sourceLabel,
                    visibility: patch.visibility,
                  }),
                )}
                where npc_knowledge_fact.id = ${id} and ${factReachable(creator, npcId)}
                returning *
              `;
              if (rows.length === 0)
                return yield* new NotFound({ resource: "npc_knowledge_fact", id });
              return toNpcKnowledgeFact(rows[0]!);
            }),
          ),

        retire: (creator, npcId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<FactRow>`
                update npc_knowledge_fact
                set retired_at = coalesce(npc_knowledge_fact.retired_at, now()), updated_at = now()
                where npc_knowledge_fact.id = ${id} and ${factReachable(creator, npcId)}
                returning *
              `;
              if (rows.length === 0)
                return yield* new NotFound({ resource: "npc_knowledge_fact", id });
              return toNpcKnowledgeFact(rows[0]!);
            }),
          ),

        playerSafeForPrompt: (campaignId, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<FactRow>`
                select npc_knowledge_fact.id,
                       npc_knowledge_fact.npc_id,
                       npc_knowledge_fact.body,
                       npc_knowledge_fact.source_kind,
                       null::uuid as source_id,
                       npc_knowledge_fact.source_label,
                       npc_knowledge_fact.retired_at,
                       npc_knowledge_fact.visibility,
                       npc_knowledge_fact.origin,
                       npc_knowledge_fact.assistant_turn_id,
                       npc_knowledge_fact.created_at,
                       npc_knowledge_fact.updated_at
                from npc_knowledge_fact
                where npc_knowledge_fact.npc_id = ${npcId}
                  and npc_knowledge_fact.retired_at is null
                  and npc_knowledge_fact.visibility = 'shared'
                  and exists (select 1 from npc where npc.id = npc_knowledge_fact.npc_id and ${playerNpcReadable(sql, campaignId, actor)})
                order by npc_knowledge_fact.created_at asc, npc_knowledge_fact.id asc
              `;
              if (rows.length === 0) {
                const reachable = yield* sql<{ readonly id: NpcId }>`
                  select npc.id from npc where npc.id = ${npcId} and ${playerNpcReadable(sql, campaignId, actor)}
                `;
                if (reachable.length === 0)
                  return yield* new NotFound({ resource: "npc", id: npcId });
              }
              return rows.map(toNpcKnowledgeFact);
            }),
          ),
      };
    }),
  );
}
