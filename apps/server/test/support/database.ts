import { NodeServices } from "@effect/platform-node";
import { PgClient } from "@effect/sql-pg";
import { Effect, Layer, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import * as Database from "../../src/Database.js";
import { DEV_DATABASE_URL } from "../../src/Config.js";

const UNSET = `
DATABASE_URL is not set, so the server tests do not know which Postgres to use.

  pnpm db:up
  DATABASE_URL=${DEV_DATABASE_URL} pnpm -F server test

Every test file force-drops and recreates a database of a fixed name, so the
suite never falls back to the development default the way \`pnpm dev\` does: a
run that loses the variable on the way (turbo drops what \`turbo.json\` does not
pass through) would otherwise land on whatever answers on port 5433.
`;

/**
 * The Postgres the suite was pointed at, required rather than defaulted.
 *
 * Thrown at import, so every database-backed file fails with this text before
 * it touches anything.
 */
const requiredDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") throw new Error(UNSET);
  return url;
};

const base = new URL(requiredDatabaseUrl());

const urlFor = (database: string): string => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};

/**
 * The database one test file gets: `name`, or `<prefix>_<name>` when
 * `TAVERNS_TEST_DATABASE_PREFIX` is set.
 *
 * Every file force-drops its database before creating it, so two runs on one
 * Postgres server with the same names destroy each other's. A run that shares
 * the development server (`scripts/with-private-postgres.sh`) sets a prefix of
 * its own, so its databases can neither collide with the maintainer's nor
 * outlive the run: the script drops everything under its prefix afterwards.
 */
export const testDatabaseName = (name: string, prefix: string | undefined): string => {
  if (prefix === undefined || prefix === "") return name;
  if (!/^[a-z][a-z0-9_]*$/.test(prefix)) {
    throw new Error(
      `TAVERNS_TEST_DATABASE_PREFIX must be lower-case letters, digits and _; got ${JSON.stringify(prefix)}`,
    );
  }
  const database = `${prefix}_${name}`;
  // Postgres silently truncates longer identifiers, and two truncated names can collide.
  if (database.length > 63) {
    throw new Error(`Test database name ${database} is longer than Postgres's 63 characters`);
  }
  return database;
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
      const database = testDatabaseName(name, process.env.TAVERNS_TEST_DATABASE_PREFIX);
      const quoted = `"${database.replaceAll('"', '""')}"`;
      yield* sql.unsafe(`drop database if exists ${quoted} with (force)`);
      yield* sql.unsafe(`create database ${quoted}`);
      return PgClient.layer({ url: Redacted.make(urlFor(database)) });
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
      const database = testDatabaseName(name, process.env.TAVERNS_TEST_DATABASE_PREFIX);
      const quoted = `"${database.replaceAll('"', '""')}"`;
      yield* sql.unsafe(`drop database if exists ${quoted} with (force)`);
      yield* sql.unsafe(`create database ${quoted}`);
      return urlFor(database);
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
