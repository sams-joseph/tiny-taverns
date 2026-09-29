import {
  AccountId,
  CampaignId,
  CampaignMember,
  CampaignMembership,
  CampaignRelation,
  CampaignSharedWorld,
  Conflict,
  CurrentActor,
  type SharedWorldId,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import type { SqlError, Statement } from "effect/unstable/sql";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { campaignImageColumns, campaignImageSigner, campaignRow } from "./Campaigns.js";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import { classFromColumns, classWithRow, dieOnSqlError, orNotFound } from "./rows.js";
import { campaignReadable, campaignWritableById, memberOfGroup } from "./visibility.js";

/**
 * `campaign_member`, the table that decides who participates in a campaign.
 *
 * There are two modules in `apps/server/src` that may name this table — this
 * one and `repo/visibility.ts`, which reads it — and
 * `apps/server/test/membership.test.ts` fails on a third.
 *
 * ### The row carries no role, and cannot
 *
 * The captain's decision of 2026-09-01: the campaign creator is its sole DM
 * (`campaign.creator_account_id`, immutable), and every other live participant
 * is a player. So `CampaignRelation` is **derived at read time** from the
 * creator column, never stored — a mutable role was the thing that made co-DM
 * semantics one UPDATE away, and it is gone rather than guarded.
 * `schema.test.ts` fails if a role column reappears here.
 *
 * ### Participation requires eligibility, structurally
 *
 * Every row here carries the campaign's `group_id` (bound to the campaign's
 * own by a composite key) and a deferred foreign key into a **live**
 * `group_member` row. A participant who is not a group member is not a state
 * this table can hold, and revoking somebody's group membership refuses until
 * the same transaction revokes their participations too — which is the
 * ordering `repo/Groups.ts` writes.
 *
 * ### The writers, and what each is bounded by
 *
 * - `addCreator` — the creator's own participation, inside
 *   `Campaigns.create`'s transaction. `campaign_creator_is_campaign_member`
 *   refuses a campaign written without it, and refuses revoking it later.
 * - `admitTo` — everybody else, called by `Invites.redeem` (with an account
 *   from `CurrentActor`) and by `Memberships.add` (with an account the creator
 *   named, checked against live group membership first). Reinstates a revoked
 *   row rather than erroring, so being invited back after leaving works and a
 *   double admit is a no-op.
 * - `revokeMemberAt` — the `where` structurally excludes any row whose account
 *   is the campaign's creator, so no bug upstream can turn "remove a player"
 *   into "unseat the DM". The composite key would refuse that anyway; this is
 *   the belt to its braces.
 */

/**
 * The clause that keeps every revocation off the creator's row. Written once:
 * two spellings of "not the creator" is how one of them comes to be wrong.
 */
const notTheCreator = (sql: SqlClient.SqlClient): Statement.Fragment =>
  sql`not exists (select 1 from campaign
                  where campaign.id = campaign_member.campaign_id
                    and campaign.creator_account_id = campaign_member.account_id)`;

/**
 * Records the account that created a campaign as a participant of it.
 *
 * Must run in the same transaction as the insert that created the campaign:
 * `campaign_creator_is_campaign_member` is deferred to COMMIT precisely so
 * these two statements can be in either order.
 */
export const addCreator = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  groupId: SharedWorldId,
  accountId: AccountId,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.asVoid(
    sql`
      insert into campaign_member (campaign_id, group_id, account_id)
      values (${campaignId}, ${groupId}, ${accountId})
    `,
  );

/**
 * Puts an account at a table as a participant.
 *
 * The conflict clause reinstates a **revoked** row and does nothing at all to
 * a live one, which is what makes admitting somebody who is already at the
 * table a harmless no-op instead of an error. It cannot demote anybody — there
 * is no role to write.
 */
export const admitTo = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  groupId: SharedWorldId,
  accountId: AccountId,
): Effect.Effect<boolean, SqlError.SqlError> =>
  Effect.map(
    sql<{ readonly campaign_id: CampaignId }>`
      insert into campaign_member (campaign_id, group_id, account_id)
      values (${campaignId}, ${groupId}, ${accountId})
      on conflict (campaign_id, account_id) do update
        set revoked_at = null
        where campaign_member.revoked_at is not null
      returning campaign_id
    `,
    (rows) => rows.length > 0,
  );

/** The live participants whose eligibility follows a campaign to a new context. */
export const liveMemberAccountIds = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
): Effect.Effect<ReadonlyArray<AccountId>, SqlError.SqlError> =>
  Effect.map(
    sql<{ readonly account_id: AccountId }>`
      select campaign_member.account_id
      from campaign_member
      where campaign_member.campaign_id = ${campaignId}
        and campaign_member.revoked_at is null
      order by campaign_member.created_at, campaign_member.account_id
    `,
    (rows) => rows.map((row) => row.account_id),
  );

/**
 * Takes a participant's reach away again. Structurally unable to touch the
 * creator's row — see `notTheCreator`. Answers how many rows moved, so the
 * caller can tell "removed" from "was not at the table".
 */
export const revokeMemberAt = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  accountId: AccountId,
): Effect.Effect<number, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<{ readonly campaign_id: CampaignId }>`
      update campaign_member set revoked_at = now()
      where campaign_member.campaign_id = ${campaignId}
        and campaign_member.account_id = ${accountId}
        and campaign_member.revoked_at is null
        and ${notTheCreator(sql)}
      returning campaign_member.campaign_id
    `;
    // Their seats retire with them, in the same transaction — the deferred
    // participation key (`campaign_character_member_fkey`) would refuse the
    // COMMIT otherwise, and it is also the honest answer: a character whose
    // player was removed is not at the table any more. The seat row stands as
    // history, which is what retiring rather than deleting buys.
    if (rows.length > 0) {
      yield* sql`
        update campaign_character set left_at = now(), updated_at = now()
        where campaign_character.campaign_id = ${campaignId}
          and campaign_character.account_id = ${accountId}
          and campaign_character.left_at is null
      `;
    }
    return rows.length;
  });

/**
 * Which shelf `mine` reads — the live tables, or the archived ones.
 *
 * Not on the wire, and that is the point: which shelf a caller gets is decided
 * by the URL they asked for. See the `me` group in `packages/api/src/Api.ts`.
 */
export type CampaignShelf = "live" | "archived";

/**
 * What an account is at a table, derived per row from the creator column —
 * `CampaignRelation` is never stored. `account` is the column holding the
 * account the row is about.
 */
const relationColumn = (sql: SqlClient.SqlClient, account: Statement.Fragment) =>
  sql`case when campaign.creator_account_id = ${account} then 'creator' else 'player' end
      as relation`;

/** A participant as the roster reads it: `campaign` and `account` must be in scope. */
const MemberRow = classFromColumns(CampaignMember, {
  ...CampaignMember.fields,
  relation: CampaignRelation,
  joinedAt: Schema.DateTimeUtcFromDate,
});

export class Memberships extends Context.Service<
  Memberships,
  {
    /**
     * Every table this credential reaches, and what this account is at each.
     *
     * **The predicate is `campaignReadable`, unchanged and uncomposed with
     * anything else**, so this cannot return a campaign `campaigns.list`
     * would not. For a player participant it still requires
     * `campaign.visibility = 'shared'` — the master toggle, and why
     * `InviteRedeemed` carries `shared`.
     *
     * The relation is **derived** from `campaign.creator_account_id`, per
     * row, because a person is the creator of one table and a player at
     * another on one credential.
     */
    readonly mine: (
      shelf: CampaignShelf,
    ) => Effect.Effect<ReadonlyArray<CampaignMembership>, never, CurrentActor>;
    /**
     * Who is at this table, live participants only — the roster the party
     * screen draws, and the creator's own read.
     *
     * The proof carries the campaign, so there is no id to disagree with it,
     * and the predicate still runs underneath — the gate is a precondition on
     * the seam, not a replacement for it.
     */
    readonly list: (
      creator: CampaignCreatorActor,
    ) => Effect.Effect<ReadonlyArray<CampaignMember>, never, never>;
    /**
     * The creator names a live member of the campaign's group as a
     * participant — the participation decision's write half.
     *
     * An account with no live membership of this group is a `NotFound` naming
     * the *member*: only somebody already holding the creator proof reaches
     * this, so "they are not in your group" is the useful answer rather than
     * a disclosure. Naming somebody already at the table is the same success,
     * like a double-tapped Join.
     */
    readonly add: (
      creator: CampaignCreatorActor,
      accountId: AccountId,
    ) => Effect.Effect<CampaignMember, NotFound, never>;
    /**
     * The creator removes a player. Removing themselves is a `Conflict` — a
     * campaign without its creator is unrepresentable, and the constraint
     * would refuse it at COMMIT; the honest answer names the reason first.
     */
    readonly remove: (
      creator: CampaignCreatorActor,
      accountId: AccountId,
    ) => Effect.Effect<void, NotFound | Conflict, never>;
  }
>()("Memberships") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const CampaignRow = campaignRow(yield* campaignImageSigner);

      const onShelf = (shelf: CampaignShelf): Statement.Fragment =>
        shelf === "archived"
          ? sql`campaign.archived_at is not null`
          : sql`campaign.archived_at is null`;

      /**
       * The reader's own tables, the campaign nested through the one campaign
       * decode (`campaignRow`), which signs covers exactly as `Campaigns` does,
       * for the campaigns this read's own predicate returned.
       */
      const tables = SqlSchema.findAll({
        Request: Schema.Literals(["live", "archived"]),
        Result: classWithRow(CampaignMembership, "campaign", CampaignRow, {
          relation: CampaignRelation,
          sharedWorld: Schema.NullOr(CampaignSharedWorld),
          joinedAt: Schema.DateTimeUtcFromDate,
        }),
        execute: (shelf) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select campaign.*,
                     ${campaignImageColumns(sql)},
                     ${relationColumn(sql, sql`${actor.accountId}`)},
                     campaign_member.created_at as joined_at,
                     case when play_group.is_shared_world
                       then json_build_object('id', play_group.id, 'name', play_group.name)
                     end as shared_world
              from campaign
              join play_group on play_group.id = campaign.group_id
              join campaign_member
                on campaign_member.campaign_id = campaign.id
               and campaign_member.account_id = ${actor.accountId}
               and campaign_member.revoked_at is null
              where ${campaignReadable(sql, actor)} and ${onShelf(shelf)}
              order by campaign.created_at desc
            `,
          ),
      });
      const roster = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(creatorFields)),
        Result: MemberRow,
        execute: ({ campaign, actor }) => sql`
          select campaign_member.account_id,
                 campaign_member.created_at as joined_at,
                 account.name,
                 ${relationColumn(sql, sql`campaign_member.account_id`)}
          from campaign_member
          join account on account.id = campaign_member.account_id
          join campaign on campaign.id = campaign_member.campaign_id
          where campaign_member.campaign_id = ${campaign}
            and campaign_member.revoked_at is null
            and ${campaignWritableById(sql, campaign, actor)}
          order by (campaign.creator_account_id = campaign_member.account_id) desc,
                   campaign_member.created_at asc,
                   campaign_member.account_id asc
        `,
      });
      /** One live participant, by the campaign and account the caller already holds. */
      const memberNamed = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, accountId: AccountId })),
        Result: MemberRow,
        execute: ({ campaignId, accountId }) => sql`
          select campaign_member.account_id,
                 campaign_member.created_at as joined_at,
                 account.name,
                 ${relationColumn(sql, sql`campaign_member.account_id`)}
          from campaign_member
          join account on account.id = campaign_member.account_id
          join campaign on campaign.id = campaign_member.campaign_id
          where campaign_member.campaign_id = ${campaignId}
            and campaign_member.account_id = ${accountId}
            and campaign_member.revoked_at is null
        `,
      });

      return {
        mine: (shelf) => dieOnSqlError(tables(shelf)),

        list: (creator) => dieOnSqlError(roster(asked(creator))),

        add: (creator, accountId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                // The named account must be a live member of this campaign's
                // group — eligibility before participation, checked here so
                // the refusal is a typed answer rather than the deferred
                // foreign key's defect at COMMIT.
                const eligible = yield* sql<{ readonly ok: boolean }>`
                  select ${memberOfGroup(sql, creator.group, accountId)} as ok
                `;
                if (eligible[0]?.ok !== true) {
                  return yield* new NotFound({ resource: "member", id: accountId });
                }
                yield* admitTo(sql, creator.campaign, creator.group, accountId);
                return yield* memberNamed({ campaignId: creator.campaign, accountId }).pipe(
                  orNotFound("member", accountId),
                );
              }),
            ),
          ),

        remove: (creator, accountId) =>
          dieOnSqlError(
            // One transaction, because `revokeMemberAt` is two statements now
            // — the revoke and the seat retirement — and the deferred
            // participation key checks them together at COMMIT. Under
            // autocommit the first alone would be refused on the spot.
            sql.withTransaction(
              Effect.gen(function* () {
                if (accountId === creator.actor.accountId) {
                  return yield* new Conflict({
                    message: "a campaign cannot lose its creator; archive the campaign instead",
                  });
                }
                const revoked = yield* revokeMemberAt(sql, creator.campaign, accountId);
                if (revoked === 0) {
                  return yield* new NotFound({ resource: "member", id: accountId });
                }
              }),
            ),
          ),
      };
    }),
  );
}
