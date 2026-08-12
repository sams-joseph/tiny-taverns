import type { AssistantTurnId, Origin, Visibility } from "@taverns/api";
import { DateTime, Effect } from "effect";
import { SqlError } from "effect/unstable/sql";
import type { SqlClient, Statement } from "effect/unstable/sql";

/**
 * The provenance/visibility tail every content row carries. Kept as one type so
 * a table that grows the columns without the mapper noticing does not compile.
 */
export interface ProvenanceColumns {
  readonly visibility: Visibility;
  readonly origin: Origin;
  readonly assistant_turn_id: AssistantTurnId | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** The shared half of every row mapper. */
export const provenanceOf = (row: ProvenanceColumns) => ({
  visibility: row.visibility,
  origin: row.origin,
  assistantTurnId: row.assistant_turn_id,
  createdAt: DateTime.fromDateUnsafe(row.created_at),
  updatedAt: DateTime.fromDateUnsafe(row.updated_at),
});

/**
 * Drops `undefined` entries so an omitted field falls through to the column
 * default instead of being bound as SQL `NULL`. This is what makes a create
 * payload without a `visibility` land as `dm` rather than as nothing at all.
 */
export const defined = <A extends Record<string, unknown>>(record: A): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));

/**
 * `SET` assignments for a PATCH, always touching `updated_at`.
 *
 * An empty patch is legal on the wire and must not compile to `set ,
 * updated_at = now()`, so the assignment list is built rather than interpolated.
 */
export const setClause = (
  sql: SqlClient.SqlClient,
  columns: Record<string, unknown>,
): Statement.Fragment =>
  Object.keys(columns).length === 0
    ? sql`updated_at = now()`
    : sql`${sql.update(columns)}, updated_at = now()`;

/**
 * Escapes the wildcards `ILIKE` would otherwise read out of a DM's search box,
 * and wraps the result for a contains match.
 *
 * Shared by the bestiary and by campaign search rather than written twice: two
 * escapers is two chances for one of them to miss a backslash, and the one that
 * missed it would turn a search for `100%` into a match on everything.
 */
export const likeContains = (query: string): string =>
  `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;

/**
 * Turns a `SqlError` into a defect, so a repository declares only the domain
 * errors a caller can do something about.
 *
 * A broken query or an unreachable database is a 500 and a stack trace, not a
 * case for a handler to branch on. Keeping it out of the error channel is what
 * lets the `HttpApi` error schemas stay honest — every error the declaration
 * names is one a client can actually receive.
 */
export const dieOnSqlError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, SqlError.SqlError>, R> =>
  Effect.catch(effect, (error) =>
    SqlError.isSqlError(error)
      ? Effect.die(error)
      : Effect.fail(error as Exclude<E, SqlError.SqlError>),
  );
