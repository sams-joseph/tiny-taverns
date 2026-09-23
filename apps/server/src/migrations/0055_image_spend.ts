import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The daily image budget's ledger: one row per draw that was started, written
 * in the transaction that records the draw, and never deleted.
 *
 * The caps used to count the image rows themselves (`character_portrait`,
 * `campaign_image`, `shared_world_image`, `npc_image`). Each of those cascades
 * from its subject, so deleting a character took its portrait's row and gave
 * the draw back to the day: draw, delete, create again, draw past the cap. A
 * spend is a fact about money already sent to the provider, which deleting the
 * picture cannot undo, so it lives in a table with **no foreign key to the
 * subject, the image or the account** and nothing ever deletes from it.
 *
 * `account_id` is the account the draw was billed to (the image row's own
 * `account_id`); `kind` is the `IMAGE_KINDS` key, for reading the ledger rather
 * than for the caps, which are shared across kinds; it carries no check, so a
 * new kind needs no migration here. A skipped or capped start sent nothing and writes no
 * row.
 *
 * **Seeded from the image rows that exist**, with their `created_at`, so a
 * deploy in the middle of a UTC day keeps that day's counts rather than handing
 * every account a fresh budget. Draws whose subjects were already deleted are
 * gone and cannot be recovered; that day undercounts by them.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table image_spend (
      id          uuid primary key default gen_random_uuid(),
      account_id  uuid not null,
      kind        text not null,
      spent_at    timestamptz not null default now()
    )
  `;
  yield* sql`create index image_spend_spent_at on image_spend (spent_at)`;
  yield* sql`create index image_spend_account_spent_at on image_spend (account_id, spent_at)`;

  yield* sql`
    insert into image_spend (account_id, kind, spent_at)
    select account_id, kind, created_at from (
      select account_id, 'character' as kind, created_at, failure from character_portrait
      union all
      select account_id, 'campaign', created_at, failure from campaign_image
      union all
      select account_id, 'sharedWorld', created_at, failure from shared_world_image
      union all
      select account_id, 'npc', created_at, failure from npc_image
    ) as drawn
    where drawn.failure is null or drawn.failure not in ('skipped', 'capped')
  `;
});
