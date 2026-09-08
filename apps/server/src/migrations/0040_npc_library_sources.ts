import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * NPC builder slice 4: account-owned Library NPC sources and group shares.
 *
 * `npc` becomes the same three-owner shape as the other copyable Library
 * corpora, except there is no system bundle yet: a row is either an
 * account-owned source (`campaign_id is null, account_id set`) or a campaign
 * instance (`campaign_id set, account_id is null`). Campaign instances are
 * snapshots. `derived_from_version` and `derived_from_name` record what source
 * version/name was copied so deleting the original leaves understandable
 * provenance while the FK itself goes null.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table npc alter column campaign_id drop not null`;
  yield* sql`alter table npc add column account_id uuid references account (id) on delete cascade`;
  yield* sql`alter table npc add column derived_from_version integer`;
  yield* sql`alter table npc add column derived_from_name text`;
  yield* sql`
    alter table npc
    add constraint npc_one_owner
    check (
      (campaign_id is not null and account_id is null)
      or (campaign_id is null and account_id is not null)
    )
  `;
  yield* sql`create index npc_account_id_idx on npc (account_id, archived_at) where campaign_id is null`;
  yield* sql`create index npc_account_name_idx on npc (account_id, lower(name)) where campaign_id is null`;

  yield* sql`alter table group_library_share drop constraint group_library_share_resource_kind_check`;
  yield* sql`
    alter table group_library_share
    add constraint group_library_share_resource_kind_check
    check (resource_kind in
      ('creature', 'character_option', 'spell', 'equipment',
       'magic_item', 'rule_article', 'feat', 'npc'))
  `;
});
