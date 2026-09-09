import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Shared-session NPC conversations are durable scene state, not a UI flag.
 * Open rows are player-interactive, paused rows keep the visible transcript but
 * refuse new player messages/model calls, and closed rows remain reviewable by
 * the creator while leaving the active player table.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    alter table npc_thread
    add column session_state text not null default 'open'
      check (session_state in ('open', 'paused', 'closed'))
  `;
  yield* sql`
    alter table npc_thread
    add constraint npc_thread_session_state_scope
    check (channel = 'session_shared' or session_state = 'open')
  `;
  yield* sql`create index npc_thread_session_state_idx on npc_thread (session_id, session_state) where channel = 'session_shared'`;
});
