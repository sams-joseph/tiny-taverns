import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * Reach stops being ownership and becomes membership.
 *
 * `campaignInScope` — the base case of every predicate in the product — asked
 * `campaign.account_id = <the actor's account>`. That is the right question for
 * as long as the only person who reaches a campaign is the person who owns it,
 * and it is the wrong one the moment a player has an account of their own.
 * Someone can be the DM of one table and a player at another **on the same
 * credential**, so the role cannot be a property of the credential: it is a
 * property of the pair (person, campaign), which is a row.
 *
 * `campaign.account_id` stays. It is the cascade parent and the answer to
 * "whose account is this" — it is simply no longer a reach path, and
 * `apps/server/test/membership.test.ts` greps `src` to keep it that way.
 *
 * Three things are worth reading before changing any of this.
 *
 * **The role column carries both values from the first day, and only one of
 * them is minted.** There is no invite yet and nothing in `src` writes
 * `'player'` — `repo/Memberships.ts` has one writer and it writes the owner's
 * `'dm'` row. Co-DMs are a settled *no* for the first iteration, and the column
 * is what keeps them additive rather than a migration.
 *
 * **`revoked_at` rather than a delete**, so a membership that ends leaves a
 * trace. The predicates test `revoked_at is null`, and the partial index is
 * over the same condition, so a revoked row costs a live read nothing.
 *
 * **The composite key is what buys back the one thing this change weakens.**
 * A player's write refusal used to be a literal: `campaignWritable` compiled to
 * the constant `false` and never reached a row. Now it depends on a
 * `campaign_member` row existing with `role = 'dm'` — so a campaign whose DM
 * membership went missing would be a campaign nobody could write to, and worse,
 * one whose owner is not its DM. The bottom half of this file makes that state
 * unrepresentable rather than merely unwritten.
 *
 * It is the `0006_session_finished.ts` trick applied to a role instead of a
 * lifecycle: widen both ends of a key with a generated column encoding the
 * thing that must be true, and let the key refuse the combination that must not
 * exist. `campaign_member.is_dm` is `role = 'dm' and revoked_at is null`; the
 * campaign's side is a constant `true`, because a campaign always points at its
 * owner. So `(id, account_id, true)` has no row to match unless the owner holds
 * a live DM membership.
 *
 * Driven against this schema, all seven cases:
 *
 *   campaign inserted with no member row      refused at COMMIT
 *   campaign + dm member in one transaction   accepted
 *   demoting the owner to player              refused, immediately
 *   revoking the owner's membership           refused, immediately
 *   deleting the owner's membership           refused, immediately
 *   delete from campaign                      cascade unblocked, member rows go
 *   a player member leaving                   allowed
 *
 * **`deferrable initially deferred`, for the reason
 * `encounter_creature.creature_id` is**: the campaign and its owner row are two
 * statements and neither order is legal if the check fires at once. Note the
 * refusals on the *referenced* side still fire on the spot, which is the
 * behaviour you want — a lone `update campaign_member set role = 'player'` is
 * rejected there and then rather than at some later commit.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table campaign_member (
      campaign_id  uuid not null references campaign (id) on delete cascade,
      account_id   uuid not null references account (id) on delete cascade,
      role         text not null check (role in ('dm', 'player')),
      created_at   timestamptz not null default now(),
      revoked_at   timestamptz,
      is_dm        boolean generated always as (role = 'dm' and revoked_at is null) stored,
      primary key (campaign_id, account_id)
    )
  `;

  // The campaign list is the one read that goes this way round — every other
  // read names a campaign, and the primary key answers those. Partial, because
  // no predicate ever looks for a revoked row.
  yield* sql`
    create index campaign_member_account_idx
      on campaign_member (account_id) where revoked_at is null
  `;

  // The referenced key for the constraint below. `(campaign_id, account_id)` is
  // still the primary key, so this widens a target without weakening anything.
  yield* sql`
    alter table campaign_member
      add constraint campaign_member_dm_key unique (campaign_id, account_id, is_dm)
  `;

  // Every campaign that exists today is reached by its owner and by nobody
  // else, so one row each says exactly what was already true. This runs before
  // the constraint below, which could not be added while a campaign had no DM.
  yield* sql`
    insert into campaign_member (campaign_id, account_id, role)
    select campaign.id, campaign.account_id, 'dm' from campaign
  `;

  // `true` unconditionally: a campaign always has an owner (`account_id` is not
  // null), so unlike `0006`'s pointer there is no "not set" case to leave
  // unconstrained. Generated, so no writer can set it and there is no second
  // copy of the answer to update wrongly.
  yield* sql`
    alter table campaign
      add column owner_is_dm boolean generated always as (true) stored
  `;

  yield* sql`
    alter table campaign
      add constraint campaign_owner_is_dm_member
      foreign key (id, account_id, owner_is_dm)
      references campaign_member (campaign_id, account_id, is_dm)
      deferrable initially deferred
  `;
});
