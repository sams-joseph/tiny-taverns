import type { Creature, CreatureSort, Page, PageCursor } from "@taverns/api";
import { Effect, Result } from "effect";
import type { HttpClient } from "effect/unstable/http";
import type { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApiAtom } from "../api/atoms";
import { runApiResult, type TavernsClient } from "../api/client";
import type { ApiFailure, Resource } from "../api/failure";
import { useCredential } from "../auth/credential";
import { NO_QUERY, type CorpusQuery, type CorpusView } from "./load";

/**
 * Reading a list of creatures: the controls, the debounce, the pages, and the
 * one thing a screen can only know by remembering what it has been told.
 *
 * **Two screens read one corpus** — the campaign bestiary and the Library — and
 * everything about *how* they read it is the same, because the server takes the
 * same filter for both (`LibraryFilter` is spread into `CreatureFilter` in
 * `packages/api`, precisely so the two cannot drift). What differs is the
 * endpoint, the shell around it and the copy; none of that is here.
 *
 * So this hook owns the whole of the reading behaviour, and it is a hook rather
 * than a second copy of thirty lines for the same reason `chronicle/fight.ts` is
 * one function: the parts where two screens must not disagree are files.
 *
 * ### Every control is the server's, and the list is a page
 *
 * The search and the sort always were. **The chips are now**, and the two
 * changes are one change: the wire could not carry a one-element array
 * (`packages/api`'s `queryArray` is the fix), and a chip applied to *the answer*
 * would have been applied to a page — narrowing twenty-four rows and calling the
 * result the list. `load.ts` argues both halves.
 *
 * What that cost is the two things this hook used to work out for itself:
 *
 * - **the chip vocabulary** is a read of its own now (`CorpusView.vocabulary`),
 *   because a row accumulated from answers would offer only what page one
 *   happened to mention and could never grow back the chip you would press to
 *   get out of a filter;
 * - **`barren`** — empty *at all*, as opposed to empty for this filter — is
 *   still worked out here, and is still settled only by an answer that narrowed
 *   nothing. It now needs the chips clear as well as the search, which is
 *   exactly what "narrowed nothing" means once the chips reach the server.
 *
 * **`shown` is the last good answer, kept so a re-query does not blank the
 * grid.** A DM typing a name would otherwise flicker through "Loading…" once per
 * settled keystroke; the screen draws the previous list and says quietly that a
 * newer one is coming.
 */
export interface Corpus<V> {
  /** What is in the search box this instant — debounced into the query below. */
  readonly term: string;
  readonly setTerm: (term: string) => void;
  readonly sort: CreatureSort;
  readonly setSort: (sort: CreatureSort) => void;
  /** The pressed chips. Any-of, and sent rather than applied to the answer. */
  readonly environments: ReadonlyArray<string>;
  readonly toggleEnvironment: (environment: string) => void;
  /** Empties the search and the chips — the way back out of a filter. */
  readonly clear: () => void;
  /**
   * Whether the reader narrowed anything.
   *
   * Sort is deliberately not part of it: reordering a list is not filtering it,
   * and an empty answer under a different sort is still an empty corpus.
   */
  readonly narrowed: boolean;
  /** Every environment the corpus mentions, from the server, alphabetical. */
  readonly vocabulary: ReadonlyArray<string>;
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

/**
 * Long enough that typing a name is one request rather than eight, short enough
 * that the list has moved by the time the eye gets to it. Same number as
 * `CreaturePicker`, for the same reason.
 */
const SEARCH_SETTLE_MS = 250;

/**
 * `first` turns a settled query into the atom that reads its first page. The
 * caller builds it with an `Atom.family` at module scope — one per screen, keyed
 * on the query and on whatever else the read names — so **nothing here has to be
 * `useCallback`-stable**: this hook keys on the atom it is handed, and the atom
 * is the identity. That is the one thing the port simplified rather than moved.
 *
 * `more` is the same query one page on, and stays a plain call because appending
 * a page is not a resource: it adds to what is on screen rather than replacing
 * it. It is a second function rather than an optional cursor on the first
 * because the two answer different shapes — the first page comes with the
 * campaign (or the tables to copy into) and the chip vocabulary, and asking for
 * those again with every page would be three requests to add twenty-four rows.
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
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<CreatureSort>(NO_QUERY.sort);
  const [environments, setEnvironments] = useState<ReadonlyArray<string>>([]);

  useEffect(() => {
    const timer = setTimeout(() => setQ(term), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  // The chips are in here now: they are a clause of the query, so pressing one
  // is a load exactly as typing is. The memo is no longer what keeps the read
  // stable — `Atom.family` compares the query structurally, so an equal query
  // is the same atom however this object was built — but it is still what keeps
  // the *key* cheap to compare on an unrelated re-render.
  const query = useMemo<CorpusQuery>(() => ({ q, sort, environments }), [q, sort, environments]);
  const [resource, reload] = useApiAtom(first(query));

  const [shown, setShown] = useState<V>();
  const [barren, setBarren] = useState<boolean>();
  /** The pages after the first, for the query `shown` came from. */
  const [extra, setExtra] = useState<ReadonlyArray<Creature>>([]);
  const [cursor, setCursor] = useState<PageCursor<CreatureSort> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailure, setMoreFailure] = useState<ApiFailure>();

  const narrowed = q.trim() !== "" || environments.length > 0;
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

  const toggleEnvironment = useCallback(
    (environment: string) =>
      setEnvironments((current) =>
        current.includes(environment)
          ? current.filter((entry) => entry !== environment)
          : [...current, environment],
      ),
    [],
  );

  const clear = useCallback(() => {
    setTerm("");
    setQ("");
    setEnvironments([]);
  }, []);

  const creatures = useMemo(
    () => [...(shown?.creatures ?? []), ...extra],
    [shown?.creatures, extra],
  );

  return {
    term,
    setTerm,
    sort,
    setSort,
    environments,
    toggleEnvironment,
    clear,
    narrowed,
    vocabulary: shown?.vocabulary ?? [],
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
