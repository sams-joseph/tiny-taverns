import {
  type Actor,
  CampaignId,
  Conflict,
  CurrentActor,
  Npc,
  type NpcCreate,
  NpcId,
  type NpcListFilter,
  NpcBannerImages,
  NpcImages,
  NpcSource,
  type NpcUpdate,
  NotFound,
  PlayerNpc,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Schema, SchemaGetter, SchemaTransformation } from "effect";
import { SqlClient, SqlSchema, type Statement } from "effect/unstable/sql";
import { type ImageSigner, imageSigner } from "../images/ImageUrls.js";
import { asked, type CampaignCreatorActor, creatorFields } from "./CreatorActor.js";
import {
  type AssistantOrigin,
  assistantColumns,
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  orNotFound,
  setClause,
  timestampColumns,
} from "./rows.js";
import {
  ensureCampaignReadable,
  ensureCampaignWritable,
  libraryRowReadable,
  libraryRowWritable,
  rowReadable,
  rowWritable,
  usableInCampaign,
} from "./visibility.js";

/**
 * The campaign's cast and the reusable NPC Library source shelf.
 *
 * Campaign methods still take a `CampaignCreatorActor`, because a campaign NPC
 * carries creator-only private material. Slice 4 adds the account-owned source
 * half: Library sources are originals in no campaign, group shares grant only
 * future copying, and copying into a campaign produces an independent snapshot.
 *
 * A campaign NPC carries the portrait Hob drew of it, as signed paths minted
 * here and in `NpcThreads` beside a read that already returned the NPC — see
 * {@link npcImageColumns}. A Library original has none.
 */

/**
 * The portrait's facts beside an `npc` row, as scalar subqueries so they fit a
 * `select`, a `returning` and a column list alike: the ready portrait's id
 * (`image_id`), the ready banner's (`banner_id`), and whether either is still
 * being drawn (`image_pending`). **Every read that becomes an `Npc`, a
 * `PlayerNpc` or a follow-up's NPC names this fragment** — the decode refuses
 * a row without it, so a path that forgot is a failed test rather than an NPC
 * whose portrait silently vanished.
 */
export const npcImageColumns = (sql: SqlClient.SqlClient) => sql`
  (select npc_image.id from npc_image
   where npc_image.npc_id = npc.id and npc_image.state = 'ready') as image_id,
  (select npc_banner.id from npc_banner
   where npc_banner.npc_id = npc.id and npc_banner.state = 'ready') as banner_id,
  (exists (select 1 from npc_image
           where npc_image.npc_id = npc.id and npc_image.state = 'generating')
   or exists (select 1 from npc_banner
              where npc_banner.npc_id = npc.id and npc_banner.state = 'generating')) as image_pending
`;

/**
 * Signs a ready portrait's paths; the NPC kind of `ImageUrls.pathsFor`.
 * `undefined` when a repository was built without the service — Hob's and the
 * NPC agent's copies, which must never hold a bearer URL — and that mints
 * nothing, the same answer a server with no URL secret gives.
 */
export interface NpcImageSigner {
  (imageId: string): NpcImages | null;
  /** The banner's paths, beside the portrait's and minted by the same reads. */
  readonly banner: (bannerId: string) => NpcBannerImages | null;
}

/** The signer a repository layer was built with, or `undefined`. */
export const npcImageSigner: Effect.Effect<NpcImageSigner | undefined> = Effect.map(
  imageSigner,
  (sign: ImageSigner | undefined) =>
    sign === undefined
      ? undefined
      : Object.assign(
          (imageId: string) => {
            const paths = sign("npc", imageId);
            return paths === null
              ? null
              : new NpcImages({ thumbUrl: paths.thumb, cardUrl: paths.card, fullUrl: paths.full });
          },
          {
            banner: (bannerId: string) => {
              const paths = sign("npcBanner", bannerId);
              return paths === null
                ? null
                : new NpcBannerImages({ cardUrl: paths.card, fullUrl: paths.full });
            },
          },
        ),
);

/**
 * A ready portrait's id, decoded into the images the wire carries — **the only
 * place an NPC portrait URL is minted.** The id must come from a read whose SQL
 * already returned the NPC to this reader — the creator's `rowWritable` (here
 * and in the follow-up queue), a player's `playerNpcReadable`, or a session
 * thread the reader may reach — beside {@link npcImageColumns}, and that is
 * what makes portrait visibility exactly NPC visibility. Minting is the
 * decode's last step, with the signer the reading repository was built with.
 */
export const npcImageFromId = (sign: NpcImageSigner | undefined) =>
  Schema.NullOr(Schema.String).pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.instanceOf(NpcImages)),
      new SchemaTransformation.Transformation(
        SchemaGetter.transform((id: string | null) =>
          id !== null && sign !== undefined ? sign(id) : null,
        ),
        SchemaGetter.forbidden(() => "an NPC portrait is minted, never read back"),
      ),
    ),
  );

/** A ready banner's id, decoded into its images: the banner's {@link npcImageFromId}. */
const npcBannerFromId = (sign: NpcImageSigner | undefined) =>
  Schema.NullOr(Schema.String).pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.instanceOf(NpcBannerImages)),
      new SchemaTransformation.Transformation(
        SchemaGetter.transform((id: string | null) =>
          id !== null && sign !== undefined ? sign.banner(id) : null,
        ),
        SchemaGetter.forbidden(() => "an NPC banner is minted, never read back"),
      ),
    ),
  );

/** The pictures of an NPC row, off {@link npcImageColumns}; `imagePending` is its own column. */
const npcPictures = (sign: NpcImageSigner | undefined) => ({
  image: npcImageFromId(sign),
  banner: npcBannerFromId(sign),
});
const pictureColumns = { image: "image_id", banner: "banner_id" } as const;

/**
 * A campaign `npc` row as the creator reads it, decoded off `npc.*` and
 * {@link npcImageColumns} by `SqlSchema`. `account_id` is not on the wire and
 * the decode drops it.
 */
const npcRow = (sign: NpcImageSigner | undefined) =>
  classFromColumns(
    Npc,
    {
      ...Npc.fields,
      ...timestampColumns,
      archivedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
      ...npcPictures(sign),
    },
    pictureColumns,
  );

/** A Library original, decoded off `npc.*`; it has no portrait to select. */
const NpcSourceRow = classFromColumns(NpcSource, {
  ...NpcSource.fields,
  ...timestampColumns,
  archivedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
});

/**
 * The columns a `PlayerNpc` is built from, and no others. **Every read that
 * decodes through {@link playerNpcRow} selects this fragment instead of
 * `npc.*`**, so the wide columns — `private_material` first among them — never
 * leave Postgres on a player's path, even though the decode would drop them.
 * A table chat adds `npc_thread.session_state` beside it. The seam block in
 * `npcs.test.ts` greps for the rule.
 */
export const playerNpcColumns = (sql: SqlClient.SqlClient) => sql`
  npc.id, npc.campaign_id, npc.name, npc.role, npc.persona, ${npcImageColumns(sql)}
`;

/**
 * A `PlayerNpc` off {@link playerNpcColumns}, signed with the reading
 * repository's signer. `sessionState` is read only when a table chat selects
 * `npc_thread.session_state` beside it, and is absent otherwise.
 */
export const playerNpcRow = (sign: NpcImageSigner | undefined) =>
  classFromColumns(PlayerNpc, { ...PlayerNpc.fields, ...npcPictures(sign) }, pictureColumns);

/** The written columns of an insert, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

export const playerNpcReadable = (
  sql: SqlClient.SqlClient,
  campaignId: CampaignId,
  actor: Actor,
): Statement.Fragment =>
  sql.and([rowReadable(sql, "npc", campaignId, actor), sql`npc.archived_at is null`]);

const staleVersion = (expected: number, actual: number): Conflict =>
  new Conflict({
    message: `the NPC moved on while you were editing (version ${String(actual)}, you read ${String(expected)}). Reload it and make the change again.`,
  });

export class Npcs extends Context.Service<
  Npcs,
  {
    /** Live campaign rows by default, by name; `archived: true` is the other shelf. */
    readonly list: (
      creator: CampaignCreatorActor,
      filter: NpcListFilter,
    ) => Effect.Effect<ReadonlyArray<Npc>, NotFound, never>;
    readonly findById: (
      creator: CampaignCreatorActor,
      id: NpcId,
    ) => Effect.Effect<Npc, NotFound, never>;
    /**
     * The cast's create. `from` is the Hob turn a kept draft came from, and
     * only `repo/Proposals.ts` passes one: the NPC is then `assistant`'s with
     * that turn. There is no `origin` on `NpcCreate`, so it cannot arrive from
     * a client.
     */
    readonly create: (
      creator: CampaignCreatorActor,
      payload: NpcCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<Npc, NotFound, never>;
    readonly sourcesForCampaign: (
      creator: CampaignCreatorActor,
    ) => Effect.Effect<ReadonlyArray<NpcSource>, NotFound, never>;
    readonly copyFromSource: (
      creator: CampaignCreatorActor,
      sourceId: NpcId,
    ) => Effect.Effect<Npc, NotFound, never>;
    readonly update: (
      creator: CampaignCreatorActor,
      id: NpcId,
      patch: NpcUpdate,
    ) => Effect.Effect<Npc, NotFound | Conflict, never>;
    readonly archive: (
      creator: CampaignCreatorActor,
      id: NpcId,
    ) => Effect.Effect<Npc, NotFound, never>;
    readonly restore: (
      creator: CampaignCreatorActor,
      id: NpcId,
    ) => Effect.Effect<Npc, NotFound, never>;
    /** Account-owned source shelf: originals only, never groupmates' shares. */
    readonly library: (
      filter: NpcListFilter,
    ) => Effect.Effect<ReadonlyArray<NpcSource>, never, CurrentActor>;
    readonly libraryFindById: (id: NpcId) => Effect.Effect<NpcSource, NotFound, CurrentActor>;
    readonly libraryCreate: (payload: NpcCreate) => Effect.Effect<NpcSource, never, CurrentActor>;
    readonly libraryUpdate: (
      id: NpcId,
      patch: NpcUpdate,
    ) => Effect.Effect<NpcSource, NotFound | Conflict, CurrentActor>;
    readonly libraryArchive: (id: NpcId) => Effect.Effect<NpcSource, NotFound, CurrentActor>;
    readonly libraryRestore: (id: NpcId) => Effect.Effect<NpcSource, NotFound, CurrentActor>;
    readonly libraryRemove: (id: NpcId) => Effect.Effect<void, NotFound, CurrentActor>;
    /** Player-safe discovery: public profile only, shared live NPCs only. */
    readonly playerList: (
      campaignId: CampaignId,
    ) => Effect.Effect<ReadonlyArray<PlayerNpc>, NotFound, CurrentActor>;
    readonly playerFindById: (
      campaignId: CampaignId,
      id: NpcId,
    ) => Effect.Effect<PlayerNpc, NotFound, CurrentActor>;
  }
>()("Npcs") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const sign = yield* npcImageSigner;
      const NpcRow = npcRow(sign);
      const PlayerNpcRow = playerNpcRow(sign);

      const CreatorNpc = Schema.toType(Schema.Struct({ ...creatorFields, id: NpcId }));
      const CreatorShelf = Schema.toType(
        Schema.Struct({ ...creatorFields, archived: Schema.Boolean }),
      );
      const shelf = (archived: boolean) =>
        archived ? sql`npc.archived_at is not null` : sql`npc.archived_at is null`;

      const creatorOne = SqlSchema.findOne({
        Request: CreatorNpc,
        Result: NpcRow,
        execute: ({ campaign, actor, id }) => sql`
          select npc.*, ${npcImageColumns(sql)} from npc
          where npc.id = ${id} and ${rowWritable(sql, "npc", campaign, actor)}
        `,
      });
      const one = (creator: CampaignCreatorActor, id: NpcId) =>
        creatorOne({ ...asked(creator), id }).pipe(orNotFound("npc", id));

      const cast = SqlSchema.findAll({
        Request: CreatorShelf,
        Result: NpcRow,
        execute: ({ campaign, actor, archived }) => sql`
          select npc.*, ${npcImageColumns(sql)} from npc
          where ${rowWritable(sql, "npc", campaign, actor)}
            and ${shelf(archived)}
          order by lower(npc.name) asc, npc.id asc
        `,
      });
      const insert = SqlSchema.findOne({
        Request: Columns,
        Result: NpcRow,
        execute: (columns) => sql`
          insert into npc ${sql.insert(columns)}
          returning npc.*, ${npcImageColumns(sql)}
        `,
      });
      /** Everything this creator may copy into the campaign, live originals only. */
      const usableSources = SqlSchema.findAll({
        Request: Schema.toType(Schema.Struct(creatorFields)),
        Result: NpcSourceRow,
        execute: ({ campaign, actor }) => sql`
          select * from npc
          where npc.archived_at is null
            and ${usableInCampaign(sql, "npc", campaign, actor)}
          order by lower(npc.name) asc, npc.id asc
        `,
      });
      const copy = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ ...creatorFields, sourceId: NpcId })),
        Result: NpcRow,
        execute: ({ campaign, actor, sourceId }) => sql`
          insert into npc
            (campaign_id, derived_from, derived_from_version, derived_from_name,
             name, role, persona, private_material)
          select ${campaign}, npc.id, npc.version, npc.name,
                 npc.name, npc.role, npc.persona,
                 case when npc.account_id = ${actor.accountId}
                      then npc.private_material else '{}'::jsonb end
          from npc
          where npc.id = ${sourceId}
            and npc.archived_at is null
            and ${usableInCampaign(sql, "npc", campaign, actor)}
          returning npc.*, ${npcImageColumns(sql)}
        `,
      });
      /** The creator's PATCH, landing only on the version it read. */
      const change = SqlSchema.findOneOption({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, id: NpcId, columns: Columns, version: Schema.Int }),
        ),
        Result: NpcRow,
        execute: ({ campaign, actor, id, columns, version }) => sql`
          update npc set ${setClause(sql, columns)}, version = npc.version + 1
          where npc.id = ${id}
            and ${rowWritable(sql, "npc", campaign, actor)}
            and npc.version = ${version}
          returning npc.*, ${npcImageColumns(sql)}
        `,
      });
      const shelve = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ ...creatorFields, id: NpcId, archive: Schema.Boolean }),
        ),
        Result: NpcRow,
        execute: ({ campaign, actor, id, archive }) => sql`
          update npc
          set archived_at = ${archive ? sql`coalesce(npc.archived_at, now())` : sql`null`},
              updated_at = now()
          where npc.id = ${id} and ${rowWritable(sql, "npc", campaign, actor)}
          returning npc.*, ${npcImageColumns(sql)}
        `,
      });

      const libraryReach = (actor: Actor, writable: boolean) =>
        writable ? libraryRowWritable(sql, "npc", actor) : libraryRowReadable(sql, "npc", actor);
      const sourceRead = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ id: NpcId, writable: Schema.Boolean })),
        Result: NpcSourceRow,
        execute: ({ id, writable }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select * from npc
              where npc.id = ${id} and ${libraryReach(actor, writable)}
            `,
          ),
      });
      const sourceOne = (id: NpcId, writable: boolean) =>
        sourceRead({ id, writable }).pipe(orNotFound("npc", id));
      const libraryShelf = SqlSchema.findAll({
        Request: Schema.Boolean,
        Result: NpcSourceRow,
        execute: (archived) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select * from npc
              where ${libraryRowReadable(sql, "npc", actor)}
                and ${shelf(archived)}
              order by lower(npc.name) asc, npc.id asc
            `,
          ),
      });
      /** A new original of this account's. `account_id` comes from the actor alone. */
      const sourceInsert = SqlSchema.findOne({
        Request: Columns,
        Result: NpcSourceRow,
        execute: (columns) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              insert into npc ${sql.insert({ ...columns, account_id: actor.accountId })}
              returning *
            `,
          ),
      });
      const sourceChange = SqlSchema.findOneOption({
        Request: Schema.toType(Schema.Struct({ id: NpcId, columns: Columns, version: Schema.Int })),
        Result: NpcSourceRow,
        execute: ({ id, columns, version }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update npc set ${setClause(sql, columns)}, version = npc.version + 1
              where npc.id = ${id}
                and ${libraryRowWritable(sql, "npc", actor)}
                and npc.version = ${version}
              returning *
            `,
          ),
      });
      const sourceShelve = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ id: NpcId, archive: Schema.Boolean })),
        Result: NpcSourceRow,
        execute: ({ id, archive }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update npc
              set archived_at = ${archive ? sql`coalesce(npc.archived_at, now())` : sql`null`},
                  updated_at = now()
              where npc.id = ${id} and ${libraryRowWritable(sql, "npc", actor)}
              returning *
            `,
          ),
      });
      const sourceErase = SqlSchema.findOne({
        Request: Schema.toType(NpcId),
        Result: fromColumns(Schema.Struct({ id: NpcId })),
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              delete from npc
              where npc.id = ${id} and ${libraryRowWritable(sql, "npc", actor)}
              returning npc.id
            `,
          ),
      });

      const playerCast = SqlSchema.findAll({
        Request: Schema.toType(CampaignId),
        Result: PlayerNpcRow,
        execute: (campaignId) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${playerNpcColumns(sql)}
              from npc
              where ${playerNpcReadable(sql, campaignId, actor)}
              order by lower(npc.name) asc, npc.id asc
            `,
          ),
      });
      const playerOne = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ campaignId: CampaignId, id: NpcId })),
        Result: PlayerNpcRow,
        execute: ({ campaignId, id }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${playerNpcColumns(sql)}
              from npc
              where npc.id = ${id} and ${playerNpcReadable(sql, campaignId, actor)}
            `,
          ),
      });

      const sourcePatchColumns = (patch: NpcUpdate) =>
        defined({
          name: patch.name,
          role: patch.role,
          persona: patch.persona === undefined ? undefined : JSON.stringify(patch.persona),
          private_material:
            patch.privateMaterial === undefined ? undefined : JSON.stringify(patch.privateMaterial),
          visibility: patch.visibility,
        });

      return {
        list: (creator, filter) =>
          dieOnSqlError(cast({ ...asked(creator), archived: filter.archived === true })),

        findById: (creator, id) => dieOnSqlError(one(creator, id)),

        create: (creator, payload, from) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* ensureCampaignWritable(sql, creator.campaign, creator.actor);
                // An insert answers with its row; not getting one is a defect.
                return yield* insert(
                  defined({
                    campaign_id: creator.campaign,
                    name: payload.name,
                    role: payload.role,
                    persona:
                      payload.persona === undefined ? undefined : JSON.stringify(payload.persona),
                    private_material:
                      payload.privateMaterial === undefined
                        ? undefined
                        : JSON.stringify(payload.privateMaterial),
                    visibility: payload.visibility,
                    ...assistantColumns(from),
                  }),
                ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
              }),
            ),
          ),

        sourcesForCampaign: (creator) =>
          dieOnSqlError(
            Effect.gen(function* () {
              yield* ensureCampaignWritable(sql, creator.campaign, creator.actor);
              return yield* usableSources(asked(creator));
            }),
          ),

        copyFromSource: (creator, sourceId) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* ensureCampaignWritable(sql, creator.campaign, creator.actor);
                const copied = yield* copy({ ...asked(creator), sourceId }).pipe(
                  orNotFound("npc", sourceId),
                );
                const canCopyPrivate = yield* sql<{ readonly owner: boolean }>`
                  select exists (select 1 from npc where npc.id = ${sourceId} and npc.account_id = ${creator.actor.accountId}) as owner
                `;
                const sourceVisible =
                  canCopyPrivate[0]?.owner === true ? sql`true` : sql`visibility = 'shared'`;
                yield* sql`
                  insert into npc_knowledge_fact
                    (npc_id, body, source_kind, source_id, source_label, visibility)
                  select ${copied.id}, body, source_kind, source_id, source_label, visibility
                  from npc_knowledge_fact
                  where npc_id = ${sourceId}
                    and retired_at is null
                    and ${sourceVisible}
                  order by created_at asc, id asc
                `;
                yield* sql`
                  insert into npc_memory
                    (npc_id, body, status, source_kind, source_id, source_label, approved_at, visibility)
                  select ${copied.id}, body, status, source_kind, source_id, source_label, approved_at, visibility
                  from npc_memory
                  where npc_id = ${sourceId}
                    and status = 'approved'
                    and retired_at is null
                    and ${sourceVisible}
                  order by approved_at asc, id asc
                `;
                // The source's sheet, for the owner and a Shared World copier
                // alike: stats are rules, not secrets. The copy's own sheet
                // starts at version 1 and moves apart from the source's from
                // here, as the persona does (`0076_npc_sheets.ts`).
                yield* sql`
                  insert into npc_sheet
                    (npc_id, level, race, subrace, class_name, ac, hp_max, cr, body)
                  select ${copied.id}, level, race, subrace, class_name, ac, hp_max, cr, body
                  from npc_sheet
                  where npc_id = ${sourceId}
                `;
                return copied;
              }),
            ),
          ),

        update: (creator, id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const before = yield* one(creator, id);
                if (
                  patch.expectedVersion !== undefined &&
                  patch.expectedVersion !== before.version
                ) {
                  return yield* staleVersion(patch.expectedVersion, before.version);
                }
                const changed = yield* change({
                  ...asked(creator),
                  id,
                  columns: sourcePatchColumns(patch),
                  version: before.version,
                });
                if (Option.isNone(changed)) {
                  const now = yield* one(creator, id);
                  return yield* staleVersion(before.version, now.version);
                }
                return changed.value;
              }),
            ),
          ),

        archive: (creator, id) =>
          dieOnSqlError(
            shelve({ ...asked(creator), id, archive: true }).pipe(orNotFound("npc", id)),
          ),

        restore: (creator, id) =>
          dieOnSqlError(
            shelve({ ...asked(creator), id, archive: false }).pipe(orNotFound("npc", id)),
          ),

        library: (filter) => dieOnSqlError(libraryShelf(filter.archived === true)),

        libraryFindById: (id) => dieOnSqlError(sourceOne(id, false)),

        libraryCreate: (payload) =>
          dieOnSqlError(
            sourceInsert(
              defined({
                name: payload.name,
                role: payload.role,
                persona:
                  payload.persona === undefined ? undefined : JSON.stringify(payload.persona),
                private_material:
                  payload.privateMaterial === undefined
                    ? undefined
                    : JSON.stringify(payload.privateMaterial),
                visibility: payload.visibility,
              }),
            ).pipe(Effect.catchTag("NoSuchElementError", Effect.die)),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const before = yield* sourceOne(id, true);
                if (
                  patch.expectedVersion !== undefined &&
                  patch.expectedVersion !== before.version
                ) {
                  return yield* staleVersion(patch.expectedVersion, before.version);
                }
                const changed = yield* sourceChange({
                  id,
                  columns: sourcePatchColumns(patch),
                  version: before.version,
                });
                if (Option.isNone(changed)) {
                  const now = yield* sourceOne(id, true);
                  return yield* staleVersion(before.version, now.version);
                }
                return changed.value;
              }),
            ),
          ),

        libraryArchive: (id) =>
          dieOnSqlError(sourceShelve({ id, archive: true }).pipe(orNotFound("npc", id))),

        libraryRestore: (id) =>
          dieOnSqlError(sourceShelve({ id, archive: false }).pipe(orNotFound("npc", id))),

        libraryRemove: (id) =>
          dieOnSqlError(Effect.asVoid(sourceErase(id).pipe(orNotFound("npc", id)))),

        playerList: (campaignId) =>
          dieOnSqlError(
            Effect.gen(function* () {
              // A campaign this actor cannot read is `NotFound`, not an empty
              // cast, like `playerFindById` and `sessions.list`.
              yield* ensureCampaignReadable(sql, campaignId, yield* CurrentActor);
              return yield* playerCast(campaignId);
            }),
          ),

        playerFindById: (campaignId, id) =>
          dieOnSqlError(playerOne({ campaignId, id }).pipe(orNotFound("npc", id))),
      };
    }),
  );
}
