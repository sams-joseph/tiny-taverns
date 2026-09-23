import { type CharacterId, CurrentActor } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { StorageKey } from "../storage/ObjectStorage.js";
import { dieOnSqlError } from "./rows.js";
import { ownCharacter } from "./visibility.js";

/**
 * Every statement about `character_portrait` and `storage_deletion`
 * (`0048_character_portraits.ts`). The worker that draws and stores is
 * `portraits/Portraits.ts`; this file is only rows.
 *
 * **Who may read a portrait is not decided here.** The wire carries a portrait
 * only as a field of `Character`, minted by `toCharacter` for a row a
 * visibility predicate already returned. The one read below that takes no
 * actor, {@link PortraitRecords} `readyPrefix`, runs only after the image route
 * has checked a signature that such a read minted.
 */

export type PortraitFailure =
  "refused" | "provider" | "timeout" | "interrupted" | "storage" | "skipped" | "capped";

/** A row the worker is to draw. */
export interface PortraitJob {
  readonly id: string;
  readonly prefix: StorageKey;
  readonly prompt: string;
}

export interface PortraitLimits {
  readonly perAccountPerDay: number;
  readonly perDay: number;
}

export interface StoredPortrait {
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
 * Where a portrait's objects live: `portraits/{accountId}/{characterId}/{portraitId}`.
 * Derived from ids alone, so it never needs a lookup to build and one
 * `deletePrefix` removes every size. Written to the row at insert, which is
 * what the deletion trigger copies.
 */
export const portraitPrefix = (
  accountId: string,
  characterId: string,
  portraitId: string,
): StorageKey => StorageKey(`portraits/${accountId}/${characterId}/${portraitId}`);

/** The key of one stored file under a portrait's prefix. */
export const portraitObjectKey = (prefix: StorageKey, file: string): StorageKey =>
  StorageKey(`${prefix}/${file}`);

/** Midnight UTC today: the caps are per UTC day whatever the session's time zone. */
const utcDayStart = (sql: SqlClient.SqlClient) =>
  sql`(date_trunc('day', now() at time zone 'utc') at time zone 'utc')`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One advisory lock serialises every portrait start, so two creates cannot
 * both read a count of nine and both draw the tenth. Starts are rare and the
 * critical section is two counts and an insert.
 */
const START_LOCK = 0x70_6f_72_74; // "port"

export class PortraitRecords extends Context.Service<
  PortraitRecords,
  {
    /**
     * Record the one portrait this character will ever have, and say whether
     * to draw it.
     *
     * `prompt` is `undefined` when there is nothing to draw from; the row is
     * then `failed/skipped`. Over either daily limit it is `failed/capped`.
     * Otherwise it is `generating` and the job comes back. A character that
     * already has a record, or that is not the actor's, gets nothing.
     */
    readonly start: (
      characterId: CharacterId,
      plan: {
        readonly prompt: string | undefined;
        readonly model: string;
        readonly limits: PortraitLimits;
      },
    ) => Effect.Effect<PortraitJob | undefined, never, CurrentActor>;
    /**
     * Store and commit a drawn portrait: lock the row while it is still
     * `generating`, run `put`, mark it `ready`. The lock is what makes a
     * character deleted mid-draw safe — its cascade waits for this
     * transaction, so the trigger's deletion is enqueued after the last put.
     * `false` when the row is gone or no longer drawing; nothing is put then.
     */
    readonly store: <E>(
      job: PortraitJob,
      put: Effect.Effect<void, E>,
      stored: StoredPortrait,
    ) => Effect.Effect<boolean, E>;
    /**
     * Mark a drawing row failed, and enqueue its prefix for deletion in the
     * same transaction in case anything was put before the failure.
     */
    readonly fail: (job: PortraitJob, failure: PortraitFailure) => Effect.Effect<void>;
    /**
     * Rows still `generating` after `olderThanSeconds` belong to a process that
     * died; mark them `interrupted` and enqueue their prefixes. Answers how many.
     */
    readonly sweepStale: (olderThanSeconds: number) => Effect.Effect<number>;
    /** Deletions whose time has come, oldest first. */
    readonly dueDeletions: (
      limit: number,
    ) => Effect.Effect<ReadonlyArray<{ readonly id: string; readonly prefix: string }>>;
    readonly deletionDone: (id: string) => Effect.Effect<void>;
    /** Back off: the next attempt waits a minute per failed attempt, up to an hour. */
    readonly deletionFailed: (id: string, error: string) => Effect.Effect<void>;
    /** The prefix of a `ready` portrait, for the image route after its signature checked out. */
    readonly readyPrefix: (portraitId: string) => Effect.Effect<StorageKey | undefined>;
  }
>()("PortraitRecords") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      return {
        start: (characterId, plan) =>
          sql
            .withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                yield* sql`select pg_advisory_xact_lock(${START_LOCK})`;
                const owned = yield* sql<{ readonly id: string; readonly account_id: string }>`
                  select character.id, character.account_id from character
                  where character.id = ${characterId} and ${ownCharacter(sql, actor)}
                  for update
                `;
                const character = owned[0];
                if (character === undefined) return undefined;

                const [mine, everyone] = yield* Effect.all([
                  sql<{ readonly count: number }>`
                    select count(*)::int as count from character_portrait
                    where account_id = ${character.account_id}
                      and created_at >= ${utcDayStart(sql)}
                      and (failure is null or failure not in ('skipped', 'capped'))
                  `,
                  sql<{ readonly count: number }>`
                    select count(*)::int as count from character_portrait
                    where created_at >= ${utcDayStart(sql)}
                      and (failure is null or failure not in ('skipped', 'capped'))
                  `,
                ]);
                const capped =
                  (mine[0]?.count ?? 0) >= plan.limits.perAccountPerDay ||
                  (everyone[0]?.count ?? 0) >= plan.limits.perDay;

                const id = crypto.randomUUID();
                const prefix = portraitPrefix(character.account_id, character.id, id);
                const failure: PortraitFailure | undefined =
                  plan.prompt === undefined ? "skipped" : capped ? "capped" : undefined;
                const rows = yield* sql<{ readonly id: string }>`
                  insert into character_portrait ${sql.insert({
                    id,
                    character_id: character.id,
                    account_id: character.account_id,
                    state: failure === undefined ? "generating" : "failed",
                    failure: failure ?? null,
                    finished_at: failure === undefined ? null : new Date(),
                    // A skipped row sent nothing, so it records no prompt; a
                    // capped one records what would have been sent.
                    prompt: plan.prompt ?? null,
                    model: failure === "skipped" ? null : plan.model,
                    storage_prefix: prefix,
                  })}
                  on conflict (character_id) do nothing
                  returning id
                `;
                if (rows.length === 0 || failure !== undefined || plan.prompt === undefined) {
                  return undefined;
                }
                return { id, prefix, prompt: plan.prompt };
              }),
            )
            .pipe(Effect.orDie),

        store: (job, put, stored) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const locked = yield* sql<{ readonly id: string }>`
                  select id from character_portrait
                  where id = ${job.id} and state = 'generating'
                  for update
                `;
                if (locked.length === 0) return false;
                yield* put;
                yield* sql`
                  update character_portrait set
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
                  update character_portrait set
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
          sql<{ readonly count: number }>`
            with swept as (
              update character_portrait set
                state = 'failed', failure = 'interrupted', finished_at = now(), updated_at = now()
              where state = 'generating'
                and created_at < now() - make_interval(secs => ${olderThanSeconds})
              returning storage_prefix
            ), enqueued as (
              insert into storage_deletion (prefix) select storage_prefix from swept
              returning 1
            )
            select count(*)::int as count from enqueued
          `.pipe(
            Effect.map((rows) => rows[0]?.count ?? 0),
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

        readyPrefix: (portraitId) =>
          UUID.test(portraitId)
            ? sql<{ readonly storage_prefix: string }>`
                select storage_prefix from character_portrait
                where id = ${portraitId} and state = 'ready'
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
