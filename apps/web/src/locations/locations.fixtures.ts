import type { Location } from "@taverns/api";
import { campaignId, worldId } from "../test/ids";

/**
 * Three places on the creator's shelf — a town, a district in it and a tavern
 * in that — with the town placed in the campaign's world and the tavern
 * revealed to the table, and a place another creator in the world put there.
 */

const stamp = "2026-10-01T12:00:00.000Z";

export const gullportId = "6c0c0000-0000-4000-8000-000000000001" as Location["id"];
export const stacksId = "6c0c0000-0000-4000-8000-000000000002" as Location["id"];
export const lambId = "6c0c0000-0000-4000-8000-000000000003" as Location["id"];
export const marshId = "6c0c0000-0000-4000-8000-000000000004" as Location["id"];

const owned = (
  id: Location["id"],
  parentId: Location["id"] | null,
  kind: Location["kind"],
  name: string,
  description: string | null,
) => ({
  id,
  parentId,
  kind,
  name,
  description,
  appearance: null,
  notes: null,
  origin: "authored",
  assistantTurnId: null,
  createdAt: stamp,
  updatedAt: stamp,
});

/** The creator's shelf, as `GET /library/locations` encodes it. */
export const libraryShelf = [
  owned(
    gullportId,
    null,
    "town",
    "Gullport",
    "A fishing town of tarred piers and gull-loud mornings.",
  ),
  owned(stacksId, gullportId, "district", "The Stacks", "Net lofts and smokehouses."),
  owned(lambId, stacksId, "building", "The Drowned Lamb", null),
] as const;

const placed = (
  place: (typeof libraryShelf)[number],
  extra: { readonly placed: boolean; readonly revealed: boolean },
) => ({
  id: place.id,
  parentId: place.parentId,
  kind: place.kind,
  name: place.name,
  description: place.description,
  appearance: place.appearance,
  ownerName: "Wren Alderby",
  mine: true,
  ...extra,
});

/** The campaign's places as its creator reads them. */
export const tablePlaces = [
  placed(libraryShelf[0], { placed: true, revealed: false }),
  placed(libraryShelf[1], { placed: false, revealed: false }),
  placed(libraryShelf[2], { placed: false, revealed: true }),
  {
    id: marshId,
    parentId: null,
    kind: "wilderness",
    name: "Blackwater Marsh",
    description: "Reeds taller than a rider, and something under the water.",
    appearance: null,
    ownerName: "Tamsin Reed",
    mine: false,
    placed: true,
    revealed: false,
  },
] as const;

/** What the table's players are told: the tavern alone, its district unrevealed. */
export const playerPlaces = [
  { id: lambId, parentId: null, kind: "building", name: "The Drowned Lamb", description: null },
] as const;

/** Every location read the fixture wire answers. */
export const fullLocations = (): ReadonlyArray<
  readonly [string, { status: number; body: unknown }]
> => [
  ["GET /library/locations", { status: 200, body: libraryShelf }],
  [`GET /campaigns/${campaignId}/locations`, { status: 200, body: tablePlaces }],
  [`GET /campaigns/${campaignId}/player-locations`, { status: 200, body: playerPlaces }],
  [
    `GET /worlds/${worldId}/locations`,
    { status: 200, body: tablePlaces.map(({ revealed: _revealed, ...place }) => place) },
  ],
];
