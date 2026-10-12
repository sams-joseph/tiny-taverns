import { Effect } from "effect";
import { SqlClient } from "effect/sql";

/**
 * A fight's own Hob conversation: where the turns Hob proposes for its
 * monsters are saved (`hobFight.turn`), one thread per run.
 *
 * Only the campaign's own conversation can be one (`campaign_id` set,
 * `account_id` null, the `"dm"` reach), so `conversationReachable` answers it
 * unchanged and the creator's discard and turn reads reach it as they reach
 * any other. The panel's list leaves these out, so a fight's turns do not
 * bury the DM's questions. That the run is this campaign's is the write's
 * check (`HobThreads.forFight`, behind the creator proof), because the run
 * reaches its campaign through its night.
 *
 * Deleting the run deletes its conversation.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    alter table assistant_thread
      add column encounter_run_id uuid references encounter_run (id) on delete cascade,
      add constraint assistant_thread_fight_is_the_campaigns
        check (encounter_run_id is null or (campaign_id is not null and account_id is null))
  `;
  yield* sql`
    create unique index assistant_thread_one_per_fight
      on assistant_thread (encounter_run_id) where encounter_run_id is not null
  `;
});
