import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Retry guard for owner resource/rest writes.
 *
 * The resource counters live in the character document and may be moved with no
 * campaign or open session, so the existing session_event request-id indexes
 * cannot be the backstop. This table is not content; it stores only the fact
 * that a request id has been spent for one character.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table character_resource_request (
      character_id uuid not null references character (id) on delete cascade,
      request_id text not null check (length(request_id) between 1 and 128),
      created_at timestamptz not null default now(),
      primary key (character_id, request_id)
    )
  `;
});
