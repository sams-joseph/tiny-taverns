import {
  type AccountId,
  type CampaignId,
  CampaignMember,
  CampaignMembership,
  CurrentActor,
  type MemberRole,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import type { SqlError, Statement } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql";
import { type CampaignRow, toCampaign } from "./Campaigns.js";
import type { DmActor } from "./DmActor.js";
import { dieOnSqlError } from "./rows.js";
import { campaignReadable, campaignWritableById } from "./visibility.js";

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
 * The **service** answers a request, and it now answers the same row from both
 * ends. `mine` is `GET /me/campaigns` — *which tables am I at* — and carries
 * `CurrentActor` like every other read in the product; it takes a shelf, which
 * is what makes `GET /me/campaigns/archived` the same read rather than a second
 * one. `list` is
 * `GET /campaigns/:c/members` — *who is at this table* — and takes a `DmActor`,
 * which makes this the **fifth gated repository** and the second, after `Recap`,
 * that is gated in part. Membership got a service the moment it got an endpoint,
 * which it did not have when `0011` landed.
 *
 * The split is the standing rule rather than a judgement: a member list is other
 * people's account names and the shape of somebody's table, so the player
 * projection of it is *nothing* and there is no narrow schema to answer with.
 * `mine` needs no gate for the mirror-image reason — the campaigns a credential
 * already reaches are not a disclosure to the credential that reaches them.
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

/**
 * Which shelf `mine` reads — the live tables, or the archived ones.
 *
 * **Not on the wire, and that is the point.** `GET /me/campaigns` and
 * `GET /me/campaigns/archived` are two paths over this one argument, so which
 * shelf a caller gets is decided by the URL they asked for rather than by a
 * decoded default that five unrelated readers would have to keep naming
 * correctly. See the `me` group in `packages/api/src/Api.ts`.
 *
 * A union rather than a boolean so the two call sites in `handlers.ts` read as
 * what they are — `mine("archived")` says which list it is answering, and
 * `mine(true)` would not.
 */
export type CampaignShelf = "live" | "archived";

interface MemberRow {
  readonly account_id: AccountId;
  readonly name: string;
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
     *
     * **The shelf is the argument, and it is the only thing that differs
     * between the two endpoints over this read.** `GET /me/campaigns` asks for
     * `"live"` and `GET /me/campaigns/archived` for `"archived"`; the join, the
     * predicate, the ordering and the mapper are one, so the two lists cannot
     * come to disagree about reach — only about which side of
     * `campaign.archived_at is null` a row is on. That clause is **the** answer
     * to whether an archived campaign appears in a list: `apps/web` used to
     * filter `archivedAt === null` a second time after this one and it was dead
     * weight, so it is gone rather than tripled.
     */
    readonly mine: (
      shelf: CampaignShelf,
    ) => Effect.Effect<ReadonlyArray<CampaignMembership>, never, CurrentActor>;
    /**
     * Who is at this table, live members only — the roster the party screen
     * draws, and the DM's own read.
     *
     * **The proof carries the campaign, so there is no id to disagree with
     * it**, and the predicate still runs underneath: the `where` composes
     * `campaignWritableById`, which is the identical question `DmActors.of`
     * asked one line earlier. That looks redundant and is the point — the gate
     * is a precondition on the seam rather than a replacement for it, so a bug
     * in the gate degrades to today's behaviour instead of to an open door.
     * Same shape as every other gated read in the product.
     *
     * **A revoked membership is absent, not flagged.** Every predicate here
     * tests `revoked_at is null` and the index is over the same condition;
     * somebody who left is not at the table, and what the DM needs to know
     * about a withdrawal is on the invitation that granted it —
     * `CampaignInvite.status` reads `revoked` and names who took it.
     *
     * **It answers no question about characters, deliberately.** *"Marta has a
     * seat but no character"* is a member of this list with no `Character` in
     * `characters.list` whose `accountId` is theirs — one join on a list the
     * party screen reads anyway. A count here would be a second answer to that,
     * and one that is structurally `0` for every row until something populates
     * `character.account_id`; an absent field beats a stubbed one, which is the
     * rule the encounter card's `count` follows. `accountId` is on the wire so
     * the join has a key.
     */
    readonly list: (dm: DmActor) => Effect.Effect<ReadonlyArray<CampaignMember>, never, never>;
  }
>()("Memberships") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      /**
       * The one clause that decides which shelf a campaign is on.
       *
       * Written once and chosen by the argument, rather than as two spellings
       * of `archived_at` a few lines apart: the pair has to stay exact
       * complements, and two literals cannot be.
       */
      const onShelf = (shelf: CampaignShelf): Statement.Fragment =>
        shelf === "archived"
          ? sql`campaign.archived_at is not null`
          : sql`campaign.archived_at is null`;

      return {
        mine: (shelf) =>
          dieOnSqlError(
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
                where ${campaignReadable(sql, actor)} and ${onShelf(shelf)}
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

        list: (dm) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<MemberRow>`
                select campaign_member.account_id,
                       campaign_member.role,
                       campaign_member.created_at as joined_at,
                       account.name
                from campaign_member
                join account on account.id = campaign_member.account_id
                where campaign_member.campaign_id = ${dm.campaign}
                  and campaign_member.revoked_at is null
                  and ${campaignWritableById(sql, dm.campaign, dm.actor)}
                order by (campaign_member.role = 'dm') desc,
                         campaign_member.created_at asc,
                         campaign_member.account_id asc
              `;
              return rows.map(
                (row) =>
                  new CampaignMember({
                    accountId: row.account_id,
                    name: row.name,
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
