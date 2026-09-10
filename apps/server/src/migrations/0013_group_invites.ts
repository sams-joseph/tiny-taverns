import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The invitation: how an account that belongs to no group comes to join one —
 * and to a seat at one of its tables in the same act.
 *
 * **A link is an invitation to join, not a way in.** Following one requires
 * signing in or signing up; its whole effect is to grant a `group_member` row
 * and a `campaign_member` row to the account that accepts it. It
 * is not a bearer credential over group data, not a guest account, and not a
 * second credential kind — so this table needs **no new predicate, no new base
 * case and no change to `Authorization`**. `packages/api/src/Invite.ts` states
 * the four lifetime rules; the columns below are what makes each of them a
 * fact rather than a habit.
 *
 * ### Group-first, structurally
 *
 * `campaign_member` carries a foreign key into `group_member`, so campaign
 * participation cannot exist for a non-group member; an invitation that admits
 * to a campaign writes the group membership first and the participation second
 * in one transaction, and there is no campaign-only invitation for the schema
 * to even express. The composite `(campaign_id, group_id)` key binds the named
 * campaign to *this* group — an invitation cannot seat somebody at another
 * group's table.
 *
 * Invitations have no meaning after their campaign is deleted, so the
 * composite foreign key cascades the invitation with it.
 *
 * ### Three columns that are deliberately absent
 *
 * **No `role`.** A member is a member; the group owner is `owner_account_id`
 * on `play_group` and a campaign's DM is its `creator_account_id`. There is no
 * role for an invitation to grant, which is the co-DM decision applied to a
 * schema one migration early.
 *
 * **No visibility, origin or `assistant_turn_id`** — the tail
 * `apps/server/test/schema.test.ts` insists on for every content table. An
 * invitation is not group content; it is the thing that decides who reaches
 * the content. Saying so means naming it in that file's `NOT_CONTENT` list.
 * The sharper consequence stands: **the assistant can never mint an
 * invitation**, because provenance is the only way a row here could be Hob's
 * and there is nowhere to record one.
 *
 * **No `created_by`.** Only the group owner can mint one — minting goes
 * through `groupWritable` — so a column recording the answer would be a second
 * copy of `play_group.owner_account_id`.
 *
 * ### The token is a digest, and the row is what the owner revokes
 *
 * `token_hash` is SHA-256 of 32 bytes of `randomBytes`, stored the same way
 * and for the same reason `account.token_hash` is. The plaintext exists once,
 * in the response to the mint.
 *
 * ### `redeemed_at` is the authority, `redeemed_by` is provenance
 *
 * `redeemed_by` may become null if an account is ever removed, and a spent
 * invitation must stay spent regardless — so the check says a redeemer implies
 * a redemption and not the converse.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table group_invite (
      id           uuid primary key default gen_random_uuid(),
      group_id     uuid not null references play_group (id) on delete cascade,
      campaign_id  uuid not null,
      token_hash   text not null unique,
      label        text not null default '',
      created_at   timestamptz not null default now(),
      expires_at   timestamptz not null,
      revoked_at   timestamptz,
      redeemed_by  uuid references account (id) on delete set null,
      redeemed_at  timestamptz,
      constraint group_invite_campaign_fkey
        foreign key (campaign_id, group_id)
        references campaign (id, group_id) on update cascade on delete cascade,
      constraint group_invite_redeemer_was_a_redemption
        check (redeemed_by is null or redeemed_at is not null)
    )
  `;

  // The owner's list, newest first. Redemption is looked up by the unique
  // index on `token_hash`, so this is the only other access path there is.
  yield* sql`
    create index group_invite_group_idx
      on group_invite (group_id, created_at desc)
  `;
});
