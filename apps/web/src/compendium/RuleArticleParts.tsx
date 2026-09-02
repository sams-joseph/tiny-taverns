import {
  type Campaign,
  type CampaignId,
  blocksToMarkdown,
  type RuleArticle,
  type RuleArticleDetail,
  type RuleArticleId,
  type RuleBlock,
  type RuleSection,
  type RuleSectionDraft,
  type Visibility,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@taverns/ui";
import { Result } from "effect";
import { useMemo, useState, type ReactNode } from "react";
import { useApiAtom } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { reads } from "../api/keys";
import { CopyIntoCampaignSection } from "../library/CopyIn";
import { FilterBar, FilterSearch, FilterSelect, type FilterOption } from "../library/filters";
import type { ListQuery } from "../library/query";
import { DetailSection } from "../ui/detail";
import { Field, Textarea, VisibilityField } from "../ui/form";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { withoutLeadingHeading } from "./blocks";
import {
  campaignRuleArticleDetailAtom,
  libraryRuleArticleDetailAtom,
  ruleArticleDetailKeys,
  ruleArticleWritesAt,
  type RuleArticleQuery,
} from "./load";
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
}: {
  readonly list: ListQuery<RuleArticleQuery>;
  readonly busy: boolean;
}) {
  return (
    <FilterBar narrowed={list.narrowed} onClear={list.clear} busy={busy}>
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
                  {article.visibility === "dm" && article.campaignId !== null
                    ? " · not shared"
                    : ""}
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
  campaignId,
  campaigns,
  onClose,
  onEdit,
}: {
  readonly articleId: RuleArticleId;
  readonly campaignId?: CampaignId;
  readonly campaigns?: ReadonlyArray<Campaign>;
  readonly onClose: () => void;
  readonly onEdit?: (detail: RuleArticleDetail) => void;
}) {
  const atom =
    campaignId === undefined
      ? libraryRuleArticleDetailAtom(articleId)
      : campaignRuleArticleDetailAtom({ campaignId, articleId });
  const [resource, reload] = useApiAtom(atom);

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
          <RuleArticleDetailView
            detail={resource.value}
            campaignId={campaignId}
            campaigns={campaigns}
            onClose={onClose}
            onEdit={onEdit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RuleArticleDetailView({
  detail,
  campaignId,
  campaigns,
  onClose,
  onEdit,
}: {
  readonly detail: RuleArticleDetail;
  readonly campaignId?: CampaignId;
  readonly campaigns?: ReadonlyArray<Campaign>;
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
          {campaignId === undefined &&
            campaigns !== undefined &&
            detail.article.campaignId === null && (
              <DetailSection>
                <CopyIntoCampaignSection
                  noun="article"
                  campaigns={campaigns}
                  derive={(intoCampaignId) => (client) =>
                    client.ruleArticles.derive({
                      params: { campaignId: intoCampaignId, ruleArticleId: detail.article.id },
                      payload: {},
                    })
                  }
                  readsChanged={(intoCampaignId) => ruleArticleWritesAt(intoCampaignId)}
                />
              </DetailSection>
            )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
        {onEdit !== undefined &&
          (isLibraryArticle(detail.article) || isCampaignArticle(detail.article)) && (
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
  campaignId,
  detail,
  onClose,
  onSaved,
}: {
  readonly campaignId?: CampaignId;
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
  const [visibility, setVisibility] = useState<Visibility>(existing?.visibility ?? "dm");
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
      (client) => {
        if (campaignId === undefined) {
          return existing === undefined
            ? client.library.createRuleArticle({ payload })
            : client.library.updateRuleArticle({
                params: { ruleArticleId: existing.id },
                payload,
              });
        }
        return client.ruleArticles.update({
          params: { campaignId, ruleArticleId: existing!.id },
          payload: { ...payload, visibility },
        });
      },
      existing === undefined
        ? [reads.libraryRuleArticles]
        : ruleArticleDetailKeys(detail!, campaignId),
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
          <DialogDescription>
            {campaignId === undefined
              ? "This original lives in your Library until you copy it into a campaign."
              : "This edits the campaign's snapshot only; the original it came from is untouched."}
          </DialogDescription>
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
          {campaignId !== undefined && (
            <VisibilityField
              id="rule-article-visibility"
              value={visibility}
              onChange={setVisibility}
              shared="Players can read this copied reference."
              hidden="Only the DM can read this copied reference."
            />
          )}
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
  campaignId,
  article,
  onClose,
  onRemoved,
}: {
  readonly campaignId?: CampaignId;
  readonly article: RuleArticle;
  readonly onClose: () => void;
  readonly onRemoved: () => void;
}) {
  const { busy, failure, submit } = useMutation();
  const remove = async () => {
    const result = await submit(
      (client) =>
        campaignId === undefined
          ? client.library.removeRuleArticle({ params: { ruleArticleId: article.id } })
          : client.ruleArticles.remove({ params: { campaignId, ruleArticleId: article.id } }),
      campaignId === undefined ? [reads.libraryRuleArticles] : [reads.ruleArticles(campaignId)],
    );
    if (Result.isSuccess(result)) onRemoved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Remove ${article.name}`}>
        <DialogHeader>
          <DialogTitle>Remove {article.name}?</DialogTitle>
          <DialogDescription>
            {campaignId === undefined
              ? "This removes your Library original only. Copies already in campaigns stay where they are."
              : "This removes the campaign snapshot only. The Library original or pinned reference row is not touched."}
          </DialogDescription>
        </DialogHeader>
        <div className="px-gutter py-3 text-body-s leading-body text-muted-foreground">
          {campaignId === undefined
            ? "Campaign snapshots are copies, so deleting the original does not rewrite the tables that already copied it."
            : "Players and future compendium searches at this table will no longer see this copied article."}
        </div>
        <DialogFooter>
          {failure !== undefined && (
            <span className="mr-auto text-caption text-danger-ink">Could not remove.</span>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
            {busy ? "Removing…" : campaignId === undefined ? "Remove original" : "Remove snapshot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CopyRuleArticleIn({
  campaignId,
  articles,
  onClose,
}: {
  readonly campaignId: CampaignId;
  readonly articles: ReadonlyArray<RuleArticle>;
  readonly onClose: () => void;
}) {
  const [selected, setSelected] = useState<RuleArticleId | undefined>(articles[0]?.id);
  const { busy, failure, submit } = useMutation();
  const names = useMemo(
    () => new Map(articles.map((article) => [article.id, article.name])),
    [articles],
  );

  const copy = async () => {
    if (selected === undefined) return;
    const result = await submit(
      (client) =>
        client.ruleArticles.derive({
          params: { campaignId, ruleArticleId: selected },
          payload: {},
        }),
      ruleArticleWritesAt(campaignId),
    );
    if (Result.isSuccess(result)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Copy compendium article">
        <DialogHeader>
          <DialogTitle>Copy a rule article</DialogTitle>
          <DialogDescription>
            Pick a Library or pinned 2014 article. Taverns copies the article and its sections into
            this campaign as a snapshot.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-gutter py-4">
          {articles.length === 0 ? (
            <EmptyState icon="book-open" title="No compendium articles">
              Run the ruleset importer, or write an article in your Library first.
            </EmptyState>
          ) : (
            <Select value={selected} onValueChange={(value) => setSelected(value as RuleArticleId)}>
              <SelectTrigger aria-label="Rule article" className="w-full">
                <SelectValue>{(value) => names.get(value as RuleArticleId)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {articles.map((article) => (
                  <SelectItem key={article.id} value={article.id}>
                    {article.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          {failure !== undefined && (
            <span className="mr-auto text-caption text-danger-ink">Could not copy.</span>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || selected === undefined} onClick={() => void copy()}>
            {busy ? "Copying…" : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
