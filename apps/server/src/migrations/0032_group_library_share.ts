import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Explicit group Library sharing — the captain's decision of 2026-09-01:
 * Library originals stay account-owned, and a group gains reach to one
 * **only through a concrete share row**. Group membership alone never widens
 * Library visibility; a missing row here is the refusal.
 *
 * The row is a *grant to copy*, not content: it carries no visibility, no
 * provenance tail and no prose — the original stays exactly where and whose
 * it was, and what the share changes is one predicate's answer
 * (`copyableIntoCampaign`'s third disjunct). That is also why `resource_id`
 * has no foreign key: the seven copyable corpora are seven tables, and a
 * polymorphic pointer cannot be one. A share whose original has been deleted
 * (or has left the Library) is **inert by predicate** — the reach requires
 * the row to still be a Library original of the share's recorded owner — so
 * a dangling grant grants nothing rather than something wrong.
 *
 * `owner_account_id` is denormalised onto the share on purpose: it is the
 * value the predicate compares the resource's owner against, which is what
 * keeps a share made by yesterday's owner from reaching a row that has since
 * changed hands (not that one can today — ownership never moves — but the
 * predicate should not depend on that staying true). `shared_by_account_id`
 * is provenance; today the repository only lets an owner share their own, so
 * the two are equal, and the pair exists so that if that ever loosens the
 * record already tells the difference.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table group_library_share (
      group_id              uuid not null references play_group (id) on delete cascade,
      owner_account_id      uuid not null references account (id) on delete cascade,
      resource_kind         text not null check (resource_kind in
                              ('creature', 'character_option', 'spell', 'equipment',
                               'magic_item', 'rule_article', 'feat')),
      resource_id           uuid not null,
      shared_by_account_id  uuid not null references account (id) on delete cascade,
      created_at            timestamptz not null default now(),
      primary key (group_id, resource_kind, resource_id)
    )
  `;
  yield* sql`create index group_library_share_owner_idx on group_library_share (owner_account_id)`;
});
