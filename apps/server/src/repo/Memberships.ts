import {
  type AccountId,
  type CampaignId,
  CampaignMembership,
  CurrentActor,
  type MemberRole,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import type { SqlError } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql";
import { type CampaignRow, toCampaign } from "./Campaigns.js";
import { dieOnSqlError } from "./rows.js";
import { campaignReadable } from "./visibility.js";

/**
 * `campaign_member`, the table that decides who reaches a campaign.
 *
 * There are two modules in `apps/server/src` that may name this table — this one
 * and `repo/visibility.ts`, which reads it — and
 * `apps/server/test/membership.test.ts` fails on a third. That rule is worth
 * more than it looks: `campaign.account_id` used to be the reach path, and the
 * whole cost of moving off it would be undone by one future query that reached
 * for ownership again because it was one grep away. It is also why the invite
 * repository, which mints the first player membership the product has ever had,
 * writes none of the SQL below — it calls it.
 *
 * ### Two shapes in one file, on purpose
 *
 * The **service** answers a request: `mine` is `GET /me/campaigns`, and it
 * carries `CurrentActor` like every other read in the product. Membership got a
 * service the moment it got an endpoint, which it did not have when `0011`
 * landed.
 *
 * The **plain functions** write the row that *decides* what an actor reaches,
 * inside somebody else's transaction — `addOwner` inside `Campaigns.create`,
 * `admitPlayer` and `revokePlayerAt` inside `Invites`. They take the `sql` they
 * are handed for exactly that reason: a membership written in a transaction of
 * its own would be a membership that can outlive the thing that justified it.
 *
 * ### Only two membership writes exist, and neither takes a role
 *
 * `addOwner` writes `'dm'`; `admitPlayer` writes `'player'`. Both spell the role
 * as a SQL literal rather than a parameter, so "an invitation cannot become a DM
 * membership" is a property of what exists rather than a check somebody has to
 * remember. Co-DMs are a settled *no* for the first iteration and must arrive as
 * their own deliberate act rather than as a role argument here — that would put
 * the most destructive grant in the product one selection away from the least.
 */

/** Re-exported so a caller needs one import for the role and the table. */
export type { MemberRole };

/**
 * Records the account that created a campaign as its DM.
 *
 * Must run in the same transaction as the insert that created the campaign:
 * `campaign_owner_is_dm_member` is deferred to COMMIT precisely so these two
 * statements can be in either order, and a campaign written without this is
 * refused at the end of its own transaction.
 */
export const addOwner = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  accountId: AccountId,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.asVoid(
    sql`
      insert into campaign_member (campaign_id, account_id, role)
      values (${campaignId}, ${accountId}, 'dm')
    `,
  );

/**
 * Puts an account at somebody else's table, as a player — **the first player
 * membership the product has ever been able to mint.**
 *
 * Called only by `Invites.redeem`, inside its transaction, with an account id
 * that came from `CurrentActor` rather than from a payload. It takes no role and
 * there is no second call site.
 *
 * The conflict clause is the one subtle part. A membership is keyed
 * `(campaign_id, account_id)`, so an account invited back after leaving already
 * has a row: the `where` reinstates a **revoked** one and does nothing at all to
 * a live one, which is what makes redeeming an invitation while already at the
 * table a harmless no-op instead of a demotion. It cannot demote a DM in any
 * case — the owner's row can never be revoked, so it never matches the `where`,
 * and `campaign_owner_is_dm_member` would refuse it on the spot if it somehow
 * did.
 */
export const admitPlayer = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  accountId: AccountId,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.asVoid(
    sql`
      insert into campaign_member (campaign_id, account_id, role)
      values (${campaignId}, ${accountId}, 'player')
      on conflict (campaign_id, account_id) do update
        set role = 'player', revoked_at = null
        where campaign_member.revoked_at is not null
    `,
  );

/**
 * Takes a player's reach away again — what revoking an invitation that was
 * already accepted actually does.
 *
 * `role = 'player'` in the `where` is load-bearing rather than tidy: it makes
 * this statement structurally unable to touch a `dm` row, so no bug upstream can
 * turn "withdraw an invitation" into "unseat the DM". The composite key would
 * refuse that anyway; this is the belt to its braces.
 *
 * `revoked_at` rather than a delete, so a membership that ended leaves a trace.
 * Every predicate tests `revoked_at is null` and the index is over the same
 * condition, so a revoked row costs a live read nothing.
 */
export const revokePlayerAt = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  accountId: AccountId,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.asVoid(
    sql`
      update campaign_member set revoked_at = now()
      where campaign_member.campaign_id = ${campaignId}
        and campaign_member.account_id = ${accountId}
        and campaign_member.role = 'player'
        and campaign_member.revoked_at is null
    `,
  );

/**
 * Who runs this campaign, by name — for the invitation page, which has to say
 * who is asking before the person it is asking has an account.
 *
 * Asked of `campaign_member` and not of `campaign.account_id`, and the
 * difference is the point rather than an accident of which module this is in:
 * since `0011` the DM of a campaign *is* its live `dm` member, and ownership is
 * a separate question about whose account the row hangs off. Asking the right
 * table means this keeps answering correctly on the day a campaign can have two
 * DMs.
 */
export const dmNameOf = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
): Effect.Effect<string | undefined, SqlError.SqlError> =>
  Effect.map(
    sql<{ readonly name: string }>`
      select account.name from campaign_member
      join account on account.id = campaign_member.account_id
      where campaign_member.campaign_id = ${campaignId}
        and campaign_member.role = 'dm'
        and campaign_member.revoked_at is null
      order by campaign_member.created_at asc
      limit 1
    `,
    (rows) => rows[0]?.name,
  );

interface MembershipRow extends CampaignRow {
  readonly role: MemberRole;
  readonly joined_at: Date;
}

export class Memberships extends Context.Service<
  Memberships,
  {
    /**
     * Every table this credential reaches, and what this account is at each.
     *
     * **The predicate is `campaignReadable`, unchanged and uncomposed with
     * anything else**, so this cannot return a campaign `campaigns.list` would
     * not — the join to `campaign_member` is there to fetch the role and for no
     * other purpose. That matters more than it looks: for a player member the
     * predicate still requires `campaign.visibility = 'shared'`, so a player who
     * has joined a campaign the DM has not shared sees nothing here. That is the
     * master toggle working, not a bug, and it is why `InviteRedeemed` carries
     * `shared` — the moment to explain it is the moment of joining.
     */
    readonly mine: Effect.Effect<ReadonlyArray<CampaignMembership>, never, CurrentActor>;
  }
>()("Memberships") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        mine: dieOnSqlError(
          Effect.gen(function* () {
            const actor = yield* CurrentActor;
            const rows = yield* sql<MembershipRow>`
              select campaign.*,
                     campaign_member.role,
                     campaign_member.created_at as joined_at
              from campaign
              join campaign_member
                on campaign_member.campaign_id = campaign.id
               and campaign_member.account_id = ${actor.accountId}
               and campaign_member.revoked_at is null
              where ${campaignReadable(sql, actor)} and campaign.archived_at is null
              order by campaign.created_at desc
            `;
            return rows.map(
              (row) =>
                new CampaignMembership({
                  campaign: toCampaign(row),
                  role: row.role,
                  joinedAt: DateTime.fromDateUnsafe(row.joined_at),
                }),
            );
          }),
        ),
      };
    }),
  );
}
