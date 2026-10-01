import { expect } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { intArray, textArray, uuidArray } from "../src/repo/rows.js";
import { freshDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

/**
 * What the native Postgres client (effect 4.0.0-rc.113 onward) binds and reads
 * differently from `pg`, and what each difference goes through. The expected
 * values are Postgres's own wherever it can say them.
 */
/** Every message down an error's `cause` chain, where the driver's own words are. */
const said = (error: unknown): string =>
  error instanceof Error ? `${error.message} ${said(error.cause)}` : "";

describeLayer("pg-values", freshDatabase("taverns_test_pg_values"), (it) => {
  const ID = "5b8f8f4e-2a64-4c55-9d0b-7f1e2c3a4b5c";

  it.effect("binds an array with the element type the call site names", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // A raw string array binds as `text[]`, which a `uuid` comparison refuses.
      // This is the reason every array goes through a typed helper; if it ever
      // stops failing, the helpers are worth reconsidering.
      const raw = yield* Effect.flip(sql`select ${ID}::uuid = any(${[ID]}) as hit`);
      expect(said(raw)).toContain("uuid = text");

      const [hit] = yield* sql<{ readonly hit: boolean }>`
        select ${ID}::uuid = any(${uuidArray([ID])}) as hit
      `;
      expect(hit?.hit).toBe(true);

      const [numbers] = yield* sql<{ readonly levels: ReadonlyArray<number> }>`
        select array(select level from unnest(array[1, 2, 3]) as level
                     where level = any(${intArray([1, 3])})) as levels
      `;
      expect(numbers?.levels).toEqual([1, 3]);

      // A typed array needs no cast where Postgres cannot type one from context.
      const pairs = yield* sql<{ readonly id: string; readonly tag: string }>`
        select id::text, tag from unnest(${uuidArray([ID])}, ${textArray(["Marsh"])}) as pair (id, tag)
      `;
      expect(pairs).toEqual([{ id: ID, tag: "Marsh" }]);
    }),
  );

  it.effect("binds an empty array, which the driver cannot type on its own", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const raw = yield* Effect.flip(sql`select ${ID}::uuid = any(${[]}) as hit`);
      expect(said(raw)).toContain("empty array");

      const [none] = yield* sql<{ readonly hit: boolean }>`
        select ${ID}::uuid = any(${uuidArray([])}) as hit
      `;
      expect(none?.hit).toBe(false);
      const [written] = yield* sql<{
        readonly tags: ReadonlyArray<string>;
        readonly dice: ReadonlyArray<number>;
      }>`
        select ${textArray([])} as tags, ${intArray([])} as dice
      `;
      expect(written).toEqual({ tags: [], dice: [] });
    }),
  );

  it.effect("keeps every element intact, whatever it spells", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const values = [
        "plain",
        "with, a comma",
        'with "quotes"',
        "with \\ a backslash",
        "it's",
        "{braces}",
        "NULL",
        "",
        "  spaced  ",
        "naïve café",
      ];
      const [read] = yield* sql<{ readonly values: ReadonlyArray<string | null> }>`
        select ${textArray([...values, null])} as values
      `;
      expect(read?.values).toEqual([...values, null]);
    }),
  );

  it.effect("reads a tsvector as the text Postgres prints for it", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // Without a codec the client decodes the binary layout as UTF-8 and the
      // connection is closed, so every `select *` over a searchable table fails.
      const rows = yield* sql<{ readonly vector: string; readonly printed: string }>`
        select vector, vector::text as printed
        from (values
          (setweight(to_tsvector('english', 'The ferryman waits'), 'A') ||
             setweight(to_tsvector('english', 'by the salt road at night'), 'B')),
          (to_tsvector('simple', 'naïve café, café again')),
          ($$'it''s' 'back\\\\slash':1,2C 'plain':3D 'nopos'$$::tsvector),
          (''::tsvector)
        ) as samples (vector)
      `;
      expect(rows).toHaveLength(4);
      for (const row of rows) expect(row.vector).toBe(row.printed);
      // Postgres doubles a lexeme's quote and backslash when it prints one.
      expect(rows[2]?.printed).toBe(`'back\\\\slash':1,2C 'it''s' 'nopos' 'plain':3`);

      const [array] = yield* sql<{ readonly vectors: ReadonlyArray<string> }>`
        select array[to_tsvector('simple', 'one two'), ''::tsvector] as vectors
      `;
      expect(array?.vectors).toEqual(["'one':1 'two':2", ""]);
    }),
  );

  it.effect("reads an int8 as a JS bigint, which is why no column the app reads is one", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // `0081` made the two sequences and the columns they fill `integer`.
      const [row] = yield* sql<{ readonly wide: unknown; readonly narrow: unknown }>`
        select 7::bigint as wide, 7::integer as narrow
      `;
      expect(row).toEqual({ wide: 7n, narrow: 7 });
    }),
  );
});
