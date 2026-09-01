import {
  blocksFromMarkdown,
  type RuleArticleDerive,
  type RuleArticleLibraryCreate,
  type RuleArticleLibraryUpdate,
  type RuleArticleUpdate,
} from "@taverns/api";
import { Effect } from "effect";
import { SqlClient, type SqlError } from "effect/unstable/sql";
import { FIVE_E_BITS_2014_SOURCE, sourceKeyFor } from "./source.js";
import {
  SYSTEM_RULE_ARTICLES,
  SYSTEM_RULE_COUNTS,
  type SystemRuleArticle,
  type SystemRuleSection,
} from "./systemRules.js";

export interface RuleImportResult {
  readonly articlesInserted: number;
  readonly articlesUpdated: number;
  readonly sections: number;
}

export const encodeRuleBlocks = (markdown: string | undefined): string =>
  JSON.stringify(blocksFromMarkdown(markdown ?? ""));

export const sectionDraftsFrom = (
  sections: ReadonlyArray<{ readonly title: string; readonly content: string }> | undefined,
): ReadonlyArray<{ readonly title: string; readonly body: string; readonly ordinal: number }> =>
  (sections ?? []).map((section, ordinal) => ({
    title: section.title,
    body: encodeRuleBlocks(section.content),
    ordinal,
  }));

const syncSystemSections = (
  sql: SqlClient.SqlClient,
  articleId: string,
  sections: ReadonlyArray<SystemRuleSection>,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    const kept: string[] = [];
    const ids = new Map<string, string>();

    for (const section of sections) {
      const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "rule-sections", section.sourceIndex);
      const rows = yield* sql<{ readonly id: string }>`
        insert into rule_section (
          article_id, parent_section_id, source_corpus, source_family, source_key,
          title, body, ordinal
        )
        values (
          ${articleId},
          null,
          ${key.sourceCorpus},
          ${key.sourceFamily},
          ${key.sourceKey},
          ${section.title},
          ${encodeRuleBlocks(section.content)},
          ${section.ordinal}
        )
        on conflict (article_id, source_corpus, source_family, source_key)
        do update set
          title      = excluded.title,
          body       = excluded.body,
          ordinal    = excluded.ordinal,
          updated_at = now()
        returning id::text
      `;
      const id = rows[0]?.id;
      if (id === undefined) throw new Error(`rule section ${section.sourceIndex} was not written`);
      kept.push(section.sourceIndex);
      ids.set(section.sourceIndex, id);
    }

    for (const section of sections) {
      if (section.parentSourceIndex === null) continue;
      const id = ids.get(section.sourceIndex);
      const parentId = ids.get(section.parentSourceIndex);
      if (id === undefined || parentId === undefined) {
        throw new Error(`rule section ${section.sourceIndex} has an unknown parent`);
      }
      yield* sql`
        update rule_section
        set parent_section_id = ${parentId}, updated_at = now()
        where id = ${id}
      `;
    }

    yield* sql`
      delete from rule_section
      where article_id = ${articleId}
        and source_corpus = ${FIVE_E_BITS_2014_SOURCE.corpus}
        and source_family = 'rule-sections'
        and not (source_key = any(${kept}))
    `;
  });

/**
 * Writes the pinned 2014 5e-bits rules and rule-sections corpus into the
 * unowned system compendium. The snapshot deliberately contains only stable
 * source keys, labels and authored reference content; URL-shaped 5e-bits
 * transport fields are not stored.
 */
export const importSystemRuleArticles = (
  corpus: ReadonlyArray<SystemRuleArticle> = SYSTEM_RULE_ARTICLES,
): Effect.Effect<RuleImportResult, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        let articlesInserted = 0;
        let articlesUpdated = 0;
        let sections = 0;

        for (const article of corpus) {
          const key = sourceKeyFor(FIVE_E_BITS_2014_SOURCE, "rules", article.sourceIndex);
          const rows = yield* sql<{ readonly id: string; readonly inserted: boolean }>`
            insert into rule_article (
              campaign_id, account_id, origin, source_corpus, source_family, source_key,
              name, body, visibility
            )
            values (
              null,
              null,
              'system',
              ${key.sourceCorpus},
              ${key.sourceFamily},
              ${key.sourceKey},
              ${article.name},
              ${encodeRuleBlocks(article.content)},
              'shared'
            )
            on conflict (source_corpus, source_family, source_key)
              where campaign_id is null and account_id is null and source_key is not null
            do update set
              name       = excluded.name,
              body       = excluded.body,
              updated_at = now()
            returning id::text, (xmax = 0) as inserted
          `;
          const row = rows[0];
          if (row === undefined)
            throw new Error(`rule article ${article.sourceIndex} was not written`);
          yield* syncSystemSections(sql, row.id, article.sections);
          sections += article.sections.length;
          if (row.inserted === true) articlesInserted += 1;
          else articlesUpdated += 1;
        }

        if (corpus === SYSTEM_RULE_ARTICLES) {
          if (articlesInserted + articlesUpdated !== SYSTEM_RULE_COUNTS.topLevelRules) {
            throw new Error("pinned rules corpus did not write the expected top-level rules");
          }
          if (sections !== SYSTEM_RULE_COUNTS.ruleSections) {
            throw new Error("pinned rules corpus did not write the expected rule sections");
          }
        }

        return { articlesInserted, articlesUpdated, sections };
      }),
    );
  });

export type RuleArticleWrite =
  RuleArticleDerive | RuleArticleLibraryCreate | RuleArticleLibraryUpdate | RuleArticleUpdate;
