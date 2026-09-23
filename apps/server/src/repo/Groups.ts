import {
  type AccountId,
  type CampaignId,
  Conflict,
  CurrentActor,
  SharedWorld,
  SharedWorldCampaignCard,
  type SharedWorldCampaignRelation,
  type SharedWorldCreate,
  type SharedWorldId,
  SharedWorldImages,
  SharedWorldMember,
  SharedWorldMembership,
  type SharedWorldUpdate,
  NotFound,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import type { SqlError } from "effect/unstable/sql";
import { SqlClient } from "effect/unstable/sql";
import { type ImageSigner, imageSigner } from "../images/ImageUrls.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { liveMemberAccountIds } from "./Memberships.js";
import { defined, dieOnSqlError, proseColumn, setClause } from "./rows.js";
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
 * `group_member`, the same rule campaign participation lives under and for the same
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
  groupId: SharedWorldId,
  accountId: AccountId,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.asVoid(
    sql`insert into group_member (group_id, account_id) values (${groupId}, ${accountId})`,
  );

/**
 * Creates the group row and its structurally required owner membership inside
 * the caller's transaction. A campaign's hidden context is founded with a name
 * alone; a description belongs to a world somebody made on purpose.
 *
 * Exported for `Campaigns.createStandalone`: the campaign-first façade still
 * uses a private one-campaign group until Shared Worlds replace the group
 * schema, but the group membership table keeps one writer module throughout
 * that transition.
 */
export const foundGroup = (
  sql: SqlClient.SqlClient,
  world: { readonly name: string; readonly description?: string | undefined },
  ownerAccountId: AccountId,
  isSharedWorld = false,
): Effect.Effect<SharedWorld, SqlError.SqlError> =>
  Effect.gen(function* () {
    const rows = yield* sql<GroupRow>`
      insert into play_group ${sql.insert(
        defined({
          owner_account_id: ownerAccountId,
          name: world.name,
          description: proseColumn(world.description),
          is_shared_world: isSharedWorld,
        }),
      )}
      returning *, ${sharedWorldImageColumns(sql, "play_group")}
    `;
    yield* addOwnerMember(sql, rows[0]!.id, ownerAccountId);
    // Founded by this statement, so it has no cover to sign yet; its creator's
    // handler starts the draw after the commit (`HobImages.drawSharedWorld`).
    return toGroup(rows[0]!, undefined);
  });

/**
 * Puts an account in a group. Reinstates a revoked membership rather than
 * erroring, so redeeming a fresh invitation after leaving works, and admitting
 * a live member is a no-op.
 */
export const admitToGroup = (
  sql: SqlClient.SqlClient,
  groupId: SharedWorldId,
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
  readonly id: SharedWorldId;
  readonly owner_account_id: AccountId;
  readonly name: string;
  readonly description: string | null;
  readonly is_shared_world: boolean;
  readonly archived_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  /** From {@link sharedWorldImageColumns}; `null` when the world has no cover record. */
  readonly image_id: string | null;
  readonly image_state: "generating" | "ready" | "failed" | null;
}

/**
 * The cover's two facts beside a `play_group` row, as scalar subqueries, the
 * way `campaignImageColumns` sits beside a campaign. **Every read that becomes
 * a `SharedWorld` names this fragment**: `toGroup` dies on a row without it.
 * `world` is the name the statement gives the `play_group` row it returns.
 */
const sharedWorldImageColumns = (sql: SqlClient.SqlClient, world: string) => sql`
  (select shared_world_image.id from shared_world_image
   where shared_world_image.group_id = ${sql(`${world}.id`)}) as image_id,
  (select shared_world_image.state from shared_world_image
   where shared_world_image.group_id = ${sql(`${world}.id`)}) as image_state
`;

/** Signs a ready cover's paths; the Shared World kind of `ImageUrls.pathsFor`. */
type SharedWorldImageSigner = (imageId: string) => SharedWorld["image"];

/** The signer a repository layer was built with, or `undefined`, which mints nothing. */
const sharedWorldImageSigner: Effect.Effect<SharedWorldImageSigner | undefined> = Effect.map(
  imageSigner,
  (sign: ImageSigner | undefined) =>
    sign === undefined
      ? undefined
      : (imageId) => {
          const paths = sign("sharedWorld", imageId);
          return paths === null
            ? null
            : new SharedWorldImages({ cardUrl: paths.card, fullUrl: paths.full });
        },
);

/**
 * One mapper per table.
 *
 * **The only place a Shared World's cover URL is minted**, from a row whose own
 * SQL already returned the world to this reader (`groupReadable` or
 * `groupWritable`), which is what makes cover visibility exactly world
 * visibility.
 */
const toGroup = (row: GroupRow, sign: SharedWorldImageSigner | undefined): SharedWorld => {
  if (row.image_state === undefined) {
    throw new Error("a Shared World read did not select sharedWorldImageColumns");
  }
  const imageId = row.image_state === "ready" ? row.image_id : null;
  return new SharedWorld({
    id: row.id,
    name: row.name,
    description: row.description,
    ownerAccountId: row.owner_account_id,
    image: imageId !== null && sign !== undefined ? sign(imageId) : null,
    imagePending: row.image_state === "generating",
    archivedAt: row.archived_at === null ? null : DateTime.fromDateUnsafe(row.archived_at),
    createdAt: DateTime.fromDateUnsafe(row.created_at),
    updatedAt: DateTime.fromDateUnsafe(row.updated_at),
  });
};

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
  readonly group_id: SharedWorldId;
  readonly creator_account_id: AccountId;
  readonly creator_name: string;
  readonly name: string;
  readonly relation: SharedWorldCampaignRelation;
  readonly archived_at: Date | null;
  readonly created_at: Date;
}

export class Groups extends Context.Service<
  Groups,
  {
    /** Every group this account is a live member of. */
    readonly mine: Effect.Effect<ReadonlyArray<SharedWorldMembership>, never, CurrentActor>;
    /** Archived explicit worlds owned by this account, for restoration. */
    readonly archived: Effect.Effect<ReadonlyArray<SharedWorld>, never, CurrentActor>;
    readonly findById: (id: SharedWorldId) => Effect.Effect<SharedWorld, NotFound, CurrentActor>;
    /** Anybody may found a group; they become its owner and first member. */
    readonly create: (
      payload: SharedWorldCreate,
    ) => Effect.Effect<SharedWorld, never, CurrentActor>;
    /** Turns a standalone campaign's hidden context into an explicit Shared World. */
    readonly promote: (
      creator: CampaignCreatorActor,
      payload: SharedWorldCreate,
    ) => Effect.Effect<SharedWorld, NotFound>;
    /** Moves a standalone campaign into an existing Shared World owned by its creator. */
    readonly connect: (
      creator: CampaignCreatorActor,
      worldId: SharedWorldId,
    ) => Effect.Effect<SharedWorld, NotFound>;
    /** Moves a connected campaign directly into another owned Shared World. */
    readonly move: (
      creator: CampaignCreatorActor,
      worldId: SharedWorldId,
    ) => Effect.Effect<SharedWorld, NotFound>;
    readonly update: (
      id: SharedWorldId,
      patch: SharedWorldUpdate,
    ) => Effect.Effect<SharedWorld, NotFound, CurrentActor>;
    readonly archive: (
      id: SharedWorldId,
    ) => Effect.Effect<SharedWorld, NotFound | Conflict, CurrentActor>;
    readonly restore: (id: SharedWorldId) => Effect.Effect<SharedWorld, NotFound, CurrentActor>;
    /**
     * The group's roster — every live member's read, unlike a campaign's,
     * because the group is the social container and its roster is what it is.
     */
    readonly members: (
      id: SharedWorldId,
    ) => Effect.Effect<ReadonlyArray<SharedWorldMember>, NotFound, CurrentActor>;
    /**
     * The directory: every campaign in the group, as a narrow card, to every
     * live member — with this reader's own relation to each. Content still
     * goes through `campaignReadable`; see `SharedWorldCampaignCard`.
     */
    readonly campaigns: (
      id: SharedWorldId,
    ) => Effect.Effect<ReadonlyArray<SharedWorldCampaignCard>, NotFound, CurrentActor>;
  }
>()("Groups") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const sign = yield* sharedWorldImageSigner;
      const asWorld = (row: GroupRow): SharedWorld => toGroup(row, sign);
      const imageColumns = sharedWorldImageColumns(sql, "play_group");
      const destinationImageColumns = sharedWorldImageColumns(sql, "destination");

      const one = (rows: ReadonlyArray<GroupRow>, id: SharedWorldId) =>
        rows.length === 0
          ? Effect.fail(new NotFound({ resource: "shared-world", id }))
          : Effect.succeed(asWorld(rows[0]!));

      return {
        mine: dieOnSqlError(
          Effect.gen(function* () {
            const actor = yield* CurrentActor;
            const rows = yield* sql<GroupMembershipRow>`
              select play_group.*, ${imageColumns}, group_member.created_at as joined_at
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
                new SharedWorldMembership({
                  sharedWorld: asWorld(row),
                  isOwner: row.owner_account_id === actor.accountId,
                  joinedAt: DateTime.fromDateUnsafe(row.joined_at),
                }),
            );
          }),
        ),

        archived: dieOnSqlError(
          Effect.gen(function* () {
            const actor = yield* CurrentActor;
            const rows = yield* sql<GroupRow>`
              select play_group.*, ${imageColumns} from play_group
              where play_group.owner_account_id = ${actor.accountId}
                and ${groupReadable(sql, actor)}
                and play_group.is_shared_world
                and play_group.archived_at is not null
              order by play_group.archived_at desc, play_group.created_at desc
            `;
            return rows.map(asWorld);
          }),
        ),

        findById: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<GroupRow>`
                select play_group.*, ${imageColumns} from play_group
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
                return yield* foundGroup(sql, payload, actor.accountId, true);
              }),
            ),
          ),

        promote: (creator, payload) =>
          dieOnSqlError(
            Effect.gen(function* () {
              // A hidden context has never had a description, so one given
              // here is its first; none given leaves it without.
              const columns = defined({
                name: payload.name,
                description: proseColumn(payload.description),
                is_shared_world: true,
              });
              const rows = yield* sql<GroupRow>`
                update play_group
                set ${setClause(sql, columns)}
                where play_group.id = ${creator.group}
                  and play_group.owner_account_id = ${creator.actor.accountId}
                  and play_group.archived_at is null
                returning play_group.*, ${imageColumns}
              `;
              return yield* one(rows, creator.group);
            }),
          ),

        connect: (creator, worldId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const destinations = yield* sql<GroupRow>`
                  select destination.*, ${destinationImageColumns}
                  from campaign
                  join play_group as source on source.id = campaign.group_id
                  cross join play_group as destination
                  where campaign.id = ${creator.campaign}
                    and campaign.group_id = ${creator.group}
                    and campaign.creator_account_id = ${creator.actor.accountId}
                    and source.owner_account_id = ${creator.actor.accountId}
                    and not source.is_shared_world
                    and source.archived_at is null
                    and destination.id = ${worldId}
                    and destination.owner_account_id = ${creator.actor.accountId}
                    and destination.is_shared_world
                    and destination.archived_at is null
                  for update of campaign, source, destination
                `;
                if (destinations.length === 0) {
                  return yield* new NotFound({ resource: "shared-world", id: worldId });
                }

                // Participation is the set that follows the campaign. World
                // eligibility remains plumbing, so every live participant is
                // admitted (or restored) before the deferred keys inspect the
                // moved rows at commit.
                const participants = yield* liveMemberAccountIds(sql, creator.campaign);
                yield* Effect.forEach(
                  participants,
                  (accountId) => admitToGroup(sql, worldId, accountId),
                  { discard: true },
                );

                const moved = yield* sql<{ readonly id: CampaignId }>`
                  update campaign
                  set group_id = ${worldId}, updated_at = now()
                  where campaign.id = ${creator.campaign}
                    and campaign.group_id = ${creator.group}
                  returning campaign.id
                `;
                if (moved.length === 0) {
                  return yield* new NotFound({ resource: "campaign", id: creator.campaign });
                }

                // Automatic contexts contain one campaign by construction.
                // Once it has moved, the context and its eligibility rows are
                // no longer product state.
                yield* sql`
                  delete from play_group
                  where play_group.id = ${creator.group}
                    and not play_group.is_shared_world
                    and not exists (
                      select 1 from campaign where campaign.group_id = play_group.id
                    )
                `;

                return asWorld(destinations[0]!);
              }),
            ),
          ),

        move: (creator, worldId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const destinations = yield* sql<GroupRow>`
                  select destination.*, ${destinationImageColumns}
                  from campaign
                  join play_group as source on source.id = campaign.group_id
                  cross join play_group as destination
                  where campaign.id = ${creator.campaign}
                    and campaign.group_id = ${creator.group}
                    and campaign.creator_account_id = ${creator.actor.accountId}
                    and source.is_shared_world
                    and destination.id = ${worldId}
                    and destination.id <> source.id
                    and destination.owner_account_id = ${creator.actor.accountId}
                    and destination.is_shared_world
                    and destination.archived_at is null
                  for update of campaign, source, destination
                `;
                if (destinations.length === 0) {
                  return yield* new NotFound({ resource: "shared-world", id: worldId });
                }

                const participants = yield* liveMemberAccountIds(sql, creator.campaign);
                yield* Effect.forEach(
                  participants,
                  (accountId) => admitToGroup(sql, worldId, accountId),
                  { discard: true },
                );

                const moved = yield* sql<{ readonly id: CampaignId }>`
                  update campaign
                  set group_id = ${worldId}, updated_at = now()
                  where campaign.id = ${creator.campaign}
                    and campaign.group_id = ${creator.group}
                  returning campaign.id
                `;
                if (moved.length === 0) {
                  return yield* new NotFound({ resource: "campaign", id: creator.campaign });
                }

                return asWorld(destinations[0]!);
              }),
            ),
          ),

        update: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const columns = defined({
                name: patch.name,
                description: proseColumn(patch.description),
              });
              const rows = yield* sql<GroupRow>`
                update play_group set ${setClause(sql, columns)}
                where play_group.id = ${id} and ${groupWritable(sql, actor, id)}
                returning play_group.*, ${imageColumns}
              `;
              return yield* one(rows, id);
            }),
          ),

        archive: (id) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const worlds = yield* sql<{ readonly id: SharedWorldId }>`
                  select play_group.id from play_group
                  where play_group.id = ${id} and ${groupWritable(sql, actor, id)}
                  for update
                `;
                if (worlds.length === 0) {
                  return yield* new NotFound({ resource: "shared-world", id });
                }

                const campaigns = yield* sql<{ readonly exists: boolean }>`
                  select exists (
                    select 1 from campaign where campaign.group_id = ${id}
                  ) as exists
                `;
                if (campaigns[0]!.exists) {
                  return yield* new Conflict({
                    message: "move every campaign out of this Shared World before archiving it",
                  });
                }

                const rows = yield* sql<GroupRow>`
                  update play_group set archived_at = now(), updated_at = now()
                  where play_group.id = ${id}
                  returning play_group.*, ${imageColumns}
                `;
                return asWorld(rows[0]!);
              }),
            ),
          ),

        restore: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<GroupRow>`
                update play_group set archived_at = null, updated_at = now()
                where play_group.id = ${id} and ${groupWritable(sql, actor, id)}
                returning play_group.*, ${imageColumns}
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
                  new SharedWorldMember({
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
                  new SharedWorldCampaignCard({
                    id: row.id,
                    worldId: row.group_id,
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
