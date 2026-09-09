import {
  type AccountId,
  type CampaignId,
  Conflict,
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
import { revokeAllInGroupFor } from "./Memberships.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { defined, dieOnSqlError, setClause } from "./rows.js";
import {
  ensureGroupReadable,
  ensureGroupWritable,
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
 * ### Governance, structurally
 *
 * The owner manages membership and invitations (the captain's decision of
 * 2026-09-01) — so every write here except `create` composes `groupWritable`,
 * whose authority half is `play_group.owner_account_id`. There is no admin
 * role, no role column, and no way to delegate; when delegation is wanted it
 * must arrive as its own deliberate act.
 *
 * ### Membership writers
 *
 * - `addOwnerMember` — the owner's own membership, inside `create`'s
 *   transaction; `play_group_owner_is_member` refuses a group without it.
 * - `admitToGroup` — everybody else, called by `Invites.redeem` and reinstating
 *   a revoked row so an invited-back member is a member again.
 * - `removeFromGroup` — the one remover, used by member removal and by
 *   revoking a spent invitation. It revokes campaign participations in the
 *   same transaction (the deferred keys demand it) and **refuses** when the
 *   account created a campaign in the group: their campaigns pin their
 *   membership — `campaign_creator_in_group` would refuse at COMMIT anyway,
 *   and a typed `Conflict` naming the reason beats a defect.
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

/**
 * Ends a membership: campaign participations first, then the group row, one
 * transaction (the caller's — this runs inside `sql.withTransaction`).
 *
 * Refuses the group owner and any campaign creator with a `Conflict`: the
 * schema pins both (`play_group_owner_is_member`, `campaign_creator_in_group`),
 * so the refusal here is the typed spelling of what COMMIT would refuse
 * anyway. Answers how many memberships moved, so a caller can tell "removed"
 * from "was not a member".
 */
export const removeFromGroup = (
  sql: SqlClient.SqlClient,
  groupId: GroupId,
  accountId: AccountId,
): Effect.Effect<number, SqlError.SqlError | Conflict> =>
  Effect.gen(function* () {
    const pinned = yield* sql<{ readonly owner: boolean; readonly creator: boolean }>`
      select
        exists (select 1 from play_group
                where play_group.id = ${groupId}
                  and play_group.owner_account_id = ${accountId}) as owner,
        exists (select 1 from campaign
                where campaign.group_id = ${groupId}
                  and campaign.creator_account_id = ${accountId}) as creator
    `;
    if (pinned[0]?.owner === true) {
      return yield* new Conflict({ message: "a group cannot lose its owner" });
    }
    if (pinned[0]?.creator === true) {
      return yield* new Conflict({
        message: "they created a campaign in this group, which keeps them a member",
      });
    }
    yield* revokeAllInGroupFor(sql, groupId, accountId);
    const rows = yield* sql<{ readonly group_id: GroupId }>`
      update group_member set revoked_at = now()
      where group_member.group_id = ${groupId}
        and group_member.account_id = ${accountId}
        and group_member.revoked_at is null
      returning group_member.group_id
    `;
    return rows.length;
  });

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
    /** The owner ends somebody's membership. See `removeFromGroup`. */
    readonly removeMember: (
      id: GroupId,
      accountId: AccountId,
    ) => Effect.Effect<void, NotFound | Conflict, CurrentActor>;
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

        removeMember: (id, accountId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureGroupWritable(sql, id, actor);
                const removed = yield* removeFromGroup(sql, id, accountId);
                if (removed === 0) {
                  return yield* new NotFound({ resource: "member", id: accountId });
                }
              }),
            ),
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
