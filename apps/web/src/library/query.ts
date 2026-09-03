import {
  conditionOf,
  EMPTY_FILTER_VALUE,
  rangeBoundsOf,
  searchTextOf,
  valuesOf,
  type FilterInputFacet,
  type FilterInputValue,
} from "@taverns/ui";
import { useEffect, useState } from "react";

/**
 * The query half of the shared filter pattern — the hook every filterable list
 * drives its `FilterInput` with, and the count phrasing, in a file of their own
 * so the component file stays fast-refreshable. `filters.tsx` is the controls;
 * this is the state they drive.
 */
/**
 * Long enough that typing a name is one request rather than eight, short enough
 * that the list has moved by the time the eye gets to it. The number the
 * creatures corpus and `CreaturePicker` already use.
 */
export const SEARCH_SETTLE_MS = 250;

/** A search box's value now, and the settled query it debounces into. */
export function useSearchTerm(): {
  readonly term: string;
  readonly setTerm: (term: string) => void;
  readonly q: string;
  readonly reset: () => void;
} {
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(term), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [term]);
  const reset = () => {
    setTerm("");
    setQ("");
  };
  return { term, setTerm, q, reset };
}

/**
 * One list's whole filter state, as the unified `FilterInput` holds it: free
 * text (debounced into `q`) plus the committed facet tokens, with the readers a
 * screen derives its own wire query from.
 *
 * Sort deliberately stays outside — a token that can be removed is the wrong
 * shape for a control that always has an answer, so every screen keeps its
 * sort in a `FilterSelect` beside the box and `clear` never touches it.
 */
export interface FilterQuery {
  /** What the box holds — hand it straight to `FilterInput`. */
  readonly value: FilterInputValue;
  readonly onChange: (value: FilterInputValue) => void;
  /** The settled search text — the input minus any `facet:` composition. */
  readonly q: string;
  /** Whether anything narrows: a settled search, or any condition at all. */
  readonly narrowed: boolean;
  readonly clear: () => void;
  /**
   * One enum facet's inclusion list — any-of, in commit order, and empty for
   * an exclusion condition, which a wire that can only include must not see.
   */
  readonly valuesOf: (facetKey: string) => ReadonlyArray<string>;
  /** A boolean facet: `true`/`false` per its pill, `undefined` when absent. */
  readonly flagOf: (facetKey: string) => boolean | undefined;
  /** A range facet's two ends, `undefined` where an end (or the pill) is absent. */
  readonly rangeOf: (facetKey: string) => {
    readonly min: string | undefined;
    readonly max: string | undefined;
  };
}

export function useFilterQuery(facets: ReadonlyArray<FilterInputFacet>): FilterQuery {
  const [value, setValue] = useState(EMPTY_FILTER_VALUE);
  const [q, setQ] = useState("");
  const text = searchTextOf(value.text, facets);
  useEffect(() => {
    const timer = setTimeout(() => setQ(text), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [text]);
  const clear = () => {
    setValue(EMPTY_FILTER_VALUE);
    setQ("");
  };
  return {
    value,
    onChange: setValue,
    q,
    narrowed: q.trim() !== "" || value.filters.length > 0,
    clear,
    valuesOf: (facetKey) => valuesOf(value, facetKey),
    flagOf: (facetKey) => {
      const condition = conditionOf(value, facetKey);
      return condition === undefined ? undefined : condition.values[0] !== "false";
    },
    rangeOf: (facetKey) => {
      const condition = conditionOf(value, facetKey);
      return condition === undefined
        ? { min: undefined, max: undefined }
        : rangeBoundsOf(condition);
    },
  };
}

/**
 * The standard count sentence for a paged, filterable list — the phrasing the
 * creatures tab established, generalised so six tabs cannot drift apart.
 */
export const listCount = (
  n: number,
  noun: { readonly one: string; readonly many: string },
  state: {
    readonly narrowed: boolean;
    readonly hasMore: boolean;
    /** What zero means when nothing narrowed — "Nothing here yet". */
    readonly empty: string;
    /** What the whole list is — "yours, and the bundled corpus". */
    readonly suffix: string;
  },
): string => {
  const things = `${String(n)} ${n === 1 ? noun.one : noun.many}`;
  if (state.hasMore)
    return state.narrowed ? `The first ${things} that match` : `The first ${things}`;
  if (state.narrowed) return `${things} ${n === 1 ? "matches" : "match"} what you're looking for`;
  return n === 0 ? state.empty : `${things} — ${state.suffix}`;
};
