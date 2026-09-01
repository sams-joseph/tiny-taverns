import { Schema } from "effect";
import { AccountId, CampaignId, RuleArticleId, RuleSectionId } from "./Ids.js";
import { pageFilter } from "./Page.js";
import { provenanceFields, Visibility } from "./Provenance.js";

const text = Schema.String.check(Schema.isLengthBetween(0, 50_000));
const label = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 240));
const sourceKey = Schema.NonEmptyString.check(Schema.isLengthBetween(1, 120));
const ordinal = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10_000 }));

export const RuleHeadingBlock = Schema.Struct({
  kind: Schema.Literal("heading"),
  depth: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 6 })),
  text: label,
});
export type RuleHeadingBlock = typeof RuleHeadingBlock.Type;

export const RuleParagraphBlock = Schema.Struct({
  kind: Schema.Literal("paragraph"),
  text,
});
export type RuleParagraphBlock = typeof RuleParagraphBlock.Type;

export const RuleListBlock = Schema.Struct({
  kind: Schema.Literal("list"),
  ordered: Schema.Boolean,
  items: Schema.Array(text).check(Schema.isLengthBetween(1, 200)),
});
export type RuleListBlock = typeof RuleListBlock.Type;

export const RuleTableBlock = Schema.Struct({
  kind: Schema.Literal("table"),
  columns: Schema.Array(label).check(Schema.isLengthBetween(1, 20)),
  rows: Schema.Array(Schema.Array(text).check(Schema.isLengthBetween(1, 20))).check(
    Schema.isLengthBetween(0, 500),
  ),
});
export type RuleTableBlock = typeof RuleTableBlock.Type;

export const RuleBlock = Schema.Union([
  RuleHeadingBlock,
  RuleParagraphBlock,
  RuleListBlock,
  RuleTableBlock,
]);
export type RuleBlock = typeof RuleBlock.Type;

const splitTableRow = (line: string): ReadonlyArray<string> =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const isTableSeparator = (line: string): boolean =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const isTableLine = (line: string): boolean => /^\s*\|/.test(line) && line.includes("|");

const listItem = (
  line: string,
): { readonly ordered: boolean; readonly text: string } | undefined => {
  const match = line.match(/^\s*(?:(\d+)\.|[-*])\s+(.*)$/);
  if (match === null) return undefined;
  return { ordered: match[1] !== undefined, text: match[2]?.trim() ?? "" };
};

/**
 * The small Markdown subset the 5e-bits 2014 rules corpus uses.
 *
 * It intentionally keeps inline emphasis as text: Taverns stores the authored
 * reference content as blocks, not as an HTML contract. The renderer may choose
 * to emphasise the asterisks, but identity and ordering live here.
 */
export const blocksFromMarkdown = (markdown: string): ReadonlyArray<RuleBlock> => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: RuleBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading !== null) {
      const depth = heading[1]!.length;
      const content = heading[2]!.trim();
      if (content !== "") blocks.push({ kind: "heading", depth, text: content });
      index += 1;
      continue;
    }

    if (isTableLine(line) && isTableSeparator(lines[index + 1] ?? "")) {
      const columns = splitTableRow(line).filter((cell) => cell !== "");
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && isTableLine(lines[index] ?? "")) {
        rows.push(splitTableRow(lines[index] ?? "") as string[]);
        index += 1;
      }
      if (columns.length > 0) blocks.push({ kind: "table", columns, rows });
      continue;
    }

    const firstItem = listItem(line);
    if (firstItem !== undefined) {
      const ordered = firstItem.ordered;
      const items: string[] = [];
      while (index < lines.length) {
        const item = listItem(lines[index] ?? "");
        if (item === undefined || item.ordered !== ordered) break;
        items.push(item.text);
        index += 1;
      }
      if (items.length > 0) blocks.push({ kind: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index] ?? "";
      if (candidate.trim() === "") break;
      if (candidate.match(/^(#{1,6})\s+(.*)$/) !== null) break;
      if (listItem(candidate) !== undefined) break;
      if (isTableLine(candidate) && isTableSeparator(lines[index + 1] ?? "")) break;
      paragraph.push(candidate.trim());
      index += 1;
    }
    const content = paragraph.join(" ").trim();
    if (content !== "") blocks.push({ kind: "paragraph", text: content });
  }

  return blocks;
};

export const blocksToMarkdown = (blocks: ReadonlyArray<RuleBlock>): string =>
  blocks
    .map((block) => {
      switch (block.kind) {
        case "heading":
          return `${"#".repeat(block.depth)} ${block.text}`;
        case "paragraph":
          return block.text;
        case "list":
          return block.items
            .map((item, index) => `${block.ordered ? `${String(index + 1)}.` : "-"} ${item}`)
            .join("\n");
        case "table": {
          const header = `| ${block.columns.join(" | ")} |`;
          const separator = `| ${block.columns.map(() => "---").join(" | ")} |`;
          const rows = block.rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
          return rows === "" ? `${header}\n${separator}` : `${header}\n${separator}\n${rows}`;
        }
      }
    })
    .join("\n\n");

/** One ordered section inside a rules article. */
export const RuleSectionDraft = Schema.Struct({
  title: label,
  content: Schema.String.check(Schema.isLengthBetween(0, 80_000)),
});
export type RuleSectionDraft = typeof RuleSectionDraft.Type;

export class RuleArticle extends Schema.Class<RuleArticle>("RuleArticle")({
  id: RuleArticleId,
  campaignId: Schema.NullOr(CampaignId),
  accountId: Schema.NullOr(AccountId),
  derivedFrom: Schema.NullOr(RuleArticleId),
  sourceIndex: Schema.NullOr(sourceKey),
  name: label,
  intro: Schema.Array(RuleBlock).check(Schema.isLengthBetween(0, 1000)),
  sectionCount: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 500 })),
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export class RuleSection extends Schema.Class<RuleSection>("RuleSection")({
  id: RuleSectionId,
  articleId: RuleArticleId,
  parentSectionId: Schema.NullOr(RuleSectionId),
  sourceIndex: Schema.NullOr(sourceKey),
  title: label,
  ordinal,
  blocks: Schema.Array(RuleBlock).check(Schema.isLengthBetween(0, 5000)),
}) {}

export const RuleArticleDetail = Schema.Struct({
  article: RuleArticle,
  sections: Schema.Array(RuleSection).check(Schema.isLengthBetween(0, 500)),
});
export type RuleArticleDetail = typeof RuleArticleDetail.Type;

const RuleArticleDraft = {
  name: label,
  intro: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 80_000))),
  sections: Schema.optional(Schema.Array(RuleSectionDraft).check(Schema.isLengthBetween(0, 100))),
} as const;

export const RuleArticleLibraryCreate = Schema.Struct(RuleArticleDraft);
export type RuleArticleLibraryCreate = typeof RuleArticleLibraryCreate.Type;

const RuleArticlePatch = {
  name: Schema.optional(label),
  intro: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 80_000))),
  sections: Schema.optional(Schema.Array(RuleSectionDraft).check(Schema.isLengthBetween(0, 100))),
} as const;

export const RuleArticleLibraryUpdate = Schema.Struct(RuleArticlePatch);
export type RuleArticleLibraryUpdate = typeof RuleArticleLibraryUpdate.Type;

export const RuleArticleUpdate = Schema.Struct({
  ...RuleArticlePatch,
  visibility: Schema.optional(Visibility),
});
export type RuleArticleUpdate = typeof RuleArticleUpdate.Type;

export const RuleArticleDerive = RuleArticleUpdate;
export type RuleArticleDerive = typeof RuleArticleDerive.Type;

export const RuleArticleSort = Schema.Literals(["name", "recent"]);
export type RuleArticleSort = typeof RuleArticleSort.Type;

export const RuleArticleFilter = {
  q: Schema.optional(Schema.String.check(Schema.isLengthBetween(0, 200))),
  sort: Schema.optional(RuleArticleSort),
  ...pageFilter(RuleArticleSort),
} as const;

export const RuleArticleFilterValues = Schema.Struct(RuleArticleFilter);
export type RuleArticleFilterValues = typeof RuleArticleFilterValues.Type;
