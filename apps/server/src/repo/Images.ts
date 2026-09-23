import { type Actor, CurrentActor } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import { ALL_IMAGE_KINDS, IMAGE_KINDS, type ImageKind } from "../images/kinds.js";
import { StorageKey } from "../storage/ObjectStorage.js";
import { dieOnSqlError } from "./rows.js";
import { campaignWritable, groupWritable, ownCharacter } from "./visibility.js";

/**
 * Every statement about Hob-drawn images' records — one table per kind
 * (`character_portrait`, `campaign_image`, `shared_world_image`;
 * `images/kinds.ts`) — and the `storage_deletion` outbox they share. The
 * worker that draws and stores is `images/HobImages.ts`; this file is only rows.
 *
 * **Who may read an image is not decided here.** The wire carries an image only
 * as a field of its subject — a `Character` (and the rows that point at one), a
 * `Campaign` or a `SharedWorld` — minted by that subject's own reads for an id
 * a visibility predicate already returned. The one read below that takes no actor,
 * {@link ImageRecords} `readyPrefix`, runs only after the image route has
 * checked a signature that such a read minted.
 *
 * **Who may start one is decided here**, per kind, by {@link OWNED_SUBJECT}:
 * the statement that finds the subject for this actor and names the account
 * the draw is billed to. A character is its owner's; a campaign is its
 * creator's, through `campaignWritable`, so a player's request draws nothing;
 * a Shared World is its owner's, through `groupWritable`, so a member's draws
 * nothing either.
 */

export type ImageFailure =
  "refused" | "provider" | "timeout" | "interrupted" | "storage" | "skipped" | "capped";

/** A row the worker is to draw. */
export interface ImageJob {
  readonly kind: ImageKind;
  readonly id: string;
  readonly prefix: StorageKey;
  readonly prompt: string;
}

/**
 * The daily budget, **shared by every kind**: one account's portraits and
 * covers count against one per-account limit, and everybody's against one
 * overall limit. The cost is the same whatever is drawn, so a separate
 * budget per kind would only multiply what one account can spend in a day.
 */
export interface ImageLimits {
  readonly perAccountPerDay: number;
  readonly perDay: number;
}

export interface StoredImage {
  readonly originalType: string;
  readonly sha256: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly originalBytes: number;
  readonly storedBytes: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

/**
 * Where an image's objects live: `{root}/{accountId}/{subjectId}/{imageId}`,
 * e.g. `portraits/…` or `campaign-images/…`. Derived from ids alone, so it
 * never needs a lookup to build and one `deletePrefix` removes every size.
 * Written to the row at insert, which is what the deletion trigger copies.
 */
export const imagePrefix = (
  kind: ImageKind,
  accountId: string,
  subjectId: string,
  imageId: string,
): StorageKey => StorageKey(`${IMAGE_KINDS[kind].root}/${accountId}/${subjectId}/${imageId}`);

/** The key of one stored file under an image's prefix. */
export const imageObjectKey = (prefix: StorageKey, file: string): StorageKey =>
  StorageKey(`${prefix}/${file}`);

/**
 * The subject this actor may start a draw of, locked, with the account it is
 * billed to — or no row. **A kind with no entry here does not compile**, which
 * is the point: whose picture it is must be decided before it can be drawn.
 */
const OWNED_SUBJECT: {
  readonly [K in ImageKind]: (
    sql: SqlClient.SqlClient,
    subjectId: string,
    actor: Actor,
  ) => Statement.Statement<{ readonly subject_id: string; readonly account_id: string }>;
} = {
  character: (sql, subjectId, actor) => sql`
    select character.id as subject_id, character.account_id from character
    where character.id = ${subjectId} and ${ownCharacter(sql, actor)}
    for update
  `,
  // `campaignWritable` matches only for the campaign's creator, so the actor
  // is the one account that may start its cover and the one it is billed to —
  // and `campaign_image_owner_fkey` refuses any other at insert.
  campaign: (sql, subjectId, actor) => sql`
    select campaign.id as subject_id, ${actor.accountId}::uuid as account_id from campaign
    where campaign.id = ${subjectId} and ${campaignWritable(sql, actor)}
    for update of campaign
  `,
  // `groupWritable` matches only an explicit world, and only for its owner —
  // the account `shared_world_image_owner_fkey` names. A hidden context is not
  // a Shared World, so nothing here can draw one.
  sharedWorld: (sql, subjectId, actor) => sql`
    select play_group.id as subject_id, ${actor.accountId}::uuid as account_id from play_group
    where play_group.id = ${subjectId} and ${groupWritable(sql, actor)}
    for update of play_group
  `,
};

/** Midnight UTC today: the caps are per UTC day whatever the session's time zone. */
const utcDayStart = (sql: SqlClient.SqlClient) =>
  sql`(date_trunc('day', now() at time zone 'utc') at time zone 'utc')`;

/** Every kind's rows as one relation, for the statements that span them all. */
const everyImage = (sql: SqlClient.SqlClient) =>
  sql.join(
    " union all ",
    false,
  )(
    ALL_IMAGE_KINDS.map(
      (kind) => sql`select account_id, created_at, failure from ${sql(IMAGE_KINDS[kind].table)}`,
    ),
  );

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One advisory lock serialises every image start, of every kind, so two
 * creates cannot both read a count of nine and both draw the tenth. Starts are
 * rare and the critical section is two counts and an insert.
 */
const START_LOCK = 0x70_6f_72_74; // "port"

export class ImageRecords extends Context.Service<
  ImageRecords,
  {
    /**
     * Record the one image this subject will ever have, and say whether to
     * draw it.
     *
     * `prompt` is `undefined` when there is nothing to draw from; the row is
     * then `failed/skipped`. Over either daily limit it is `failed/capped`.
     * Otherwise it is `generating` and the job comes back. A subject that
     * already has a record, or that this actor may not start a draw of, gets
     * nothing.
     */
    readonly start: (
      kind: ImageKind,
      subjectId: string,
      plan: {
        readonly prompt: string | undefined;
        readonly model: string;
        readonly limits: ImageLimits;
      },
    ) => Effect.Effect<ImageJob | undefined, never, CurrentActor>;
    /**
     * Store and commit a drawn image: lock the row while it is still
     * `generating`, run `put`, mark it `ready`. The lock is what makes a
     * subject deleted mid-draw safe — its cascade waits for this transaction,
     * so the trigger's deletion is enqueued after the last put. `false` when
     * the row is gone or no longer drawing; nothing is put then.
     */
    readonly store: <E>(
      job: ImageJob,
      put: Effect.Effect<void, E>,
      stored: StoredImage,
    ) => Effect.Effect<boolean, E>;
    /**
     * Mark a drawing row failed, and enqueue its prefix for deletion in the
     * same transaction in case anything was put before the failure.
     */
    readonly fail: (job: ImageJob, failure: ImageFailure) => Effect.Effect<void>;
    /**
     * Rows of any kind still `generating` after `olderThanSeconds` belong to a
     * process that died; mark them `interrupted` and enqueue their prefixes.
     * Answers how many.
     */
    readonly sweepStale: (olderThanSeconds: number) => Effect.Effect<number>;
    /** Deletions whose time has come, oldest first. */
    readonly dueDeletions: (
      limit: number,
    ) => Effect.Effect<ReadonlyArray<{ readonly id: string; readonly prefix: string }>>;
    readonly deletionDone: (id: string) => Effect.Effect<void>;
    /** Back off: the next attempt waits a minute per failed attempt, up to an hour. */
    readonly deletionFailed: (id: string, error: string) => Effect.Effect<void>;
    /** The prefix of a `ready` image, for the image route after its signature checked out. */
    readonly readyPrefix: (
      kind: ImageKind,
      imageId: string,
    ) => Effect.Effect<StorageKey | undefined>;
  }
>()("ImageRecords") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const table = (kind: ImageKind) => sql(IMAGE_KINDS[kind].table);

      return {
        start: (kind, subjectId, plan) =>
          sql
            .withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* sql`select pg_advisory_xact_lock(${START_LOCK})`;
                const owned = yield* OWNED_SUBJECT[kind](sql, subjectId, actor);
                const subject = owned[0];
                if (subject === undefined) return undefined;

                // Skipped and capped rows sent nothing, so they spend nothing.
                const [mine, everyone] = yield* Effect.all([
                  sql<{ readonly count: number }>`
                    select count(*)::int as count from (${everyImage(sql)}) as drawn
                    where drawn.account_id = ${subject.account_id}
                      and drawn.created_at >= ${utcDayStart(sql)}
                      and (drawn.failure is null or drawn.failure not in ('skipped', 'capped'))
                  `,
                  sql<{ readonly count: number }>`
                    select count(*)::int as count from (${everyImage(sql)}) as drawn
                    where drawn.created_at >= ${utcDayStart(sql)}
                      and (drawn.failure is null or drawn.failure not in ('skipped', 'capped'))
                  `,
                ]);
                const capped =
                  (mine[0]?.count ?? 0) >= plan.limits.perAccountPerDay ||
                  (everyone[0]?.count ?? 0) >= plan.limits.perDay;

                const id = crypto.randomUUID();
                const prefix = imagePrefix(kind, subject.account_id, subject.subject_id, id);
                const failure: ImageFailure | undefined =
                  plan.prompt === undefined ? "skipped" : capped ? "capped" : undefined;
                const rows = yield* sql<{ readonly id: string }>`
                  insert into ${table(kind)} ${sql.insert({
                    id,
                    [IMAGE_KINDS[kind].subjectColumn]: subject.subject_id,
                    account_id: subject.account_id,
                    state: failure === undefined ? "generating" : "failed",
                    failure: failure ?? null,
                    finished_at: failure === undefined ? null : new Date(),
                    // A skipped row sent nothing, so it records no prompt; a
                    // capped one records what would have been sent.
                    prompt: plan.prompt ?? null,
                    model: failure === "skipped" ? null : plan.model,
                    storage_prefix: prefix,
                  })}
                  on conflict (${sql(IMAGE_KINDS[kind].subjectColumn)}) do nothing
                  returning id
                `;
                if (rows.length === 0 || failure !== undefined || plan.prompt === undefined) {
                  return undefined;
                }
                return { kind, id, prefix, prompt: plan.prompt };
              }),
            )
            .pipe(Effect.orDie),

        store: (job, put, stored) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const locked = yield* sql<{ readonly id: string }>`
                  select id from ${table(job.kind)}
                  where id = ${job.id} and state = 'generating'
                  for update
                `;
                if (locked.length === 0) return false;
                yield* put;
                yield* sql`
                  update ${table(job.kind)} set
                    state = 'ready',
                    original_type = ${stored.originalType},
                    content_sha256 = ${Buffer.from(stored.sha256)},
                    width = ${stored.width},
                    height = ${stored.height},
                    original_bytes = ${stored.originalBytes},
                    stored_bytes = ${stored.storedBytes},
                    input_tokens = ${stored.inputTokens},
                    output_tokens = ${stored.outputTokens},
                    finished_at = now(),
                    updated_at = now()
                  where id = ${job.id}
                `;
                return true;
              }),
            ),
          ),

        fail: (job, failure) =>
          sql
            .withTransaction(
              Effect.gen(function* () {
                const rows = yield* sql<{ readonly storage_prefix: string }>`
                  update ${table(job.kind)} set
                    state = 'failed', failure = ${failure}, finished_at = now(), updated_at = now()
                  where id = ${job.id} and state = 'generating'
                  returning storage_prefix
                `;
                if (rows.length > 0) {
                  yield* sql`insert into storage_deletion (prefix) values (${rows[0]!.storage_prefix})`;
                }
              }),
            )
            .pipe(Effect.orDie),

        sweepStale: (olderThanSeconds) =>
          Effect.forEach(ALL_IMAGE_KINDS, (kind) =>
            sql<{ readonly count: number }>`
              with swept as (
                update ${table(kind)} set
                  state = 'failed', failure = 'interrupted', finished_at = now(), updated_at = now()
                where state = 'generating'
                  and created_at < now() - make_interval(secs => ${olderThanSeconds})
                returning storage_prefix
              ), enqueued as (
                insert into storage_deletion (prefix) select storage_prefix from swept
                returning 1
              )
              select count(*)::int as count from enqueued
            `.pipe(Effect.map((rows) => rows[0]?.count ?? 0)),
          ).pipe(
            Effect.map((counts) => counts.reduce((total, count) => total + count, 0)),
            Effect.orDie,
          ),

        dueDeletions: (limit) =>
          sql<{ readonly id: string; readonly prefix: string }>`
            select id, prefix from storage_deletion
            where not_before <= now()
            order by not_before asc, enqueued_at asc
            limit ${limit}
          `.pipe(Effect.orDie),

        deletionDone: (id) =>
          sql`delete from storage_deletion where id = ${id}`.pipe(Effect.orDie, Effect.asVoid),

        deletionFailed: (id, error) =>
          sql`
            update storage_deletion set
              attempts = attempts + 1,
              last_error = ${error.slice(0, 500)},
              not_before = now() + make_interval(mins => least(attempts + 1, 60))
            where id = ${id}
          `.pipe(Effect.orDie, Effect.asVoid),

        readyPrefix: (kind, imageId) =>
          UUID.test(imageId)
            ? sql<{ readonly storage_prefix: string }>`
                select storage_prefix from ${table(kind)}
                where id = ${imageId} and state = 'ready'
              `.pipe(
                Effect.map((rows) =>
                  rows[0] === undefined ? undefined : StorageKey(rows[0].storage_prefix),
                ),
                Effect.orDie,
              )
            : Effect.succeed(undefined),
      };
    }),
  );
}
