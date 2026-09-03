import type { Creature, CreatureSort, Page, PageCursor } from "@taverns/api";
import { Effect, Result } from "effect";
import type { HttpClient } from "effect/unstable/http";
import type { AsyncResult, Atom } from "effect/unstable/reactivity";
import type { FilterInputFacet, FilterInputOption } from "@taverns/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApiAtom } from "../api/atoms";
import { runApiResult, type TavernsClient } from "../api/client";
import type { ApiFailure, Resource } from "../api/failure";
import { useCredential } from "../auth/credential";
import { useFilterQuery, type FilterQuery } from "../library/query";
import { NO_QUERY, type CorpusQuery, type CorpusView } from "./load";

/**
 * Reading a list of creatures: the unified filter box, the debounce, the pages,
 * and the one thing a screen can only know by remembering what it has been
 * told.
 *
 * The Library shelf and the encounter picker read one corpus, and everything
 * about *how* it is read is the same because the server takes the same filter
 * for both. This hook owns the whole of the reading behaviour; only the shell,
 * the copy and the empty states live in the screens.
 *
 * ### Every control is the server's, and the list is a page
 *
 * The search and the sort always were, and the facets are clauses of the same
 * query — a facet applied to *the answer* would be applied to a page, narrowing
 * twenty-four rows and calling the result the list. `load.ts` argues both
 * halves.
 *
 * What the richest corpus adds over `useFilterQuery` alone:
 *
 * - **the facet schema is built from the server's vocabulary read**
 *   (`CorpusView.facets`), because a schema accumulated from answers would
 *   offer only what page one happened to mention and could never grow back the
 *   value you would pick to get out of a filter;
 * - **facet vocabularies are grouped case-insensitively** — the corpus really
 *   does hold `beast` and `Beast` as distinct spellings (the starter bundle
 *   lowercases what the SRD capitalises), and a filter meaning "beasts" means
 *   both, so one option stands for the group and a committed token expands to
 *   every raw spelling on the wire;
 * - **`barren`** — empty *at all*, as opposed to empty for this filter — is
 *   still settled only by an answer that narrowed nothing;
 * - **`shown` is the last good answer**, kept so a re-query does not blank the
 *   grid while a newer one is on its way.
 */
export interface Corpus<V> {
  /** The unified filter state — search text, tokens, and the readers. */
  readonly list: FilterQuery;
  /** The facet schema the box suggests from, built from the shown vocabulary. */
  readonly facets: ReadonlyArray<FilterInputFacet>;
  readonly sort: CreatureSort;
  readonly setSort: (sort: CreatureSort) => void;
  /** Empties the search and the tokens — the way back out of a filter. */
  readonly clear: () => void;
  /**
   * Whether the reader narrowed anything.
   *
   * Sort is deliberately not part of it: reordering a list is not filtering it,
   * and an empty answer under a different sort is still an empty corpus.
   */
  readonly narrowed: boolean;
  /** Empty *at all*, rather than empty for this filter. `undefined` until an unnarrowed answer lands. */
  readonly barren: boolean | undefined;
  /** The last good answer, whole — a screen reads its own extra fields off this. */
  readonly shown: V | undefined;
  /** Every row read for this query: the first page, plus whatever was asked for after it. */
  readonly creatures: ReadonlyArray<Creature>;
  /** Whether the server said there is another page. */
  readonly hasMore: boolean;
  /** Asks for it. A no-op while one is in flight, or when there is none. */
  readonly loadMore: () => void;
  /** A page is being fetched. The first page is `resource.state`, not this. */
  readonly loadingMore: boolean;
  /** What went wrong asking for one more page. The rows already read stay on screen. */
  readonly moreFailure: ApiFailure | undefined;
  readonly resource: Resource<V>;
  readonly reload: () => void;
}

/** The nine any-of facets, in the order the suggestion popup offers them. */
const ENUM_FACETS: ReadonlyArray<{
  readonly key: string;
  readonly label: string;
  readonly field: FacetField;
}> = [
  { key: "environment", label: "Environment", field: "environments" },
  { key: "size", label: "Size", field: "sizes" },
  { key: "type", label: "Type", field: "types" },
  { key: "subtype", label: "Subtype", field: "subtypes" },
  { key: "alignment", label: "Alignment", field: "alignments" },
  { key: "resists", label: "Resists", field: "damageResistances" },
  { key: "immune", label: "Damage immunity", field: "damageImmunities" },
  { key: "condition", label: "Condition immunity", field: "conditionImmunities" },
  { key: "movement", label: "Movement", field: "movementModes" },
];

type FacetField =
  | "environments"
  | "sizes"
  | "types"
  | "subtypes"
  | "alignments"
  | "damageResistances"
  | "damageImmunities"
  | "conditionImmunities"
  | "movementModes";

/**
 * One facet's vocabulary, grouped case-insensitively — one option per group,
 * and the raw spellings a committed group key expands back into. The predicate
 * is any-of, so widening a token to every spelling is exactly what the reader
 * asked for.
 */
const grouped = (
  vocabulary: ReadonlyArray<string>,
): {
  readonly options: ReadonlyArray<FilterInputOption>;
  readonly raws: ReadonlyMap<string, ReadonlyArray<string>>;
} => {
  const raws = new Map<string, Array<string>>();
  for (const value of vocabulary) {
    const key = value.toLowerCase();
    const entry = raws.get(key);
    if (entry === undefined) raws.set(key, [value]);
    else entry.push(value);
  }
  const options = [...raws.keys()].map((key) => ({
    value: key,
    label: (key[0]?.toUpperCase() ?? "") + key.slice(1),
  }));
  return { options, raws };
};

/** A CR bound as the wire's number filter reads it — a fraction becomes its decimal. */
const crBound = (bound: string | undefined): string => {
  if (bound === undefined) return "";
  const fraction = /^(\d+)\/(\d+)$/.exec(bound);
  if (fraction === null) return bound;
  const denominator = Number(fraction[2]);
  return denominator === 0 ? bound : String(Number(fraction[1]) / denominator);
};

/** The facet schema for what the vocabulary read said this corpus holds. */
const facetsOf = (view: CorpusView | undefined): ReadonlyArray<FilterInputFacet> => {
  if (view === undefined) return [];
  const out: Array<FilterInputFacet> = [];
  for (const facet of ENUM_FACETS) {
    const vocabulary = view.facets[facet.field];
    if (vocabulary.length === 0) continue;
    out.push({
      kind: "enum",
      key: facet.key,
      label: facet.label,
      options: grouped(vocabulary).options,
    });
  }
  out.push({
    kind: "range",
    key: "cr",
    label: "CR",
    hint:
      view.facets.crMin === null || view.facets.crMax === null
        ? undefined
        : `Type a range — like ${String(view.facets.crMin)}-${String(view.facets.crMax)} — then press Enter.`,
  });
  if (view.facets.legendary) out.push({ kind: "boolean", key: "legendary", label: "Legendary" });
  if (view.facets.spellcaster)
    out.push({ kind: "boolean", key: "spellcaster", label: "Spellcaster" });
  return out;
};

/** The wire query for what the box holds — group keys expanded to raw spellings. */
const queryOf = (
  list: FilterQuery,
  sort: CreatureSort,
  view: CorpusView | undefined,
): CorpusQuery => {
  const expand = (key: string, field: FacetField): ReadonlyArray<string> => {
    const selected = list.valuesOf(key);
    if (selected.length === 0 || view === undefined) return selected;
    const { raws } = grouped(view.facets[field]);
    return selected.flatMap((group) => raws.get(group) ?? [group]);
  };
  const cr = list.rangeOf("cr");
  return {
    ...NO_QUERY,
    q: list.q,
    sort,
    environments: expand("environment", "environments"),
    sizes: expand("size", "sizes"),
    types: expand("type", "types"),
    subtypes: expand("subtype", "subtypes"),
    alignments: expand("alignment", "alignments"),
    damageResistances: expand("resists", "damageResistances"),
    damageImmunities: expand("immune", "damageImmunities"),
    conditionImmunities: expand("condition", "conditionImmunities"),
    movementModes: expand("movement", "movementModes"),
    crMin: crBound(cr.min),
    crMax: crBound(cr.max),
    legendary: list.flagOf("legendary"),
    spellcaster: list.flagOf("spellcaster"),
  };
};

/**
 * `first` turns a settled query into the atom that reads its first page. The
 * caller builds it with an `Atom.family` at module scope — one per screen, keyed
 * on the query and on whatever else the read names — so **nothing here has to be
 * `useCallback`-stable**: this hook keys on the atom it is handed, and the atom
 * is the identity.
 *
 * `more` is the same query one page on, and stays a plain call because appending
 * a page is not a resource: it adds to what is on screen rather than replacing
 * it.
 */
export function useCorpus<V extends CorpusView, E, E2>(
  first: (query: CorpusQuery) => Atom.Atom<AsyncResult.AsyncResult<V, E>>,
  more: (
    query: CorpusQuery,
    cursor: PageCursor<CreatureSort>,
  ) => (
    client: TavernsClient,
  ) => Effect.Effect<Page<Creature, CreatureSort>, E2, HttpClient.HttpClient>,
): Corpus<V> {
  const [shown, setShown] = useState<V>();
  const facets = useMemo(() => facetsOf(shown), [shown]);
  const list = useFilterQuery(facets);
  const [sort, setSort] = useState<CreatureSort>(NO_QUERY.sort);

  // The tokens are in the query: pressing a suggestion is a load exactly as
  // typing is. `Atom.family` compares the query structurally, so an equal
  // query is the same atom however this object was built — a fresh object per
  // render is the same read.
  const query = queryOf(list, sort, shown);
  const [resource, reload] = useApiAtom(first(query));

  const [barren, setBarren] = useState<boolean>();
  /** The pages after the first, for the query `shown` came from. */
  const [extra, setExtra] = useState<ReadonlyArray<Creature>>([]);
  const [cursor, setCursor] = useState<PageCursor<CreatureSort> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailure, setMoreFailure] = useState<ApiFailure>();

  const narrowed = list.narrowed;
  /**
   * Read inside the effect below rather than depended on, and that is
   * load-bearing rather than tidy.
   *
   * `narrowed` changes one render *before* the answer for the new query lands —
   * the moment the debounce settles — so as a dependency it re-runs the effect
   * against the **previous** answer and throws away the extra pages while the
   * old first page is still on screen. Measured: after typing a search, the
   * second page vanished and the first stayed, which is a list that is neither
   * the old one nor the new one. A ref is read at the moment the answer arrives,
   * by which time the two agree.
   */
  const narrowing = useRef(narrowed);
  narrowing.current = narrowed;

  useEffect(() => {
    if (resource.state !== "ready") return;
    const value = resource.value;
    setShown(value);
    // A new first page replaces everything read after the old one: those rows
    // belong to a query nobody is looking at any more.
    setExtra([]);
    setCursor(value.nextCursor);
    setMoreFailure(undefined);
    // An answer that narrowed nothing *is* the corpus, so an empty one means
    // there is nothing to find. Any narrowing at all and this says nothing,
    // which is what keeps "loosen a filter" and "here is what fills this" apart.
    if (!narrowing.current) setBarren(value.creatures.length === 0 && value.nextCursor === null);
  }, [resource]);

  const fetchCredential = useCredential();
  const loadMore = useCallback(() => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    setMoreFailure(undefined);
    void (async () => {
      // Per call, never held — the rule the atom client and `useMutation` both
      // follow, and `auth/credential.ts` says why.
      const token = await fetchCredential();
      const result = await runApiResult((client) => more(query, cursor)(client), token);
      setLoadingMore(false);
      if (Result.isFailure(result)) {
        setMoreFailure(result.failure);
        return;
      }
      setExtra((rows) => [...rows, ...result.success.items]);
      setCursor(result.success.nextCursor);
    })();
  }, [cursor, loadingMore, query, more, fetchCredential]);

  const creatures = useMemo(
    () => [...(shown?.creatures ?? []), ...extra],
    [shown?.creatures, extra],
  );

  return {
    list,
    facets,
    sort,
    setSort,
    clear: list.clear,
    narrowed,
    barren,
    shown,
    creatures,
    hasMore: cursor !== null,
    loadMore,
    loadingMore,
    moreFailure,
    resource,
    reload,
  };
}
