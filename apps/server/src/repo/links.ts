import {
  type CampaignCharacterId,
  type EncounterId,
  type NoteLink,
  NotFound,
  type NpcId,
} from "@taverns/api";
import { Effect } from "effect";
import { type SqlClient, type Statement } from "effect/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { ownedRowReadable, rowWritable } from "./visibility.js";

/**
 * What the creator links prep to, and the one rule for which targets they
 * may: a note's links (`note_link`, `0069_note_links.ts`) and an NPC's
 * (`npc_link`, `0074_npc_links.ts`) name their targets through the same
 * columns and are refused by this same check. `NoteLink` is the widest set; an
 * `NpcLink` is a member of it.
 */
export type LinkTarget = NoteLink;
export type LinkKind = LinkTarget["kind"];
export type LinkTargetId = EncounterId | CampaignCharacterId | NpcId;

/** The column a link of this kind sets, in `note_link` and `npc_link` alike. */
export const linkColumn = (kind: LinkKind) =>
  kind === "encounter" ? "encounter_id" : kind === "seat" ? "campaign_character_id" : "npc_id";

/**
 * A link table's rows as the `json` array the contract's links are: the kind
 * read back from whichever target column is set, in the order they were added.
 * `table` is the link table and `where` names the rows of one owner.
 */
export const linksAggregate = (
  sql: SqlClient.SqlClient,
  table: "note_link" | "npc_link",
  where: Statement.Fragment,
): Statement.Fragment => {
  const npcKind = table === "note_link";
  return sql`coalesce((
    select json_agg(json_build_object(
      'kind', case
        when ${sql(table)}.encounter_id is not null then 'encounter'
        when ${sql(table)}.campaign_character_id is not null then 'seat'
        ${npcKind ? sql`else 'npc'` : sql``}
      end,
      'id', coalesce(
        ${sql(table)}.encounter_id, ${sql(table)}.campaign_character_id
        ${npcKind ? sql`, ${sql(table)}.npc_id` : sql``}
      )
    ) order by ${sql(table)}.created_at, ${sql(table)}.id)
    from ${sql(table)}
    where ${where}
  ), '[]'::json)`;
};

/**
 * Fails with `NotFound` unless the link's target is in this campaign and the
 * creator reaches it: an encounter they may write, a seat whose character is
 * still at the table, or an NPC still in the cast. The composite keys already
 * refuse another campaign's target, as a 500; this is the same refusal as the
 * 404 the surface answers with, and it also refuses a retired seat and an
 * archived NPC, which a chip could not open.
 */
export const ensureLinkTarget = (
  sql: SqlClient.SqlClient,
  creator: CampaignCreatorActor,
  link: LinkTarget,
) =>
  Effect.gen(function* () {
    const { campaign, actor } = creator;
    const rows =
      link.kind === "encounter"
        ? yield* sql<{ readonly id: EncounterId }>`
            select encounter.id from encounter
            where encounter.id = ${link.id}
              and ${rowWritable(sql, "encounter", campaign, actor)}
          `
        : link.kind === "seat"
          ? yield* sql<{ readonly id: CampaignCharacterId }>`
              select campaign_character.id from campaign_character
              where campaign_character.id = ${link.id}
                and campaign_character.campaign_id = ${campaign}
                and campaign_character.left_at is null
                and ${ownedRowReadable(sql, "campaign_character", campaign, actor)}
            `
          : yield* sql<{ readonly id: NpcId }>`
              select npc.id from npc
              where npc.id = ${link.id}
                and npc.archived_at is null
                and ${rowWritable(sql, "npc", campaign, actor)}
            `;
    if (rows.length === 0) {
      return yield* new NotFound({ resource: link.kind, id: link.id });
    }
  });
