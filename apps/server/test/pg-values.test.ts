import { expect } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { arrayParam } from "../src/repo/rows.js";
import { freshDatabase } from "./support/database.js";
import { describeLayer } from "./support/suite.js";

/**
 * What the native Postgres client (effect 4.0.0-rc.113 onward) binds and reads
 * differently from `pg`, and the one helper each difference goes through. The
 * expected values are Postgres's own wherever it can say them.
 */
/** Every message down an error's `cause` chain, where the driver's own words are. */
const said = (error: unknown): string =>
  error instanceof Error ? `${error.message} ${said(error.cause)}` : "";

describeLayer("pg-values", freshDatabase("taverns_test_pg_values"), (it) => {
  const ID = "5b8f8f4e-2a64-4c55-9d0b-7f1e2c3a4b5c";

  it.effect("binds an array as an untyped literal, typed by where it stands", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // A raw string array binds as `text[]`, which a `uuid` comparison refuses.
      // This is the reason `arrayParam` exists; if it ever stops failing, the
      // helper is worth reconsidering.
      const raw = yield* Effect.flip(sql`select ${ID}::uuid = any(${[ID]}) as hit`);
      expect(said(raw)).toContain("uuid = text");

      const [hit] = yield* sql<{ readonly hit: boolean }>`
        select ${ID}::uuid = any(${arrayParam([ID])}) as hit
      `;
      expect(hit?.hit).toBe(true);

      const [numbers] = yield* sql<{ readonly levels: ReadonlyArray<number> }>`
        select array(select level from unnest(array[1, 2, 3]) as level
                     where level = any(${arrayParam([1, 3])})) as levels
      `;
      expect(numbers?.levels).toEqual([1, 3]);
    }),
  );

  it.effect("binds an empty array, which the driver cannot type on its own", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const raw = yield* Effect.flip(sql`select ${ID}::uuid = any(${[]}) as hit`);
      expect(said(raw)).toContain("empty array");

      const [none] = yield* sql<{ readonly hit: boolean }>`
        select ${ID}::uuid = any(${arrayParam([])}) as hit
      `;
      expect(none?.hit).toBe(false);
      const [written] = yield* sql<{ readonly tags: ReadonlyArray<string> }>`
        select ${arrayParam([])}::text[] as tags
      `;
      expect(written?.tags).toEqual([]);
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
        "{braces}",
        "NULL",
        "",
        "  spaced  ",
        "naïve café",
      ];
      const [read] = yield* sql<{ readonly values: ReadonlyArray<string | null> }>`
        select ${arrayParam([...values, null])}::text[] as values
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
