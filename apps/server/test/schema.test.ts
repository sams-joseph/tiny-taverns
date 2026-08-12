import { Effect, ManagedRuntime } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migratedDatabase } from "./support/database.js";

const runtime = ManagedRuntime.make(migratedDatabase("taverns_test_schema"));
afterAll(() => runtime.dispose());

/**
 * Tables that hold no campaign content and so carry no visibility.
 *
 * Adding a name here is the only way to opt a table out, which is the point:
 * it takes a deliberate edit and shows up in review. A table added without one
 * fails this file.
 */
const NOT_CONTENT = ["account", "effect_sql_migrations"];

interface Column {
  readonly table_name: string;
  readonly column_name: string;
  readonly data_type: string;
  readonly is_nullable: "YES" | "NO";
  readonly column_default: string | null;
}

let contentTables: ReadonlyArray<string>;
let columns: ReadonlyArray<Column>;

const columnFor = (table: string, column: string): Column | undefined =>
  columns.find((c) => c.table_name === table && c.column_name === column);

beforeAll(async () => {
  const rows = await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      return yield* sql<Column>`
        select table_name, column_name, data_type, is_nullable, column_default
        from information_schema.columns
        where table_schema = 'public'
        order by table_name, column_name
      `;
    }).pipe(Effect.orDie),
  );

  columns = rows;
  contentTables = [...new Set(rows.map((row) => row.table_name))]
    .filter((table) => !NOT_CONTENT.includes(table))
    .sort();
}, 60_000);

describe("every content-bearing table", () => {
  it("is the set this file thinks it is", () => {
    // A guard on the guard: if this list changes, the assertions below have
    // started covering something new, and somebody should have noticed.
    expect(contentTables).toEqual([
      "assistant_thread",
      "assistant_turn",
      "beat",
      "campaign",
      "character",
      "combatant",
      "creature",
      "encounter",
      "encounter_creature",
      "encounter_run",
      "note",
      "prep_item",
      "session",
      "session_event",
    ]);
  });

  it("has a visibility column that is not null and defaults to dm", () => {
    for (const table of contentTables) {
      const visibility = columnFor(table, "visibility");

      expect(visibility, `${table}.visibility is missing`).toBeDefined();
      expect(visibility?.is_nullable, `${table}.visibility is nullable`).toBe("NO");
      expect(visibility?.column_default, `${table}.visibility does not default to dm`).toBe(
        "'dm'::text",
      );
    }
  });

  it("carries provenance from the first migration", () => {
    // Added in `0001` and inert for nine migrations, because retrofitting
    // provenance onto a table that already mixes authored and generated rows
    // means guessing which is which. `0010` gave the pointer a referent; the
    // block at the bottom of this file is where it is now exercised.
    for (const table of contentTables) {
      const origin = columnFor(table, "origin");
      const turn = columnFor(table, "assistant_turn_id");

      expect(origin?.is_nullable, `${table}.origin is nullable`).toBe("NO");
      expect(origin?.column_default, `${table}.origin does not default to authored`).toBe(
        "'authored'::text",
      );
      expect(turn?.data_type, `${table}.assistant_turn_id is missing`).toBe("uuid");
      expect(turn?.is_nullable, `${table}.assistant_turn_id is not nullable`).toBe("YES");
    }
  });

  it("constrains visibility and origin to the values the schema names", async () => {
    const constraints = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{ readonly table_name: string; readonly check_clause: string }>`
          select rel.relname as table_name, pg_get_constraintdef(con.oid) as check_clause
          from pg_constraint con
          join pg_class rel on rel.oid = con.conrelid
          join pg_namespace nsp on nsp.oid = rel.relnamespace
          where nsp.nspname = 'public' and con.contype = 'c'
        `;
      }).pipe(Effect.orDie),
    );

    for (const table of contentTables) {
      const clauses = constraints
        .filter((row) => row.table_name === table)
        .map((row) => row.check_clause)
        .join(" ");

      expect(clauses, `${table} does not constrain visibility`).toContain("visibility");
      expect(clauses, `${table} does not constrain origin`).toContain("origin");
      // origin = 'assistant' exactly when a turn id is present.
      expect(clauses, `${table} does not tie origin to assistant_turn_id`).toContain(
        "assistant_turn_id",
      );
    }
  });
});

describe("an account must be reachable by something", () => {
  it("accepts either credential alone and refuses a row with neither", async () => {
    const insert = (values: Record<string, string | null>) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`insert into account ${sql.insert({ name: "Jo", ...values })}`;
        }).pipe(Effect.result),
      );

    const machineOnly = await insert({ token_hash: "credential-machine" });
    const hostedOnly = await insert({ clerk_user_id: "user_credential" });
    const both = await insert({ token_hash: "credential-both", clerk_user_id: "user_both" });
    // An account nobody can ever authenticate as is a bug, not a state.
    const neither = await insert({});

    expect(machineOnly._tag).toBe("Success");
    expect(hostedOnly._tag).toBe("Success");
    expect(both._tag).toBe("Success");
    expect(neither._tag).toBe("Failure");
  });

  it("still requires a token hash to be unique, now that it is nullable", async () => {
    // Postgres permits many NULLs under a unique constraint, which is what
    // makes the column nullable safe — but two accounts sharing a hash would
    // mean one token authenticating as either.
    const insert = (tokenHash: string) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`insert into account ${sql.insert({ name: "Jo", token_hash: tokenHash })}`;
        }).pipe(Effect.result),
      );

    expect((await insert("credential-unique"))._tag).toBe("Success");
    expect((await insert("credential-unique"))._tag).toBe("Failure");
  });
});

describe("provenance is enforced, not just declared", () => {
  /**
   * A conversation to point at.
   *
   * The check has been on every content table since `0001_init.ts` and was
   * vacuously satisfiable until `0010`: `assistant_turn_id` had no referent, so
   * a row could claim `origin = 'assistant'` and name any uuid it liked. Now
   * there is a table, and the assertions below are about a real turn — which is
   * also what makes the last one, a turn id that names nothing, worth writing.
   */
  const aRealTurn = (label: string) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const account = yield* sql<{ readonly id: string }>`
        insert into account ${sql.insert({ name: "Jo", token_hash: `provenance-${label}` })}
        returning id
      `;
      const campaign = yield* sql<{ readonly id: string }>`
        insert into campaign ${sql.insert({ account_id: account[0]!.id, name: `provenance ${label}` })}
        returning id
      `;
      const thread = yield* sql<{ readonly id: string }>`
        insert into assistant_thread ${sql.insert({
          campaign_id: campaign[0]!.id,
          title: "Who is the ferryman?",
        })}
        returning id
      `;
      const turn = yield* sql<{ readonly id: string }>`
        insert into assistant_turn ${sql.insert({
          thread_id: thread[0]!.id,
          who: "user",
          body: "hi",
        })}
        returning id
      `;
      return { accountId: account[0]!.id, turnId: turn[0]!.id };
    }).pipe(Effect.orDie);

  it("rejects an assistant row with no turn id, and an authored row with one", async () => {
    const { accountId, turnId } = await runtime.runPromise(aRealTurn("pair"));

    const insert = (origin: string, turn: string | null) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          yield* sql`
            insert into campaign ${sql.insert({
              account_id: accountId,
              name: `provenance ${origin} ${String(turn)}`,
              origin,
              assistant_turn_id: turn,
            })}
          `;
        }).pipe(Effect.result),
      );

    const assistantWithoutTurn = await insert("assistant", null);
    const authoredWithTurn = await insert("authored", turnId);
    const assistantWithTurn = await insert("assistant", turnId);

    expect(assistantWithoutTurn._tag).toBe("Failure");
    expect(authoredWithTurn._tag).toBe("Failure");
    expect(assistantWithTurn._tag).toBe("Success");
  });

  it("refuses a turn id that names no turn", async () => {
    // What `0010` bought. Before it, this row was accepted and the campaign
    // carried a provenance trail leading nowhere — which is worse than none,
    // because it reads as an answer.
    const { accountId } = await runtime.runPromise(aRealTurn("invented"));
    const invented = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`
          insert into campaign ${sql.insert({
            account_id: accountId,
            name: "provenance invented",
            origin: "assistant",
            assistant_turn_id: "00000000-0000-4000-8000-000000000001",
          })}
        `;
      }).pipe(Effect.result),
    );

    expect(invented._tag).toBe("Failure");
  });

  it("keeps an accepted row's turn from being deleted out from under it", async () => {
    // The provenance trail has to survive, so the reference is `no action`
    // rather than `set null` — which the check constraint would reject anyway.
    const { accountId, turnId } = await runtime.runPromise(aRealTurn("pinned"));
    const deleted = await runtime.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* sql`
          insert into campaign ${sql.insert({
            account_id: accountId,
            name: "provenance pinned",
            origin: "assistant",
            assistant_turn_id: turnId,
          })}
        `;
        yield* sql`delete from assistant_turn where id = ${turnId}`;
      }).pipe(Effect.result),
    );

    expect(deleted._tag).toBe("Failure");
  });
});
