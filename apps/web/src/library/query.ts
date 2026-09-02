import { useEffect, useState } from "react";

/**
 * The query half of the shared Library filter pattern — the hooks and the
 * count phrasing, in a file of their own so the component file stays
 * fast-refreshable. `filters.tsx` is the controls; this is the state they
 * drive.
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
 * One tab's whole query state: the debounced search plus everything else, with
 * the narrowed flag and the clear affordance every tab owes the bar.
 *
 * The creatures corpus keeps its own richer version of this in
 * `bestiary/corpus.ts` (it also owns pages and a facet vocabulary); this is the
 * same contract for the tabs whose query is a plain object.
 */
export function useListQuery<Q extends { readonly q: string }>(
  initial: Q,
  options: {
    /** Whether anything besides the search narrows — sort never counts. */
    readonly narrows: (query: Q) => boolean;
    /** What clearing resets to; defaults to `initial`. Keep the sort. */
    readonly onClear?: (query: Q) => Q;
  },
): {
  readonly query: Q;
  readonly term: string;
  readonly setTerm: (term: string) => void;
  readonly value: Q;
  readonly patch: (partial: Partial<Q>) => void;
  readonly narrowed: boolean;
  readonly clear: () => void;
} {
  const search = useSearchTerm();
  const [rest, setRest] = useState(initial);
  const query = { ...rest, q: search.q };
  const narrowed = search.q.trim() !== "" || options.narrows(rest);
  const patch = (partial: Partial<Q>) => setRest((current) => ({ ...current, ...partial }));
  const clear = () => {
    search.reset();
    setRest((current) => options.onClear?.(current) ?? initial);
  };
  return { query, term: search.term, setTerm: search.setTerm, value: rest, patch, narrowed, clear };
}

/** What `useListQuery` hands a tab's filter row. */
export type ListQuery<Q extends { readonly q: string }> = ReturnType<typeof useListQuery<Q>>;

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
