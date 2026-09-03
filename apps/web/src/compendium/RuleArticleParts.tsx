import {
  blocksToMarkdown,
  type RuleArticle,
  type RuleArticleDetail,
  type RuleArticleId,
  type RuleBlock,
  type RuleSection,
  type RuleSectionDraft,
} from "@taverns/api";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  cn,
} from "@taverns/ui";
import { Result } from "effect";
import { useState, type ReactNode } from "react";
import { useApiAtom } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { reads } from "../api/keys";
import { FilterBar, FilterSearch, FilterSelect, type FilterOption } from "../library/filters";
import type { ListQuery } from "../library/query";
import { Field, Textarea } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";
import { withoutLeadingHeading } from "./blocks";
import { libraryRuleArticleDetailAtom, ruleArticleDetailKeys, type RuleArticleQuery } from "./load";
import {
  isBundleArticle,
  isCampaignArticle,
  isLibraryArticle,
  ruleArticleOwnerLabel,
} from "./ownership";

const SORTS: ReadonlyArray<FilterOption> = [
  { value: "name", label: "Name" },
  { value: "recent", label: "Recent" },
];

export function RuleArticleFilters({
  list,
  busy,
  actions,
}: {
  readonly list: ListQuery<RuleArticleQuery>;
  readonly busy: boolean;
  /** The tab's own write action(s), forwarded to `FilterBar`'s slot. */
  readonly actions?: ReactNode;
}) {
  return (
    <FilterBar narrowed={list.narrowed} onClear={list.clear} busy={busy} actions={actions}>
      <FilterSearch label="Search the compendium" value={list.term} onChange={list.setTerm} />
      <FilterSelect
        label="Sort"
        value={list.value.sort}
        onChange={(sort) => list.patch({ sort: sort as RuleArticleQuery["sort"] })}
        options={SORTS}
        className="w-32"
      />
    </FilterBar>
  );
}

export function RuleArticleGrid({
  articles,
  onOpen,
  onEdit,
  onRemove,
}: {
  readonly articles: ReadonlyArray<RuleArticle>;
  readonly onOpen: (article: RuleArticle) => void;
  readonly onEdit?: (article: RuleArticle) => (() => void) | undefined;
  readonly onRemove?: (article: RuleArticle) => (() => void) | undefined;
}) {
  return (
    <div className="grid gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
      {articles.map((article) => {
        const edit = onEdit?.(article);
        const remove = onRemove?.(article);
        return (
          <article
            key={article.id}
            className="flex min-w-0 flex-col gap-3 rounded-card border border-subtle bg-surface-card p-4 shadow-1"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-title leading-title font-semibold text-heading">
                  {article.name}
                </h3>
                <p className="mt-1 text-caption leading-body text-muted-foreground">
                  {article.sectionCount} {article.sectionCount === 1 ? "section" : "sections"}
                </p>
              </div>
              <ArticleBadge article={article} />
            </div>
            {article.intro.length > 0 && (
              <p className="line-clamp-3 text-body-s leading-body text-muted-foreground">
                {plainText(article.intro)}
              </p>
            )}
            <div className="mt-auto flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => onOpen(article)}>
                Read
              </Button>
              {edit !== undefined && (
                <Button variant="secondary" size="sm" onClick={edit}>
                  Edit
                </Button>
              )}
              {remove !== undefined && (
                <Button variant="ghost" size="sm" onClick={remove}>
                  Remove
                </Button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ArticleBadge({ article }: { readonly article: RuleArticle }) {
  if (isCampaignArticle(article)) return null;
  return (
    <Badge variant={isBundleArticle(article) ? "magic" : "default"}>
      {isBundleArticle(article) ? "2014" : "Yours"}
    </Badge>
  );
}

const plainText = (blocks: ReadonlyArray<RuleBlock>): string =>
  blocks
    .map((block) => {
      switch (block.kind) {
        case "heading":
          return block.text;
        case "paragraph":
          return block.text;
        case "list":
          return block.items.join(" · ");
        case "table":
          return block.columns.join(" · ");
      }
    })
    .join(" ");

/**
 * The `**bold**` and `*italic*` the 2014 source writes inline, rendered rather
 * than shown as asterisks. Deliberately only those two: the corpus uses
 * nothing else inline, and a full markdown pass belongs to the source
 * importer, not a reader.
 */
const inline = (text: string): ReactNode =>
  text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-heading">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });

export function RuleBlocks({ blocks }: { readonly blocks: ReadonlyArray<RuleBlock> }) {
  if (blocks.length === 0) return null;
  return (
    <div className="flex flex-col gap-4 text-body-s leading-body text-foreground">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading": {
            const Tag = block.depth <= 2 ? "h3" : "h4";
            return (
              <Tag
                key={index}
                className={cn(
                  block.depth <= 2
                    ? "text-title leading-title font-semibold text-heading"
                    : "text-body-l leading-body font-semibold text-heading",
                )}
              >
                {block.text}
              </Tag>
            );
          }
          case "paragraph":
            return <p key={index}>{inline(block.text)}</p>;
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List
                key={index}
                className="flex list-outside flex-col gap-1 pl-5 marker:text-accent-ink"
              >
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className={block.ordered ? "list-decimal" : "list-disc"}>
                    {inline(item)}
                  </li>
                ))}
              </List>
            );
          }
          case "table":
            return (
              <div key={index} className="overflow-x-auto rounded-control border border-subtle">
                <table className="w-full min-w-max border-collapse text-left text-caption leading-body">
                  <thead className="bg-surface-raised text-heading">
                    <tr>
                      {block.columns.map((column) => (
                        <th key={column} className="border-b border-subtle px-3 py-2 font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="odd:bg-surface-card even:bg-surface-raised/40">
                        {block.columns.map((_, cellIndex) => (
                          <td key={cellIndex} className="border-t border-subtle px-3 py-2">
                            {inline(row[cellIndex] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}

export function RuleArticleReader({
  articleId,
  onClose,
  onEdit,
}: {
  readonly articleId: RuleArticleId;
  readonly onClose: () => void;
  readonly onEdit?: (detail: RuleArticleDetail) => void;
}) {
  const [resource, reload] = useApiAtom(libraryRuleArticleDetailAtom(articleId));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label="Read rule article"
        className="max-h-[min(90vh,47.5rem)] overflow-hidden"
      >
        {resource.state === "loading" && <Loading label="Opening the article…" />}
        {resource.state === "failed" && (
          <FailureNotice failure={resource.failure} onRetry={reload} />
        )}
        {resource.state === "ready" && (
          <RuleArticleDetailView detail={resource.value} onClose={onClose} onEdit={onEdit} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RuleArticleDetailView({
  detail,
  onClose,
  onEdit,
}: {
  readonly detail: RuleArticleDetail;
  readonly onClose: () => void;
  readonly onEdit?: (detail: RuleArticleDetail) => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{detail.article.name}</DialogTitle>
        <DialogDescription>
          {detail.sections.length} {detail.sections.length === 1 ? "section" : "sections"} ·{" "}
          {ruleArticleOwnerLabel(detail.article)}
        </DialogDescription>
      </DialogHeader>
      <div className="min-h-0 overflow-auto px-gutter py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-7">
          {/* The imported source often opens with a heading repeating the
              article's own name, which the dialog title has already said. */}
          <RuleBlocks blocks={withoutLeadingHeading(detail.article.intro, detail.article.name)} />
          {detail.sections.map((section) => (
            <section
              key={section.id}
              // `first:` covers the article whose whole intro was the heading
              // the title already said — without it the rule floats under
              // nothing at the top of the body.
              className="flex flex-col gap-3 border-t border-subtle pt-5 first:border-t-0 first:pt-0"
            >
              <h3 className="text-title leading-title font-semibold text-heading">
                {section.title}
              </h3>
              <RuleBlocks blocks={withoutLeadingHeading(section.blocks, section.title)} />
            </section>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
        {onEdit !== undefined && isLibraryArticle(detail.article) && (
          <Button size="sm" onClick={() => onEdit(detail)}>
            Edit
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

const draftsFrom = (detail: RuleArticleDetail | undefined): ReadonlyArray<RuleSectionDraft> =>
  detail?.sections.map((section) => ({
    title: section.title,
    content: sectionMarkdown(section),
  })) ?? [{ title: "Overview", content: "" }];

const sectionMarkdown = (section: RuleSection): string => blocksToMarkdown(section.blocks);

export function RuleArticleForm({
  detail,
  onClose,
  onSaved,
}: {
  readonly detail?: RuleArticleDetail;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const existing = detail?.article;
  const [name, setName] = useState(existing?.name ?? "");
  const [intro, setIntro] = useState(
    existing === undefined ? "" : blocksToMarkdown(existing.intro),
  );
  const [sections, setSections] = useState<ReadonlyArray<RuleSectionDraft>>(draftsFrom(detail));
  const { busy, failure, submit } = useMutation();
  const nameError = name.trim() === "" ? "Give it a name." : undefined;

  const save = async () => {
    if (nameError !== undefined) return;
    const payload = {
      name: name.trim(),
      intro,
      sections: sections
        .map((section) => ({ title: section.title.trim(), content: section.content }))
        .filter((section) => section.title !== "" || section.content.trim() !== ""),
    };
    const result = await submit(
      (client) =>
        existing === undefined
          ? client.library.createRuleArticle({ payload })
          : client.library.updateRuleArticle({
              params: { ruleArticleId: existing.id },
              payload,
            }),
      existing === undefined ? [reads.libraryRuleArticles] : ruleArticleDetailKeys(detail!),
    );
    if (Result.isSuccess(result)) onSaved();
  };

  const updateSection = (index: number, patch: Partial<RuleSectionDraft>) =>
    setSections((current) =>
      current.map((section, at) => (at === index ? { ...section, ...patch } : section)),
    );

  const removeSection = (index: number) =>
    setSections((current) => current.filter((_, at) => at !== index));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label={existing === undefined ? "Write compendium article" : `Edit ${existing.name}`}
      >
        <DialogHeader>
          <DialogTitle>
            {existing === undefined ? "Write a compendium article" : `Edit ${existing.name}`}
          </DialogTitle>
          <DialogDescription>This original lives in your Library.</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[min(72vh,38.75rem)] flex-col gap-4 overflow-auto px-gutter py-4">
          <Field label="Name" htmlFor="rule-article-name" error={nameError}>
            <Input
              id="rule-article-name"
              value={name}
              aria-invalid={nameError !== undefined}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </Field>
          <Field
            label="Introduction"
            htmlFor="rule-article-intro"
            hint="Markdown headings, lists and tables are kept as structured blocks."
          >
            <Textarea
              id="rule-article-intro"
              value={intro}
              onChange={(event) => setIntro(event.currentTarget.value)}
            />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-title leading-title font-semibold text-heading">Sections</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSections((current) => [...current, { title: "", content: "" }])}
            >
              <Icon name="plus" size={13} />
              Add section
            </Button>
          </div>
          {sections.map((section, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-card border border-subtle bg-surface-raised p-3"
            >
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Section ${index + 1} title`}
                  value={section.title}
                  onChange={(event) => updateSection(index, { title: event.currentTarget.value })}
                  placeholder="Section title"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSection(index)}
                  disabled={sections.length === 1}
                >
                  Remove
                </Button>
              </div>
              <Textarea
                aria-label={`Section ${index + 1} content`}
                value={section.content}
                onChange={(event) => updateSection(index, { content: event.currentTarget.value })}
                placeholder="Write this section…"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          {failure !== undefined && (
            <span className="mr-auto text-caption text-danger-ink">Could not save.</span>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || nameError !== undefined} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveRuleArticleDialog({
  article,
  onClose,
  onRemoved,
}: {
  readonly article: RuleArticle;
  readonly onClose: () => void;
  readonly onRemoved: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const remove = async () => {
    const result = await submit(
      (client) => client.library.removeRuleArticle({ params: { ruleArticleId: article.id } }),
      [reads.libraryRuleArticles],
    );
    if (Result.isSuccess(result)) onRemoved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Remove ${article.name}`}>
        <DialogHeader>
          <DialogTitle>Remove {article.name}?</DialogTitle>
          <DialogDescription>This removes your Library original only.</DialogDescription>
        </DialogHeader>
        <div className="px-gutter py-3 text-body-s leading-body text-muted-foreground">
          The pinned 2014 reference is not touched, and characters already built from it keep what
          they have.
        </div>
        <DialogFooter>
          {failure !== undefined && (
            <span className="mr-auto text-caption text-danger-ink">Could not remove.</span>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
            {busy ? "Removing…" : "Remove original"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
