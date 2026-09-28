import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Where an NPC's sheet came from: the creator's own hand, or a Hob draft the
 * creator kept.
 *
 * `0076_npc_sheets.ts` gave the sheet no provenance because nothing but the
 * creator's own writes put it there. The creator's Hob can now draft one
 * (`proposeNpcSheet`), and a draft enters the record only through the
 * creator's accept, stamped `origin = 'assistant'` with the turn it came from
 * — the rule every content row keeps (`repo/Proposals.ts`). So the sheet
 * gains the provenance pair, and only that: who may read it is still its
 * NPC's owner, so it takes no `visibility` and stays in `NOT_CONTENT`.
 *
 * Every existing sheet was written by hand, so the default is the truth for
 * each of them. A hand-written PUT over a kept draft makes the sheet
 * `authored` again, because it replaces the whole of it; a PATCH keeps the
 * origin it had, as an edited note keeps its own (`repo/NpcSheets.ts`).
 *
 * The turn's key is deferred as `campaign_story`'s is (`0072`), so deleting a
 * campaign, which takes its NPCs' sheets and its threads' turns in one
 * statement, is checked once both are gone. A Library original's sheet is
 * never a draft (the creator's campaign toolkit is the only one with the
 * tool), and a copy into a campaign starts `authored`: the copy writes it,
 * not Hob.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table npc_sheet
      add column origin text not null default 'authored'
        constraint npc_sheet_origin_check check (origin in ('authored', 'assistant')),
      add column assistant_turn_id uuid,
      add constraint npc_sheet_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
  `;
  yield* sql`
    alter table npc_sheet
      add constraint npc_sheet_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;
});
