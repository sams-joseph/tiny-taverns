import {
  Actor,
  Campaign,
  type CampaignCreate,
  CampaignId,
  CampaignImages,
  type CampaignUpdate,
  Conflict,
  CurrentActor,
  SharedWorldId,
  NotFound,
  type SessionId,
} from "@taverns/api";
import { Context, Effect, Layer, Schema, SchemaGetter, SchemaTransformation } from "effect";
import { SqlClient, SqlSchema } from "effect/sql";
import { type ImageSigner, imageSigner } from "../images/ImageUrls.js";
import type { CampaignCreatorActor } from "./CreatorActor.js";
import { foundGroup, moveToOwnContext } from "./Groups.js";
import { addCreator } from "./Memberships.js";
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
  campaignReadable,
  campaignWritable,
  ensureGroupReadable,
  rowWritable,
} from "./visibility.js";

/**
 * The cover's two facts beside a campaign row: `image_id`, the id of a cover
 * that is ready to sign, and `image_pending`, whether one is being drawn — as
 * scalar subqueries so they fit a `select`, a `returning` and a column list
 * alike. **Every read that becomes a `Campaign` names this fragment** — the
 * decode refuses a row without it, so a path that forgot is a failed test
 * rather than a campaign whose cover silently vanished.
 */
export const campaignImageColumns = (sql: SqlClient.SqlClient) => sql`
  (select campaign_image.id from campaign_image
   where campaign_image.campaign_id = campaign.id
     and campaign_image.state = 'ready') as image_id,
  coalesce(
    (select campaign_image.state = 'generating' from campaign_image
     where campaign_image.campaign_id = campaign.id),
    false
  ) as image_pending
`;

/**
 * Signs a ready cover's paths; the campaign kind of `ImageUrls.pathsFor`.
 * `undefined` when a repository was built without the service, which mints
 * nothing — the same answer a server with no URL secret gives.
 */
export type CampaignImageSigner = (imageId: string) => Campaign["image"];

/** The signer a repository layer was built with, or `undefined`. */
export const campaignImageSigner: Effect.Effect<CampaignImageSigner | undefined> = Effect.map(
  imageSigner,
  (sign: ImageSigner | undefined) =>
    sign === undefined
      ? undefined
      : (imageId) => {
          const paths = sign("campaign", imageId);
          return paths === null
            ? null
            : new CampaignImages({ cardUrl: paths.card, fullUrl: paths.full });
        },
);

/**
 * **The only place a cover URL is minted.** `imageId` must come from a read
 * whose SQL already returned the campaign to this reader — `campaignReadable`
 * or `campaignWritable` beside {@link campaignImageColumns} — and that is what
 * makes cover visibility exactly campaign visibility.
 */
export const campaignImages = (
  imageId: string | null,
  sign: CampaignImageSigner | undefined,
): Campaign["image"] => (imageId !== null && sign !== undefined ? sign(imageId) : null);

/**
 * A ready cover's id, decoded into the images the wire carries. Minting is the
 * decode's last step, so the id a predicate let through is the only thing a URL
 * is made from.
 */
const coverFromId = (sign: CampaignImageSigner | undefined) =>
  Schema.NullOr(Schema.String).pipe(
    Schema.decodeTo(
      Schema.NullOr(Schema.instanceOf(CampaignImages)),
      new SchemaTransformation.Transformation(
        SchemaGetter.transform((id: string | null) => campaignImages(id, sign)),
        SchemaGetter.forbidden(() => "a cover is minted, never read back"),
      ),
    ),
  );

/**
 * A `campaign` row as the wire reads it, decoded off `campaign.*` and
 * {@link campaignImageColumns} by `SqlSchema`, its cover signed with the signer
 * the reading repository was built with.
 *
 * **One decode per table**, exported for `repo/Memberships.ts`, which selects
 * `campaign.*` beside the actor's own membership row and nests it through
 * here rather than restating what a campaign is on the wire.
 */
export const campaignRow = (sign: CampaignImageSigner | undefined) =>
  classFromColumns(
    Campaign,
    {
      ...Campaign.fields,
      ...timestampColumns,
      archivedAt: Schema.NullOr(Schema.DateTimeUtcFromDate),
      image: coverFromId(sign),
    },
    { contextId: "group_id", image: "image_id" },
  );

/** The written columns of an insert or a PATCH, as the method builds them. */
const Columns = Schema.toType(Schema.Record(Schema.String, Schema.Unknown));

/**
 * Reads and writes over `campaign`.
 *
 * Every method carries `CurrentActor` in its requirements. That is the whole
 * point: an unscoped read is not something you have to remember not to write —
 * it does not typecheck.
 */
export class Campaigns extends Context.Service<
  Campaigns,
  {
    readonly list: Effect.Effect<ReadonlyArray<Campaign>, never, CurrentActor>;
    readonly findById: (id: CampaignId) => Effect.Effect<Campaign, NotFound, CurrentActor>;
    /** `from` is Hob's accept (`Proposals.acceptDraft`); no create payload carries it. */
    readonly create: (
      groupId: SharedWorldId,
      payload: CampaignCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<Campaign, NotFound, CurrentActor>;
    /** Campaign-first creation; its private group is transitional plumbing. */
    readonly createStandalone: (
      payload: CampaignCreate,
      from?: AssistantOrigin,
    ) => Effect.Effect<Campaign, never, CurrentActor>;
    /** Moves a connected campaign into a new automatic context of its own. */
    readonly disconnectSharedWorld: (
      creator: CampaignCreatorActor,
    ) => Effect.Effect<Campaign, NotFound>;
    readonly update: (
      id: CampaignId,
      patch: CampaignUpdate,
    ) => Effect.Effect<Campaign, NotFound | Conflict, CurrentActor>;
    readonly archive: (id: CampaignId) => Effect.Effect<Campaign, NotFound, CurrentActor>;
    readonly restore: (id: CampaignId) => Effect.Effect<Campaign, NotFound, CurrentActor>;
    /** The creator's permanent delete, refused while a night is open. */
    readonly deletePermanently: (
      id: CampaignId,
    ) => Effect.Effect<void, NotFound | Conflict, CurrentActor>;
  }
>()("Campaigns") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const CampaignRow = campaignRow(yield* campaignImageSigner);

      const readable = SqlSchema.findAll({
        Request: Schema.Void,
        Result: CampaignRow,
        execute: () =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select campaign.*, ${campaignImageColumns(sql)} from campaign
              where ${campaignReadable(sql, actor)} and campaign.archived_at is null
              order by campaign.created_at desc
            `,
          ),
      });
      const readableById = SqlSchema.findOne({
        Request: Schema.toType(CampaignId),
        Result: CampaignRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select campaign.*, ${campaignImageColumns(sql)} from campaign
              where campaign.id = ${id} and ${campaignReadable(sql, actor, id)}
            `,
          ),
      });
      const insertRow = SqlSchema.findOne({
        Request: Columns,
        Result: CampaignRow,
        execute: (columns) => sql`
          insert into campaign ${sql.insert(columns)}
          returning campaign.*, ${campaignImageColumns(sql)}
        `,
      });
      /**
       * The campaign a creator is taking out of its Shared World, locked with
       * the world it leaves for the move that follows.
       */
      const leaving = SqlSchema.findOne({
        Request: Schema.toType(
          Schema.Struct({ campaign: CampaignId, group: SharedWorldId, actor: Actor }),
        ),
        Result: CampaignRow,
        execute: ({ campaign, group, actor }) => sql`
          select campaign.*, ${campaignImageColumns(sql)}
          from campaign
          join play_group as source on source.id = campaign.group_id
          where campaign.id = ${campaign}
            and campaign.group_id = ${group}
            and campaign.creator_account_id = ${actor.accountId}
            and source.is_shared_world
          for update of campaign, source
        `,
      });
      /** A campaign this transaction has just moved, read back by the id it moved. */
      const moved = SqlSchema.findOne({
        Request: Schema.toType(CampaignId),
        Result: CampaignRow,
        execute: (id) => sql`
          select campaign.*, ${campaignImageColumns(sql)} from campaign
          where campaign.id = ${id}
        `,
      });
      /** The creator's PATCH, behind `campaignWritable`. */
      const change = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ id: CampaignId, columns: Columns })),
        Result: CampaignRow,
        execute: ({ id, columns }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update campaign set ${setClause(sql, columns)}
              where campaign.id = ${id} and ${campaignWritable(sql, actor, id)}
              returning campaign.*, ${campaignImageColumns(sql)}
            `,
          ),
      });
      /** Onto the archive shelf or off it — `archive` and `restore`, one statement. */
      const shelve = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ id: CampaignId, archived: Schema.Boolean })),
        Result: CampaignRow,
        execute: ({ id, archived }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update campaign
              set archived_at = ${archived ? sql`now()` : sql`null`}, updated_at = now()
              where campaign.id = ${id} and ${campaignWritable(sql, actor, id)}
              returning campaign.*, ${campaignImageColumns(sql)}
            `,
          ),
      });

      /**
       * Whether a session may become this campaign's current one.
       *
       * Two refusals, and they are deliberately different errors. A session
       * this credential cannot write — someone else's, or another campaign's,
       * since the id in a payload is a client claim exactly as one in a path is
       * — is `NotFound`, because saying "it exists but is not yours" is itself
       * a disclosure. A session of this campaign that is **finished** is a
       * `Conflict`: the caller can see it perfectly well, and the honest answer
       * is that the night is over. That is the invariant §1.4 asks for, read
       * from the other end — `Sessions.update` clears the pointer when a
       * session ends, and this refuses to point it back.
       *
       * Neither is the last word. `campaign_current_session_id_fkey`
       * (`0006_session_finished.ts`) refuses the same pair structurally, which
       * is what closes the window between this check and the write: a session
       * ending concurrently makes the foreign key's own row lock the arbiter,
       * not this `select`.
       */
      const ensureEligible = (
        id: CampaignId,
        sessionId: SessionId | null | undefined,
        actor: Actor,
      ) =>
        Effect.gen(function* () {
          if (sessionId === null || sessionId === undefined) return;
          const rows = yield* sql<{ readonly ended_at: Date | null }>`
            select session.ended_at from session
            where session.id = ${sessionId} and ${rowWritable(sql, "session", id, actor)}
          `;
          if (rows.length === 0) {
            return yield* new NotFound({ resource: "session", id: sessionId });
          }
          if (rows[0]!.ended_at !== null) {
            return yield* new Conflict({
              message: "that session is finished, so it cannot be the current session",
            });
          }
        });

      const insert = (
        groupId: SharedWorldId,
        payload: CampaignCreate,
        actor: Actor,
        from: AssistantOrigin | undefined,
      ) =>
        Effect.gen(function* () {
          // An insert answers with its row; not getting one is a defect.
          const campaign = yield* insertRow(
            defined({
              group_id: groupId,
              creator_account_id: actor.accountId,
              name: payload.name,
              party_name: payload.partyName,
              description: proseColumn(payload.description),
              player_count: payload.playerCount,
              visibility: payload.visibility,
              ...assistantColumns(from),
            }),
          ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
          yield* addCreator(sql, campaign.id, groupId, actor.accountId);
          return campaign;
        });

      return {
        list: dieOnSqlError(readable()),

        findById: (id) => dieOnSqlError(readableById(id).pipe(orNotFound("campaign", id))),

        /**
         * Any live member of the group may create a campaign in it — the
         * governance decision — and becomes its creator and sole DM.
         *
         * Three facts written in one transaction, each pinned by a deferred
         * key: the campaign names its group and creator
         * (`campaign_creator_in_group` proves the creator is a live group
         * member), and the creator's own participation row goes in beside it
         * (`campaign_creator_is_campaign_member` refuses a campaign without
         * one). `ensureGroupReadable` fronts the typed refusal — a group this
         * credential does not reach is a 404 naming the group, not a defect
         * at COMMIT.
         */
        create: (groupId, payload, from) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* ensureGroupReadable(sql, groupId, actor);
                // Coordinate with `Groups.archive`: both lifecycle operations
                // lock the world before deciding whether it is empty/active,
                // so a new campaign cannot race retirement and land in an
                // archived Shared World.
                const active = yield* sql<{ readonly id: SharedWorldId }>`
                  select play_group.id from play_group
                  where play_group.id = ${groupId}
                    and play_group.archived_at is null
                  for update
                `;
                if (active.length === 0) {
                  return yield* new NotFound({ resource: "shared-world", id: groupId });
                }
                return yield* insert(groupId, payload, actor, from);
              }),
            ),
          ),

        /**
         * The campaign-first path. The private group is deliberately named
         * after the campaign and remains hidden until explicitly promoted.
         */
        createStandalone: (payload, from) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const group = yield* foundGroup(sql, { name: payload.name }, actor.accountId);
                return yield* insert(group.id, payload, actor, from);
              }),
            ),
          ),

        disconnectSharedWorld: (creator) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const source = yield* leaving({
                  campaign: creator.campaign,
                  group: creator.group,
                  actor: creator.actor,
                }).pipe(orNotFound("campaign", creator.campaign));

                yield* moveToOwnContext(sql, source);
                return yield* moved(creator.campaign).pipe(
                  orNotFound("campaign", creator.campaign),
                );
              }),
            ),
          ),

        update: (id, patch) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              yield* ensureEligible(id, patch.currentSessionId, actor);
              const columns = defined({
                name: patch.name,
                party_name: patch.partyName,
                description: proseColumn(patch.description),
                player_count: patch.playerCount,
                current_session_id: patch.currentSessionId,
                visibility: patch.visibility,
                diagonal_rule: patch.diagonalRule,
              });
              return yield* change({ id, columns }).pipe(orNotFound("campaign", id));
            }),
          ),

        /**
         * Off the list, and nothing else.
         *
         * **One column moves, and that is the whole design.** Nothing here
         * clears `current_session_id`, ends a live fight, unshares the campaign
         * or touches a row hanging off it — so a night in progress is still in
         * progress and `restore` below can put the campaign back *exactly* where
         * it was rather than approximately. The alternative, finishing the night
         * on the way out, is the one thing that could not be undone:
         * `campaign_current_session_id_fkey` (`0006_session_finished.ts`) makes
         * a finished session unpointable, so an archive that ended the night
         * would be a reversible act with an irreversible side effect. The
         * confirmation names the open night instead — see
         * `apps/web/src/campaign/ArchiveDialog.tsx`.
         *
         * No predicate in `repo/visibility.ts` consults `archived_at`, so an
         * archived campaign stays readable and writable at its own URL. That is
         * a soft delete working rather than a gap: the two lists that answer
         * *"what am I running"* — `list` above and `Memberships.mine` — are what
         * the column narrows, and pushing it into the seam instead would put a
         * second question into every predicate in the product for a shelf.
         *
         * Idempotent in the harmless direction: archiving an archived campaign
         * re-stamps `archived_at`, which is the same shelf a moment later.
         */
        archive: (id) =>
          dieOnSqlError(shelve({ id, archived: true }).pipe(orNotFound("campaign", id))),

        /**
         * Back on the list — `archive` read backwards, deliberately down to the
         * shape of the statement.
         *
         * Same predicate, same statement, same `NotFound`: a campaign somebody else
         * runs matches no row here for exactly the reason it matches none there,
         * so the refusal is not a second rule that could come to disagree with
         * the first. `campaignWritable` does not test `archived_at`, which is
         * what makes an archived campaign reachable by the one act that is about
         * being archived.
         *
         * Restoring one that is not archived is a no-op success. There is
         * nothing for a DM to reconcile — the campaign is on the list, which is
         * what they asked for — and a `Conflict` here would be an error for
         * pressing a button twice.
         */
        restore: (id) =>
          dieOnSqlError(shelve({ id, archived: false }).pipe(orNotFound("campaign", id))),

        /**
         * The campaign and everything that belongs only to it, in one
         * transaction, live or archived.
         *
         * One `delete from campaign` does the work, because every row that
         * belongs to a campaign is keyed to it `on delete cascade`: sessions,
         * notes, encounters and runs, NPCs, Hob threads, seats, participation,
         * invitations, campaign-scoped rules content, and the cover and NPC
         * portraits, whose triggers queue their files on the storage outbox.
         * What outlives it is deliberate. A character is account-owned and
         * only loses its seat; a character Hob drafted here keeps
         * `origin = 'assistant'` and loses the turn pointer
         * (`0056_character_draft_provenance.ts`). A Chronicle entry a Shared
         * World accepted from it stays in that world with `campaign_id` set to
         * null (`0053`). A standalone campaign's hidden context contains this
         * campaign alone, so it goes too, with its eligibility rows; a Shared
         * World stays, and so does membership of it.
         *
         * **A night in progress refuses the delete.** `current_session_id` set
         * means players may be at the table right now, and ending their night
         * is the table's act (`FinishSessionDialog`), not a side effect of
         * this one. The row lock is what makes the check the last word: a
         * session starting concurrently waits on it, then finds nothing.
         *
         * `campaignWritable`, like `archive`: `NotFound` for a player or a
         * stranger, and no test of `archived_at`, so the archived shelf can
         * offer it too.
         */
        deletePermanently: (id) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const rows = yield* sql<{
                  readonly group_id: SharedWorldId;
                  readonly current_session_id: SessionId | null;
                }>`
                  select campaign.group_id, campaign.current_session_id from campaign
                  where campaign.id = ${id} and ${campaignWritable(sql, actor, id)}
                  for update
                `;
                if (rows.length === 0) {
                  return yield* new NotFound({ resource: "campaign", id });
                }
                if (rows[0]!.current_session_id !== null) {
                  return yield* new Conflict({
                    message: "a night is still open at this table; finish it before deleting",
                  });
                }

                yield* sql`delete from campaign where campaign.id = ${id}`;
                yield* sql`
                  delete from play_group
                  where play_group.id = ${rows[0]!.group_id}
                    and not play_group.is_shared_world
                    and not exists (
                      select 1 from campaign where campaign.group_id = play_group.id
                    )
                `;
              }),
            ),
          ),
      };
    }),
  );
}
