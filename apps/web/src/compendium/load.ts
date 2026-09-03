import type {
  PageCursor,
  RuleArticle,
  RuleArticleDetail,
  RuleArticleId,
  RuleArticleSort,
} from "@taverns/api";
import { Atom } from "effect/unstable/reactivity";
import { Effect } from "effect";
import { apiAtom } from "../api/atoms";
import type { TavernsClient } from "../api/client";
import { reads } from "../api/keys";
import { collectPages, WHOLE_LIST } from "../api/page";

export interface RuleArticleQuery {
  readonly q: string;
  readonly sort: RuleArticleSort;
}

export const NO_RULE_ARTICLE_QUERY: RuleArticleQuery = { q: "", sort: "name" };


/** The wire query for what the unified filter box holds, plus the sort beside it. */
export const ruleArticleQueryOf = (
  filter: { readonly q: string },
  sort: RuleArticleSort,
): RuleArticleQuery => ({ q: filter.q, sort });

const queryParams = (query: RuleArticleQuery, cursor: PageCursor<RuleArticleSort> | undefined) => ({
  q: query.q.trim(),
  sort: query.sort,
  limit: WHOLE_LIST,
  cursor,
});

const readLibraryArticles = (query: RuleArticleQuery) => (client: TavernsClient) =>
  collectPages<RuleArticle, RuleArticleSort, unknown, never>((cursor) =>
    client.library.ruleArticles({ query: queryParams(query, cursor) }),
  );

export interface RuleArticleLibraryView {
  readonly articles: ReadonlyArray<RuleArticle>;
}

export const libraryRuleArticlesAtom = Atom.family((query: RuleArticleQuery) =>
  apiAtom(
    (client) =>
      Effect.map(
        readLibraryArticles(query)(client),
        (articles) => ({ articles }) satisfies RuleArticleLibraryView,
      ),
    [reads.libraryRuleArticles],
  ),
);

export const libraryRuleArticleDetailAtom = Atom.family((articleId: RuleArticleId) =>
  apiAtom(
    (client) => client.library.findRuleArticle({ params: { ruleArticleId: articleId } }),
    [reads.libraryRuleArticle(articleId), reads.libraryRuleArticles],
  ),
);

export const ruleArticleDetailKeys = (article: RuleArticleDetail) => [
  reads.libraryRuleArticles,
  reads.libraryRuleArticle(article.article.id),
];
