import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Records whether accepting an invitation actually created or restored its
 * campaign membership. Campaign-local revocation may then undo exactly that
 * grant without removing an older, independently-held seat.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table group_invite
      add column granted_campaign_membership boolean not null default false
  `;
});
