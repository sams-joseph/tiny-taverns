import type { Location } from "@taverns/api";
import { campaignId, gullportId, lambId, marshId, stacksId, worldId } from "../test/ids";

/**
 * Three places on the creator's shelf — a town, a district in it and a tavern
 * in that — with the town placed in the campaign's world and the tavern
 * revealed to the table, and a place another creator in the world put there.
 * The town has its map drawn, and the district is pinned on it.
 */

export { gullportId, lambId, marshId, stacksId };

const stamp = "2026-10-01T12:00:00.000Z";

/** Gullport's drawn map, as a read signs it. */
const gullportMap = {
  cardUrl: "/location-images/6c0c0000-0000-4000-8000-0000000000aa/card?e=1&s=c",
  fullUrl: "/location-images/6c0c0000-0000-4000-8000-0000000000aa/full?e=1&s=f",
  width: 1536,
  height: 1024,
};

const owned = (
  id: string,
  parentId: string | null,
  kind: Location["kind"],
  name: string,
  description: string | null,
  picture: {
    readonly pin?: { readonly x: number; readonly y: number };
    readonly image?: typeof gullportMap;
  } = {},
) => ({
  id,
  parentId,
  kind,
  name,
  description,
  appearance: null,
  notes: null,
  pin: picture.pin ?? null,
  image: picture.image ?? null,
  imagePending: false,
  pictured: picture.image !== undefined,
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
    {
      image: gullportMap,
    },
  ),
  owned(stacksId, gullportId, "district", "The Stacks", "Net lofts and smokehouses.", {
    pin: { x: 0.3, y: 0.6 },
  }),
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
  pin: place.pin,
  image: place.image,
  imagePending: place.imagePending,
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
    pin: null,
    image: null,
    imagePending: false,
    ownerName: "Tamsin Reed",
    mine: false,
    placed: true,
    revealed: false,
  },
] as const;

/** What the table's players are told: the tavern alone, its district unrevealed. */
export const playerPlaces = [
  {
    id: lambId,
    parentId: null,
    kind: "building",
    name: "The Drowned Lamb",
    description: null,
    pin: null,
    image: null,
    imagePending: false,
  },
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
