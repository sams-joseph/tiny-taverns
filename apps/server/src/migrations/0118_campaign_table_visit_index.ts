import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * ### `campaign_table_visit_idx`
 *
 * `campaign.table_visit_id` (`0113_level_visits.ts`) references the visit on
 * the table `on delete set null`, so deleting a visit (*Reset level*, or a
 * campaign's visits going with it) asks `campaign` which row names it. Without
 * an index on the column that is a scan of every campaign. Partial, since most
 * campaigns have no visit on the table, and not unique: a unique index would
 * make the column part of a key, so that putting a visit on the table took the
 * campaign row `for update` and waited on every seat sitting down.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create index campaign_table_visit_idx on campaign (table_visit_id)
      where table_visit_id is not null
  `;
});
