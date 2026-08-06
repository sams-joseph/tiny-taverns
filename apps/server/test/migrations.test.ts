import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, describe, expect, it } from "vitest";
import * as Database from "../src/Database.js";
import { freshDatabase } from "./support/database.js";

/** Migrations run against a database created empty for this file. */
const runtime = ManagedRuntime.make(freshDatabase("taverns_test_migrations"));
afterAll(() => runtime.dispose());

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
      "effect_sql_migrations",
      "note",
      "session",
    ]);
    expect(await runtime.runPromise(appliedMigrations)).toEqual([
      { migration_id: 1, name: "init" },
    ]);
  }, 60_000);

  it("are a no-op when run a second time", async () => {
    // Forward-only — `Migrator` has no down-migration concept — so "safe to
    // re-run" is the only property there is to hold onto.
    await runtime.runPromise(migrate);
    await runtime.runPromise(migrate);

    expect(await runtime.runPromise(appliedMigrations)).toEqual([
      { migration_id: 1, name: "init" },
    ]);
  }, 60_000);
});
