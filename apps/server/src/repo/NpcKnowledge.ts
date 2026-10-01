import {
  Actor,
  CampaignId,
  CurrentActor,
  NpcKnowledgeFact,
  type NpcKnowledgeFactCreate,
  NpcKnowledgeFactId,
  type NpcKnowledgeFactUpdate,
  NpcId,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema, type Statement } from "effect/sql";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import { playerNpcReadable } from "./Npcs.js";
import { NPC } from "./NpcThreads.js";
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
 * Explicit facts selected for one campaign NPC.
 *
 * A fact is copied text plus provenance. The `source_*` columns are never read
 * through when assembling a prompt; a source can be edited, deleted, or become
 * unreadable without changing what this NPC knows or leaking fresh content.
 */

export const NPC_KNOWLEDGE: Containment = under("npc_knowledge_fact", "npc_id", NPC);

/** An `npc_knowledge_fact` row as the wire reads it, decoded off `npc_knowledge_fact.*` by `SqlSchema`. */
export const NpcKnowledgeFactRow = classFromColumns(NpcKnowledgeFact, {
  ...NpcKnowledgeFact.fields,
  ...timestampColumns,
  retiredAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
});

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

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
      from?: AssistantOrigin,
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

      const factReachable = (
        campaign: CampaignId,
        actor: Actor,
        npcId: NpcId,
      ): Statement.Fragment => containedChildWritable(sql, NPC_KNOWLEDGE, npcId, campaign, actor);

      const facts = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, npcId: NpcId, activeOnly: Schema.Boolean }),
        ),
        Result: NpcKnowledgeFactRow,
        execute: ({ campaign, actor, npcId, activeOnly }) => sql`
          select npc_knowledge_fact.* from npc_knowledge_fact
          where ${sql.and([
            factReachable(campaign, actor, npcId),
            ...(activeOnly ? [sql`npc_knowledge_fact.retired_at is null`] : []),
          ])}
          order by npc_knowledge_fact.created_at asc, npc_knowledge_fact.id asc
        `,
      });
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: NpcKnowledgeFactRow,
        execute: (columns) =>
          sql`insert into npc_knowledge_fact ${sql.insert(columns)} returning *`,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({
            ...creatorFields,
            npcId: NpcId,
            id: NpcKnowledgeFactId,
            columns: Columns,
          }),
        ),
        Result: NpcKnowledgeFactRow,
        execute: ({ campaign, actor, npcId, id, columns }) => sql`
          update npc_knowledge_fact set ${setClause(sql, columns)}
          where npc_knowledge_fact.id = ${id} and ${factReachable(campaign, actor, npcId)}
          returning *
        `,
      });
      const retire = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, npcId: NpcId, id: NpcKnowledgeFactId }),
        ),
        Result: NpcKnowledgeFactRow,
        execute: ({ campaign, actor, npcId, id }) => sql`
          update npc_knowledge_fact
          set retired_at = coalesce(npc_knowledge_fact.retired_at, now()), updated_at = now()
          where npc_knowledge_fact.id = ${id} and ${factReachable(campaign, actor, npcId)}
          returning *
        `,
      });
      /** A player's prompt's facts: active, shared, of an NPC they may read, and no source id. */
      const playerSafe = SqlSchema.findAll({
        Request: Schema.toType(
          Schema.Struct({ campaignId: CampaignId, npcId: NpcId, actor: Actor }),
        ),
        Result: NpcKnowledgeFactRow,
        execute: ({ campaignId, npcId, actor }) => sql`
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
        `,
      });

      return {
        list: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              return yield* facts({ ...asked(creator), npcId, activeOnly: false });
            }),
          ),

        activeForPrompt: (creator, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              return yield* facts({ ...asked(creator), npcId, activeOnly: true });
            }),
          ),

        create: (creator, npcId, payload, from) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureContainedRowWritable(sql, NPC, npcId, creator.campaign, creator.actor);
              // An insert answers with its row; not getting one is a defect.
              return yield* insert(
                defined({
                  npc_id: npcId,
                  body: payload.body,
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
            }).pipe(orNotFound("npc_knowledge_fact", id)),
          ),

        retire: (creator, npcId, id) =>
          dieOnSqlError(
            retire({ ...asked(creator), npcId, id }).pipe(orNotFound("npc_knowledge_fact", id)),
          ),

        playerSafeForPrompt: (campaignId, npcId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* playerSafe({ campaignId, npcId, actor });
              if (rows.length === 0) {
                const reachable = yield* sql<{ readonly id: NpcId }>`
                  select npc.id from npc where npc.id = ${npcId} and ${playerNpcReadable(sql, campaignId, actor)}
                `;
                if (reachable.length === 0)
                  return yield* new NotFound({ resource: "npc", id: npcId });
              }
              return rows;
            }),
          ),
      };
    }),
  );
}
