import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * NPC builder slice 3: private player direct chat.
 *
 * A player thread is a second channel on `npc_thread`, owned by exactly one
 * account. Creator rehearsal remains the campaign-owned null-account channel.
 * The check makes the partition structural: a creator read that filters to
 * rehearsal can never see a player thread, and a player read always has an
 * account id to compare to the credential.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table npc_thread add column account_id uuid references account (id) on delete cascade`;
  yield* sql`alter table npc_thread drop constraint npc_thread_channel_check`;
  yield* sql`
    alter table npc_thread
    add constraint npc_thread_channel_check
    check (channel in ('rehearsal', 'player_direct'))
  `;
  yield* sql`
    alter table npc_thread
    add constraint npc_thread_channel_account
    check (
      (channel = 'rehearsal' and account_id is null)
      or (channel = 'player_direct' and account_id is not null)
    )
  `;
  yield* sql`create index npc_thread_player_idx on npc_thread (npc_id, account_id, updated_at desc, id desc) where channel = 'player_direct'`;
});
