import type {
  Campaign,
  CampaignId,
  PageCursor,
  RuleArticle,
  RuleArticleDetail,
  RuleArticleId,
  RuleArticleSort,
} from "@taverns/api";
import { Atom, AsyncResult } from "effect/unstable/reactivity";
import { Effect } from "effect";
import { apiAtom, combine } from "../api/atoms";
import type { TavernsClient } from "../api/client";
import { reads } from "../api/keys";
import { collectPages, WHOLE_LIST } from "../api/page";

export interface RuleArticleQuery {
  readonly q: string;
  readonly sort: RuleArticleSort;
}

export const NO_RULE_ARTICLE_QUERY: RuleArticleQuery = { q: "", sort: "name" };

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

const readCampaignArticles =
  (campaignId: CampaignId, query: RuleArticleQuery) => (client: TavernsClient) =>
    collectPages<RuleArticle, RuleArticleSort, unknown, never>((cursor) =>
      client.ruleArticles.list({ params: { campaignId }, query: queryParams(query, cursor) }),
    );

export interface RuleArticleLibraryView {
  readonly articles: ReadonlyArray<RuleArticle>;
  readonly campaigns: ReadonlyArray<Campaign>;
}

export const libraryRuleArticlesAtom = Atom.family((query: RuleArticleQuery) =>
  apiAtom(
    (client) =>
      Effect.gen(function* () {
        const [articles, memberships] = yield* Effect.all(
          [readLibraryArticles(query)(client), client.me.campaigns()],
          { concurrency: "unbounded" },
        );
        return {
          articles,
          campaigns: memberships
            .filter((membership) => membership.role === "dm")
            .map((membership) => membership.campaign),
        } satisfies RuleArticleLibraryView;
      }),
    [reads.libraryRuleArticles, reads.myCampaigns],
  ),
);

export interface CampaignRuleArticlesView {
  readonly offered: ReadonlyArray<RuleArticle>;
  readonly originals: ReadonlyArray<RuleArticle>;
}

const libraryOriginalsAtom = apiAtom(readLibraryArticles(NO_RULE_ARTICLE_QUERY), [
  reads.libraryRuleArticles,
]);

const campaignArticlesListAtom = Atom.family(
  ({ campaignId, query }: { readonly campaignId: CampaignId; readonly query: RuleArticleQuery }) =>
    apiAtom(readCampaignArticles(campaignId, query), [reads.ruleArticles(campaignId)]),
);

export const campaignRuleArticlesAtom = Atom.family(
  ({ campaignId, query }: { readonly campaignId: CampaignId; readonly query: RuleArticleQuery }) =>
    Atom.readable(
      (get): AsyncResult.AsyncResult<CampaignRuleArticlesView, unknown> =>
        combine(
          get,
          AsyncResult.all({
            offered: get(campaignArticlesListAtom({ campaignId, query })),
            originals: get(libraryOriginalsAtom),
          }),
        ),
      (refresh) => {
        refresh(campaignArticlesListAtom({ campaignId, query }));
        refresh(libraryOriginalsAtom);
      },
    ),
);

export const libraryRuleArticleDetailAtom = Atom.family((articleId: RuleArticleId) =>
  apiAtom(
    (client) => client.library.findRuleArticle({ params: { ruleArticleId: articleId } }),
    [reads.libraryRuleArticle(articleId), reads.libraryRuleArticles],
  ),
);

export const campaignRuleArticleDetailAtom = Atom.family(
  ({
    campaignId,
    articleId,
  }: {
    readonly campaignId: CampaignId;
    readonly articleId: RuleArticleId;
  }) =>
    apiAtom(
      (client) =>
        client.ruleArticles.findById({ params: { campaignId, ruleArticleId: articleId } }),
      [reads.ruleArticle(campaignId, articleId), reads.ruleArticles(campaignId)],
    ),
);

export const ruleArticleWritesAt = (campaignId: CampaignId) => [
  reads.ruleArticles(campaignId),
  reads.libraryRuleArticles,
];

export const ruleArticleDetailKeys = (
  article: RuleArticleDetail,
  campaignId: CampaignId | undefined,
) =>
  campaignId === undefined
    ? [reads.libraryRuleArticles, reads.libraryRuleArticle(article.article.id)]
    : [reads.ruleArticles(campaignId), reads.ruleArticle(campaignId, article.article.id)];
