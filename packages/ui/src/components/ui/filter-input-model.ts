/**
 * The pure half of `FilterInput` — the facet schema, the token value shape,
 * the `facet:value` grammar and the suggestion computation. Everything decided
 * here is wrong *silently* (a mis-parsed range renders as a plausible chip),
 * so it is a plain module with tests of its own, the `chronicle/fight.ts`
 * rule applied in this package.
 */

export interface FilterInputOption {
  readonly value: string;
  readonly label: string;
}

/**
 * One facet of a consumer's schema. The key is the word typed before the colon
 * (`type:beast`), so keep it short, lowercase and unique; the label is what the
 * chip and the suggestion list say.
 *
 * - `enum` — a value list. Any-of by default; `multiple: false` makes a commit
 *   replace the facet's previous token instead of standing beside it.
 * - `range` — a numeric interval typed as `min-max`, `min-`, `-max` or one
 *   exact value. Values may be decimals or fractions (`1/4`), because a
 *   challenge rating is one.
 * - `boolean` — present or absent. It has no value mode: its suggestion *is*
 *   the token.
 */
export type FilterInputFacet =
  | {
      readonly kind: "enum";
      readonly key: string;
      readonly label: string;
      readonly options: ReadonlyArray<FilterInputOption>;
      readonly multiple?: boolean;
    }
  | {
      readonly kind: "range";
      readonly key: string;
      readonly label: string;
      /** What the popup shows while the range is still being typed. */
      readonly hint?: string;
    }
  | { readonly kind: "boolean"; readonly key: string; readonly label: string };

/** One committed filter. A boolean facet's token carries the value `"true"`. */
export interface FilterInputToken {
  readonly facet: string;
  readonly value: string;
}

/**
 * The controlled value: what is typed, and what is committed. `text` is the
 * whole input including any `facet:` composition in progress; `searchTextOf`
 * is what a consumer should treat as the search query.
 */
export interface FilterInputValue {
  readonly text: string;
  readonly tokens: ReadonlyArray<FilterInputToken>;
}

export const EMPTY_FILTER_VALUE: FilterInputValue = { text: "", tokens: [] };

/**
 * What the suggestion popup offers. A `facet` suggestion drills into that
 * facet's values (it rewrites the input to `key:`); a `token` suggestion
 * commits the token it carries.
 */
export type FilterInputSuggestion =
  | { readonly kind: "facet"; readonly key: string; readonly label: string }
  | { readonly kind: "token"; readonly token: FilterInputToken; readonly label: string };

export const sameToken = (a: FilterInputToken, b: FilterInputToken): boolean =>
  a.facet === b.facet && a.value === b.value;

export const sameSuggestion = (a: FilterInputSuggestion, b: FilterInputSuggestion): boolean =>
  a.kind === "facet"
    ? b.kind === "facet" && a.key === b.key
    : b.kind === "token" && sameToken(a.token, b.token);

const facetByKey = (
  facets: ReadonlyArray<FilterInputFacet>,
  key: string,
): FilterInputFacet | undefined => facets.find((facet) => facet.key === key);

/** Where the trailing word starts — the segment a composition or a match reads. */
const wordStart = (text: string): number => {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (/\s/.test(text[index]!)) return index + 1;
  }
  return 0;
};

export interface FilterComposition {
  /** Everything before the composing segment — it stays as search text. */
  readonly head: string;
  readonly facet: FilterInputFacet;
  /** What is typed after the colon. */
  readonly query: string;
}

/**
 * The `facet:` composition in progress: the last word-opening `key:` in the
 * text, with **everything after the colon as the value query — spaces
 * included**, because enum labels are things like `Level 3` and `Animal
 * Handling`. Unknown prefixes are not compositions — `time: dusk` in a note
 * search is text, not a filter. Boolean facets have no value mode, so they
 * never compose.
 */
export const compositionOf = (
  text: string,
  facets: ReadonlyArray<FilterInputFacet>,
): FilterComposition | undefined => {
  for (const match of [...text.matchAll(/(^|\s)([A-Za-z][\w-]*):/g)].reverse()) {
    const prefix = match[2]!.toLowerCase();
    const facet = facets.find(
      (candidate) =>
        candidate.key.toLowerCase() === prefix || candidate.label.toLowerCase() === prefix,
    );
    if (facet === undefined || facet.kind === "boolean") continue;
    const start = match.index + match[1]!.length;
    const colon = start + match[2]!.length;
    return { head: text.slice(0, start), facet, query: text.slice(colon + 1) };
  }
  return undefined;
};

/** The free-text search a consumer should run — the input minus any composition. */
export const searchTextOf = (text: string, facets: ReadonlyArray<FilterInputFacet>): string => {
  const composition = compositionOf(text, facets);
  return (composition === undefined ? text : composition.head).trim();
};

/** `min-max`, `min-`, `-max` or one exact value; decimals and fractions allowed. */
const RANGE = /^(\d+(?:\.\d+)?(?:\/\d+)?)?(-)?(\d+(?:\.\d+)?(?:\/\d+)?)?$/;

/** A range facet's token value for what is typed, or nothing while it does not parse. */
export const rangeValueOf = (query: string): string | undefined => {
  const trimmed = query.trim().replace(/\s+/g, "");
  if (trimmed === "" || trimmed === "-") return undefined;
  const match = RANGE.exec(trimmed);
  if (match === null) return undefined;
  const [, min, dash, max] = match;
  if (min === undefined && max === undefined) return undefined;
  if (dash === undefined && min !== undefined && max !== undefined) return undefined;
  return trimmed;
};

/** A committed range token's two ends. An exact value is both of them. */
export const rangeBoundsOf = (
  value: string,
): { readonly min: string | undefined; readonly max: string | undefined } => {
  const match = RANGE.exec(value);
  if (match === null) return { min: undefined, max: undefined };
  const [, min, dash, max] = match;
  if (dash === undefined) return { min, max: min };
  return { min, max };
};

const rangeLabelOf = (value: string): string => {
  const { min, max } = rangeBoundsOf(value);
  if (min !== undefined && max !== undefined && min === max) return min;
  if (min !== undefined && max !== undefined) return `${min}–${max}`;
  if (min !== undefined) return `${min} and up`;
  if (max !== undefined) return `up to ${max}`;
  return value;
};

/** What a token's chip (and its suggestion row) says. */
export const tokenLabelOf = (
  token: FilterInputToken,
  facets: ReadonlyArray<FilterInputFacet>,
): string => {
  const facet = facetByKey(facets, token.facet);
  if (facet === undefined) return `${token.facet}: ${token.value}`;
  if (facet.kind === "boolean") return facet.label;
  if (facet.kind === "range") return `${facet.label}: ${rangeLabelOf(token.value)}`;
  const option = facet.options.find((candidate) => candidate.value === token.value);
  return `${facet.label}: ${option?.label ?? token.value}`;
};

/** Keeps the popup honest on a big vocabulary without a scroll to nowhere. */
const SUGGESTION_CAP = 12;

const contains = (candidate: string, query: string): boolean =>
  candidate.toLowerCase().includes(query);

/**
 * The popup's rows for what is typed.
 *
 * Composing a facet lists that facet's values narrowed by the typed query (a
 * range facet offers the one parsed interval). Otherwise the trailing word
 * matches facet names — a boolean facet's row is its token, the others drill
 * in — and, once there is a word at all, values across every enum facet, so
 * typing `beast` can offer `Type: Beast` without the drill-down.
 */
export const suggestionsFor = (
  text: string,
  facets: ReadonlyArray<FilterInputFacet>,
): ReadonlyArray<FilterInputSuggestion> => {
  const composition = compositionOf(text, facets);
  if (composition !== undefined) {
    const { facet, query } = composition;
    if (facet.kind === "range") {
      const value = rangeValueOf(query);
      if (value === undefined) return [];
      return [
        {
          kind: "token",
          token: { facet: facet.key, value },
          label: tokenLabelOf({ facet: facet.key, value }, facets),
        },
      ];
    }
    if (facet.kind === "enum") {
      const needle = query.trim().toLowerCase();
      return facet.options
        .filter(
          (option) =>
            needle === "" || contains(option.label, needle) || contains(option.value, needle),
        )
        .slice(0, SUGGESTION_CAP)
        .map((option) => ({
          kind: "token",
          token: { facet: facet.key, value: option.value },
          label: `${facet.label}: ${option.label}`,
        }));
    }
    return [];
  }

  const needle = text.slice(wordStart(text)).trim().toLowerCase();
  const out: Array<FilterInputSuggestion> = [];
  for (const facet of facets) {
    const named =
      needle === "" || contains(facet.label, needle) || contains(facet.key, needle);
    if (!named) continue;
    if (facet.kind === "boolean") {
      out.push({
        kind: "token",
        token: { facet: facet.key, value: "true" },
        label: facet.label,
      });
    } else if (facet.kind !== "enum" || facet.options.length > 0) {
      out.push({ kind: "facet", key: facet.key, label: facet.label });
    }
  }
  if (needle !== "") {
    for (const facet of facets) {
      if (facet.kind !== "enum") continue;
      for (const option of facet.options) {
        if (out.length >= SUGGESTION_CAP) return out;
        if (contains(option.label, needle) || contains(option.value, needle)) {
          out.push({
            kind: "token",
            token: { facet: facet.key, value: option.value },
            label: `${facet.label}: ${option.label}`,
          });
        }
      }
    }
  }
  return out.slice(0, SUGGESTION_CAP);
};

/** The input's text after a commit — the matched trailing segment is spent. */
const spentText = (text: string, facets: ReadonlyArray<FilterInputFacet>): string => {
  const composition = compositionOf(text, facets);
  if (composition !== undefined) return composition.head;
  return text.slice(0, wordStart(text));
};

/**
 * Commits a token: toggles it off when it is already there, replaces the
 * facet's previous token when the facet is single-valued (range, boolean, or
 * `multiple: false`), stands beside it otherwise. The composing segment is
 * spent either way.
 */
export const withToken = (
  value: FilterInputValue,
  token: FilterInputToken,
  facets: ReadonlyArray<FilterInputFacet>,
): FilterInputValue => {
  const facet = facetByKey(facets, token.facet);
  const single =
    facet !== undefined &&
    (facet.kind === "range" || facet.kind === "boolean" || facet.multiple === false);
  const already = value.tokens.some((candidate) => sameToken(candidate, token));
  const tokens = already
    ? value.tokens.filter((candidate) => !sameToken(candidate, token))
    : [...(single ? value.tokens.filter((candidate) => candidate.facet !== token.facet) : value.tokens), token];
  return { text: spentText(value.text, facets), tokens };
};

/** Selecting a facet suggestion rewrites the trailing word into `key:`. */
export const withComposition = (
  value: FilterInputValue,
  key: string,
  facets: ReadonlyArray<FilterInputFacet>,
): FilterInputValue => ({
  ...value,
  text: `${spentText(value.text, facets)}${key}:`,
});

export const withoutToken = (
  value: FilterInputValue,
  token: FilterInputToken,
): FilterInputValue => ({
  ...value,
  tokens: value.tokens.filter((candidate) => !sameToken(candidate, token)),
});

/** Every committed value of one facet, in commit order. */
export const tokenValuesOf = (
  value: FilterInputValue,
  facetKey: string,
): ReadonlyArray<string> =>
  value.tokens.filter((token) => token.facet === facetKey).map((token) => token.value);
