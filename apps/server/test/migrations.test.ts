import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, describe, expect, it } from "vitest";
import * as Database from "../src/Database.js";
import init from "../src/migrations/0001_init.js";
import clerkIdentity from "../src/migrations/0002_clerk_identity.js";
import { freshDatabase } from "./support/database.js";

/** Migrations run against a database created empty for this file. */
const runtime = ManagedRuntime.make(freshDatabase("taverns_test_migrations"));
afterAll(() => runtime.dispose());

/** A second empty database, for stepping through the migrations by hand. */
const upgradeRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_upgrade"));
afterAll(() => upgradeRuntime.dispose());

const migrate = Effect.scoped(
  Layer.build(Layer.provide(Database.layerMigrator, NodeServices.layer)),
).pipe(Effect.orDie);

const tableNames = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly table_name: string }>`
    select table_name from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `;
  return rows.map((row) => row.table_name);
});

const appliedMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql<{ readonly migration_id: number; readonly name: string }>`
    select migration_id, name from effect_sql_migrations order by migration_id
  `;
});

describe("migrations", () => {
  it("bring an empty database up to the current schema", async () => {
    expect(await runtime.runPromise(tableNames)).toEqual([]);

    await runtime.runPromise(migrate);

    expect(await runtime.runPromise(tableNames)).toEqual([
      "account",
      "campaign",
      "character",
      "combatant",
      "creature",
      "effect_sql_migrations",
      "encounter",
      "encounter_creature",
      "encounter_run",
      "note",
      "prep_item",
      "session",
      "session_event",
    ]);
    expect(await runtime.runPromise(appliedMigrations)).toEqual([
      { migration_id: 1, name: "init" },
      { migration_id: 2, name: "clerk_identity" },
      { migration_id: 3, name: "prep_surface" },
      { migration_id: 4, name: "bestiary" },
      { migration_id: 5, name: "live_session" },
    ]);
  }, 60_000);

  it("are a no-op when run a second time", async () => {
    // Forward-only — `Migrator` has no down-migration concept — so "safe to
    // re-run" is the only property there is to hold onto.
    await runtime.runPromise(migrate);
    await runtime.runPromise(migrate);

    expect(await runtime.runPromise(appliedMigrations)).toEqual([
      { migration_id: 1, name: "init" },
      { migration_id: 2, name: "clerk_identity" },
      { migration_id: 3, name: "prep_surface" },
      { migration_id: 4, name: "bestiary" },
      { migration_id: 5, name: "live_session" },
    ]);
  }, 60_000);
});

describe("upgrading a database that already holds accounts", () => {
  it("adds the second credential without a backfill and without losing a row", async () => {
    // Stepped by hand rather than through the migrator, because the property
    // is about the *order*: rows written under the old schema have to satisfy
    // the new constraint as they stand. Running both migrations against an
    // empty database — which the tests above do — cannot show that.
    const accountsAfterUpgrade = await upgradeRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* init;
        // An account as 0001 knew them: a machine token and nothing else.
        yield* sql`insert into account ${sql.insert({ name: "Jo", token_hash: "existing-hash" })}`;

        yield* clerkIdentity;

        return yield* sql<{
          readonly name: string;
          readonly token_hash: string | null;
          readonly clerk_user_id: string | null;
        }>`select name, token_hash, clerk_user_id from account`;
      }).pipe(Effect.orDie),
    );

    expect(accountsAfterUpgrade).toEqual([
      { name: "Jo", token_hash: "existing-hash", clerk_user_id: null },
    ]);
  }, 60_000);
});
