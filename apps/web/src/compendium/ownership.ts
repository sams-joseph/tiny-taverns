import type { RuleArticle } from "@taverns/api";

const articleKind = (article: RuleArticle): "bundle" | "library" | "campaign" => {
  if (article.campaignId !== null) return "campaign";
  if (article.accountId !== null) return "library";
  return "bundle";
};

export const isCampaignArticle = (article: RuleArticle): boolean =>
  articleKind(article) === "campaign";
export const isLibraryArticle = (article: RuleArticle): boolean =>
  articleKind(article) === "library";
export const ruleArticleOwnerLabel = (article: RuleArticle): string => {
  switch (articleKind(article)) {
    case "bundle":
      return "Pinned 2014 reference";
    case "library":
      return "Library original";
    case "campaign":
      return "Campaign snapshot";
  }
};

export const isBundleArticle = (article: RuleArticle): boolean => articleKind(article) === "bundle";
