import {
  type AccountId,
  type CampaignId,
  CurrentActor,
  NotFound,
  type Page,
  RuleArticle,
  type RuleArticleDetail,
  type RuleArticleFilterValues,
  type RuleArticleId,
  type RuleArticleLibraryCreate,
  type RuleArticleLibraryUpdate,
  type RuleArticleSort,
  RuleSection,
  type RuleSectionId,
  type RuleSectionDraft,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { SqlClient, type Statement } from "effect/unstable/sql";
import { encodeRuleBlocks, sectionDraftsFrom } from "../ruleset/rules.js";
import {
  defined,
  dieOnSqlError,
  likeContains,
  type ProvenanceColumns,
  provenanceOf,
  setClause,
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

interface RuleArticleRow extends ProvenanceColumns {
  readonly id: RuleArticleId;
  readonly campaign_id: CampaignId | null;
  readonly account_id: AccountId | null;
  readonly derived_from: RuleArticleId | null;
  readonly source_corpus: string | null;
  readonly source_family: string | null;
  readonly source_key: string | null;
  readonly name: string;
  readonly body: RuleArticle["intro"];
  readonly section_count: number;
}

interface RuleSectionRow {
  readonly id: RuleSectionId;
  readonly article_id: RuleArticleId;
  readonly parent_section_id: RuleSectionId | null;
  readonly source_key: string | null;
  readonly title: string;
  readonly body: RuleSection["blocks"];
  readonly ordinal: number;
}

const toArticle = (row: RuleArticleRow): RuleArticle =>
  new RuleArticle({
    id: row.id,
    campaignId: row.campaign_id,
    accountId: row.account_id,
    derivedFrom: row.derived_from,
    sourceIndex: row.source_key,
    name: row.name,
    intro: row.body,
    sectionCount: row.section_count,
    ...provenanceOf(row),
  });

const toSection = (row: RuleSectionRow): RuleSection =>
  new RuleSection({
    id: row.id,
    articleId: row.article_id,
    parentSectionId: row.parent_section_id,
    sourceIndex: row.source_key,
    title: row.title,
    ordinal: row.ordinal,
    blocks: row.body,
  });

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

const orderingsOf = (
  sql: SqlClient.SqlClient,
): Record<RuleArticleSort, Ordering<RuleArticleRow>> => {
  const name = orderColumn<RuleArticleRow>(sql, sql`lower(rule_article.name)`, "text", (row) =>
    row.name.toLowerCase(),
  );
  const id = orderColumn<RuleArticleRow>(sql, sql`rule_article.id`, "uuid", (row) => row.id);
  return {
    name: [name, id],
    recent: [
      timeColumn<RuleArticleRow>(
        sql,
        sql`rule_article.created_at`,
        (row) => row.created_at,
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

      const sectionsFor = (articleId: RuleArticleId) =>
        sql<RuleSectionRow>`
          select id, article_id, parent_section_id, source_key, title, body, ordinal
          from rule_section
          where article_id = ${articleId}
          order by ordinal, title, id
        `;

      const detail = (row: RuleArticleRow): Effect.Effect<RuleArticleDetail, never> =>
        Effect.map(sectionsFor(row.id).pipe(dieOnSqlError), (sections) => ({
          article: toArticle(row),
          sections: sections.map(toSection),
        }));

      return {
        library: (filter) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const [sort, ordering] = orderingFor(filter);
              const rows = yield* sql<RuleArticleRow>`
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
              return pageOfRows(rows, filter.limit, ordering, sort, toArticle);
            }),
          ),

        libraryFindById: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<RuleArticleRow>`
                select ${sql.unsafe(articleColumns())}
                from rule_article
                where rule_article.id = ${id}
                  and ${libraryRowReadable(sql, "rule_article", actor)}
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "rule_article", id });
              return yield* detail(rows[0]!);
            }),
          ),

        libraryCreate: (payload) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const rows = yield* sql<RuleArticleRow>`
                  insert into rule_article ${sql.insert(createColumns(payload, { account_id: actor.accountId }))}
                  returning ${sql.unsafe(articleColumns())}
                `;
                if (payload.sections !== undefined)
                  yield* insertDraftSections(sql, rows[0]!.id, payload.sections);
                const reread = yield* sql<RuleArticleRow>`
                  select ${sql.unsafe(articleColumns())}
                  from rule_article
                  where id = ${rows[0]!.id}
                `;
                return yield* detail(reread[0]!);
              }),
            ),
          ),

        libraryUpdate: (id, patch) =>
          dieOnSqlError(
            sql.withTransaction(
              Effect.gen(function* () {
                const actor = yield* CurrentActor;
                const rows = yield* sql<RuleArticleRow>`
                  update rule_article
                  set ${setClause(sql, updateColumns(patch))}
                  where rule_article.id = ${id}
                    and ${libraryRowWritable(sql, "rule_article", actor)}
                  returning ${sql.unsafe(articleColumns())}
                `;
                if (rows.length === 0) return yield* new NotFound({ resource: "rule_article", id });
                if (patch.sections !== undefined)
                  yield* insertDraftSections(sql, rows[0]!.id, patch.sections);
                const reread = yield* sql<RuleArticleRow>`
                  select ${sql.unsafe(articleColumns())}
                  from rule_article
                  where id = ${rows[0]!.id}
                `;
                return yield* detail(reread[0]!);
              }),
            ),
          ),

        libraryRemove: (id) =>
          dieOnSqlError(
            Effect.gen(function* () {
              const actor = yield* CurrentActor;
              const rows = yield* sql<{ readonly id: RuleArticleId }>`
                delete from rule_article
                where rule_article.id = ${id}
                  and ${libraryRowWritable(sql, "rule_article", actor)}
                returning rule_article.id
              `;
              if (rows.length === 0) return yield* new NotFound({ resource: "rule_article", id });
            }),
          ),
      };
    }),
  );
}
