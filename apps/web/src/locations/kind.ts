import type { LocationKind } from "@taverns/api";

/** Every kind of place, as a person says it, in the order a picker offers them. */
export const LOCATION_KIND_LABELS: Readonly<Record<LocationKind, string>> = {
  realm: "Realm",
  region: "Region",
  wilderness: "Wilderness",
  city: "City",
  town: "Town",
  village: "Village",
  district: "District",
  dungeon: "Dungeon",
  landmark: "Landmark",
  building: "Building",
};

/** One kind of place, as a person says it. */
export const locationKindLabel = (kind: LocationKind): string => LOCATION_KIND_LABELS[kind];
