import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Automatic campaign contexts stay invisible until their owner deliberately
 * promotes one. There is no legacy population to classify, so the column's
 * fail-safe default is private and explicit world creation opts in.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table play_group
      add column is_shared_world boolean not null default false
  `;
});
