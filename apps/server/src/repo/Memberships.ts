import {
  type AccountId,
  type CampaignId,
  CampaignMember,
  CampaignMembership,
  type CampaignRelation,
  Conflict,
  CurrentActor,
  type GroupId,
  NotFound,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import type { SqlError, Statement } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql";
import { type CampaignRow, toCampaign } from "./Campaigns.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { dieOnSqlError } from "./rows.js";
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
 * - `revokeMemberAt` / `revokeAllInGroupFor` — the `where` structurally
 *   excludes any row whose account is the campaign's creator, so no bug
 *   upstream can turn "remove a player" into "unseat the DM". The composite
 *   key would refuse that anyway; this is the belt to its braces.
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
  groupId: GroupId,
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
  groupId: GroupId,
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
 * Revokes every live participation an account holds across one group's
 * campaigns — the campaign half of removing somebody from a group, run in the
 * same transaction as the `group_member` revoke so the deferred key holds.
 *
 * Creator rows are excluded by the same clause as everywhere else; the caller
 * (`repo/Groups.ts`) refuses the whole removal first when the account created
 * a campaign in the group, because `campaign_creator_in_group` would refuse it
 * at COMMIT anyway and a `Conflict` naming the reason beats a defect.
 */
export const revokeAllInGroupFor = (
  sql: SqlClient.SqlClient,
  groupId: GroupId,
  accountId: AccountId,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    yield* sql`
      update campaign_member set revoked_at = now()
      where campaign_member.group_id = ${groupId}
        and campaign_member.account_id = ${accountId}
        and campaign_member.revoked_at is null
        and ${notTheCreator(sql)}
    `;
    // Seats retire with the memberships — `revokeMemberAt`'s clause, across
    // the group. Scoped by `group_id` on the seat itself, which is the
    // campaign's own value by the composite key into `campaign`.
    yield* sql`
      update campaign_character set left_at = now(), updated_at = now()
      where campaign_character.group_id = ${groupId}
        and campaign_character.account_id = ${accountId}
        and campaign_character.left_at is null
    `;
  });

/**
 * Which shelf `mine` reads — the live tables, or the archived ones.
 *
 * Not on the wire, and that is the point: which shelf a caller gets is decided
 * by the URL they asked for. See the `me` group in `packages/api/src/Api.ts`.
 */
export type CampaignShelf = "live" | "archived";

interface MembershipRow extends CampaignRow {
  readonly is_creator: boolean;
  readonly joined_at: Date;
}

interface MemberRow {
  readonly account_id: AccountId;
  readonly name: string;
  readonly is_creator: boolean;
  readonly joined_at: Date;
}

const relationOf = (isCreator: boolean): CampaignRelation => (isCreator ? "creator" : "player");

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

      const onShelf = (shelf: CampaignShelf): Statement.Fragment =>
        shelf === "archived"
          ? sql`campaign.archived_at is not null`
          : sql`campaign.archived_at is null`;

      const memberNamed = (campaignId: CampaignId, accountId: AccountId) =>
        Effect.map(
          sql<MemberRow>`
            select campaign_member.account_id,
                   campaign_member.created_at as joined_at,
                   account.name,
                   (campaign.creator_account_id = campaign_member.account_id) as is_creator
            from campaign_member
            join account on account.id = campaign_member.account_id
            join campaign on campaign.id = campaign_member.campaign_id
            where campaign_member.campaign_id = ${campaignId}
              and campaign_member.account_id = ${accountId}
              and campaign_member.revoked_at is null
          `,
          (rows) => rows[0],
        );

      const toMember = (row: MemberRow): CampaignMember =>
        new CampaignMember({
          accountId: row.account_id,
          name: row.name,
          relation: relationOf(row.is_creator),
          joinedAt: DateTime.fromDateUnsafe(row.joined_at),
        });

      return {
        mine: (shelf) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<MembershipRow>`
                select campaign.*,
                       (campaign.creator_account_id = ${actor.accountId}) as is_creator,
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
                    relation: relationOf(row.is_creator),
                    joinedAt: DateTime.fromDateUnsafe(row.joined_at),
                  }),
              );
            }),
          ),

        list: (creator) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<MemberRow>`
                select campaign_member.account_id,
                       campaign_member.created_at as joined_at,
                       account.name,
                       (campaign.creator_account_id = campaign_member.account_id) as is_creator
                from campaign_member
                join account on account.id = campaign_member.account_id
                join campaign on campaign.id = campaign_member.campaign_id
                where campaign_member.campaign_id = ${creator.campaign}
                  and campaign_member.revoked_at is null
                  and ${campaignWritableById(sql, creator.campaign, creator.actor)}
                order by (campaign.creator_account_id = campaign_member.account_id) desc,
                         campaign_member.created_at asc,
                         campaign_member.account_id asc
              `;
              return rows.map(toMember);
            }),
          ),

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
                const row = yield* memberNamed(creator.campaign, accountId);
                if (row === undefined) {
                  return yield* new NotFound({ resource: "member", id: accountId });
                }
                return toMember(row);
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
