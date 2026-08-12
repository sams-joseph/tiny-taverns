import type { AccountId, CampaignId } from "@taverns/api";
import { Effect } from "effect";
import type { SqlClient, SqlError } from "effect/unstable/sql";

/**
 * Writes over `campaign_member`, the table that decides who reaches a campaign.
 *
 * There are two modules in `apps/server/src` that may name this table — this
 * one and `repo/visibility.ts`, which reads it — and
 * `apps/server/test/membership.test.ts` fails on a third. That rule is worth
 * more than it looks: `campaign.account_id` used to be the reach path, and the
 * whole cost of moving off it would be undone by one future query that reached
 * for ownership again because it was one grep away.
 *
 * This is not a `Context.Service` like the repositories, and the difference is
 * deliberate. Every repository method carries `CurrentActor` because it answers
 * a request; this writes the row that *decides* what an actor reaches, in the
 * same transaction as the campaign it belongs to. Making it a service would
 * imply there is a membership endpoint. There is not — see below.
 */

/**
 * What a membership can be.
 *
 * The column carries both values from the first migration and the product mints
 * exactly one of them. A co-DM is a settled *no* for the first iteration; when
 * it arrives it must be its own deliberate act rather than this same path with
 * a role argument, because that would put the most destructive grant in the
 * product one selection away from the least. Naming both here is what keeps the
 * eventual addition additive.
 */
export type MemberRole = "dm" | "player";

/**
 * Records the account that created a campaign as its DM.
 *
 * **The only membership write in `src`, and it takes no role.** A player
 * membership is step 4's — it needs an invite, a redemption and a credential
 * that reaches a campaign its account does not own — and until that exists the
 * honest state of the product is that no player membership can be minted at
 * all. A function that took a `MemberRole` would make that a matter of who
 * calls it; one that does not makes it a matter of what exists.
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
      insert into campaign_member ${sql.insert({
        campaign_id: campaignId,
        account_id: accountId,
        role: "dm" satisfies MemberRole,
      })}
    `,
  );
