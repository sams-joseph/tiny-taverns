import {
  CurrentActor,
  Feat,
  FeatFilterValues,
  FeatId,
  type FeatLibraryCreate,
  type FeatLibraryUpdate,
  FeatPrerequisiteAbility,
  type FeatPrerequisiteAbilityInput,
  type FeatPrerequisiteGroupId,
  type FeatSort,
  NotFound,
  type Page,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Schema, Struct } from "effect";
import { SqlClient, SqlSchema, type Statement } from "effect/sql";
import {
  defined,
  dieOnSqlError,
  fileUnder,
  fromColumns,
  likeContains,
  orNotFound,
  setClause,
  timestampColumns,
  uuidArray,
} from "./rows.js";
import {
  orderClause,
  orderColumn,
  type Ordering,
  pageClauses,
  pageLimit,
  pageOfRows,
  timeColumn,
} from "./paging.js";
import { libraryRowReadable, libraryRowWritable } from "./visibility.js";

/**
 * A `feat` row as the wire reads it — everything but the description and the
 * prerequisites, which are hydrated from their own tables — decoded off
 * `select feat.*` by `SqlSchema`. The bundle's key is `source_key`.
 */
const FeatRow = fromColumns(
  Schema.Struct({
    ...Struct.omit(Feat.fields, ["description", "prerequisites"]),
    ...timestampColumns,
  }),
  { sourceIndex: "source_key" },
);
type FeatRow = typeof FeatRow.Type;

/** A feat's children, each beside the feat it was read for. */
const DescriptionRow = fromColumns(Schema.Struct({ featId: FeatId, text: Schema.String }));
const PrerequisiteRow = fromColumns(
  Schema.Struct({ featId: FeatId, ...FeatPrerequisiteAbility.fields }),
);
const FeatIds = Schema.toType(Schema.Array(FeatId));

const FeatFilterRequest = Schema.toType(FeatFilterValues);
const Columns = Schema.Record(Schema.String, Schema.Unknown);

const matchesQuery = (sql: SqlClient.SqlClient, query: string): Statement.Fragment =>
  sql.or([
    sql`feat.name ilike ${likeContains(query)}`,
    sql`exists (
      select 1 from feat_description
      where feat_description.feat_id = feat.id
        and feat_description.text ilike ${likeContains(query)}
    )`,
  ]);

const narrowedBy = (
  sql: SqlClient.SqlClient,
  filter: FeatFilterValues,
): ReadonlyArray<Statement.Fragment> =>
  filter.q === undefined || filter.q.trim() === "" ? [] : [matchesQuery(sql, filter.q.trim())];

const orderingsOf = (sql: SqlClient.SqlClient): Record<FeatSort, Ordering<FeatRow>> => {
  const name = orderColumn<FeatRow>(sql, sql`lower(feat.name)`, "text", (row) =>
    row.name.toLowerCase(),
  );
  const id = orderColumn<FeatRow>(sql, sql`feat.id`, "uuid", (row) => row.id);
  return {
    name: [name, id],
    recent: [
      timeColumn<FeatRow>(
        sql,
        sql`feat.created_at`,
        (row) => DateTime.toDateUtc(row.createdAt),
        "desc",
      ),
      name,
      id,
    ],
  };
};

const patchColumns = (patch: FeatLibraryUpdate) =>
  defined({
    name: patch.name,
    visibility: "visibility" in patch ? patch.visibility : undefined,
  });

const syncDescription = (
  sql: SqlClient.SqlClient,
  featId: FeatId,
  description: ReadonlyArray<string>,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    yield* sql`delete from feat_description where feat_id = ${featId}`;
    for (const [ordinal, text] of description.entries()) {
      yield* sql`
        insert into feat_description (feat_id, ordinal, text)
        values (${featId}, ${ordinal}, ${text})
      `;
    }
  }).pipe(dieOnSqlError);

const syncPrerequisites = (
  sql: SqlClient.SqlClient,
  featId: FeatId,
  prerequisites: ReadonlyArray<FeatPrerequisiteAbilityInput>,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    yield* sql`delete from feat_prerequisite_group where feat_id = ${featId}`;
    if (prerequisites.length === 0) return;
    const group = yield* sql<{ readonly id: FeatPrerequisiteGroupId }>`
      insert into feat_prerequisite_group (feat_id, ordinal)
      values (${featId}, 0)
      returning id::text
    `;
    const groupId = group[0]!.id;
    for (const [ordinal, prerequisite] of prerequisites.entries()) {
      yield* sql`
        insert into feat_prerequisite_ability_score (
          feat_id, group_id, ability_score_id, minimum_score, ordinal
        )
        values (
          ${featId}, ${groupId}, ${prerequisite.abilityScoreId}, ${prerequisite.minimumScore}, ${ordinal}
        )
      `;
    }
  }).pipe(dieOnSqlError);

/**
 * The Library's feats — originals and the bundle, `libraryRowReadable` /
 * `libraryRowWritable` and nothing else.
 *
 * The campaign-scoped methods went with the instancing decision of 2026-09-02:
 * campaign copies became internal plumbing, and this corpus has no
 * per-campaign consumer at all, so the Library is its entire surface. Old
 * campaign rows in existing data are inert and unlisted.
 */
export class Feats extends Context.Service<
  Feats,
  {
    readonly library: (
      filter: FeatFilterValues,
    ) => Effect.Effect<Page<Feat, FeatSort>, never, CurrentActor>;
    readonly libraryFindById: (id: FeatId) => Effect.Effect<Feat, NotFound, CurrentActor>;
    readonly libraryCreate: (
      payload: FeatLibraryCreate,
    ) => Effect.Effect<Feat, never, CurrentActor>;
    readonly libraryUpdate: (
      id: FeatId,
      patch: FeatLibraryUpdate,
    ) => Effect.Effect<Feat, NotFound, CurrentActor>;
    readonly libraryRemove: (id: FeatId) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("Feats") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const orderings = orderingsOf(sql);
      const orderingFor = (filter: FeatFilterValues) => {
        const sort = filter.cursor?.o ?? filter.sort ?? "name";
        return [sort, orderings[sort]] as const;
      };

      const descriptions = SqlSchema.findAll({
        Request: FeatIds,
        Result: DescriptionRow,
        execute: (ids) => sql`
          select feat_id, text from feat_description
          where feat_id = any(${uuidArray([...ids])})
          order by feat_id, ordinal, id
        `,
      });
      const prerequisites = SqlSchema.findAll({
        Request: FeatIds,
        Result: PrerequisiteRow,
        execute: (ids) => sql`
          select
            feat_prerequisite_group.feat_id,
            ability_score.id::text as ability_score_id,
            jsonb_build_object(
              'id', ability_score.id::text,
              'index', ability_score.source_key,
              'name', ability_score.name,
              'fullName', coalesce(ability_score.full_name, ability_score.name),
              'desc', coalesce(ability_score.body -> 'desc', '[]'::jsonb)
            ) as ability,
            feat_prerequisite_ability_score.minimum_score,
            feat_prerequisite_group.id::text as group_id,
            feat_prerequisite_group.ordinal as group_ordinal,
            feat_prerequisite_ability_score.ordinal
          from feat_prerequisite_group
          join feat_prerequisite_ability_score
            on feat_prerequisite_ability_score.group_id = feat_prerequisite_group.id
          join ability_score on ability_score.id = feat_prerequisite_ability_score.ability_score_id
          where feat_prerequisite_group.feat_id = any(${uuidArray([...ids])})
          order by feat_prerequisite_group.feat_id, feat_prerequisite_group.ordinal,
            feat_prerequisite_ability_score.ordinal, feat_prerequisite_ability_score.id
        `,
      });

      /**
       * Rows with their description and prerequisites: **three statements for
       * a page of any size** — the rows, then each child table once with
       * `= any($1)` over every id, filed back under its feat. It used to be two
       * statements per feat. The children need no predicate of their own: every
       * id came out of a query that applied one. `feats-hydration.test.ts`
       * holds the count.
       */
      const hydrateAll = (rows: ReadonlyArray<FeatRow>) =>
        Effect.gen(function* () {
          if (rows.length === 0) return [];
          const ids = rows.map((row) => row.id);
          const textOf = fileUnder(yield* descriptions(ids), "featId");
          const prerequisitesOf = fileUnder(yield* prerequisites(ids), "featId");
          return rows.map(
            (row) =>
              new Feat({
                ...row,
                description: (textOf.get(row.id) ?? []).map((line) => line.text),
                prerequisites: prerequisitesOf.get(row.id) ?? [],
              }),
          );
        });
      const hydrate = (row: FeatRow) => Effect.map(hydrateAll([row]), (feats) => feats[0]!);

      const inLibraryPage = SqlSchema.findAll({
        Request: FeatFilterRequest,
        Result: FeatRow,
        execute: (filter) =>
          Effect.flatMap(Effect.service(CurrentActor), (actor) => {
            const [, ordering] = orderingFor(filter);
            return sql`
              select feat.*
              from feat
              where ${sql.and([
                libraryRowReadable(sql, "feat", actor),
                ...narrowedBy(sql, filter),
                ...pageClauses(sql, ordering, filter.cursor),
              ])}
              order by ${orderClause(sql, ordering)}
              limit ${pageLimit(filter.limit)}
            `;
          }),
      });
      /** One feat this Library reads — its own originals and the bundle — by id. */
      const inLibrary = SqlSchema.findOne({
        Request: Schema.toType(FeatId),
        Result: FeatRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select feat.*
              from feat
              where feat.id = ${id}
                and ${libraryRowReadable(sql, "feat", actor)}
            `,
          ),
      });
      /**
       * A new original in this account's Library. `account_id` comes from the
       * actor and from nothing a caller supplied.
       */
      const insertOriginal = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ name: Schema.String })),
        Result: FeatRow,
        execute: ({ name }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              insert into feat ${sql.insert({ account_id: actor.accountId, name })}
              returning feat.*
            `,
          ),
      });
      const updateOriginal = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ id: FeatId, columns: Columns })),
        Result: FeatRow,
        execute: ({ id, columns }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update feat
              set ${setClause(sql, columns)}
              where feat.id = ${id}
                and ${libraryRowWritable(sql, "feat", actor)}
              returning feat.*
            `,
          ),
      });
      const removeOriginal = SqlSchema.findOne({
        Request: Schema.toType(FeatId),
        Result: fromColumns(Schema.Struct({ id: FeatId })),
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              delete from feat
              where feat.id = ${id}
                and ${libraryRowWritable(sql, "feat", actor)}
              returning feat.id
            `,
          ),
      });

      return {
        library: (filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const rows = yield* inLibraryPage(filter);
              const [sort, ordering] = orderingFor(filter);
              // Hydrate the page only, never the probe row that answers "is there more".
              const page = pageOfRows(rows, filter.limit, ordering, sort, (row) => row);
              return { ...page, items: yield* hydrateAll(page.items) };
            }),
          ),

        libraryFindById: (id) =>
          dieOnSqlError(Effect.flatMap(inLibrary(id).pipe(orNotFound("feat", id)), hydrate)),

        libraryCreate: (payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                // An insert answers with its row; not getting one is a defect.
                const row = yield* insertOriginal({ name: payload.name }).pipe(
                  Effect.catchTag("NoSuchElementError", Effect.die),
                );
                yield* syncDescription(sql, row.id, payload.description ?? []);
                yield* syncPrerequisites(sql, row.id, payload.prerequisites ?? []);
                return yield* hydrate(row);
              }),
            ),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const row = yield* updateOriginal({ id, columns: patchColumns(patch) }).pipe(
                  orNotFound("feat", id),
                );
                if (patch.description !== undefined)
                  yield* syncDescription(sql, row.id, patch.description);
                if (patch.prerequisites !== undefined)
                  yield* syncPrerequisites(sql, row.id, patch.prerequisites);
                return yield* hydrate(row);
              }),
            ),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(Effect.asVoid(removeOriginal(id).pipe(orNotFound("feat", id)))),
      };
    }),
  );
}
