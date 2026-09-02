import { NodeServices } from "@effect/platform-node";
import { PgClient } from "@effect/sql-pg";
import { Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import * as Database from "../../src/Database.js";
import { DEV_DATABASE_URL } from "../../src/Config.js";

const base = new URL(process.env.DATABASE_URL ?? DEV_DATABASE_URL);

const urlFor = (database: string): string => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};

/** Where the tests are pointed, with any password removed. */
const describeTarget = (): string => `${base.host}${base.pathname}`;

const UNREACHABLE = `
Postgres is not reachable at ${describeTarget()}.

  pnpm db:up      start the development database (docker compose)
  pnpm db:reset   start it again from empty

The repository and migration tests run against a real Postgres on purpose — the
schema is Postgres dialect and a stand-in would not exercise it. They fail here
rather than skipping, because a silently skipped database test is a green build
that proves nothing.
`;

/**
 * Turns "cannot connect" into a message that says what to do about it.
 *
 * A dying layer fails every test in the file with this text, which is the point:
 * the failure has to be impossible to mistake for a passing run.
 */
const orExplain = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, never, R> =>
  Effect.catch(effect, (error) => Effect.die(new Error(`${UNREACHABLE}\n${String(error)}`)));

/**
 * A private, freshly created database for one test file.
 *
 * Per-file rather than per-run so files stay independent under Vitest's parallel
 * file execution, and so the migration test gets a genuinely empty database
 * rather than one another test has already migrated.
 */
export const freshDatabase = (name: string): Layer.Layer<SqlClient.SqlClient | PgClient.PgClient> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const quoted = `"${name.replaceAll('"', '""')}"`;
      yield* sql.unsafe(`drop database if exists ${quoted} with (force)`);
      yield* sql.unsafe(`create database ${quoted}`);
      return PgClient.layer({ url: Redacted.make(urlFor(name)) });
    }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(urlFor("postgres")) })), orExplain),
  ).pipe(Layer.orDie);

/**
 * A fresh database as a plain URL — for the one file that spawns a real
 * `node` process rather than building a layer (`start.smoke.test.ts`).
 *
 * The smoke test used to let `dist/main.js` inherit the developer's
 * `DATABASE_URL` default, which meant a spawned server migrating **the shared
 * dev database** on boot. That was invisible while the ledger never grew past
 * what dev had applied — and became a boot failure (and a near-miss write to
 * a database the suite does not own) the day the clean baseline added `0030`:
 * an old-ledger dev database cannot take a new migration, by design. A
 * spawned server gets a database of its own, like every other file.
 */
export const provisionDatabase = (name: string): Promise<string> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const quoted = `"${name.replaceAll('"', '""')}"`;
      yield* sql.unsafe(`drop database if exists ${quoted} with (force)`);
      yield* sql.unsafe(`create database ${quoted}`);
      return urlFor(name);
    }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(urlFor("postgres")) })), orExplain),
  );

/** A fresh database with the migrations already applied. */
export const migratedDatabase = (
  name: string,
): Layer.Layer<SqlClient.SqlClient | PgClient.PgClient> =>
  Layer.provideMerge(Database.layerMigrator, freshDatabase(name)).pipe(
    Layer.provide(NodeServices.layer),
    Layer.orDie,
  );
