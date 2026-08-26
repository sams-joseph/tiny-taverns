import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A conversation with Hob can belong to an **account** — the one column a
 * player-facing assistant needed.
 *
 * `assistant_thread` has been campaign-scoped and DM-only since `0010`, because
 * asking was a DM-only act: `HobThreads.start` composes `campaignWritable`,
 * which requires `isDm`. The captain reversed that on 2026-08-26 so that a
 * player can have Hob draft a character for them, and this is the whole of what
 * the schema owed. There is no `player_thread` table, no second turn table, and
 * no new predicate in `repo/visibility.ts` that does not compose one already
 * there.
 *
 * ### Nullable, and the null means the DM's
 *
 * A thread with `account_id is null` is the campaign's own — the one the DM's
 * panel resumes. A thread with an account is that account's, and the two sets
 * are **disjoint by predicate rather than by convention**
 * (`conversationReachable` in `repo/visibility.ts`): the DM's reads add
 * `account_id is null` and the player's are `ownRowWritable`, which never
 * matches a null. That disjointness is load-bearing three times over and none
 * of them is obvious:
 *
 * - the DM's panel resumes *the newest thread*, and without it a player asking
 *   Hob would change which conversation their DM is shown;
 * - `Proposals.accept` materialises whatever the turn proposed, and a DM
 *   reaching a player's `character` proposal would create a character owned by
 *   the DM — so the refusal is "there is no such turn on this reach" rather
 *   than a role check inside the accept;
 * - a player reaching the DM's thread would read the DM's own prep
 *   conversation, which is the disclosure this whole area exists to prevent.
 *
 * ### It is not a second reach rule
 *
 * The column is compared to `CurrentActor`'s own account and to nothing a
 * caller supplies, and the campaign half of every predicate that names it is
 * `withinReadableCampaign` — the same fragment `character`'s ownership
 * predicates compose. So a player's thread is reachable exactly while their
 * membership is live, their credential reaches this campaign, and the DM has
 * shared it: a revoked player loses their conversation along with everything
 * else at the table. `on delete cascade` from `account`, because a thread whose
 * owner is gone is a row nothing can reach and nobody can delete.
 *
 * `assistant_turn` gains nothing. A turn hangs off its thread and has no reach
 * of its own — which is why the turn-level predicate composes the thread's
 * rather than testing a denormalised copy that could disagree with it, exactly
 * as `prep_item` has no `campaign_id`.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    alter table assistant_thread
      add column account_id uuid references account (id) on delete cascade
  `;

  // Every read of this table names the campaign and then the owner, in that
  // order, so the index leads with the campaign. Partial on the owner would be
  // two indexes for two reaches; one covers both, because `account_id is null`
  // is as much a value here as a uuid is.
  yield* sql`
    create index assistant_thread_campaign_account_idx
      on assistant_thread (campaign_id, account_id)
  `;
});
