import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * A monster that belongs to an **account** and to no campaign — a Library
 * entity, and a shape the schema could not express at all before this.
 *
 * Captain's model, in their own words: *"The library should be where you create
 * the entities; when you use them in a campaign they are copied in, so the
 * library should only show the raw entity and not anything in campaigns, as the
 * campaign is a copied state of the entity."*
 *
 * So `creature` now holds three kinds of row, and after this migration every one
 * of them is told apart by **who owns it** rather than by what its `origin`
 * says:
 *
 * | row              | `campaign_id` | `account_id` | who may write it        |
 * | ---------------- | ------------- | ------------ | ----------------------- |
 * | the bundle       | null          | null         | **nobody**              |
 * | a Library entity | null          | an account   | that account            |
 * | a campaign copy  | a campaign    | null         | that campaign's DM      |
 *
 * `creature_one_owner` is what makes the middle column of that table exclusive,
 * and `creature_system_is_unowned` is what keeps the top row unreachable.
 *
 * ### The guarantee this migration had to carry across, unbroken
 *
 * `0004_bestiary.ts` made the shared corpus immutable **structurally**: every
 * write predicate requires `campaign_id` to equal the campaign named in the
 * request path, a bundled row's is null, and a null never equals a uuid. There
 * is no `origin = 'system'` check anywhere in `apps/server/src` and none is
 * needed.
 *
 * Adding a second kind of row at `campaign_id is null` is exactly what could
 * have spent that guarantee: the moment campaign-less creatures have a write
 * path, "nothing writes a null campaign" stops being true. What replaces it is
 * the *same argument one column across*:
 *
 * > A Library write requires `account_id` to equal the account the credential
 * > resolved to. A bundled row's `account_id` is null, and a null never equals a
 * > uuid.
 *
 * And `creature_system_is_unowned` is what makes "a bundled row's `account_id`
 * is null" a fact about the schema rather than about how the importer happens to
 * be written: `origin = 'system'` and *owned by nobody* are the same statement,
 * so a system row that names an account is not a row anybody forgot to reject —
 * it is not a row Postgres will store. The write predicate is still the only
 * mechanism, there is still no `origin` check in `src`, and there is still
 * nothing for a future author to remember.
 *
 * `apps/server/test/library.test.ts` and `apps/server/test/bestiary.test.ts`
 * pin both halves, from the endpoints and from raw SQL.
 *
 * ### No backfill, and none is wanted
 *
 * Campaign-authored creatures written before this stay exactly where they are:
 * `campaign_id` set, `account_id` null, readable in their campaign's bestiary as
 * they always were. They simply do not appear in anybody's Library, because they
 * are not Library entities — they are what the model calls copied state, with no
 * original behind them. Turning them into Library entities would mean guessing
 * whose Library, and a guess written into a column somebody trusts is worse than
 * an absence — the same refusal `0012` made about parsing old descriptors and
 * `0014` made about hit points.
 *
 * Nothing here deletes a row. A migration is permanent history and runs
 * everywhere it is ever applied.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Whose Library this creature is in. Null for the bundle and for a campaign
  // copy — the two rows nobody personally owns.
  //
  // `on delete cascade`, like `campaign.account_id`: a Library is the account's
  // and does not outlive it. (Nothing in the product deletes an account, and
  // `AGENTS.md` records why that must stay a deliberate product decision rather
  // than something an external webhook can reach.)
  yield* sql`
    alter table creature
      add column account_id uuid references account (id) on delete cascade
  `;
  // Partial, like `character_account_id_idx`: the column is null on every row
  // that is not somebody's Library entity, and the Library read is the only
  // thing that asks about it.
  yield* sql`
    create index creature_account_id_idx on creature (account_id)
      where account_id is not null
  `;

  // **At most one owner.** A creature is a campaign's or an account's or
  // nobody's, never two of those at once — which is what lets each write
  // predicate name one column and be complete. Without it, `account_id = me`
  // would be a way to write a row inside a campaign the actor does not DM.
  yield* sql`
    alter table creature
      add constraint creature_one_owner
        check (campaign_id is null or account_id is null)
  `;

  // `creature_system_is_global` said `(origin = 'system') = (campaign_id is
  // null)`. That was the same statement as "owned by nobody" for as long as
  // `campaign_id` was the only ownership column; it is not any more, and left
  // alone it would have made every Library entity a system row.
  //
  // The replacement says what the old one meant: **a bundled creature is the one
  // nobody owns.** Both halves are load-bearing —
  //
  //   `origin = 'system'` ⇒ unowned   no bundled row can be written by anyone,
  //                                   because both write predicates compare an
  //                                   ownership column to a value and null
  //                                   matches neither
  //   unowned ⇒ `origin = 'system'`   no ownerless row can be minted through a
  //                                   write path, because both write paths set
  //                                   an owner and the check refuses the pair
  //
  // — so the shared corpus stays exactly as unreachable as it was, and
  // `src/bestiary/import.ts` stays the only thing that can write one.
  yield* sql`alter table creature drop constraint creature_system_is_global`;
  yield* sql`
    alter table creature
      add constraint creature_system_is_unowned
        check ((origin = 'system') = (campaign_id is null and account_id is null))
  `;

  // `creature_system_name_key` was `unique (lower(name)) where campaign_id is
  // null` — the importer's upsert target, and a *bundle* uniqueness rule that
  // now spans every account's Library as well. Left alone it would mean two
  // accounts could not both keep a monster called Goblin, and the second one to
  // try would get a constraint violation naming an index they have never heard
  // of.
  //
  // Restricted to the rows it was always about. `src/bestiary/import.ts`'s
  // `on conflict … where` clause is widened to match, because Postgres infers an
  // arbiter index only from an inference predicate that implies the index's own.
  //
  // A Library gets no uniqueness rule of its own: two monsters with one name is
  // a thing a DM may reasonably want, and nothing upserts here.
  yield* sql`drop index creature_system_name_key`;
  yield* sql`
    create unique index creature_system_name_key
      on creature (lower(name)) where campaign_id is null and account_id is null
  `;
});
