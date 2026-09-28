import {
  type CampaignCharacterId,
  type EncounterId,
  type NpcId,
  type NpcLink,
  type NpcLinkKind,
  NpcLinks as NpcLinksRow,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { ensureLinkTarget, linkColumn, linksAggregate } from "./links.js";
import { dieOnSqlError } from "./rows.js";
import { rowWritable } from "./visibility.js";

/**
 * An NPC's ties to encounters and seats (`npc_link`, `0074_npc_links.ts`):
 * the DM's prep, so every method takes the creator proof and there is no
 * player read. The notes that name an NPC are note links (`repo/Notes.ts`).
 *
 * The NPC is asked for first, archived or not, as `Npcs.update` asks for it:
 * somebody who may not write it is told the NPC is not there, never anything
 * about a target. None of the writes touches the `npc` row, so a link moves
 * neither `version` nor `updated_at`: it is not an edit of the persona.
 */
export class NpcLinks extends Context.Service<
  NpcLinks,
  {
    readonly list: (
      creator: CampaignCreatorActor,
      id: NpcId,
    ) => Effect.Effect<NpcLinksRow, NotFound>;
    /** Idempotent: a link the NPC already has is one row. */
    readonly add: (
      creator: CampaignCreatorActor,
      id: NpcId,
      link: NpcLink,
    ) => Effect.Effect<NpcLinksRow, NotFound>;
    /** Idempotent: removing a link the NPC does not have changes nothing. */
    readonly remove: (
      creator: CampaignCreatorActor,
      id: NpcId,
      kind: NpcLinkKind,
      targetId: EncounterId | CampaignCharacterId,
    ) => Effect.Effect<NpcLinksRow, NotFound>;
  }
>()("NpcLinks") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const ensureNpc = (creator: CampaignCreatorActor, id: NpcId) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ readonly id: NpcId }>`
            select npc.id from npc
            where npc.id = ${id} and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "npc", id });
        });

      /** The NPC's links, under the NPC's own predicate: one statement, one answer. */
      const read = (creator: CampaignCreatorActor, id: NpcId) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ readonly links: ReadonlyArray<NpcLink> }>`
            select ${linksAggregate(sql, "npc_link", sql`npc_link.npc_id = npc.id`)} as links
            from npc
            where npc.id = ${id} and ${rowWritable(sql, "npc", creator.campaign, creator.actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "npc", id });
          return new NpcLinksRow({ npcId: id, links: rows[0]!.links });
        });

      return {
        list: (creator, id) => dieOnSqlError(read(creator, id)),

        add: (creator, id, link) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* ensureNpc(creator, id);
                yield* ensureLinkTarget(sql, creator, link);
                yield* sql`
                  insert into npc_link ${sql.insert({
                    npc_id: id,
                    campaign_id: creator.campaign,
                    [linkColumn(link.kind)]: link.id,
                  })}
                  on conflict do nothing
                `;
                return yield* read(creator, id);
              }),
            ),
          ),

        remove: (creator, id, kind, targetId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* ensureNpc(creator, id);
                yield* sql`
                  delete from npc_link
                  where npc_link.npc_id = ${id}
                    and ${sql(`npc_link.${linkColumn(kind)}`)} = ${targetId}
                `;
                return yield* read(creator, id);
              }),
            ),
          ),
      };
    }),
  );
}
