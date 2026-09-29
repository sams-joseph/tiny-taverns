import {
  AccountId,
  Actor,
  Campaign,
  CampaignId,
  Conflict,
  CurrentActor,
  SharedWorld,
  SharedWorldCampaignCard,
  type SharedWorldCreate,
  SharedWorldId,
  SharedWorldImages,
  SharedWorldMember,
  SharedWorldMembership,
  type SharedWorldUpdate,
  NotFound,
} from "@taverns/api";
import { Context, Effect, Layer, Schema, SchemaGetter, SchemaTransformation, Struct } from "effect";
import { SqlClient, type SqlError, SqlSchema } from "effect/unstable/sql";
import { type ImageSigner, imageSigner } from "../images/ImageUrls.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { liveMemberAccountIds } from "./Memberships.js";
import {
  type AssistantOrigin,
  assistantColumns,
  classFromColumns,
  classWithRow,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  proseColumn,
  setClause,
  timestampColumns,
} from "./rows.js";
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
  from?: AssistantOrigin,
): Effect.Effect<SharedWorld, SqlError.SqlError | Schema.SchemaError> =>
  Effect.gen(function* () {
    // An insert answers with its row; not getting one is a defect.
    const group = yield* SqlSchema.findOne({
      Request: Columns,
      // Founded by this statement, so it has no cover to sign yet; its
      // creator's handler starts the draw after the commit
      // (`HobImages.drawSharedWorld`).
      Result: UnsignedGroupRow,
      execute: (columns) => sql`
        insert into play_group ${sql.insert(columns)}
        returning *, ${sharedWorldImageColumns(sql, "play_group")}
      `,
    })(
      defined({
        owner_account_id: ownerAccountId,
        name: world.name,
        description: proseColumn(world.description),
        is_shared_world: isSharedWorld,
        ...assistantColumns(from),
      }),
    ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
    yield* addOwnerMember(sql, group.id, ownerAccountId);
    return group;
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

/**
 * Gives a campaign a fresh hidden context of its creator's and moves it there.
 * The context is founded, every live participant is admitted, and the campaign
 * is repointed; the `on update cascade` keys carry memberships, seats and
 * invitations along (`0053_campaign_move_keys.ts`). Membership of the context
 * it leaves is not revoked.
 *
 * The caller holds the campaign's row lock. `Campaigns.disconnectSharedWorld`
 * and `Groups.deletePermanently` both call this, so a table leaves a Shared
 * World the same way whoever sends it.
 */
export const moveToOwnContext = (
  sql: SqlClient.SqlClient,
  campaign: MovingCampaign,
): Effect.Effect<void, SqlError.SqlError | Schema.SchemaError> =>
  Effect.gen(function* () {
    const context = yield* foundGroup(sql, { name: campaign.name }, campaign.creatorAccountId);
    const participants = yield* liveMemberAccountIds(sql, campaign.id);
    yield* Effect.forEach(participants, (accountId) => admitToGroup(sql, context.id, accountId), {
      discard: true,
    });
    yield* sql`
      update campaign
      set group_id = ${context.id}, updated_at = now()
      where campaign.id = ${campaign.id}
        and campaign.group_id = ${campaign.contextId}
    `;
  });

/**
 * The cover's two facts beside a `play_group` row — `image_id`, a cover ready
 * to sign, and `image_pending` — as scalar subqueries, the way
 * `campaignImageColumns` sits beside a campaign. **Every read that becomes a
 * `SharedWorld` names this fragment**: the decode refuses a row without it.
 * `world` is the name the statement gives the `play_group` row it returns.
 */
const sharedWorldImageColumns = (sql: SqlClient.SqlClient, world: string) => sql`
  (select shared_world_image.id from shared_world_image
   where shared_world_image.group_id = ${sql(`${world}.id`)}
     and shared_world_image.state = 'ready') as image_id,
  coalesce(
    (select shared_world_image.state = 'generating' from shared_world_image
     where shared_world_image.group_id = ${sql(`${world}.id`)}),
    false
  ) as image_pending
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
 * A ready cover's id, decoded into the images the wire carries.
 *
 * **The only place a Shared World's cover URL is minted**, as the last step of
 * the decode of a row whose own SQL already returned the world to this reader
 * (`groupReadable` or `groupWritable`), which is what makes cover visibility
 * exactly world visibility.
 */
const coverFromId = (sign: SharedWorldImageSigner | undefined) =>
  Schema.NullOr(Schema.String).pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.instanceOf(SharedWorldImages)),
      new SchemaTransformation.Transformation(
        SchemaGetter.transform((id: string | null) =>
          id !== null && sign !== undefined ? sign(id) : null,
        ),
        SchemaGetter.forbidden(() => "a cover is minted, never read back"),
      ),
    ),
  );

/**
 * A `play_group` row as the wire reads it, decoded off `play_group.*` and
 * {@link sharedWorldImageColumns} by `SqlSchema`. One decode per table.
 */
const groupRow = (sign: SharedWorldImageSigner | undefined) =>
  classFromColumns(
    SharedWorld,
    {
      ...SharedWorld.fields,
      ...timestampColumns,
      archivedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
      image: coverFromId(sign),
    },
    { image: "image_id" },
  );

/** `groupRow` for a world founded by the statement that reads it, which has no cover to sign. */
const UnsignedGroupRow = groupRow(undefined);

/** The written columns of an insert or a PATCH, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/** What `moveToOwnContext` needs of the campaign it moves: a `Campaign` has it all. */
const MovingCampaign = Schema.Struct(
  Struct.pick(Campaign.fields, ["id", "contextId", "creatorAccountId", "name"]),
);
type MovingCampaign = typeof MovingCampaign.Type;

/** Every campaign in a world that is going, locked, decoded as the move needs it. */
const MovingCampaignRow = fromColumns(MovingCampaign, { contextId: "group_id" });

const MemberRow = classFromColumns(SharedWorldMember, {
  ...SharedWorldMember.fields,
  joinedAt: Schema.DateTimeUtcFromDate,
});

const CampaignCardRow = classFromColumns(
  SharedWorldCampaignCard,
  {
    ...SharedWorldCampaignCard.fields,
    archivedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
    createdAt: Schema.DateTimeUtcFromDate,
  },
  { worldId: "group_id" },
);

export class Groups extends Context.Service<
  Groups,
  {
    /** Every group this account is a live member of. */
    readonly mine: Effect.Effect<ReadonlyArray<SharedWorldMembership>, never, CurrentActor>;
    /** Archived explicit worlds owned by this account, for restoration. */
    readonly archived: Effect.Effect<ReadonlyArray<SharedWorld>, never, CurrentActor>;
    readonly findById: (id: SharedWorldId) => Effect.Effect<SharedWorld, NotFound, CurrentActor>;
    /**
     * Anybody may found a group; they become its owner and first member.
     * `from` is Hob's accept (`Proposals.acceptDraft`); no create payload
     * carries it.
     */
    readonly create: (
      payload: SharedWorldCreate,
      from?: AssistantOrigin,
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
    /** The owner's permanent delete; every campaign in it becomes standalone first. */
    readonly deletePermanently: (id: SharedWorldId) => Effect.Effect<void, NotFound, CurrentActor>;
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
      const GroupRow = groupRow(yield* sharedWorldImageSigner);
      const imageColumns = sharedWorldImageColumns(sql, "play_group");
      const destinationImageColumns = sharedWorldImageColumns(sql, "destination");

      /** The reader's own membership of each world, the world nested through `GroupRow`. */
      const memberships = SqlSchema.findAll({
        Request: Schema.Void,
        Result: classWithRow(SharedWorldMembership, "sharedWorld", GroupRow, {
          isOwner: Schema.Boolean,
          joinedAt: Schema.DateTimeUtcFromDate,
        }),
        execute: () =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select play_group.*, ${imageColumns}, group_member.created_at as joined_at,
                     (play_group.owner_account_id = ${actor.accountId}) as is_owner
              from play_group
              join group_member
                on group_member.group_id = play_group.id
               and group_member.account_id = ${actor.accountId}
               and group_member.revoked_at is null
              where ${groupReadable(sql, actor)}
                and play_group.archived_at is null
                and play_group.is_shared_world
              order by play_group.created_at desc
            `,
          ),
      });
      const shelved = SqlSchema.findAll({
        Request: Schema.Void,
        Result: GroupRow,
        execute: () =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select play_group.*, ${imageColumns} from play_group
              where play_group.owner_account_id = ${actor.accountId}
                and ${groupReadable(sql, actor)}
                and play_group.is_shared_world
                and play_group.archived_at is not null
              order by play_group.archived_at desc, play_group.created_at desc
            `,
          ),
      });
      const readable = SqlSchema.findOne({
        Request: Schema.toType(SharedWorldId),
        Result: GroupRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select play_group.*, ${imageColumns} from play_group
              where play_group.id = ${id} and ${groupReadable(sql, actor, id)}
            `,
          ),
      });
      /** A campaign's hidden context made an explicit world by its owner. */
      const promoted = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ group: SharedWorldId, actor: Actor, columns: Columns }),
        ),
        Result: GroupRow,
        execute: ({ group, actor, columns }) => sql`
          update play_group
          set ${setClause(sql, columns)}
          where play_group.id = ${group}
            and play_group.owner_account_id = ${actor.accountId}
            and play_group.archived_at is null
          returning play_group.*, ${imageColumns}
        `,
      });
      const creatorWorld = Schema.toType(
        Schema.Struct({
          campaign: CampaignId,
          group: SharedWorldId,
          actor: Actor,
          worldId: SharedWorldId,
        }),
      );
      /**
       * The owned world a standalone campaign is connecting to, locked with
       * the campaign and the hidden context it leaves.
       */
      const connecting = SqlSchema.findOne({
        Request: creatorWorld,
        Result: GroupRow,
        execute: ({ campaign, group, actor, worldId }) => sql`
          select destination.*, ${destinationImageColumns}
          from campaign
          join play_group as source on source.id = campaign.group_id
          cross join play_group as destination
          where campaign.id = ${campaign}
            and campaign.group_id = ${group}
            and campaign.creator_account_id = ${actor.accountId}
            and source.owner_account_id = ${actor.accountId}
            and not source.is_shared_world
            and source.archived_at is null
            and destination.id = ${worldId}
            and destination.owner_account_id = ${actor.accountId}
            and destination.is_shared_world
            and destination.archived_at is null
          for update of campaign, source, destination
        `,
      });
      /**
       * The other owned world a connected campaign is moving to, locked with
       * the campaign and the world it leaves.
       */
      const moving = SqlSchema.findOne({
        Request: creatorWorld,
        Result: GroupRow,
        execute: ({ campaign, group, actor, worldId }) => sql`
          select destination.*, ${destinationImageColumns}
          from campaign
          join play_group as source on source.id = campaign.group_id
          cross join play_group as destination
          where campaign.id = ${campaign}
            and campaign.group_id = ${group}
            and campaign.creator_account_id = ${actor.accountId}
            and source.is_shared_world
            and destination.id = ${worldId}
            and destination.id <> source.id
            and destination.owner_account_id = ${actor.accountId}
            and destination.is_shared_world
            and destination.archived_at is null
          for update of campaign, source, destination
        `,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ id: SharedWorldId, columns: Columns })),
        Result: GroupRow,
        execute: ({ id, columns }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update play_group set ${setClause(sql, columns)}
              where play_group.id = ${id} and ${groupWritable(sql, actor, id)}
              returning play_group.*, ${imageColumns}
            `,
          ),
      });
      /** The world onto the archive shelf; the caller holds its lock and has checked it. */
      const archiveRow = SqlSchema.findOne({
        Request: Schema.toType(SharedWorldId),
        Result: GroupRow,
        execute: (id) => sql`
          update play_group set archived_at = now(), updated_at = now()
          where play_group.id = ${id}
          returning play_group.*, ${imageColumns}
        `,
      });
      const restoreRow = SqlSchema.findOne({
        Request: Schema.toType(SharedWorldId),
        Result: GroupRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update play_group set archived_at = null, updated_at = now()
              where play_group.id = ${id} and ${groupWritable(sql, actor, id)}
              returning play_group.*, ${imageColumns}
            `,
          ),
      });
      const campaignsIn = SqlSchema.findAll({
        Request: Schema.toType(SharedWorldId),
        Result: MovingCampaignRow,
        execute: (id) => sql`
          select campaign.id, campaign.group_id, campaign.creator_account_id, campaign.name
          from campaign
          where campaign.group_id = ${id}
          order by campaign.created_at
          for update
        `,
      });
      const roster = SqlSchema.findAll({
        Request: Schema.toType(SharedWorldId),
        Result: MemberRow,
        execute: (id) => sql`
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
        `,
      });
      const directory = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ id: SharedWorldId, reader: AccountId })),
        Result: CampaignCardRow,
        execute: ({ id, reader }) => sql`
          select campaign.id,
                 campaign.group_id,
                 campaign.creator_account_id,
                 campaign.name,
                 campaign.archived_at,
                 campaign.created_at,
                 account.name as creator_name,
                 case
                   when campaign.creator_account_id = ${reader} then 'creator'
                   when ${memberOfCampaign(sql, sql("campaign.id"), reader)} then 'player'
                   else 'none'
                 end as relation
          from campaign
          join account on account.id = campaign.creator_account_id
          where campaign.group_id = ${id}
          order by campaign.created_at desc
        `,
      });

      return {
        mine: dieOnSqlError(memberships()),

        archived: dieOnSqlError(shelved()),

        findById: (id) => dieOnSqlError(readable(id).pipe(orNotFound("shared-world", id))),

        create: (payload, from) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                return yield* foundGroup(sql, payload, actor.accountId, true, from);
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
              return yield* promoted({
                group: creator.group,
                actor: creator.actor,
                columns,
              }).pipe(orNotFound("shared-world", creator.group));
            }),
          ),

        connect: (creator, worldId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const destination = yield* connecting({
                  campaign: creator.campaign,
                  group: creator.group,
                  actor: creator.actor,
                  worldId,
                }).pipe(orNotFound("shared-world", worldId));

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

                return destination;
              }),
            ),
          ),

        move: (creator, worldId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const destination = yield* moving({
                  campaign: creator.campaign,
                  group: creator.group,
                  actor: creator.actor,
                  worldId,
                }).pipe(orNotFound("shared-world", worldId));

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

                return destination;
              }),
            ),
          ),

        update: (id, patch) =>
          dieOnSqlError(
            change({
              id,
              columns: defined({ name: patch.name, description: proseColumn(patch.description) }),
            }).pipe(orNotFound("shared-world", id)),
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

                // The row is locked and was read above; not getting it is a defect.
                return yield* archiveRow(id).pipe(
                  Effect.catchTag("NoSuchElementError", Effect.die),
                );
              }),
            ),
          ),

        restore: (id) => dieOnSqlError(restoreRow(id).pipe(orNotFound("shared-world", id))),

        /**
         * The world and everything that belongs only to it, in one
         * transaction; never a campaign.
         *
         * Every campaign in it, live or archived and whoever created it, is
         * moved into a hidden context of its creator's first
         * (`moveToOwnContext`). The world's delete then cascades what is left:
         * its memberships, Chronicle and Story So Far, its Hob thread, its
         * Library shares (instances already minted stand) and its cover, whose
         * files the `shared_world_image` trigger queues on the storage outbox.
         *
         * `groupWritable` is the gate, so it is the owner's act on an explicit
         * world and `NotFound` for anyone else or for a campaign's hidden
         * context. It does not test `archived_at`, which is what lets the
         * archived shelf offer this too. The world row is locked first, the
         * lock `Campaigns.create` and `archive` take, so no campaign can land
         * in a world that is going.
         */
        deletePermanently: (id) =>
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

                const campaigns = yield* campaignsIn(id);
                yield* Effect.forEach(campaigns, (campaign) => moveToOwnContext(sql, campaign), {
                  discard: true,
                });

                yield* sql`delete from play_group where play_group.id = ${id}`;
              }),
            ),
          ),

        members: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, id, actor);
              return yield* roster(id);
            }),
          ),

        campaigns: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, id, actor);
              return yield* directory({ id, reader: actor.accountId });
            }),
          ),
      };
    }),
  );
}
