import type { Creature, CreatureSort } from "@taverns/api";
import type { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TavernsClient } from "../api/client";
import { useApiResource, type Resource } from "../api/resource";
import { inEnvironments, NO_QUERY, type CorpusQuery } from "./load";

/**
 * Reading a list of creatures: the controls, the debounce, and the two things a
 * screen can only know by remembering what it has been told.
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
 * ### The two things it remembers, and why neither can be recomputed
 *
 * - **`vocabulary`** is accumulated across answers, never derived from the list
 *   in hand. Typing "goblin" narrows what comes back, and a chip row computed
 *   from *that* would take every environment the goblins do not live in off the
 *   row — including the one you would press to get back out. The first answer is
 *   unsearched, so it is the whole vocabulary, and later ones can only add.
 * - **`barren`** is whether the list is empty *at all*, as opposed to empty for
 *   this filter, and only an **unsearched** answer settles it. It is what lets a
 *   screen tell its two silences apart, which is the difference between "loosen
 *   a filter" and "here is what fills this".
 *
 * The chips never reach the server (see `inEnvironments`), so an answer with no
 * `q` really is the whole reachable set and nothing else can have narrowed it.
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
  /** The pressed chips. Any-of, and applied to the answer rather than sent. */
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
  /** Every environment any answer has mentioned, alphabetical. */
  readonly vocabulary: ReadonlyArray<string>;
  /** Empty *at all*, rather than empty for this filter. `undefined` until an unsearched answer lands. */
  readonly barren: boolean | undefined;
  /** The last good answer, whole — a screen reads its own extra fields off this. */
  readonly shown: V | undefined;
  /** That answer's creatures, with the pressed chips applied. */
  readonly creatures: ReadonlyArray<Creature>;
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
 * `load` is given the settled query and must be **`useCallback`-stable** on
 * everything else it closes over — its identity is what says "load again", so an
 * inline closure loads forever and the debounce buys nothing.
 */
export function useCorpus<V extends { readonly creatures: ReadonlyArray<Creature> }, E>(
  load: (
    query: CorpusQuery,
  ) => (client: TavernsClient) => Effect.Effect<V, E, HttpClient.HttpClient>,
): Corpus<V> {
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<CreatureSort>(NO_QUERY.sort);
  const [environments, setEnvironments] = useState<ReadonlyArray<string>>([]);

  useEffect(() => {
    const timer = setTimeout(() => setQ(term), SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  // The environments are deliberately absent: they are applied to what comes
  // back rather than sent. Memoised on what *is* sent, because its identity is
  // what tells `useApiResource` to load again.
  const query = useMemo<CorpusQuery>(() => ({ q, sort }), [q, sort]);
  const use = useCallback((client: TavernsClient) => load(query)(client), [load, query]);
  const [resource, reload] = useApiResource(use);

  const [shown, setShown] = useState<V>();
  const [vocabulary, setVocabulary] = useState<ReadonlyArray<string>>([]);
  const [barren, setBarren] = useState<boolean>();

  useEffect(() => {
    if (resource.state !== "ready") return;
    const value = resource.value;
    setShown(value);
    setVocabulary((current) => {
      const merged = new Set(current);
      for (const creature of value.creatures) {
        for (const environment of creature.environments) merged.add(environment);
      }
      return merged.size === current.length
        ? current
        : [...merged].sort((left, right) => left.localeCompare(right));
    });
    // An unsearched answer *is* the whole reachable set — the chips never reach
    // the server, so nothing else can have narrowed it.
    if (q.trim() === "") setBarren(value.creatures.length === 0);
  }, [resource, q]);

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

  const creatures = (shown?.creatures ?? []).filter((creature) =>
    inEnvironments(creature, environments),
  );

  return {
    term,
    setTerm,
    sort,
    setSort,
    environments,
    toggleEnvironment,
    clear,
    narrowed: q.trim() !== "" || environments.length > 0,
    vocabulary,
    barren,
    shown,
    creatures,
    resource,
    reload,
  };
}
