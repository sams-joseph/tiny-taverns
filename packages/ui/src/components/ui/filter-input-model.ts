/**
 * The pure half of `FilterInput` — the facet schema, the condition shape, the
 * typed grammar and the suggestion computation. Everything decided here is
 * wrong *silently* (a mis-parsed range renders as a plausible pill), so it is
 * a plain module with tests of its own, the `chronicle/fight.ts` rule applied
 * in this package.
 *
 * The shape is Linear's filter row: an active filter is a **condition** — one
 * facet, one operator, a value set — rendered as a segmented pill
 * (`field | operator | values | ×`), never a `key:value` token. The typed
 * `facet:` grammar survives as the fast path *into* a condition; what it
 * produces is the same condition the picker produces.
 */

export interface FilterInputOption {
  readonly value: string;
  readonly label: string;
}

/**
 * One facet of a consumer's schema. The key is the word typed before the colon
 * (`type:beast`), so keep it short, lowercase and unique; the label is what the
 * pill's field segment and the suggestion list say.
 *
 * - `enum` — a value list. Any-of within the facet by default; `multiple:
 *   false` keeps the condition to one value. `not: true` offers the exclusion
 *   operator — set it only where the consumer can honour it (a server that
 *   only ANDs inclusion lists cannot, and a pill that lies is worse than a
 *   missing operator).
 * - `range` — a numeric interval typed as `min-max`, `min-`, `-max` or one
 *   exact value; the shape becomes the comparison operator. Values may be
 *   decimals or fractions (`1/4`), because a challenge rating is one.
 * - `boolean` — `is` / `is not`, values `"true"` / `"false"`.
 */
export type FilterInputFacet =
  | {
      readonly kind: "enum";
      readonly key: string;
      readonly label: string;
      readonly options: ReadonlyArray<FilterInputOption>;
      readonly multiple?: boolean;
      readonly not?: boolean;
      /** The aggregated value segment's noun — "3 environments". Defaults to the lowercased label + "s". */
      readonly many?: string;
    }
  | {
      readonly kind: "range";
      readonly key: string;
      readonly label: string;
      /** What the popup shows while the range is still being typed. */
      readonly hint?: string;
    }
  | { readonly kind: "boolean"; readonly key: string; readonly label: string };

/**
 * How a condition matches. Which of these a facet offers is derived from its
 * kind (and its `not` flag); the ids are stable, the labels live in
 * `operatorLabelOf`.
 */
export type FilterOperator =
  | "in" // enum: any of the values
  | "not" // enum: none of the values
  | "is" // boolean: true / false, per the one value
  | "eq" // range: exactly the one value
  | "gte" // range: the one value and up
  | "lte" // range: up to the one value
  | "between"; // range: the two values inclusive

/** One active filter — the pill. */
export interface FilterCondition {
  readonly facet: string;
  readonly operator: FilterOperator;
  /** enum: the chosen values; boolean: ["true"|"false"]; range: [v] or [min, max]. */
  readonly values: ReadonlyArray<string>;
}

/**
 * The controlled value: the search text, the active conditions, and how the
 * conditions combine. `match` is carried here so one state object round-trips
 * a whole filter row; the toggle renders only where the consumer says it can
 * honour "any" (`FilterInput`'s `matchToggle`).
 */
export interface FilterInputValue {
  readonly text: string;
  readonly filters: ReadonlyArray<FilterCondition>;
  readonly match: "all" | "any";
}

export const EMPTY_FILTER_VALUE: FilterInputValue = { text: "", filters: [], match: "all" };

/**
 * What the suggestion popup offers. A `facet` suggestion drills into that
 * facet's values; a `value` suggestion commits one value into (or out of) the
 * facet's condition; a `boolean` suggestion is the ready condition.
 */
export type FilterInputSuggestion =
  | { readonly kind: "facet"; readonly key: string; readonly label: string }
  | {
      readonly kind: "value";
      readonly facet: string;
      readonly value: string;
      readonly label: string;
    };

export const sameSuggestion = (a: FilterInputSuggestion, b: FilterInputSuggestion): boolean =>
  a.kind === "facet"
    ? b.kind === "facet" && a.key === b.key
    : b.kind === "value" && a.facet === b.facet && a.value === b.value;

const facetByKey = (
  facets: ReadonlyArray<FilterInputFacet>,
  key: string,
): FilterInputFacet | undefined => facets.find((facet) => facet.key === key);

export const conditionOf = (
  value: FilterInputValue,
  facetKey: string,
): FilterCondition | undefined => value.filters.find((condition) => condition.facet === facetKey);

/** Where the trailing word starts — the segment a facet-name match reads. */
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

/** A range condition for what is typed, or nothing while it does not parse. */
export const rangeConditionOf = (facetKey: string, query: string): FilterCondition | undefined => {
  const trimmed = query.trim().replace(/\s+/g, "");
  if (trimmed === "" || trimmed === "-") return undefined;
  const match = RANGE.exec(trimmed);
  if (match === null) return undefined;
  const [, min, dash, max] = match;
  if (min === undefined && max === undefined) return undefined;
  if (dash === undefined) {
    if (min === undefined || max !== undefined) return undefined;
    return { facet: facetKey, operator: "eq", values: [min] };
  }
  if (min !== undefined && max !== undefined)
    return { facet: facetKey, operator: "between", values: [min, max] };
  if (min !== undefined) return { facet: facetKey, operator: "gte", values: [min] };
  return { facet: facetKey, operator: "lte", values: [max!] };
};

/** A range condition's two ends, however its operator spells them. */
export const rangeBoundsOf = (
  condition: FilterCondition,
): { readonly min: string | undefined; readonly max: string | undefined } => {
  switch (condition.operator) {
    case "eq":
      return { min: condition.values[0], max: condition.values[0] };
    case "gte":
      return { min: condition.values[0], max: undefined };
    case "lte":
      return { min: undefined, max: condition.values[0] };
    case "between":
      return { min: condition.values[0], max: condition.values[1] };
    default:
      return { min: undefined, max: undefined };
  }
};

/** The operators a facet's pill may cycle through, in cycle order. */
export const operatorsFor = (facet: FilterInputFacet): ReadonlyArray<FilterOperator> => {
  if (facet.kind === "boolean") return ["is"];
  if (facet.kind === "range") return ["eq", "gte", "lte", "between"];
  return facet.not === true ? ["in", "not"] : ["in"];
};

/**
 * What the operator segment says. Enum wording follows the value count the
 * way Linear's does — `is` for one, `is any of` for several.
 */
export const operatorLabelOf = (condition: FilterCondition): string => {
  switch (condition.operator) {
    case "in":
      return condition.values.length > 1 ? "is any of" : "is";
    case "not":
      return condition.values.length > 1 ? "is none of" : "is not";
    case "is":
      return "is";
    case "eq":
      return "is";
    case "gte":
      return "is at least";
    case "lte":
      return "is at most";
    case "between":
      return "is between";
  }
};

/**
 * The next operator when the pill's operator segment is pressed — cycling,
 * because every set here is two to four entries and a click that just works
 * beats a nested menu inside a chip. Values are reshaped to what the new
 * operator can hold (a `between` collapsing to `is` keeps its lower end); a
 * boolean cycles its one value instead, `is` ⇄ `is not`.
 */
export const withNextOperator = (
  condition: FilterCondition,
  facet: FilterInputFacet,
): FilterCondition => {
  if (facet.kind === "boolean") {
    return { ...condition, values: [condition.values[0] === "true" ? "false" : "true"] };
  }
  const operators = operatorsFor(facet);
  const at = operators.indexOf(condition.operator);
  const operator = operators[(at + 1) % operators.length] ?? condition.operator;
  if (facet.kind === "range") {
    const { min, max } = rangeBoundsOf(condition);
    const first = min ?? max ?? "0";
    const values = operator === "between" ? [min ?? first, max ?? first] : [first];
    return { ...condition, operator, values };
  }
  return { ...condition, operator };
};

/** What the pill's value segment says. */
export const valuesLabelOf = (
  condition: FilterCondition,
  facets: ReadonlyArray<FilterInputFacet>,
): string => {
  const facet = facetByKey(facets, condition.facet);
  if (facet?.kind === "boolean") return condition.values[0] === "false" ? "No" : "Yes";
  if (facet?.kind === "range" || (facet === undefined && condition.values.length === 2)) {
    const { min, max } = rangeBoundsOf(condition);
    if (condition.operator === "between") return `${min ?? "?"}–${max ?? "?"}`;
    return min ?? max ?? "?";
  }
  if (condition.values.length === 1) {
    const value = condition.values[0]!;
    if (facet?.kind !== "enum") return value;
    return facet.options.find((option) => option.value === value)?.label ?? value;
  }
  const noun =
    facet?.kind === "enum" && facet.many !== undefined
      ? facet.many
      : `${(facet?.label ?? condition.facet).toLowerCase()}s`;
  return `${String(condition.values.length)} ${noun}`;
};

/** The pill's field segment — the facet's label. */
export const fieldLabelOf = (
  condition: FilterCondition,
  facets: ReadonlyArray<FilterInputFacet>,
): string => facetByKey(facets, condition.facet)?.label ?? condition.facet;

/** One accessible sentence for the whole pill — its name wherever one is needed. */
export const conditionLabelOf = (
  condition: FilterCondition,
  facets: ReadonlyArray<FilterInputFacet>,
): string =>
  `${fieldLabelOf(condition, facets)} ${operatorLabelOf(condition)} ${valuesLabelOf(condition, facets)}`;

/** Keeps the popup honest on a big vocabulary without a scroll to nowhere. */
const SUGGESTION_CAP = 12;

const contains = (candidate: string, query: string): boolean =>
  candidate.toLowerCase().includes(query);

/**
 * The popup's rows for what is typed.
 *
 * Field mode (no composition) matches the trailing word against facet names —
 * a boolean facet's row is a ready `value` suggestion, the others drill in —
 * and, once there is a word at all, values across every enum facet, so typing
 * `beast` can offer `Type: Beast` without the drill-down. Value mode (a
 * composition, or a pill's value segment reopened) lists that facet's values
 * narrowed by the query; a range facet offers the one parsed interval.
 */
export const suggestionsFor = (
  text: string,
  facets: ReadonlyArray<FilterInputFacet>,
): ReadonlyArray<FilterInputSuggestion> => {
  const composition = compositionOf(text, facets);
  if (composition !== undefined) return valueSuggestionsFor(composition.facet, composition.query);

  const needle = text.slice(wordStart(text)).trim().toLowerCase();
  const out: Array<FilterInputSuggestion> = [];
  for (const facet of facets) {
    const named = needle === "" || contains(facet.label, needle) || contains(facet.key, needle);
    if (!named) continue;
    if (facet.kind === "boolean") {
      out.push({ kind: "value", facet: facet.key, value: "true", label: facet.label });
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
            kind: "value",
            facet: facet.key,
            value: option.value,
            label: `${facet.label}: ${option.label}`,
          });
        }
      }
    }
  }
  return out.slice(0, SUGGESTION_CAP);
};

/** Value mode for one facet — what the picker lists once a field is chosen. */
export const valueSuggestionsFor = (
  facet: FilterInputFacet,
  query: string,
): ReadonlyArray<FilterInputSuggestion> => {
  if (facet.kind === "range") {
    const condition = rangeConditionOf(facet.key, query);
    if (condition === undefined) return [];
    return [
      {
        kind: "value",
        facet: facet.key,
        value: condition.values.join("-"),
        label: `${facet.label} ${operatorLabelOf(condition)} ${valuesLabelOf(condition, [facet])}`,
      },
    ];
  }
  if (facet.kind === "enum") {
    const needle = query.trim().toLowerCase();
    // The whole vocabulary, uncapped — the popup scrolls, and a picker whose
    // later values are unreachable except by typing is a silent hole. The cap
    // is for field-mode cross-matches, which are a convenience, not the list.
    return facet.options
      .filter(
        (option) =>
          needle === "" || contains(option.label, needle) || contains(option.value, needle),
      )
      .map((option) => ({
        kind: "value",
        facet: facet.key,
        value: option.value,
        label: option.label,
      }));
  }
  return [];
};

/**
 * The input's text after a commit. A composition being *browsed* — its query
 * empty, values picked from the popup — keeps its `key:`, so choosing three
 * environments is one flow rather than three drill-downs (the bare remnant is
 * stripped when the popup closes, `strippedOnClose`). A composition with a
 * typed query is spent whole: the user named their value, and keeping the
 * `key:` would chain remnants across typed commits. A field-mode commit
 * spends the matched trailing word.
 */
const spentText = (text: string, facets: ReadonlyArray<FilterInputFacet>): string => {
  const composition = compositionOf(text, facets);
  if (composition !== undefined) {
    if (composition.query.trim() === "") return `${composition.head}${composition.facet.key}:`;
    return composition.head;
  }
  return text.slice(0, wordStart(text));
};

/** The text once the popup closes — a spent composition's `key:` remnant goes. */
export const strippedOnClose = (text: string, facets: ReadonlyArray<FilterInputFacet>): string => {
  const composition = compositionOf(text, facets);
  if (composition !== undefined && composition.query.trim() === "") return composition.head;
  return text;
};

const replaceCondition = (
  filters: ReadonlyArray<FilterCondition>,
  facetKey: string,
  next: FilterCondition | undefined,
): ReadonlyArray<FilterCondition> => {
  const rest = filters.filter((condition) => condition.facet !== facetKey);
  const at = filters.findIndex((condition) => condition.facet === facetKey);
  if (next === undefined) return rest;
  if (at === -1) return [...filters, next];
  return filters.map((condition, index) => (index === at ? next : condition));
};

/**
 * Commits one value into the facet's condition: toggles it out when already
 * there (an empty condition leaves whole), stands beside the rest for an
 * any-of facet, replaces for a single-valued one. The composing segment is
 * spent either way. A boolean facet's value sets its one-value condition; a
 * range facet's value *is* the typed shape, re-parsed into its operator.
 */
export const withValue = (
  value: FilterInputValue,
  facetKey: string,
  picked: string,
  facets: ReadonlyArray<FilterInputFacet>,
): FilterInputValue => {
  const facet = facetByKey(facets, facetKey);
  const text = spentText(value.text, facets);
  const current = conditionOf(value, facetKey);

  if (facet?.kind === "boolean") {
    const next =
      current !== undefined && current.values[0] === picked
        ? undefined
        : { facet: facetKey, operator: "is" as const, values: [picked] };
    return { ...value, text, filters: replaceCondition(value.filters, facetKey, next) };
  }
  if (facet?.kind === "range") {
    const parsed = rangeConditionOf(facetKey, picked);
    return {
      ...value,
      text,
      filters: replaceCondition(value.filters, facetKey, parsed ?? current),
    };
  }

  const single = facet?.kind === "enum" && facet.multiple === false;
  const operator = current?.operator ?? "in";
  const has = current?.values.includes(picked) ?? false;
  const values = has
    ? (current?.values ?? []).filter((candidate) => candidate !== picked)
    : single
      ? [picked]
      : [...(current?.values ?? []), picked];
  const next = values.length === 0 ? undefined : { facet: facetKey, operator, values };
  return { ...value, text, filters: replaceCondition(value.filters, facetKey, next) };
};

/** Selecting a field suggestion rewrites the trailing word into `key:`. */
export const withComposition = (
  value: FilterInputValue,
  key: string,
  facets: ReadonlyArray<FilterInputFacet>,
): FilterInputValue => ({
  ...value,
  text: `${spentText(value.text, facets)}${key}:`,
});

export const withoutCondition = (value: FilterInputValue, facetKey: string): FilterInputValue => ({
  ...value,
  filters: value.filters.filter((condition) => condition.facet !== facetKey),
});

/** Every value the facet's `in` condition holds — the inclusion list a wire query sends. */
export const valuesOf = (value: FilterInputValue, facetKey: string): ReadonlyArray<string> => {
  const condition = conditionOf(value, facetKey);
  return condition !== undefined && condition.operator === "in" ? condition.values : [];
};

/**
 * The single-line layout's fixed numbers, shared with the tests that drive the
 * measurement. `gap` is the box's `gap-1.5`, `paddingX` its `px-2` pair, and
 * `inputReserve` the typing room the line always keeps (`min-w-24` plus
 * breathing space) — pills never squeeze the search out of its own box.
 */
export const PILL_LAYOUT = { gap: 6, paddingX: 16, inputReserve: 120 } as const;

/**
 * How many of the newest pills fit on one line.
 *
 * `pillWidths` is oldest → newest; the fit walks newest → oldest, because the
 * filter the user just added must stay visible while the older ones collect
 * into the overflow chip (whose own width is reserved the moment anything
 * hides). Everything fitting means no chip and no reserve.
 */
export const visiblePillCount = (layout: {
  readonly available: number;
  readonly pillWidths: ReadonlyArray<number>;
  readonly overflowWidth: number;
  readonly gap: number;
}): number => {
  const { available, pillWidths, overflowWidth, gap } = layout;
  const total = pillWidths.reduce((sum, width) => sum + width + gap, 0);
  if (total <= available) return pillWidths.length;
  let used = overflowWidth + gap;
  let count = 0;
  for (let index = pillWidths.length - 1; index >= 0; index -= 1) {
    const next = used + pillWidths[index]! + gap;
    if (next > available) break;
    used = next;
    count += 1;
  }
  return count;
};
