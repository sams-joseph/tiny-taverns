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
      "campaign",
      "character",
      "encounter",
      "note",
      "prep_item",
      "session",
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
    // Inert until the assistant ships. They are here now because retrofitting
    // provenance onto a table that already mixes authored and generated rows
    // means guessing which is which.
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
  it("rejects an assistant row with no turn id, and an authored row with one", async () => {
    const insert = (origin: string, turnId: string | null) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          const account = yield* sql<{ readonly id: string }>`
            insert into account ${sql.insert({ name: "Jo", token_hash: `${origin}-${turnId}` })}
            returning id
          `;
          yield* sql`
            insert into campaign ${sql.insert({
              account_id: account[0]!.id,
              name: "provenance",
              origin,
              assistant_turn_id: turnId,
            })}
          `;
        }).pipe(Effect.result),
      );

    const assistantWithoutTurn = await insert("assistant", null);
    const authoredWithTurn = await insert("authored", "00000000-0000-4000-8000-000000000000");
    const assistantWithTurn = await insert("assistant", "00000000-0000-4000-8000-000000000001");

    expect(assistantWithoutTurn._tag).toBe("Failure");
    expect(authoredWithTurn._tag).toBe("Failure");
    expect(assistantWithTurn._tag).toBe("Success");
  });
});
