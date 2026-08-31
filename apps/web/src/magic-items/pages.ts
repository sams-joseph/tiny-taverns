import type { MagicItem, MagicItemSort, Page, PageCursor } from "@taverns/api";
import { Effect, Result } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useMemo, useState } from "react";
import { runApiResult, type TavernsClient } from "../api/client";
import type { ApiFailure, Resource } from "../api/failure";
import { useCredential } from "../auth/credential";
import type { MagicItemQuery } from "./load";

export function magicItemCount(count: number, more: boolean): string {
  const label = `${count} ${count === 1 ? "item" : "items"}`;
  return more ? `The first ${label}` : label;
}

export interface MagicItemPageSource {
  readonly magicItems: ReadonlyArray<MagicItem>;
  readonly nextCursor: PageCursor<MagicItemSort> | null;
}

export interface MagicItemPages<V extends MagicItemPageSource> {
  readonly shown: V | undefined;
  readonly magicItems: ReadonlyArray<MagicItem>;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly moreFailure: ApiFailure | undefined;
  readonly loadMore: () => void;
}

export function useMagicItemPages<V extends MagicItemPageSource, E2>(
  resource: Resource<V>,
  query: MagicItemQuery,
  more: (
    query: MagicItemQuery,
    cursor: PageCursor<MagicItemSort>,
  ) => (
    client: TavernsClient,
  ) => Effect.Effect<Page<MagicItem, MagicItemSort>, E2, HttpClient.HttpClient>,
): MagicItemPages<V> {
  const [shown, setShown] = useState<V>();
  const [extra, setExtra] = useState<ReadonlyArray<MagicItem>>([]);
  const [cursor, setCursor] = useState<PageCursor<MagicItemSort> | null>(null);
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

  const magicItems = useMemo(
    () => [...(shown?.magicItems ?? []), ...extra],
    [shown?.magicItems, extra],
  );

  return {
    shown,
    magicItems,
    hasMore: cursor !== null,
    loadingMore,
    moreFailure,
    loadMore,
  };
}
