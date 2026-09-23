import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Hob drafting with no campaign: `assistant_thread` learns a third scope, the
 * account alone.
 *
 * A thread belonged to a campaign (`0010`, with a per-account owner since
 * `0016`) or to a Shared World (`0031`). A character is account-owned and can
 * be written against the core rules with no table at all (`POST
 * /me/characters`), and drafting one with Hob needs a conversation that belongs
 * to its author and to nothing else.
 *
 * `assistant_thread_one_scope` is replaced rather than joined by a second
 * check, so the three legal shapes are one statement:
 *
 * - a campaign's: `campaign_id` set, `group_id` null (`account_id` null for the
 *   creator's panel, an account for a drafting thread at that table);
 * - a Shared World's: `group_id` set, `campaign_id` and `account_id` null
 *   (`assistant_thread_group_unowned` still says the last half);
 * - an account's: both scopes null and `account_id` set.
 *
 * A thread with no scope and no owner stays unrepresentable, and so does one
 * with two scopes. The four `conversationReachable` arms in
 * `repo/visibility.ts` pin these shapes, so no thread answers two reaches.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`alter table assistant_thread drop constraint assistant_thread_one_scope`;
  yield* sql`
    alter table assistant_thread
      add constraint assistant_thread_one_scope
      check (
        num_nonnulls(campaign_id, group_id) = 1
        or (campaign_id is null and group_id is null and account_id is not null)
      )
  `;
  yield* sql`
    create index assistant_thread_account_scope_idx
      on assistant_thread (account_id)
      where campaign_id is null and group_id is null
  `;
});
