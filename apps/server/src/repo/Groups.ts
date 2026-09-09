import {
  type AccountId,
  type CampaignId,
  CurrentActor,
  Group,
  GroupCampaignCard,
  type GroupCampaignRelation,
  type GroupCreate,
  type GroupId,
  GroupMember,
  GroupMembership,
  type GroupUpdate,
  NotFound,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import type { SqlError } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { defined, dieOnSqlError, setClause } from "./rows.js";
import {
  ensureGroupReadable,
  groupReadable,
  groupWritable,
  memberOfCampaign,
} from "./visibility.js";

/**
 * `play_group` and `group_member` — the group and who is in it.
 *
 * This module and `repo/visibility.ts` are the only two in `src` that may name
 * `group_member`, the same rule `campaign_member` lives under and for the same
 * reason: group membership is the thing that decides what an account is
 * eligible to reach, and a third writer is where the next leak lives.
 * `membership.test.ts` enforces it.
 *
 * ### Membership writers
 *
 * - `addOwnerMember` — the owner's own membership, inside `create`'s
 *   transaction; `play_group_owner_is_member` refuses a group without it.
 * - `admitToGroup` — everybody else, called by `Invites.redeem` and reinstating
 *   a revoked row so an invited-back member is a member again.
 * There is no world-level remover: campaign creators govern participation at
 * their own tables, and eligibility remains while any Shared World context may
 * still refer to the account.
 */

/** The owner's membership, in `create`'s transaction. */
const addOwnerMember = (
  sql: SqlClient.SqlClient,
  groupId: GroupId,
  accountId: AccountId,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.asVoid(
    sql`insert into group_member (group_id, account_id) values (${groupId}, ${accountId})`,
  );

/**
 * Creates the group row and its structurally required owner membership inside
 * the caller's transaction.
 *
 * Exported for `Campaigns.createStandalone`: the campaign-first façade still
 * uses a private one-campaign group until Shared Worlds replace the group
 * schema, but the group membership table keeps one writer module throughout
 * that transition.
 */
export const foundGroup = (
  sql: SqlClient.SqlClient,
  name: string,
  ownerAccountId: AccountId,
  isSharedWorld = false,
): Effect.Effect<Group, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<GroupRow>`
      insert into play_group ${sql.insert(
        defined({ owner_account_id: ownerAccountId, name, is_shared_world: isSharedWorld }),
      )}
      returning *
    `;
    yield* addOwnerMember(sql, rows[0]!.id, ownerAccountId);
    return toGroup(rows[0]!);
  });

/**
 * Puts an account in a group. Reinstates a revoked membership rather than
 * erroring, so redeeming a fresh invitation after leaving works, and admitting
 * a live member is a no-op.
 */
export const admitToGroup = (
  sql: SqlClient.SqlClient,
  groupId: GroupId,
  accountId: AccountId,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.asVoid(
    sql`
      insert into group_member (group_id, account_id) values (${groupId}, ${accountId})
      on conflict (group_id, account_id) do update
        set revoked_at = null
        where group_member.revoked_at is not null
    `,
  );

interface GroupRow {
  readonly id: GroupId;
  readonly owner_account_id: AccountId;
  readonly name: string;
  readonly is_shared_world: boolean;
  readonly archived_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** One mapper per table — imported wherever a second read needs it. */
export const toGroup = (row: GroupRow): Group =>
  new Group({
    id: row.id,
    name: row.name,
    isSharedWorld: row.is_shared_world,
    ownerAccountId: row.owner_account_id,
    archivedAt: row.archived_at === null ? null : DateTime.fromDateUnsafe(row.archived_at),
    createdAt: DateTime.fromDateUnsafe(row.created_at),
    updatedAt: DateTime.fromDateUnsafe(row.updated_at),
  });

interface GroupMembershipRow extends GroupRow {
  readonly joined_at: Date;
}

interface GroupMemberRow {
  readonly account_id: AccountId;
  readonly name: string;
  readonly is_owner: boolean;
  readonly joined_at: Date;
}

interface CampaignCardRow {
  readonly id: CampaignId;
  readonly group_id: GroupId;
  readonly creator_account_id: AccountId;
  readonly creator_name: string;
  readonly name: string;
  readonly relation: GroupCampaignRelation;
  readonly archived_at: Date | null;
  readonly created_at: Date;
}

export class Groups extends Context.Service<
  Groups,
  {
    /** Every group this account is a live member of. */
    readonly mine: Effect.Effect<ReadonlyArray<GroupMembership>, never, CurrentActor>;
    readonly findById: (id: GroupId) => Effect.Effect<Group, NotFound, CurrentActor>;
    /** Anybody may found a group; they become its owner and first member. */
    readonly create: (payload: GroupCreate) => Effect.Effect<Group, never, CurrentActor>;
    /** Turns a standalone campaign's hidden context into an explicit Shared World. */
    readonly promote: (
      creator: CampaignCreatorActor,
      payload: GroupCreate,
    ) => Effect.Effect<Group, NotFound>;
    readonly update: (
      id: GroupId,
      patch: GroupUpdate,
    ) => Effect.Effect<Group, NotFound, CurrentActor>;
    readonly archive: (id: GroupId) => Effect.Effect<Group, NotFound, CurrentActor>;
    readonly restore: (id: GroupId) => Effect.Effect<Group, NotFound, CurrentActor>;
    /**
     * The group's roster — every live member's read, unlike a campaign's,
     * because the group is the social container and its roster is what it is.
     */
    readonly members: (
      id: GroupId,
    ) => Effect.Effect<ReadonlyArray<GroupMember>, NotFound, CurrentActor>;
    /**
     * The directory: every campaign in the group, as a narrow card, to every
     * live member — with this reader's own relation to each. Content still
     * goes through `campaignReadable`; see `GroupCampaignCard`.
     */
    readonly campaigns: (
      id: GroupId,
    ) => Effect.Effect<ReadonlyArray<GroupCampaignCard>, NotFound, CurrentActor>;
  }
>()("Groups") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const one = (rows: ReadonlyArray<GroupRow>, id: GroupId) =>
        rows.length === 0
          ? Effect.fail(new NotFound({ resource: "group", id }))
          : Effect.succeed(toGroup(rows[0]!));

      return {
        mine: dieOnSqlError(
          Effect.gen(function* () {
            const actor = yield* CurrentActor;
            const rows = yield* sql<GroupMembershipRow>`
              select play_group.*, group_member.created_at as joined_at
              from play_group
              join group_member
                on group_member.group_id = play_group.id
               and group_member.account_id = ${actor.accountId}
               and group_member.revoked_at is null
              where ${groupReadable(sql, actor)}
                and play_group.archived_at is null
                and play_group.is_shared_world
              order by play_group.created_at desc
            `;
            return rows.map(
              (row) =>
                new GroupMembership({
                  group: toGroup(row),
                  isOwner: row.owner_account_id === actor.accountId,
                  joinedAt: DateTime.fromDateUnsafe(row.joined_at),
                }),
            );
          }),
        ),

        findById: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<GroupRow>`
                select * from play_group
                where play_group.id = ${id} and ${groupReadable(sql, actor, id)}
              `;
              return yield* one(rows, id);
            }),
          ),

        create: (payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                return yield* foundGroup(sql, payload.name, actor.accountId, true);
              }),
            ),
          ),

        promote: (creator, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* sql<GroupRow>`
                update play_group
                set name = ${payload.name}, is_shared_world = true, updated_at = now()
                where play_group.id = ${creator.group}
                  and play_group.owner_account_id = ${creator.actor.accountId}
                  and play_group.archived_at is null
                returning *
              `;
              return yield* one(rows, creator.group);
            }),
          ),

        update: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({ name: patch.name });
              const rows = yield* sql<GroupRow>`
                update play_group set ${setClause(sql, columns)}
                where play_group.id = ${id} and ${groupWritable(sql, actor, id)}
                returning *
              `;
              return yield* one(rows, id);
            }),
          ),

        archive: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<GroupRow>`
                update play_group set archived_at = now(), updated_at = now()
                where play_group.id = ${id} and ${groupWritable(sql, actor, id)}
                returning *
              `;
              return yield* one(rows, id);
            }),
          ),

        restore: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<GroupRow>`
                update play_group set archived_at = null, updated_at = now()
                where play_group.id = ${id} and ${groupWritable(sql, actor, id)}
                returning *
              `;
              return yield* one(rows, id);
            }),
          ),

        members: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, id, actor);
              const rows = yield* sql<GroupMemberRow>`
                select group_member.account_id,
                       group_member.created_at as joined_at,
                       account.name,
                       (play_group.owner_account_id = group_member.account_id) as is_owner
                from group_member
                join account on account.id = group_member.account_id
                join play_group on play_group.id = group_member.group_id
                where group_member.group_id = ${id}
                  and group_member.revoked_at is null
                order by (play_group.owner_account_id = group_member.account_id) desc,
                         group_member.created_at asc,
                         group_member.account_id asc
              `;
              return rows.map(
                (row) =>
                  new GroupMember({
                    accountId: row.account_id,
                    name: row.name,
                    isOwner: row.is_owner,
                    joinedAt: DateTime.fromDateUnsafe(row.joined_at),
                  }),
              );
            }),
          ),

        campaigns: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, id, actor);
              const rows = yield* sql<CampaignCardRow>`
                select campaign.id,
                       campaign.group_id,
                       campaign.creator_account_id,
                       campaign.name,
                       campaign.archived_at,
                       campaign.created_at,
                       account.name as creator_name,
                       case
                         when campaign.creator_account_id = ${actor.accountId} then 'creator'
                         when ${memberOfCampaign(sql, sql("campaign.id"), actor.accountId)} then 'player'
                         else 'none'
                       end as relation
                from campaign
                join account on account.id = campaign.creator_account_id
                where campaign.group_id = ${id}
                order by campaign.created_at desc
              `;
              return rows.map(
                (row) =>
                  new GroupCampaignCard({
                    id: row.id,
                    groupId: row.group_id,
                    creatorAccountId: row.creator_account_id,
                    creatorName: row.creator_name,
                    name: row.name,
                    relation: row.relation,
                    archivedAt:
                      row.archived_at === null ? null : DateTime.fromDateUnsafe(row.archived_at),
                    createdAt: DateTime.fromDateUnsafe(row.created_at),
                  }),
              );
            }),
          ),
      };
    }),
  );
}
