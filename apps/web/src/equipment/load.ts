import type { Equipment, EquipmentSort, PageCursor } from "@taverns/api";
import { Effect } from "effect";
import type { TavernsClient } from "../api/client";
import type { FilterInputFacet, FilterInputOption } from "@taverns/ui";
import type { FilterQuery } from "../library/query";

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

/** The wire query for what the unified filter box holds, plus the sort beside it. */
export const equipmentQueryOf = (filter: FilterQuery, sort: EquipmentSort): EquipmentQuery => ({
  ...NO_EQUIPMENT_QUERY,
  q: filter.q,
  sort,
  categories: filter.valuesOf("category"),
  properties: filter.valuesOf("property"),
});

const CATEGORIES: ReadonlyArray<FilterInputOption> = [
  { value: "adventuring-gear", label: "Adventuring Gear" },
  { value: "armor", label: "Armor" },
  { value: "mounts-and-vehicles", label: "Mounts and Vehicles" },
  { value: "tools", label: "Tools" },
  { value: "weapon", label: "Weapons" },
];

/**
 * The 2014 weapon properties, by source key — what the bundled corpus's rows
 * name. See the spells tab's class facet for the reasoning, which is the same.
 */
const PROPERTIES: ReadonlyArray<FilterInputOption> = [
  { value: "ammunition", label: "Ammunition" },
  { value: "finesse", label: "Finesse" },
  { value: "heavy", label: "Heavy" },
  { value: "light", label: "Light" },
  { value: "loading", label: "Loading" },
  { value: "monk", label: "Monk" },
  { value: "reach", label: "Reach" },
  { value: "special", label: "Special" },
  { value: "thrown", label: "Thrown" },
  { value: "two-handed", label: "Two-handed" },
  { value: "versatile", label: "Versatile" },
];

/** The equipment tab's facet schema — what its `FilterBox` suggests and parses. */
export const EQUIPMENT_FACETS: ReadonlyArray<FilterInputFacet> = [
  { kind: "enum", key: "category", label: "Category", options: CATEGORIES },
  { kind: "enum", key: "property", label: "Property", options: PROPERTIES },
];
