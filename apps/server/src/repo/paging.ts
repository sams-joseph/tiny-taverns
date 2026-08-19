import { DEFAULT_PAGE_SIZE, type CursorKey, type Page, type PageCursor } from "@taverns/api";
import type { SqlClient, Statement } from "effect/unstable/sql";

/**
 * Keyset pagination, as clauses a list query composes.
 *
 * **The whole point is that a page is a `where` clause.** `AGENTS.md`'s actor
 * and visibility contract says the visibility predicate lives in SQL and never
 * in a handler, and that post-filtering in a handler is the leak pattern.
 * Pagination has exactly the same failure mode one step further on: narrow after
 * the predicate and you both disclose what you then discard and hand back a page
 * shorter than the one you promised. So everything here contributes fragments
 * that go **inside** the same `sql.and([...])` as the predicate, and the only
 * thing that happens outside the query is throwing away the one extra row that
 * answered "is there more".
 *
 * See `packages/api/src/Page.ts` for the wire shape and for why this is a keyset
 * rather than an offset.
 */

/**
 * One column of an ordering: how it sorts, what a row contributes to a cursor,
 * and how that value binds back.
 *
 * Built once per repository layer, with `sql` in hand, because an ordering is a
 * property of the table rather than of a request.
 *
 * **Every column in an ordering must be `not null`.** A null would sort by
 * Postgres's own nulls-last/first rule while `=` and `>` against it are neither
 * true nor false, so a cursor could not name a position at all. Nothing here
 * orders by a nullable column and nothing should start to without answering that
 * first.
 */
export interface OrderColumn<Row> {
  /** The column, table-qualified. */
  readonly column: Statement.Fragment;
  readonly direction: "asc" | "desc";
  /** What this row contributes to a cursor. */
  readonly key: (row: Row) => CursorKey;
  /** That value on its way back in, with the cast the comparison wants. */
  readonly bind: (value: CursorKey) => Statement.Fragment;
}

/**
 * A whole ordering, most significant column first.
 *
 * **The last column must be the row's id**, and that is not decoration: none of
 * the natural ordering columns is unique — two creatures share a name, a whole
 * transaction's rows share `created_at` — so without a unique tiebreak a cursor
 * names a position several rows wide and a page boundary either repeats a row or
 * loses one.
 */
export type Ordering<Row> = readonly [...ReadonlyArray<OrderColumn<Row>>, OrderColumn<Row>];

/**
 * An ordering column, with the cast its cursor value binds back with.
 *
 * The cast is explicit rather than left to the driver's inference so that
 * `id > $1` compares a uuid with a uuid rather than asking Postgres to guess
 * from a text parameter.
 */
export const orderColumn = <Row>(
  sql: SqlClient.SqlClient,
  column: Statement.Fragment,
  cast: "text" | "uuid" | "double precision",
  key: (row: Row) => CursorKey,
  direction: "asc" | "desc" = "asc",
): OrderColumn<Row> => ({
  column,
  direction,
  key,
  bind: (value) => sql`${value}${sql.literal(`::${cast}`)}`,
});

/**
 * A `timestamptz` ordering column, **truncated to milliseconds on both sides**.
 *
 * The driver hands a `timestamptz` back as a JavaScript `Date`, which has
 * millisecond resolution where the column has microsecond. A cursor built from
 * the truncated value and compared against the full-precision column skips rows:
 * every row inside that millisecond is strictly greater than the truncated
 * bound, so a descending page drops the rest of them. Truncating the *column* as
 * well makes the two sides the same value, and `id` — which is always the last
 * column of an ordering — separates whatever then ties.
 *
 * The bound is built by integer arithmetic rather than `to_timestamp`, so no
 * float division stands between the millisecond and the comparison.
 */
export const timeColumn = <Row>(
  sql: SqlClient.SqlClient,
  column: Statement.Fragment,
  key: (row: Row) => Date,
  direction: "asc" | "desc" = "asc",
): OrderColumn<Row> => ({
  column: sql`date_trunc('milliseconds', ${column})`,
  direction,
  key: (row) => key(row).getTime(),
  bind: (value) => sql`(timestamptz 'epoch' + ${value}::bigint * interval '1 millisecond')`,
});

/**
 * The ordering of a list that has exactly one: oldest first, then the id.
 *
 * A campaign's notes, its encounters and a night's beats are chronologies, and
 * all three ordered by `created_at` alone before they were paged. That is not a
 * position: a whole transaction's rows share `now()`, so the id is what makes
 * the key unique — see {@link Ordering}.
 *
 * `table` is a constant from the repository, never anything a client supplies.
 */
export const createdOrdering = <Row extends { readonly created_at: Date; readonly id: string }>(
  sql: SqlClient.SqlClient,
  table: string,
): Ordering<Row> => [
  timeColumn<Row>(sql, sql.literal(`${table}.created_at`), (row) => row.created_at),
  orderColumn<Row>(sql, sql.literal(`${table}.id`), "uuid", (row) => row.id),
];

/** `order by` for an ordering. */
export const orderClause = <Row>(
  sql: SqlClient.SqlClient,
  ordering: Ordering<Row>,
): Statement.Fragment =>
  sql.csv(ordering.map((column) => sql`${column.column} ${sql.literal(column.direction)}`));

/**
 * "Strictly after the row this cursor names", lexicographically.
 *
 * Written out rather than as Postgres's row comparison (`(a, b) > (x, y)`),
 * which only works when every column sorts the same way — and `recent` does not:
 * it is newest first with an ascending tiebreak.
 *
 * A cursor whose key does not have one value per column was not minted here.
 * That cannot happen through the schema, which validates the ordering name, so
 * it means a hand-forged token — answered with `false`, an empty page, because
 * continuing from nowhere must never be the same as starting from the beginning.
 */
export const afterCursor = <Row>(
  sql: SqlClient.SqlClient,
  ordering: Ordering<Row>,
  cursor: PageCursor,
): Statement.Fragment => {
  if (cursor.k.length !== ordering.length) return sql`false`;
  const step = (index: number): Statement.Fragment => {
    const column = ordering[index]!;
    const value = column.bind(cursor.k[index]!);
    const beyond =
      column.direction === "asc"
        ? sql`${column.column} > ${value}`
        : sql`${column.column} < ${value}`;
    if (index === ordering.length - 1) return beyond;
    return sql.or([beyond, sql.and([sql`${column.column} = ${value}`, step(index + 1)])]);
  };
  return step(0);
};

/**
 * The clauses a paged read adds to its own `where`: nothing when this is the
 * first page, and one comparison when it is not.
 *
 * Returned as an array so a caller spreads it into the same `sql.and([...])` the
 * visibility predicate is in — there is deliberately no way to compose this
 * *around* a query.
 */
export const pageClauses = <Row>(
  sql: SqlClient.SqlClient,
  ordering: Ordering<Row>,
  cursor: PageCursor | undefined,
): ReadonlyArray<Statement.Fragment> =>
  cursor === undefined ? [] : [afterCursor(sql, ordering, cursor)];

/**
 * How many rows to ask the database for: one more than will be returned.
 *
 * That extra row is the whole of "is there another page", and it is why no list
 * here runs a `count(*)` over a visibility-predicated corpus to answer a
 * question nothing draws.
 */
export const pageLimit = (limit: number | undefined): number => (limit ?? DEFAULT_PAGE_SIZE) + 1;

/**
 * The rows, minus the probe row, plus the cursor that continues from the last
 * one returned.
 *
 * The mapper runs over the returned rows only, so the probe row is never mapped
 * and never leaves the repository.
 */
export const pageOfRows = <Row, A, Ordering_ extends string>(
  rows: ReadonlyArray<Row>,
  limit: number | undefined,
  ordering: Ordering<Row>,
  orderingName: Ordering_,
  map: (row: Row) => A,
): Page<A, Ordering_> => {
  const size = limit ?? DEFAULT_PAGE_SIZE;
  const more = rows.length > size;
  const kept = more ? rows.slice(0, size) : rows;
  const last = kept[kept.length - 1];
  return {
    items: kept.map(map),
    nextCursor:
      more && last !== undefined
        ? { o: orderingName, k: ordering.map((column) => column.key(last)) }
        : null,
  };
};
