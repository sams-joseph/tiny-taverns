import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, describe, expect, it } from "vitest";
import * as Database from "../src/Database.js";
import init from "../src/migrations/0001_init.js";
import clerkIdentity from "../src/migrations/0002_clerk_identity.js";
import sessionFinished from "../src/migrations/0006_session_finished.js";
import { freshDatabase } from "./support/database.js";

/** Migrations run against a database created empty for this file. */
const runtime = ManagedRuntime.make(freshDatabase("taverns_test_migrations"));
afterAll(() => runtime.dispose());

/** A second empty database, for stepping through the migrations by hand. */
const upgradeRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_upgrade"));
afterAll(() => upgradeRuntime.dispose());

/** A third, for the database that already holds the shipped defect. */
const stuckRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_stuck"));
afterAll(() => stuckRuntime.dispose());

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
      "assistant_thread",
      "assistant_turn",
      "beat",
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
      { migration_id: 6, name: "session_finished" },
      { migration_id: 7, name: "run_carryover" },
      { migration_id: 8, name: "beats" },
      { migration_id: 9, name: "search_index" },
      { migration_id: 10, name: "assistant_conversation" },
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
      { migration_id: 6, name: "session_finished" },
      { migration_id: 7, name: "run_carryover" },
      { migration_id: 8, name: "beats" },
      { migration_id: 9, name: "search_index" },
      { migration_id: 10, name: "assistant_conversation" },
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

describe("upgrading a database left in the dead end", () => {
  it("releases a campaign still pointing at a session it finished", async () => {
    // The shipped defect, on every database that has run one night to its end:
    // `ended_at` stamped, the pointer never moved. `0006` cannot add its
    // foreign key while such a row exists, so it repairs them first — and the
    // repair is exactly what the fix would have done at the time. Stepped by
    // hand for the reason the test above is: the property is about rows written
    // under the old schema, which an empty database cannot show.
    const campaignAfterUpgrade = await stuckRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* init;
        const accounts = yield* sql<{
          readonly id: string;
        }>`insert into account ${sql.insert({ name: "Jo", token_hash: "hash" })} returning id`;
        const campaigns = yield* sql<{ readonly id: string }>`
          insert into campaign ${sql.insert({ account_id: accounts[0]!.id, name: "The Salt Road" })}
          returning id
        `;
        const sessions = yield* sql<{ readonly id: string }>`
          insert into session ${sql.insert({ campaign_id: campaigns[0]!.id, number: 12 })}
          returning id
        `;
        // A night run to its end under the old code: both halves of §1.4's
        // transition were the client's to do, and it only did the first.
        yield* sql`update session set ended_at = now() where id = ${sessions[0]!.id}`;
        yield* sql`
          update campaign set current_session_id = ${sessions[0]!.id}
          where id = ${campaigns[0]!.id}
        `;

        yield* sessionFinished;

        return yield* sql<{ readonly current_session_id: string | null }>`
          select current_session_id from campaign where id = ${campaigns[0]!.id}
        `;
      }).pipe(Effect.orDie),
    );

    expect(campaignAfterUpgrade).toEqual([{ current_session_id: null }]);
  }, 60_000);
});
