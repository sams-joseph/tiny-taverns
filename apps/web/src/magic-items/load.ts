import type { Campaign, CampaignId, MagicItem, MagicItemSort, PageCursor } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

export interface MagicItemQuery {
  readonly q: string;
  readonly sort: MagicItemSort;
  readonly categories: ReadonlyArray<string>;
  readonly rarities: ReadonlyArray<string>;
  readonly attunement: ReadonlyArray<"required" | "none">;
  readonly variantStates: ReadonlyArray<"base" | "variant" | "standalone">;
}

export const NO_MAGIC_ITEM_QUERY: MagicItemQuery = {
  q: "",
  sort: "name",
  categories: [],
  rarities: [],
  attunement: [],
  variantStates: [],
};

export const MAGIC_ITEM_PAGE_SIZE = 48;

export const magicItemQueryParams = (
  query: MagicItemQuery,
  cursor: PageCursor<MagicItemSort> | undefined,
) => ({
  q: query.q.trim(),
  sort: query.sort,
  categories: query.categories,
  rarities: query.rarities,
  attunement: query.attunement,
  variantStates: query.variantStates,
  limit: MAGIC_ITEM_PAGE_SIZE,
  cursor,
});

export interface MagicItemLibraryView {
  readonly magicItems: ReadonlyArray<MagicItem>;
  readonly nextCursor: PageCursor<MagicItemSort> | null;
  readonly campaigns: ReadonlyArray<Campaign>;
}

export const loadMagicItemLibrary = (query: MagicItemQuery) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [page, memberships] = yield* Effect.all(
      [
        client.library.magicItems({ query: magicItemQueryParams(query, undefined) }),
        client.me.campaigns(),
      ],
      { concurrency: "unbounded" },
    );
    return {
      magicItems: page.items,
      nextCursor: page.nextCursor,
      campaigns: memberships
        .filter((membership) => membership.relation === "creator")
        .map((membership) => membership.campaign),
    } satisfies MagicItemLibraryView;
  });

export interface CampaignMagicItemView {
  readonly magicItems: ReadonlyArray<MagicItem>;
  readonly nextCursor: PageCursor<MagicItemSort> | null;
}

export const loadCampaignMagicItems =
  (campaignId: CampaignId, query: MagicItemQuery) => (client: TavernsClient) =>
    Effect.map(
      client.magicItems.list({
        params: { campaignId },
        query: magicItemQueryParams(query, undefined),
      }),
      (page) =>
        ({
          magicItems: page.items,
          nextCursor: page.nextCursor,
        }) satisfies CampaignMagicItemView,
    );

export const loadMoreLibraryMagicItems =
  (query: MagicItemQuery, cursor: PageCursor<MagicItemSort>) => (client: TavernsClient) =>
    client.library.magicItems({ query: magicItemQueryParams(query, cursor) });

export const loadMoreCampaignMagicItems =
  (campaignId: CampaignId, query: MagicItemQuery, cursor: PageCursor<MagicItemSort>) =>
  (client: TavernsClient) =>
    client.magicItems.list({ params: { campaignId }, query: magicItemQueryParams(query, cursor) });

/** True when anything besides the search narrows a magic item list. */
export const magicItemNarrows = (query: MagicItemQuery): boolean =>
  query.categories.length > 0 ||
  query.rarities.length > 0 ||
  query.attunement.length > 0 ||
  query.variantStates.length > 0;

/** Clearing keeps the sort — reordering a list is not filtering it. */
export const magicItemClear = (query: MagicItemQuery, initial: MagicItemQuery): MagicItemQuery => ({
  ...initial,
  sort: query.sort,
});
