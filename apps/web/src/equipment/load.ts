import type { Equipment, EquipmentSort, PageCursor } from "@taverns/api";
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
}

export const loadEquipmentLibrary = (query: EquipmentQuery) => (client: TavernsClient) =>
  Effect.map(
    client.library.equipment({ query: equipmentQueryParams(query, undefined) }),
    (page) =>
      ({ equipment: page.items, nextCursor: page.nextCursor }) satisfies EquipmentLibraryView,
  );

export const loadMoreLibraryEquipment =
  (query: EquipmentQuery, cursor: PageCursor<EquipmentSort>) => (client: TavernsClient) =>
    client.library.equipment({ query: equipmentQueryParams(query, cursor) });

/** True when anything besides the search narrows an equipment list. */
export const equipmentNarrows = (query: EquipmentQuery): boolean =>
  query.categories.length > 0 || query.properties.length > 0;

/** Clearing keeps the sort — reordering a list is not filtering it. */
export const equipmentClear = (query: EquipmentQuery, initial: EquipmentQuery): EquipmentQuery => ({
  ...initial,
  sort: query.sort,
});
