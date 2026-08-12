import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";

/**
 * The invitation: how an account that owns no campaign comes to reach one.
 *
 * `0011_membership.ts` made reach a `campaign_member` row and left exactly one
 * writer, `addOwner`, which takes no role — so a player membership was not
 * something a caller might forget to refuse, it was not expressible. This is the
 * migration that makes it expressible, and it is the first irreversible step in
 * the players plan: after it, a credential exists that reaches a campaign its
 * account does not own.
 *
 * **A link is an invitation to join, not a way in.** Following one requires
 * signing in or signing up; its whole effect is to grant a membership to the
 * account that accepts it. It is not a bearer credential over campaign data, not
 * a guest account with no identity, and not a second credential kind — that last
 * one is what the plan calls "a second way to be reachable, which is exactly
 * where the next leak lives". So once accepted the member is ordinary, and this
 * table needs **no new predicate, no new base case and no change to
 * `Authorization`**. `packages/api/src/Invite.ts` states the four lifetime rules;
 * the columns below are what makes each of them a fact rather than a habit.
 *
 * ### Three columns that are deliberately absent
 *
 * **No `role`.** An invitation is an invitation to play. Co-DMs are a settled
 * *no* for the first iteration, and the decision says out loud that when they
 * arrive they must not be this same flow with a role dropdown — that would put
 * the most destructive grant in the product one selection away from the least.
 * A column with one legal value *is* that dropdown, one migration early. When a
 * co-DM invitation is really wanted it is a deliberate act of its own, and
 * adding a defaulted column to this table then is a one-liner.
 *
 * **No visibility, origin or `assistant_turn_id`** — the tail
 * `apps/server/test/schema.test.ts` insists on for every content table. An
 * invitation is not campaign content; it is the thing that decides who reaches
 * the content, exactly like `campaign_member`. Saying so means naming it in that
 * file's `NOT_CONTENT` list, which is the deliberate, reviewable edit that list
 * exists to demand. It also has a sharper consequence worth stating: **the
 * assistant can never mint an invitation**, because provenance is the only way a
 * row in this product can be Hob's and there is nowhere here to record one.
 *
 * **No `created_by`.** Today the only account that can mint one is the campaign's
 * owner, since minting goes through `campaignWritable` and the owner is the only
 * `dm` member there can be. A column recording an answer that is a constant is a
 * second copy of `campaign.account_id`; when co-DMs arrive it becomes a real
 * question and can be added then.
 *
 * ### The token is a digest, and the row is what a DM revokes
 *
 * `token_hash` is SHA-256 of 32 bytes of `randomBytes`, stored the same way and
 * for the same reason `account.token_hash` is: the column is a lookup key, not a
 * recoverable secret, and there is nothing to salt because there is nothing to
 * guess. The plaintext exists once, in the response to the mint. `id` is what
 * the DM's list shows and what revoking names — a person revoking an invitation
 * should never have to handle the secret again.
 *
 * ### `redeemed_at` is the authority, `redeemed_by` is provenance
 *
 * The pair is one-directional on purpose: `redeemed_by` may become null if an
 * account is ever removed, and a spent invitation must stay spent regardless.
 * So the check says a redeemer implies a redemption and not the converse, and
 * every liveness test in `repo/Invites.ts` reads `redeemed_at`.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    create table campaign_invite (
      id           uuid primary key default gen_random_uuid(),
      campaign_id  uuid not null references campaign (id) on delete cascade,
      token_hash   text not null unique,
      label        text not null default '',
      created_at   timestamptz not null default now(),
      expires_at   timestamptz not null,
      revoked_at   timestamptz,
      redeemed_by  uuid references account (id) on delete set null,
      redeemed_at  timestamptz,
      constraint campaign_invite_redeemer_was_a_redemption
        check (redeemed_by is null or redeemed_at is not null)
    )
  `;

  // The DM's list, newest first. Redemption is looked up by the unique index on
  // `token_hash`, so this is the only other access path there is.
  yield* sql`
    create index campaign_invite_campaign_idx
      on campaign_invite (campaign_id, created_at desc)
  `;
});
