import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, describe, expect, it } from "vitest";
import * as Database from "../src/Database.js";
import init from "../src/migrations/0001_init.js";
import clerkIdentity from "../src/migrations/0002_clerk_identity.js";
import sessionFinished from "../src/migrations/0006_session_finished.js";
import membership from "../src/migrations/0011_membership.js";
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

/** A fourth, for campaigns written before membership existed. */
const ownedRuntime = ManagedRuntime.make(freshDatabase("taverns_test_migrations_owned"));
afterAll(() => ownedRuntime.dispose());

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
      "campaign_member",
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
      { migration_id: 11, name: "membership" },
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
      { migration_id: 11, name: "membership" },
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

describe("upgrading a database whose campaigns predate membership", () => {
  it("gives every existing campaign its owner as a DM member, and leaves none without one", async () => {
    // The risky half of `0011`. Reach used to be `campaign.account_id`, so
    // every campaign that exists is reached by its owner and by nobody else —
    // the backfill has to say exactly that, for every row, before the composite
    // key is added. A campaign it missed would not merely lose its DM: the
    // constraint could not be created at all, and the migration would fail on
    // the DM's database rather than here.
    //
    // Stepped by hand for the reason the two tests above are: the property is
    // about rows written under the old schema, and an empty database cannot
    // show it. Two DMs, three campaigns — one of them running two tables, which
    // is the case a naive `select distinct account_id` would get wrong.
    const { members, orphans, refused } = await ownedRuntime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;

        yield* init;
        const account = (name: string, hash: string) =>
          sql<{ readonly id: string }>`
            insert into account ${sql.insert({ name, token_hash: hash })} returning id
          `;
        const campaign = (accountId: string, name: string) =>
          sql<{ readonly id: string }>`
            insert into campaign ${sql.insert({ account_id: accountId, name })} returning id
          `;

        const ada = (yield* account("Ada", "ada-hash"))[0]!.id;
        const bo = (yield* account("Bo", "bo-hash"))[0]!.id;
        yield* campaign(ada, "The Salt Road");
        yield* campaign(ada, "Salt and Sixpence");
        yield* campaign(bo, "The Hag's Bargain");

        yield* membership;

        const members = yield* sql<{
          readonly name: string;
          readonly owner: string;
          readonly role: string;
          readonly is_dm: boolean;
          readonly revoked_at: Date | null;
        }>`
          select campaign.name, account.name as owner,
                 campaign_member.role, campaign_member.is_dm, campaign_member.revoked_at
          from campaign_member
          join campaign on campaign.id = campaign_member.campaign_id
          join account on account.id = campaign_member.account_id
          order by campaign.name
        `;

        // Asked of the schema rather than of the three rows above, so it stays
        // true of a database with three hundred.
        const orphans = yield* sql<{ readonly count: number }>`
          select count(*)::int as count from campaign
          where not exists (
            select 1 from campaign_member
            where campaign_member.campaign_id = campaign.id
              and campaign_member.account_id = campaign.account_id
              and campaign_member.role = 'dm'
              and campaign_member.revoked_at is null
          )
        `;

        // And the constraint is really in place afterwards, not merely declared.
        const refused = yield* sql`
          insert into campaign ${sql.insert({ account_id: ada, name: "No DM" })}
        `.pipe(Effect.result);

        return { members, orphans: orphans[0]!.count, refused: refused._tag };
      }).pipe(Effect.orDie),
    );

    expect(members).toEqual([
      { name: "Salt and Sixpence", owner: "Ada", role: "dm", is_dm: true, revoked_at: null },
      { name: "The Hag's Bargain", owner: "Bo", role: "dm", is_dm: true, revoked_at: null },
      { name: "The Salt Road", owner: "Ada", role: "dm", is_dm: true, revoked_at: null },
    ]);
    expect(orphans).toBe(0);
    expect(refused).toBe("Failure");
  }, 60_000);
});
