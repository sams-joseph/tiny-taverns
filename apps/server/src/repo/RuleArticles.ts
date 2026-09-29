import {
  CurrentActor,
  NotFound,
  type Page,
  RuleArticle,
  type RuleArticleDetail,
  RuleArticleFilterValues,
  RuleArticleId,
  type RuleArticleLibraryCreate,
  type RuleArticleLibraryUpdate,
  type RuleArticleSort,
  RuleSection,
  type RuleSectionDraft,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { SqlClient, SqlSchema, type Statement } from "effect/unstable/sql";
import { encodeRuleBlocks, sectionDraftsFrom } from "../ruleset/rules.js";
import {
  classFromColumns,
  defined,
  dieOnSqlError,
  fromColumns,
  likeContains,
  orNotFound,
  setClause,
  timestampColumns,
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
 * A `rule_article` row with its `section_count`, as `articleColumns` selects
 * it, decoded by `SqlSchema`. The intro is `body` and the bundle's key is
 * `source_key`.
 */
const RuleArticleRow = classFromColumns(
  RuleArticle,
  { ...RuleArticle.fields, ...timestampColumns },
  { sourceIndex: "source_key", intro: "body" },
);
const RuleSectionRow = classFromColumns(RuleSection, RuleSection.fields, {
  sourceIndex: "source_key",
  blocks: "body",
});

const RuleArticleFilterRequest = Schema.toType(RuleArticleFilterValues);
/** The written columns, as `createColumns` and `updateColumns` build them. */
const Columns = Schema.Record(Schema.String, Schema.Unknown);

const articleColumns = (table = "rule_article"): string => `
  ${table}.*,
  (
    select count(*)::int
    from rule_section
    where rule_section.article_id = ${table}.id
  ) as section_count
`;

const matchesQuery = (sql: SqlClient.SqlClient, query: string): Statement.Fragment =>
  sql.or([
    sql`rule_article.name ilike ${likeContains(query)}`,
    sql`rule_article.search @@ websearch_to_tsquery('english', ${query})`,
    sql`exists (
      select 1 from rule_section
      where rule_section.article_id = rule_article.id
        and (
          rule_section.title ilike ${likeContains(query)}
          or rule_section.search @@ websearch_to_tsquery('english', ${query})
        )
    )`,
  ]);

const narrowedBy = (
  sql: SqlClient.SqlClient,
  filter: RuleArticleFilterValues,
): ReadonlyArray<Statement.Fragment> =>
  filter.q === undefined || filter.q.trim() === "" ? [] : [matchesQuery(sql, filter.q.trim())];

const orderingsOf = (sql: SqlClient.SqlClient): Record<RuleArticleSort, Ordering<RuleArticle>> => {
  const name = orderColumn<RuleArticle>(sql, sql`lower(rule_article.name)`, "text", (row) =>
    row.name.toLowerCase(),
  );
  const id = orderColumn<RuleArticle>(sql, sql`rule_article.id`, "uuid", (row) => row.id);
  return {
    name: [name, id],
    recent: [
      timeColumn<RuleArticle>(
        sql,
        sql`rule_article.created_at`,
        (row) => DateTime.toDateUtc(row.createdAt),
        "desc",
      ),
      name,
      id,
    ],
  };
};

const updateColumns = (patch: RuleArticleLibraryUpdate): Record<string, unknown> =>
  defined({
    name: patch.name,
    body: patch.intro === undefined ? undefined : encodeRuleBlocks(patch.intro),
    visibility: "visibility" in patch ? patch.visibility : undefined,
  });

const createColumns = (
  payload: RuleArticleLibraryCreate,
  owner: Record<string, unknown>,
): Record<string, unknown> =>
  defined({
    ...owner,
    name: payload.name,
    body: encodeRuleBlocks(payload.intro),
  });

const insertDraftSections = (
  sql: SqlClient.SqlClient,
  articleId: RuleArticleId,
  sections: ReadonlyArray<RuleSectionDraft>,
): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* sql`delete from rule_section where article_id = ${articleId}`;
    for (const section of sectionDraftsFrom(sections)) {
      yield* sql`
        insert into rule_section (article_id, title, body, ordinal)
        values (${articleId}, ${section.title}, ${section.body}, ${section.ordinal})
      `;
    }
  }).pipe(dieOnSqlError);

/**
 * The Library's rule articles — originals and the bundle, `libraryRowReadable` /
 * `libraryRowWritable` and nothing else.
 *
 * The campaign-scoped methods went with the instancing decision of 2026-09-02:
 * campaign copies became internal plumbing, and this corpus has no
 * per-campaign consumer at all, so the Library is its entire surface. Old
 * campaign rows in existing data are inert and unlisted.
 */
export class RuleArticles extends Context.Service<
  RuleArticles,
  {
    readonly library: (
      filter: RuleArticleFilterValues,
    ) => Effect.Effect<Page<RuleArticle, RuleArticleSort>, never, CurrentActor>;
    readonly libraryFindById: (
      id: RuleArticleId,
    ) => Effect.Effect<RuleArticleDetail, NotFound, CurrentActor>;
    readonly libraryCreate: (
      payload: RuleArticleLibraryCreate,
    ) => Effect.Effect<RuleArticleDetail, never, CurrentActor>;
    readonly libraryUpdate: (
      id: RuleArticleId,
      patch: RuleArticleLibraryUpdate,
    ) => Effect.Effect<RuleArticleDetail, NotFound, CurrentActor>;
    readonly libraryRemove: (id: RuleArticleId) => Effect.Effect<void, NotFound, CurrentActor>;
  }
>()("RuleArticles") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const orderings = orderingsOf(sql);
      const orderingFor = (filter: RuleArticleFilterValues) => {
        const sort = filter.cursor?.o ?? filter.sort ?? "name";
        return [sort, orderings[sort]] as const;
      };

      const sectionsOf = SqlSchema.findAll({
        Request: Schema.toType(RuleArticleId),
        Result: RuleSectionRow,
        execute: (articleId) => sql`
          select id, article_id, parent_section_id, source_key, title, body, ordinal
          from rule_section
          where article_id = ${articleId}
          order by ordinal, title, id
        `,
      });

      const detail = (article: RuleArticle): Effect.Effect<RuleArticleDetail, never> =>
        Effect.map(sectionsOf(article.id).pipe(dieOnSqlError), (sections) => ({
          article,
          sections,
        }));

      const inLibraryPage = SqlSchema.findAll({
        Request: RuleArticleFilterRequest,
        Result: RuleArticleRow,
        execute: (filter) =>
          Effect.flatMap(Effect.service(CurrentActor), (actor) => {
            const [, ordering] = orderingFor(filter);
            return sql`
              select ${sql.unsafe(articleColumns())}
              from rule_article
              where ${sql.and([
                libraryRowReadable(sql, "rule_article", actor),
                ...narrowedBy(sql, filter),
                ...pageClauses(sql, ordering, filter.cursor),
              ])}
              order by ${orderClause(sql, ordering)}
              limit ${pageLimit(filter.limit)}
            `;
          }),
      });
      /** One article this Library reads — its own originals and the bundle — by id. */
      const inLibrary = SqlSchema.findOne({
        Request: Schema.toType(RuleArticleId),
        Result: RuleArticleRow,
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              select ${sql.unsafe(articleColumns())}
              from rule_article
              where rule_article.id = ${id}
                and ${libraryRowReadable(sql, "rule_article", actor)}
            `,
          ),
      });
      /**
       * The article a write just made or changed, read again inside its
       * transaction so `section_count` counts the sections it wrote.
       */
      const reread = SqlSchema.findOne({
        Request: Schema.toType(RuleArticleId),
        Result: RuleArticleRow,
        execute: (id) => sql`
          select ${sql.unsafe(articleColumns())}
          from rule_article
          where id = ${id}
        `,
      });
      /** A new original. `account_id` comes from the actor, in `createColumns`'s owner. */
      const insertOriginal = SqlSchema.findOne({
        Request: Schema.toType(Columns),
        Result: fromColumns(Schema.Struct({ id: RuleArticleId })),
        execute: (columns) => sql`
          insert into rule_article ${sql.insert(columns)}
          returning rule_article.id
        `,
      });
      const updateOriginal = SqlSchema.findOne({
        Request: Schema.toType(Schema.Struct({ id: RuleArticleId, columns: Columns })),
        Result: fromColumns(Schema.Struct({ id: RuleArticleId })),
        execute: ({ id, columns }) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              update rule_article
              set ${setClause(sql, columns)}
              where rule_article.id = ${id}
                and ${libraryRowWritable(sql, "rule_article", actor)}
              returning rule_article.id
            `,
          ),
      });
      const removeOriginal = SqlSchema.findOne({
        Request: Schema.toType(RuleArticleId),
        Result: fromColumns(Schema.Struct({ id: RuleArticleId })),
        execute: (id) =>
          Effect.flatMap(
            Effect.service(CurrentActor),
            (actor) => sql`
              delete from rule_article
              where rule_article.id = ${id}
                and ${libraryRowWritable(sql, "rule_article", actor)}
              returning rule_article.id
            `,
          ),
      });
      /** An article just written, with the sections it now has; not finding it is a defect. */
      const written = (id: RuleArticleId) =>
        Effect.flatMap(reread(id).pipe(Effect.catchTag("NoSuchElementError", Effect.die)), detail);

      return {
        library: (filter) =>
          dieOnSqlError(
            Effect.map(inLibraryPage(filter), (rows) => {
              const [sort, ordering] = orderingFor(filter);
              return pageOfRows(rows, filter.limit, ordering, sort, (article) => article);
            }),
          ),

        libraryFindById: (id) =>
          dieOnSqlError(Effect.flatMap(inLibrary(id).pipe(orNotFound("rule_article", id)), detail)),

        libraryCreate: (payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                // An insert answers with its row; not getting one is a defect.
                const { id } = yield* insertOriginal(
                  createColumns(payload, { account_id: actor.accountId }),
                ).pipe(Effect.catchTag("NoSuchElementError", Effect.die));
                if (payload.sections !== undefined)
                  yield* insertDraftSections(sql, id, payload.sections);
                return yield* written(id);
              }),
            ),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* updateOriginal({ id, columns: updateColumns(patch) }).pipe(
                  orNotFound("rule_article", id),
                );
                if (patch.sections !== undefined)
                  yield* insertDraftSections(sql, id, patch.sections);
                return yield* written(id);
              }),
            ),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(Effect.asVoid(removeOriginal(id).pipe(orNotFound("rule_article", id)))),
      };
    }),
  );
}
