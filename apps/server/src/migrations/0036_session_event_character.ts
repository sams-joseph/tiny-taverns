import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/** Filterable owner context for player-visible character events. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table session_event add column character_id uuid references character (id) on delete set null`;
  yield* sql`create index session_event_character_seq_idx on session_event (character_id, seq) where character_id is not null`;
});
