import type { RuleArticle, RuleArticleDetail } from "@taverns/api";
import { Button, Icon } from "@taverns/ui";
import { useState } from "react";
import { useApiAtom } from "../api/atoms";
import { useFilterQuery } from "../library/query";
import { LibraryNav } from "../library/LibraryNav";
import { TopBar } from "../shell/TopBar";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { libraryRuleArticlesAtom, ruleArticleQueryOf, type RuleArticleQuery } from "./load";
import { isLibraryArticle } from "./ownership";
import {
  RemoveRuleArticleDialog,
  RuleArticleFilters,
  RuleArticleForm,
  RuleArticleGrid,
  RuleArticleReader,
} from "./RuleArticleParts";

const summaryOf = (articles: ReadonlyArray<RuleArticle>): string => {
  const mine = articles.filter(isLibraryArticle).length;
  const count = `${articles.length} ${articles.length === 1 ? "article" : "articles"}`;
  return mine === 0 ? `${count} — the pinned 2014 compendium` : `${count} · ${mine} yours`;
};

export function CompendiumLibraryScreen() {
  const list = useFilterQuery([]);
  const [sort, setSort] = useState<RuleArticleQuery["sort"]>("name");
  const [resource, reload] = useApiAtom(libraryRuleArticlesAtom(ruleArticleQueryOf(list, sort)));
  const [reading, setReading] = useState<RuleArticle>();
  const [editing, setEditing] = useState<RuleArticleDetail | undefined>();
  const [removing, setRemoving] = useState<RuleArticle>();
  const [writing, setWriting] = useState(false);

  const value = resource.state === "ready" ? resource.value : undefined;

  return (
    <>
      <TopBar
        title="Library"
        subtitle={value === undefined ? undefined : summaryOf(value.articles)}
        tabs={<LibraryNav />}
      />
      {resource.state === "loading" && value === undefined && (
        <Loading label="Reading the compendium…" />
      )}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}
      {value !== undefined && resource.state !== "failed" && (
        <div className="flex flex-col gap-6">
          <RuleArticleFilters
            list={list}
            sort={sort}
            onSort={setSort}
            busy={resource.state === "loading"}
            actions={
              <Button size="sm" onClick={() => setWriting(true)}>
                <Icon name="plus" size={13} />
                Write an article
              </Button>
            }
          />
          {value.articles.length === 0 ? (
            <EmptyState icon="book-open" title="No compendium articles">
              {list.narrowed ? (
                "Clear the search — the pinned 2014 compendium is in this list too."
              ) : (
                <>
                  Write an article, or load the pinned 2014 rules with{" "}
                  <code className="font-mono text-mono whitespace-nowrap text-slate-300">
                    pnpm -F server ruleset:import
                  </code>
                  .
                </>
              )}
            </EmptyState>
          ) : (
            <RuleArticleGrid
              articles={value.articles}
              onOpen={setReading}
              onRemove={(article) =>
                isLibraryArticle(article) ? () => setRemoving(article) : undefined
              }
            />
          )}
        </div>
      )}

      {reading !== undefined && (
        <RuleArticleReader
          articleId={reading.id}
          onClose={() => setReading(undefined)}
          onEdit={(detail) => {
            setReading(undefined);
            setEditing(detail);
          }}
        />
      )}
      {writing && (
        <RuleArticleForm onClose={() => setWriting(false)} onSaved={() => setWriting(false)} />
      )}
      {removing !== undefined && (
        <RemoveRuleArticleDialog
          article={removing}
          onClose={() => setRemoving(undefined)}
          onRemoved={() => setRemoving(undefined)}
        />
      )}
      {editing !== undefined && (
        <RuleArticleForm
          detail={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
