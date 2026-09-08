import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * NPC builder slice 5: one shared live-session NPC channel.
 *
 * The channel is a thread under the existing `npc_thread` table, not a second
 * session model. `session_shared` is scoped to exactly one existing `session`,
 * with one thread per `(npc, session)`. A user turn may copy the account that
 * spoke and a caller-supplied request id for idempotency; NPC turns stay
 * account-less generated content.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table npc_thread add column session_id uuid references session (id) on delete cascade`;
  yield* sql`alter table npc_thread drop constraint npc_thread_channel_check`;
  yield* sql`
    alter table npc_thread
    add constraint npc_thread_channel_check
    check (channel in ('rehearsal', 'player_direct', 'session_shared'))
  `;
  yield* sql`alter table npc_thread drop constraint npc_thread_channel_account`;
  yield* sql`
    alter table npc_thread
    add constraint npc_thread_channel_scope
    check (
      (channel = 'rehearsal' and account_id is null and session_id is null)
      or (channel = 'player_direct' and account_id is not null and session_id is null)
      or (channel = 'session_shared' and account_id is null and session_id is not null)
    )
  `;
  yield* sql`create unique index npc_thread_one_session_shared on npc_thread (npc_id, session_id) where channel = 'session_shared'`;
  yield* sql`create index npc_thread_session_shared_idx on npc_thread (session_id, updated_at desc, id desc) where channel = 'session_shared'`;

  yield* sql`alter table npc_turn add column account_id uuid references account (id) on delete set null`;
  yield* sql`alter table npc_turn add column request_id text check (length(request_id) <= 120)`;
  yield* sql`create unique index npc_turn_session_user_request on npc_turn (thread_id, account_id, request_id) where who = 'user' and request_id is not null and account_id is not null`;
});
