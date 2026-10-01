import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * Where a Shared World came from: its founder's own hand, or a Hob draft its
 * founder kept.
 *
 * `play_group` had no provenance because nothing but a person's own create or
 * promote made one. The account's own Hob can now draft a Shared World
 * (`proposeSharedWorld`), and a draft enters the record only through the
 * asker's accept, stamped `origin = 'assistant'` with the turn it came from —
 * the rule every row Hob can make keeps (`repo/Proposals.ts`). So the world
 * gains the provenance pair, and only that: who may read it is still its live
 * members (`groupReadable`), so it takes no `visibility` and stays in
 * `NOT_CONTENT`.
 *
 * Every existing row was made by hand, so the default is the truth for each
 * of them. A campaign's hidden backing context is plumbing its campaign's
 * create founds, never a draft, so it stays `authored` even under a campaign
 * Hob drafted; the campaign carries that turn. Promoting a context into a
 * Shared World is a person's act and leaves the origin as it was.
 *
 * The turn's key is deferred as `npc_sheet`'s is (`0077`). The turn lives in
 * the asker's account thread, which no Shared World delete reaches, so
 * deleting the world never has to wait on it.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table play_group
      add column origin text not null default 'authored'
        constraint play_group_origin_check check (origin in ('authored', 'assistant')),
      add column assistant_turn_id uuid,
      add constraint play_group_assistant_provenance
        check ((origin = 'assistant') = (assistant_turn_id is not null))
  `;
  yield* sql`
    alter table play_group
      add constraint play_group_assistant_turn_fkey
      foreign key (assistant_turn_id) references assistant_turn (id)
      deferrable initially deferred
  `;
});
