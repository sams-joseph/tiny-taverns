import type { Campaign, CampaignId, Equipment, EquipmentSort, PageCursor } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";

export interface EquipmentQuery {
  readonly q: string;
  readonly sort: EquipmentSort;
  readonly categories: ReadonlyArray<string>;
  readonly gearCategories: ReadonlyArray<string>;
  readonly armorCategories: ReadonlyArray<string>;
  readonly weaponCategories: ReadonlyArray<string>;
  readonly weaponRanges: ReadonlyArray<string>;
  readonly toolCategories: ReadonlyArray<string>;
  readonly vehicleCategories: ReadonlyArray<string>;
  readonly properties: ReadonlyArray<string>;
}

export const NO_EQUIPMENT_QUERY: EquipmentQuery = {
  q: "",
  sort: "name",
  categories: [],
  gearCategories: [],
  armorCategories: [],
  weaponCategories: [],
  weaponRanges: [],
  toolCategories: [],
  vehicleCategories: [],
  properties: [],
};

export const EQUIPMENT_PAGE_SIZE = 48;

const valuesFrom = (text: string): ReadonlyArray<string> =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

export const equipmentTextValues = valuesFrom;

export const equipmentQueryParams = (
  query: EquipmentQuery,
  cursor: PageCursor<EquipmentSort> | undefined,
) => ({
  q: query.q.trim(),
  sort: query.sort,
  categories: query.categories,
  gearCategories: query.gearCategories,
  armorCategories: query.armorCategories,
  weaponCategories: query.weaponCategories,
  weaponRanges: query.weaponRanges,
  toolCategories: query.toolCategories,
  vehicleCategories: query.vehicleCategories,
  properties: query.properties,
  limit: EQUIPMENT_PAGE_SIZE,
  cursor,
});

export interface EquipmentLibraryView {
  readonly equipment: ReadonlyArray<Equipment>;
  readonly nextCursor: PageCursor<EquipmentSort> | null;
  readonly campaigns: ReadonlyArray<Campaign>;
}

export const loadEquipmentLibrary = (query: EquipmentQuery) => (client: TavernsClient) =>
  Effect.gen(function* () {
    const [page, memberships] = yield* Effect.all(
      [
        client.library.equipment({ query: equipmentQueryParams(query, undefined) }),
        client.me.campaigns(),
      ],
      { concurrency: "unbounded" },
    );
    return {
      equipment: page.items,
      nextCursor: page.nextCursor,
      campaigns: memberships
        .filter((membership) => membership.relation === "creator")
        .map((membership) => membership.campaign),
    } satisfies EquipmentLibraryView;
  });

export interface CampaignEquipmentView {
  readonly equipment: ReadonlyArray<Equipment>;
  readonly nextCursor: PageCursor<EquipmentSort> | null;
}

export const loadCampaignEquipment =
  (campaignId: CampaignId, query: EquipmentQuery) => (client: TavernsClient) =>
    Effect.map(
      client.equipment.list({
        params: { campaignId },
        query: equipmentQueryParams(query, undefined),
      }),
      (page) =>
        ({
          equipment: page.items,
          nextCursor: page.nextCursor,
        }) satisfies CampaignEquipmentView,
    );

export const loadMoreLibraryEquipment =
  (query: EquipmentQuery, cursor: PageCursor<EquipmentSort>) => (client: TavernsClient) =>
    client.library.equipment({ query: equipmentQueryParams(query, cursor) });

export const loadMoreCampaignEquipment =
  (campaignId: CampaignId, query: EquipmentQuery, cursor: PageCursor<EquipmentSort>) =>
  (client: TavernsClient) =>
    client.equipment.list({ params: { campaignId }, query: equipmentQueryParams(query, cursor) });
