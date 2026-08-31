import type { Equipment, EquipmentSort, Page, PageCursor } from "@taverns/api";
import { Effect, Result } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useMemo, useState } from "react";
import { runApiResult, type TavernsClient } from "../api/client";
import type { ApiFailure, Resource } from "../api/failure";
import { useCredential } from "../auth/credential";
import type { EquipmentQuery } from "./load";

export function equipmentCount(count: number, more: boolean): string {
  const label = `${count} ${count === 1 ? "item" : "items"}`;
  return more ? `The first ${label}` : label;
}

export interface EquipmentPageSource {
  readonly equipment: ReadonlyArray<Equipment>;
  readonly nextCursor: PageCursor<EquipmentSort> | null;
}

export interface EquipmentPages<V extends EquipmentPageSource> {
  readonly shown: V | undefined;
  readonly equipment: ReadonlyArray<Equipment>;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly moreFailure: ApiFailure | undefined;
  readonly loadMore: () => void;
}

export function useEquipmentPages<V extends EquipmentPageSource, E2>(
  resource: Resource<V>,
  query: EquipmentQuery,
  more: (
    query: EquipmentQuery,
    cursor: PageCursor<EquipmentSort>,
  ) => (
    client: TavernsClient,
  ) => Effect.Effect<Page<Equipment, EquipmentSort>, E2, HttpClient.HttpClient>,
): EquipmentPages<V> {
  const [shown, setShown] = useState<V>();
  const [extra, setExtra] = useState<ReadonlyArray<Equipment>>([]);
  const [cursor, setCursor] = useState<PageCursor<EquipmentSort> | null>(null);
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

  const equipment = useMemo(
    () => [...(shown?.equipment ?? []), ...extra],
    [shown?.equipment, extra],
  );

  return {
    shown,
    equipment,
    hasMore: cursor !== null,
    loadingMore,
    moreFailure,
    loadMore,
  };
}
