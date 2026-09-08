import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Campaign search learns the Cast.
 *
 * The generated vector deliberately indexes only the public half of an NPC:
 * name, role and `persona`. `private_material` stays out because
 * `searchCampaign` is a shared tool (DM and player Hob) and a player searching
 * for a secret word must not get an NPC-hit existence oracle. Creator-only
 * private material is available through Hob's focused `getNpc` tool, after the
 * creator proof has been checked.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table npc
      add column search tsvector generated always as (
        setweight(to_tsvector('english', name), 'A') ||
        setweight(to_tsvector('english', role), 'B') ||
        setweight(jsonb_to_tsvector('english', persona, '["string"]'), 'C')
      ) stored
  `;
  yield* sql`create index npc_search_idx on npc using gin (search)`;
});
