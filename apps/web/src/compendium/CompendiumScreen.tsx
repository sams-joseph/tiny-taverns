import type { CampaignId, RuleArticle, RuleArticleDetail } from "@taverns/api";
import { Button, Icon } from "@taverns/ui";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { CampaignChrome, type CampaignChromeSlots } from "../campaign/CampaignChrome";
import { useListQuery, type ListQuery } from "../library/query";
import { EmptyState } from "../ui/states";
import {
  campaignRuleArticlesAtom,
  NO_RULE_ARTICLE_QUERY,
  type CampaignRuleArticlesView,
  type RuleArticleQuery,
} from "./load";
import { isCampaignArticle } from "./ownership";
import {
  CopyRuleArticleIn,
  RemoveRuleArticleDialog,
  RuleArticleFilters,
  RuleArticleForm,
  RuleArticleGrid,
  RuleArticleReader,
} from "./RuleArticleParts";

const summaryOf = (view: CampaignRuleArticlesView): string => {
  const hidden = view.offered.filter(
    (article) => isCampaignArticle(article) && article.visibility === "dm",
  ).length;
  const count = `${view.offered.length} ${view.offered.length === 1 ? "article" : "articles"}`;
  return hidden === 0 ? count : `${count} · ${hidden} your players cannot read yet`;
};

export function CompendiumScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });
  const list = useListQuery(NO_RULE_ARTICLE_QUERY, { narrows: () => false });
  const [copying, setCopying] = useState(false);
  const [reading, setReading] = useState<RuleArticle>();
  const [editing, setEditing] = useState<RuleArticleDetail | undefined>();
  const [removing, setRemoving] = useState<RuleArticle>();

  return (
    <CampaignChrome<CampaignRuleArticlesView>
      campaignId={campaignId}
      title="Compendium"
      extra={campaignRuleArticlesAtom({ campaignId, query: list.query })}
      subtitle={({ extra }) => summaryOf(extra)}
      actions={() => (
        <Button size="sm" onClick={() => setCopying(true)}>
          <Icon name="copy" size={13} />
          Copy article
        </Button>
      )}
    >
      {(slots) => (
        <Compendium
          slots={slots}
          list={list}
          campaignId={campaignId}
          reading={reading}
          onRead={setReading}
          editing={editing}
          onEdit={setEditing}
          removing={removing}
          onRemove={setRemoving}
          copying={copying}
          onCopying={setCopying}
        />
      )}
    </CampaignChrome>
  );
}

function Compendium({
  slots,
  list,
  campaignId,
  reading,
  onRead,
  editing,
  onEdit,
  removing,
  onRemove,
  copying,
  onCopying,
}: {
  readonly slots: CampaignChromeSlots<CampaignRuleArticlesView>;
  readonly list: ListQuery<RuleArticleQuery>;
  readonly campaignId: CampaignId;
  readonly reading: RuleArticle | undefined;
  readonly onRead: (article: RuleArticle | undefined) => void;
  readonly editing: RuleArticleDetail | undefined;
  readonly onEdit: (detail: RuleArticleDetail | undefined) => void;
  readonly removing: RuleArticle | undefined;
  readonly onRemove: (article: RuleArticle | undefined) => void;
  readonly copying: boolean;
  readonly onCopying: (copying: boolean) => void;
}) {
  const { extra } = slots;

  return (
    <>
      <div className="flex flex-col gap-6">
        <RuleArticleFilters list={list} busy={false} />
        {extra.offered.length === 0 ? (
          <EmptyState icon="book-open" title="No compendium articles">
            {list.narrowed
              ? "Clear the search — nothing in this campaign matches."
              : "Copy one from the pinned 2014 compendium or from your Library. Campaign copies are snapshots, so later imports and Library edits do not rewrite them."}
          </EmptyState>
        ) : (
          <RuleArticleGrid
            articles={extra.offered}
            onOpen={onRead}
            onEdit={(article) =>
              isCampaignArticle(article)
                ? () => {
                    onRead(article);
                  }
                : undefined
            }
            onRemove={(article) =>
              isCampaignArticle(article) ? () => onRemove(article) : undefined
            }
          />
        )}
      </div>

      {reading !== undefined && (
        <RuleArticleReader
          articleId={reading.id}
          campaignId={campaignId}
          onClose={() => onRead(undefined)}
          onEdit={(detail) => {
            onRead(undefined);
            onEdit(detail);
          }}
        />
      )}
      {editing !== undefined && (
        <RuleArticleForm
          campaignId={campaignId}
          detail={editing}
          onClose={() => onEdit(undefined)}
          onSaved={() => onEdit(undefined)}
        />
      )}
      {removing !== undefined && (
        <RemoveRuleArticleDialog
          campaignId={campaignId}
          article={removing}
          onClose={() => onRemove(undefined)}
          onRemoved={() => onRemove(undefined)}
        />
      )}
      {copying && (
        <CopyRuleArticleIn
          campaignId={campaignId}
          articles={extra.originals}
          onClose={() => onCopying(false)}
        />
      )}
    </>
  );
}
