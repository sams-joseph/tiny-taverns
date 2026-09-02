import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Group Hob's conversations: `assistant_thread` learns a second scope.
 *
 * A thread was campaign-scoped since `0010` and gained a per-account owner in
 * `0016`; group Hob needs one that belongs to a **group** — the shared
 * conversation over the group's canonical history, readable and writable by
 * any live member the way the chronicle is.
 *
 * The XOR check is the shape of the reach story: a thread is a campaign's or
 * a group's, never both and never neither, so the three
 * `conversationReachable` arms partition the table by construction —
 * `"dm"`/`"own"` pin `campaign_id`, `"group"` pins `group_id`, and no thread
 * answers two of them. A group thread has no `account_id` either: the group's
 * conversation is the group's, like its chronicle.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table assistant_thread alter column campaign_id drop not null`;
  yield* sql`
    alter table assistant_thread
      add column group_id uuid references play_group (id) on delete cascade
  `;
  yield* sql`
    alter table assistant_thread
      add constraint assistant_thread_one_scope
      check ((campaign_id is null) <> (group_id is null))
  `;
  yield* sql`
    alter table assistant_thread
      add constraint assistant_thread_group_unowned
      check (group_id is null or account_id is null)
  `;
  yield* sql`create index assistant_thread_group_idx on assistant_thread (group_id)`;
});
