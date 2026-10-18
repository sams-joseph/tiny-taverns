import {
  type AccountId,
  Actor,
  type CampaignId,
  CampaignLocation,
  Conflict,
  CurrentActor,
  Location,
  LocationAppearance,
  LocationAppearanceCampaign,
  type LocationCreate,
  LocationId,
  LocationImages,
  type LocationKind,
  LocationPin,
  type LocationUpdate,
  NotFound,
  PlayerLocation,
  SharedWorldId,
  WorldLocation,
} from "@taverns/api";
import { Context, Effect, Layer, Schema, SchemaGetter, SchemaTransformation } from "effect";
import { SqlClient, SqlSchema, type SqlError, type Statement } from "effect/sql";
import { type ImageSigner, imageSigner } from "../images/ImageUrls.js";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import {
  type AssistantOrigin,
  assistantColumns,
  classFromColumns,
  defined,
  dieOnSqlError,
  orNotFound,
  proseColumn,
  setClause,
  timestampColumns,
} from "./rows.js";
import {
  campaignWritableById,
  ensureCampaignReadable,
  ensureGroupReadable,
  groupReadable,
  locationAtCampaign,
  locationInContext,
  locationInWorld,
  locationOwned,
  locationRevealedAt,
  locationShownToPlayer,
} from "./visibility.js";

/**
 * The picture beside a place, as one `json` column: its id, state and size, or
 * `null` with no picture record. **Every read of a place names this fragment**
 * (through {@link pictureColumns}): the decode refuses a row without it.
 */
const LocationPicture = Schema.NullOr(
  Schema.Struct({
    id: Schema.String,
    state: Schema.Literals(["generating", "ready", "failed"]),
    width: Schema.NullOr(Schema.Int),
    height: Schema.NullOr(Schema.Int),
  }),
);

/**
 * **The only place a place's picture URL is minted**, as the last step of the
 * decode of a row whose own statement already returned the place to this
 * reader: the owner's, a world member's, a creator's or a player's. So who
 * sees the picture is exactly who sees the place. `undefined` signs nothing,
 * which is what Hob's and the accept's bare copy of this repository is built
 * with: a model must never hold a bearer URL.
 */
const pictureFromColumn = (sign: ImageSigner | undefined) =>
  LocationPicture.pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.instanceOf(LocationImages)),
      new SchemaTransformation.Transformation(
        SchemaGetter.transform((picture: typeof LocationPicture.Type) => {
          if (
            picture === null ||
            picture.state !== "ready" ||
            picture.width === null ||
            picture.height === null ||
            sign === undefined
          ) {
            return null;
          }
          const paths = sign("location", picture.id);
          return paths === null
            ? null
            : new LocationImages({
                cardUrl: paths.card,
                fullUrl: paths.full,
                width: picture.width,
                height: picture.height,
              });
        }),
        SchemaGetter.forbidden(() => "a place's picture is minted, never read back"),
      ),
    ),
  );

/**
 * The picture, whether it is drawing, and the pin, beside a `location` row in
 * scope. The pin is shown only where `pinShown` holds — the parent is in the
 * reader's view too — because a pin is a point on the parent's picture.
 */
const pictureColumns = (sql: SqlClient.SqlClient, pinShown: Statement.Fragment) => sql`
  (select json_build_object(
     'id', location_image.id,
     'state', location_image.state,
     'width', location_image.width,
     'height', location_image.height
   ) from location_image
   where location_image.location_id = location.id) as picture,
  coalesce(
    (select location_image.state = 'generating' from location_image
     where location_image.location_id = location.id),
    false
  ) as image_pending,
  case when location.pin_x is not null and ${pinShown}
       then json_build_object('x', location.pin_x, 'y', location.pin_y) end as pin
`;

/** The owner's columns beside `location.*`: every picture column, and whether one was ever recorded. */
const ownerColumns = (sql: SqlClient.SqlClient) => sql`
  ${pictureColumns(sql, sql`true`)},
  exists (select 1 from location_image
          where location_image.location_id = location.id) as pictured
`;

/** The rows each reader decodes, their pictures signed with the layer's signer. */
const rowsFor = (sign: ImageSigner | undefined) => {
  const picture = { image: pictureFromColumn(sign), pin: Schema.NullOr(LocationPin) } as const;
  return {
    owner: classFromColumns(
      Location,
      { ...Location.fields, ...timestampColumns, ...picture },
      { image: "picture" },
    ),
    world: classFromColumns(
      WorldLocation,
      { ...WorldLocation.fields, ...picture },
      { image: "picture" },
    ),
    campaign: classFromColumns(
      CampaignLocation,
      { ...CampaignLocation.fields, ...picture },
      { image: "picture" },
    ),
    player: classFromColumns(
      PlayerLocation,
      { ...PlayerLocation.fields, ...picture },
      { image: "picture" },
    ),
  };
};

const AppearanceRow = classFromColumns(LocationAppearance, {
  ...LocationAppearance.fields,
  campaigns: Schema.Array(LocationAppearanceCampaign),
});

/** The written columns, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/**
 * The columns a world member and a creator read, beside the context `group`
 * names. `parent_id` only when the parent is in the context too; `placed` when
 * the place has a placement of its own there. `account` must be in scope.
 */
const placedColumns = (
  sql: SqlClient.SqlClient,
  accountId: AccountId,
  group: Statement.Fragment,
) => sql`
  location.id,
  case when ${locationInContext(sql, sql`location.parent_id`, group)}
       then location.parent_id end as parent_id,
  location.kind, location.name, location.description, location.appearance,
  account.name as owner_name,
  location.account_id = ${accountId} as mine,
  exists (select 1 from context_location as own_placement
          where own_placement.group_id = ${group}
            and own_placement.location_id = location.id) as placed,
  ${pictureColumns(sql, locationInContext(sql, sql`location.parent_id`, group))}
`;

/**
 * Serialises tree edits within one account's places, so two re-parents racing
 * cannot each pass the cycle check and together make a loop. Transaction-scoped.
 */
const lockTree = (sql: SqlClient.SqlClient, accountId: AccountId) =>
  sql`select pg_advisory_xact_lock(hashtextextended(${`location-tree:${accountId}`}, 0))`;

/**
 * Deletes the reveals that name a place no longer in their campaign's context,
 * among the places `scope` selects (a fragment over `campaign_location_reveal`).
 * Hygiene, not a gate: `locationRevealedAt` already ignores such a reveal.
 */
const pruneReveals = (sql: SqlClient.SqlClient, scope: Statement.Fragment) =>
  sql`
    delete from campaign_location_reveal
    using campaign
    where campaign.id = campaign_location_reveal.campaign_id
      and ${scope}
      and not ${locationInContext(sql, sql`campaign_location_reveal.location_id`, sql`campaign.group_id`)}
  `;

/**
 * Carries a campaign's creator's placements along when the campaign changes
 * context: a connect, a move, a disconnect or its world's delete. Every place
 * the creator placed in the context the campaign leaves is placed in the one it
 * joins as well; the old context keeps them, because the creator is still a
 * member there and other tables in it may use them. Then this campaign's
 * reveals of places the new context lacks are deleted.
 *
 * Call it after `campaign.group_id` names the new context, inside the move's
 * transaction, and before anything deletes the old context.
 */
export const carryPlacements = (
  sql: SqlClient.SqlClient,
  move: {
    readonly campaignId: CampaignId;
    readonly creatorAccountId: AccountId;
    readonly from: SharedWorldId;
    readonly to: SharedWorldId;
  },
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    yield* sql`
      insert into context_location (group_id, location_id, account_id)
      select ${move.to}, context_location.location_id, context_location.account_id
      from context_location
      where context_location.group_id = ${move.from}
        and context_location.account_id = ${move.creatorAccountId}
      on conflict (group_id, location_id) do nothing
    `;
    yield* pruneReveals(sql, sql`campaign_location_reveal.campaign_id = ${move.campaignId}`);
  });

/**
 * Every place: the owner's Library shelf, a Shared World's atlas, a creator's
 * placements and reveals at their table, and a player's revealed list.
 *
 * Who may do what is the predicate in each statement (`repo/visibility.ts`):
 * only the owner reads or writes a place on the shelf, and only the owner can
 * place one (`context_location_owner_fkey` makes that structural too). A
 * creator reveals and unreveals at their own table, behind the proof; Hob
 * holds this repository for `listLocations` and the accept path for
 * `proposeLocation`.
 */
export class Locations extends Context.Service<
  Locations,
  {
    /** The asker's own places, by name. */
    readonly library: Effect.Effect<ReadonlyArray<Location>, never, CurrentActor>;
    readonly findById: (id: LocationId) => Effect.Effect<Location, NotFound, CurrentActor>;
    /**
     * A new place of the asker's. A parent that is not one of their own is
     * `NotFound`. `from` is the accept path's, and only its — see `Notes.create`.
     */
    readonly create: (
      payload: LocationCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<Location, NotFound | Conflict, CurrentActor>;
    /** The owner's edit. A parent inside the place's own subtree is `Conflict`. */
    readonly update: (
      id: LocationId,
      patch: LocationUpdate,
    ) => Effect.Effect<Location, NotFound | Conflict, CurrentActor>;
    /**
     * One of the owner's places and the places directly inside it, by kind
     * and pin: what its picture is drawn from and around
     * (`HobImages.drawLocation`).
     */
    readonly forDrawing: (id: LocationId) => Effect.Effect<
      {
        readonly location: Location;
        readonly children: ReadonlyArray<{
          readonly kind: LocationKind;
          readonly pin: LocationPin | null;
        }>;
      },
      NotFound,
      CurrentActor
    >;
    /** The place and its whole subtree, with every placement and reveal of them. */
    readonly remove: (id: LocationId) => Effect.Effect<void, NotFound, CurrentActor>;
    /** Each context the place or a place under it is placed in, with its campaigns. */
    readonly appearances: (
      id: LocationId,
    ) => Effect.Effect<ReadonlyArray<LocationAppearance>, NotFound, CurrentActor>;
    /** A Shared World's atlas, for a live member. */
    readonly inWorld: (
      worldId: SharedWorldId,
    ) => Effect.Effect<ReadonlyArray<WorldLocation>, NotFound, CurrentActor>;
    /** Every place in the campaign's context, as its creator arranges them. */
    readonly atCampaign: (
      creator: CampaignCreatorActor,
    ) => Effect.Effect<ReadonlyArray<CampaignLocation>>;
    /**
     * Places one of the creator's own places, with its subtree, in the
     * campaign's context. Placing one already placed there changes nothing.
     */
    readonly place: (
      creator: CampaignCreatorActor,
      id: LocationId,
    ) => Effect.Effect<void, NotFound>;
    /**
     * Places one of the actor's own places in a Shared World they are a live
     * member of: the accept of a place Shared World Hob drafted, which has no
     * campaign to place it through. Idempotent.
     */
    readonly placeInWorld: (
      worldId: SharedWorldId,
      id: LocationId,
    ) => Effect.Effect<void, NotFound, CurrentActor>;
    /** Takes the creator's own placement back out, and the reveals it carried. */
    readonly unplace: (
      creator: CampaignCreatorActor,
      id: LocationId,
    ) => Effect.Effect<void, NotFound>;
    /** Shows a place in the campaign's context to this table's players. Idempotent. */
    readonly reveal: (
      creator: CampaignCreatorActor,
      id: LocationId,
    ) => Effect.Effect<void, NotFound>;
    /** Hides it again. Hiding one that is not revealed changes nothing. */
    readonly unreveal: (
      creator: CampaignCreatorActor,
      id: LocationId,
    ) => Effect.Effect<void, NotFound>;
    /** The places this table has revealed, as a player is told them. */
    readonly forPlayer: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<PlayerLocation>, NotFound, CurrentActor>;
  }
>()("Locations") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = rowsFor(yield* imageSigner);

      const shelf = SqlSchema.findAll({
        Request: Schema.toType(Actor),
        Result: rows.owner,
        execute: (actor) => sql`
          select location.*, ${ownerColumns(sql)} from location
          where ${locationOwned(sql, actor)}
          order by lower(location.name), location.id
        `,
      });
      const owned = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ actor: Actor, id: LocationId })),
        Result: rows.owner,
        execute: ({ actor, id }) => sql`
          select location.*, ${ownerColumns(sql)} from location
          where location.id = ${id} and ${locationOwned(sql, actor)}
        `,
      });
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: rows.owner,
        execute: (columns) => sql`
          insert into location ${sql.insert(columns)}
          returning location.*, ${ownerColumns(sql)}
        `,
      });
      const change = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ actor: Actor, id: LocationId, columns: Columns })),
        Result: rows.owner,
        execute: ({ actor, id, columns }) => sql`
          update location set ${setClause(sql, columns)}
          where location.id = ${id} and ${locationOwned(sql, actor)}
          returning location.*, ${ownerColumns(sql)}
        `,
      });

      const appearing = SqlSchema.findAll({
        Request: Schema.toType(LocationId),
        Result: AppearanceRow,
        execute: (id) => sql`
          with recursive subtree (id) as (
            select ${id}::uuid
            union all
            select location.id from location
            join subtree on location.parent_id = subtree.id
          )
          select play_group.id as context_id,
                 case when play_group.is_shared_world then play_group.name end as world_name,
                 coalesce((
                   select json_agg(json_build_object('id', campaign.id, 'name', campaign.name)
                                   order by lower(campaign.name))
                   from campaign where campaign.group_id = play_group.id
                 ), '[]'::json) as campaigns
          from play_group
          where exists (
            select 1 from context_location
            join subtree on subtree.id = context_location.location_id
            where context_location.group_id = play_group.id
          )
          order by play_group.is_shared_world desc, lower(play_group.name)
        `,
      });
      const world = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ worldId: SharedWorldId, actor: Actor })),
        Result: rows.world,
        execute: ({ worldId, actor }) => sql`
          select ${placedColumns(sql, actor.accountId, sql`${worldId}`)}
          from location
          join account on account.id = location.account_id
          where ${locationInWorld(sql, worldId, actor)}
          order by lower(location.name), location.id
        `,
      });
      const table = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, group: SharedWorldId })),
        Result: rows.campaign,
        execute: ({ campaign, actor, group }) => sql`
          select ${placedColumns(sql, actor.accountId, sql`${group}`)},
                 exists (select 1 from campaign_location_reveal
                         where campaign_location_reveal.campaign_id = ${campaign}
                           and campaign_location_reveal.location_id = location.id) as revealed
          from location
          join account on account.id = location.account_id
          where ${locationAtCampaign(sql, campaign, actor)}
          order by lower(location.name), location.id
        `,
      });
      const revealed = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(creatorFields)),
        Result: rows.player,
        execute: ({ campaign, actor }) => sql`
          select location.id,
                 case when location.parent_id is not null
                       and ${locationRevealedAt(sql, sql`location.parent_id`, campaign)}
                      then location.parent_id end as parent_id,
                 location.kind, location.name, location.description,
                 ${pictureColumns(sql, locationRevealedAt(sql, sql`location.parent_id`, campaign))}
          from location
          where ${locationShownToPlayer(sql, campaign, actor)}
          order by lower(location.name), location.id
        `,
      });

      /** `NotFound` unless the place is the actor's own; the gate every write opens with. */
      const ownOrNotFound = (id: LocationId) =>
        Effect.gen(function* () {
          const actor = yield* CurrentActor;
          const rows = yield* sql<{ readonly id: string }>`
            select location.id from location
            where location.id = ${id} and ${locationOwned(sql, actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "location", id });
        });

      /** `NotFound` unless the place is in the creator's campaign's context. */
      const atCampaignOrNotFound = (creator: CampaignCreatorActor, id: LocationId) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ readonly id: string }>`
            select location.id from location
            where location.id = ${id}
              and ${locationAtCampaign(sql, creator.campaign, creator.actor)}
          `;
          if (rows.length === 0) return yield* new NotFound({ resource: "location", id });
        });

      return {
        library: dieOnSqlError(Effect.flatMap(CurrentActor, (actor) => shelf(actor))),

        findById: (id) =>
          dieOnSqlError(
            Effect.flatMap(CurrentActor, (actor) =>
              owned({ actor, id }).pipe(orNotFound("location", id)),
            ),
          ),

        create: (payload, from) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                if (payload.parentId !== undefined) yield* ownOrNotFound(payload.parentId);
                if (payload.pin !== undefined && payload.parentId === undefined) {
                  return yield* new Conflict({
                    message: "a place that stands on its own has no map to be pinned on",
                  });
                }
                // An insert answers with its row; not getting one is a defect.
                return yield* insert(
                  defined({
                    account_id: actor.accountId,
                    parent_id: payload.parentId,
                    kind: payload.kind,
                    name: payload.name.trim(),
                    description: proseColumn(payload.description),
                    appearance: proseColumn(payload.appearance),
                    notes: proseColumn(payload.notes),
                    ...(payload.pin === undefined
                      ? {}
                      : { pin_x: payload.pin.x, pin_y: payload.pin.y }),
                    ...assistantColumns(from),
                  }),
                ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
              }),
            ),
          ),

        update: (id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const current = yield* sql<{ readonly parent_id: LocationId | null }>`
                  select location.parent_id from location
                  where location.id = ${id} and ${locationOwned(sql, actor)}
                  for update
                `;
                if (current.length === 0) return yield* new NotFound({ resource: "location", id });
                const parentBefore = current[0]!.parent_id;
                const parentAfter = patch.parentId === undefined ? parentBefore : patch.parentId;
                if (patch.pin !== undefined && patch.pin !== null && parentAfter === null) {
                  return yield* new Conflict({
                    message: "a place that stands on its own has no map to be pinned on",
                  });
                }
                // A pin is a point on the parent's picture, so a new parent
                // clears it unless this edit sets one too.
                const pin =
                  patch.pin !== undefined
                    ? patch.pin === null
                      ? { pin_x: null, pin_y: null }
                      : { pin_x: patch.pin.x, pin_y: patch.pin.y }
                    : parentAfter !== parentBefore
                      ? { pin_x: null, pin_y: null }
                      : {};
                if (patch.parentId !== undefined && patch.parentId !== null) {
                  yield* lockTree(sql, actor.accountId);
                  yield* ownOrNotFound(patch.parentId);
                  // The new parent may not be the place or anything under it.
                  const loops = yield* sql<{ readonly loops: boolean }>`
                    with recursive subtree (id) as (
                      select ${id}::uuid
                      union all
                      select location.id from location
                      join subtree on location.parent_id = subtree.id
                    )
                    select exists (
                      select 1 from subtree where subtree.id = ${patch.parentId}
                    ) as loops
                  `;
                  if (loops[0]!.loops) {
                    return yield* new Conflict({
                      message: "a place cannot sit inside itself or a place under it",
                    });
                  }
                }
                const updated = yield* change({
                  actor,
                  id,
                  columns: defined({
                    kind: patch.kind,
                    name: patch.name?.trim(),
                    parent_id: patch.parentId,
                    description: proseColumn(patch.description),
                    appearance: proseColumn(patch.appearance),
                    notes: proseColumn(patch.notes),
                    ...pin,
                  }),
                }).pipe(orNotFound("location", id));
                if (patch.parentId !== undefined) {
                  // A re-parent can take the subtree out of a context its old
                  // parent was placed in.
                  yield* pruneReveals(
                    sql,
                    sql`campaign_location_reveal.location_id in (
                      with recursive subtree (id) as (
                        select ${id}::uuid
                        union all
                        select location.id from location
                        join subtree on location.parent_id = subtree.id
                      )
                      select subtree.id from subtree
                    )`,
                  );
                }
                return updated;
              }),
            ),
          ),

        forDrawing: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const location = yield* owned({ actor, id }).pipe(orNotFound("location", id));
              const children = yield* sql<{
                readonly kind: LocationKind;
                readonly pin_x: number | null;
                readonly pin_y: number | null;
              }>`
                select location.kind, location.pin_x, location.pin_y from location
                where location.parent_id = ${id} and ${locationOwned(sql, actor)}
              `;
              return {
                location,
                children: children.map((child) => ({
                  kind: child.kind,
                  pin:
                    child.pin_x === null || child.pin_y === null
                      ? null
                      : { x: child.pin_x, y: child.pin_y },
                })),
              };
            }),
          ),

        remove: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              // `location_parent_fkey` cascades the subtree; the placement and
              // reveal keys cascade from each place.
              const gone = yield* sql<{ readonly id: string }>`
                delete from location
                where location.id = ${id} and ${locationOwned(sql, actor)}
                returning location.id
              `;
              if (gone.length === 0) return yield* new NotFound({ resource: "location", id });
            }),
          ),

        appearances: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ownOrNotFound(id);
              return yield* appearing(id);
            }),
          ),

        inWorld: (worldId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureGroupReadable(sql, worldId, actor);
              return yield* world({ worldId, actor });
            }),
          ),

        atCampaign: (creator) => dieOnSqlError(table({ ...asked(creator), group: creator.group })),

        place: (creator, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              // Only the owner places: `NotFound` for anybody else's place,
              // whether or not it is already in this world.
              const placed = yield* sql<{ readonly id: string }>`
                insert into context_location (group_id, location_id, account_id)
                select campaign.group_id, location.id, location.account_id
                from location
                join campaign on campaign.id = ${creator.campaign}
                where location.id = ${id}
                  and ${locationOwned(sql, creator.actor)}
                  and campaign.group_id = ${creator.group}
                  and ${campaignWritableById(sql, creator.campaign, creator.actor)}
                on conflict (group_id, location_id) do update
                  set placed_at = context_location.placed_at
                returning context_location.location_id as id
              `;
              if (placed.length === 0) return yield* new NotFound({ resource: "location", id });
            }),
          ),

        placeInWorld: (worldId, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const placed = yield* sql<{ readonly id: string }>`
                insert into context_location (group_id, location_id, account_id)
                select ${worldId}, location.id, location.account_id
                from location
                where location.id = ${id}
                  and ${locationOwned(sql, actor)}
                  and ${groupReadable(sql, actor, worldId)}
                on conflict (group_id, location_id) do update
                  set placed_at = context_location.placed_at
                returning context_location.location_id as id
              `;
              if (placed.length === 0) return yield* new NotFound({ resource: "location", id });
            }),
          ),

        unplace: (creator, id) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const gone = yield* sql<{ readonly id: string }>`
                  delete from context_location
                  where context_location.group_id = ${creator.group}
                    and context_location.location_id = ${id}
                    and context_location.account_id = ${creator.actor.accountId}
                    and exists (select 1 from campaign as placing_campaign
                                where placing_campaign.id = ${creator.campaign}
                                  and placing_campaign.group_id = ${creator.group})
                    and ${campaignWritableById(sql, creator.campaign, creator.actor)}
                  returning context_location.location_id as id
                `;
                if (gone.length === 0) return yield* new NotFound({ resource: "location", id });
                // Every table in the context loses the reveals it no longer reaches.
                yield* pruneReveals(sql, sql`campaign.group_id = ${creator.group}`);
              }),
            ),
          ),

        reveal: (creator, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* atCampaignOrNotFound(creator, id);
              yield* sql`
                insert into campaign_location_reveal (campaign_id, location_id)
                values (${creator.campaign}, ${id})
                on conflict (campaign_id, location_id) do nothing
              `;
            }),
          ),

        unreveal: (creator, id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* atCampaignOrNotFound(creator, id);
              yield* sql`
                delete from campaign_location_reveal
                where campaign_location_reveal.campaign_id = ${creator.campaign}
                  and campaign_location_reveal.location_id = ${id}
              `;
            }),
          ),

        forPlayer: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureCampaignReadable(sql, campaignId, actor);
              return yield* revealed({ campaign: campaignId, actor });
            }),
          ),
      };
    }),
  );
}
