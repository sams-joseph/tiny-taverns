import type { Page, PageCursor, Spell, SpellSort } from "@taverns/api";
import { Effect, Result } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useMemo, useState } from "react";
import { runApiResult, type TavernsClient } from "../api/client";
import type { ApiFailure, Resource } from "../api/failure";
import { useCredential } from "../auth/credential";
import type { SpellQuery } from "./load";

export interface SpellPageSource {
  readonly spells: ReadonlyArray<Spell>;
  readonly nextCursor: PageCursor<SpellSort> | null;
}

export interface SpellPages<V extends SpellPageSource> {
  readonly shown: V | undefined;
  readonly spells: ReadonlyArray<Spell>;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly moreFailure: ApiFailure | undefined;
  readonly loadMore: () => void;
}

export function useSpellPages<V extends SpellPageSource, E2>(
  resource: Resource<V>,
  query: SpellQuery,
  more: (
    query: SpellQuery,
    cursor: PageCursor<SpellSort>,
  ) => (client: TavernsClient) => Effect.Effect<Page<Spell, SpellSort>, E2, HttpClient.HttpClient>,
): SpellPages<V> {
  const [shown, setShown] = useState<V>();
  const [extra, setExtra] = useState<ReadonlyArray<Spell>>([]);
  const [cursor, setCursor] = useState<PageCursor<SpellSort> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailure, setMoreFailure] = useState<ApiFailure>();
  const fetchCredential = useCredential();

  useEffect(() => {
    if (resource.state !== "ready") return;
    setShown(resource.value);
    setExtra([]);
    setCursor(resource.value.nextCursor);
    setMoreFailure(undefined);
  }, [resource]);

  const loadMore = useCallback(() => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    setMoreFailure(undefined);
    void (async () => {
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

  const spells = useMemo(() => [...(shown?.spells ?? []), ...extra], [shown?.spells, extra]);

  return {
    shown,
    spells,
    hasMore: cursor !== null,
    loadingMore,
    moreFailure,
    loadMore,
  };
}
