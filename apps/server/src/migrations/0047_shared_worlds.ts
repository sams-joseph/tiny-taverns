import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Automatic campaign contexts stay invisible until their owner deliberately
 * promotes one. Existing groups predate that distinction and remain explicit.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table play_group
      add column is_shared_world boolean not null default true
  `;
});
