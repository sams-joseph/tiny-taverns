import { type AssistantTurnId, NotFound, type Origin, type Visibility } from "@taverns/api";
import { type Cause, DateTime, Effect, Schema, SchemaGetter, SchemaTransformation } from "effect";
import { SqlError } from "effect/unstable/sql";
import type { SqlClient, Statement } from "effect/unstable/sql";

/**
 * A domain struct read straight off its columns: the same fields, decoded from
 * their snake_case spelling (`assistantTurnId` from `assistant_turn_id`).
 *
 * This is the one place a column name becomes a field name. A repository
 * converted to `SqlSchema` declares the wire schema it answers with, wraps it
 * in this, and hands the pair to `SqlSchema.findAll`/`findOne` — there is no
 * hand-written row type and no `to…` mapper beside it. Columns the struct does
 * not name (`source_key`, a join's extra keys) are dropped by the decode, and
 * nested `jsonb` documents keep the spelling the query built them in: only the
 * top-level keys are renamed.
 *
 * A column whose driver value differs from the wire's encoding needs its own
 * field: `timestampColumns` for the two every content row carries.
 *
 * A field whose column is not its snake_case spelling — the wire's
 * `statBlock` is a creature's `body` — names that column in `columns`, so the
 * query keeps selecting what the table holds and the rename is still made
 * here and nowhere else.
 */
export const fromColumns = <Fields extends Schema.Struct.Fields>(
  schema: Schema.Struct<Fields>,
  columns: { readonly [K in keyof Fields]?: string } = {},
) =>
  schema.pipe(
    Schema.encodeKeys(
      Object.fromEntries(
        Object.keys(schema.fields).map((field) => [
          field,
          columns[field] ?? field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        ]),
      ) as { readonly [K in keyof Fields]: string },
    ),
  );

/**
 * `fromColumns` for a wire type that is a `Schema.Class`: the same decode,
 * answering an instance of the class.
 *
 * The instance is the point. A class's encoder checks `instanceof`, so a plain
 * struct with the right fields is refused at the `HttpApi` boundary. The
 * decoded fields go to the class's own constructor with its checks off,
 * because the decode has just run those same checks field by field. A row is
 * only ever read, so the way back to columns is refused rather than written.
 */
export const classFromColumns = <Self, Fields extends Schema.Struct.Fields>(
  Class: new (fields: Schema.Struct<Fields>["Type"], options?: Schema.MakeOptions) => Self,
  fields: Fields,
  columns: { readonly [K in keyof Fields]?: string } = {},
) =>
  fromColumns(Schema.Struct(fields), columns).pipe(
    Schema.decodeTo(
      Schema.instanceOf(Class),
      new SchemaTransformation.Transformation(
        SchemaGetter.transform((row) => new Class(row, { disableChecks: true })),
        SchemaGetter.forbidden(() => "a row is read, never written back"),
      ),
    ),
  );

/**
 * Child rows read for many parents in one statement, filed under the parent
 * each was read for, in the order the query returned them, with the parent's
 * key dropped — what turns an `= any($1)` read back into one list per parent.
 */
export const fileUnder = <Row extends object, Key extends keyof Row>(
  rows: ReadonlyArray<Row>,
  key: Key,
): ReadonlyMap<Row[Key], ReadonlyArray<Omit<Row, Key>>> => {
  const filed = new Map<Row[Key], Array<Omit<Row, Key>>>();
  for (const row of rows) {
    const { [key]: parent, ...child } = row;
    const siblings = filed.get(parent);
    if (siblings === undefined) filed.set(parent, [child]);
    else siblings.push(child);
  }
  return filed;
};

/**
 * `created_at` and `updated_at` as the driver hands them over: a `Date`, where
 * the wire carries an ISO string. Spread over a wire struct's fields before
 * `fromColumns`; both decode to the same `DateTime.Utc`.
 */
export const timestampColumns = {
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
} as const;

/**
 * `SqlSchema.findOne`'s "no row" as the domain's refusal.
 *
 * `findOne` fails with `NoSuchElementError` when the predicate returned
 * nothing, which is exactly the case AGENTS rule 1 answers with `NotFound`:
 * a row that does not exist and a row this actor may not read are the same
 * answer.
 */
export const orNotFound =
  (resource: string, id: string) =>
  <A, E, R>(
    effect: Effect.Effect<A, E | Cause.NoSuchElementError, R>,
  ): Effect.Effect<A, E | NotFound, R> =>
    Effect.catchTag(effect, "NoSuchElementError", () =>
      Effect.fail(new NotFound({ resource, id })),
    );

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
 * Where an accepted proposal came from — the one thing that may set
 * `origin = 'assistant'`.
 *
 * Passed as an extra argument to an ordinary `create`, never as a field on a
 * payload, and that distinction is the safety property. A `NoteCreate` has no
 * `origin`, so a client cannot claim the assistant wrote its prose; only
 * `repo/Proposals.ts` constructs one of these, out of a turn the *server*
 * stored. Everything else about the insert is unchanged, which is what makes an
 * accepted row indistinguishable in usefulness from an authored one and
 * completely distinguishable in origin.
 */
export interface AssistantOrigin {
  readonly assistantTurnId: AssistantTurnId;
}

/** The two provenance columns an accept sets, or nothing at all. */
export const assistantColumns = (from: AssistantOrigin | undefined): Record<string, unknown> =>
  from === undefined ? {} : { origin: "assistant", assistant_turn_id: from.assistantTurnId };

/**
 * Drops `undefined` entries so an omitted field falls through to the column
 * default instead of being bound as SQL `NULL`. This is what makes a create
 * payload without a `visibility` land as `dm` rather than as nothing at all.
 */
export const defined = <A extends Record<string, unknown>>(record: A): Record<string, unknown> =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));

/**
 * A nullable prose column's value from a payload, trimmed: `undefined` stays
 * omitted, and `null` or a blank is `null`. Absent is one value, not two — the
 * column's own check refuses a blank (`0052_descriptions.ts`).
 */
export const proseColumn = (value: string | null | undefined): string | null | undefined =>
  value === undefined ? undefined : value === null || value.trim() === "" ? null : value.trim();

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
 * Turns a `SqlError`, or a row its `SqlSchema` row schema refuses, into a
 * defect, so a repository declares only the domain errors a caller can do
 * something about.
 *
 * A broken query, an unreachable database or a column holding what no write
 * path puts there is a 500 and a stack trace, not a case for a handler to
 * branch on. Keeping it out of the error channel is what lets the `HttpApi`
 * error schemas stay honest — every error the declaration names is one a
 * client can actually receive.
 */
export const dieOnSqlError = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, SqlError.SqlError | Schema.SchemaError>, R> =>
  Effect.catch(effect, (error) =>
    SqlError.isSqlError(error) || Schema.isSchemaError(error)
      ? Effect.die(error)
      : Effect.fail(error as Exclude<E, SqlError.SqlError | Schema.SchemaError>),
  );
