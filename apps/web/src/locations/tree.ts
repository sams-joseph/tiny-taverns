import type { LocationId } from "@taverns/api";

/** One place in a tree, with the places under it. */
export interface PlaceNode<A> {
  readonly place: A;
  readonly children: ReadonlyArray<PlaceNode<A>>;
}

/**
 * A flat list of places as a forest, each list in the order it came in. A
 * place whose parent is not in the list stands at the top: every read already
 * says `null` for a parent the reader may not see, and a filtered list drops
 * parents too, so the tree never invents one.
 */
export const placeTree = <
  A extends { readonly id: LocationId; readonly parentId: LocationId | null },
>(
  places: ReadonlyArray<A>,
): ReadonlyArray<PlaceNode<A>> => {
  const present = new Set(places.map((place) => place.id));
  const under = new Map<LocationId | null, Array<A>>();
  for (const place of places) {
    const parent = place.parentId !== null && present.has(place.parentId) ? place.parentId : null;
    under.set(parent, [...(under.get(parent) ?? []), place]);
  }
  const grow = (parent: LocationId | null): ReadonlyArray<PlaceNode<A>> =>
    (under.get(parent) ?? []).map((place) => ({ place, children: grow(place.id) }));
  return grow(null);
};

/** The place and every place under it, by id: what a parent picker must leave out. */
export const subtreeIds = <
  A extends { readonly id: LocationId; readonly parentId: LocationId | null },
>(
  places: ReadonlyArray<A>,
  root: LocationId,
): ReadonlySet<LocationId> => {
  const found = new Set<LocationId>([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const place of places) {
      if (place.parentId !== null && found.has(place.parentId) && !found.has(place.id)) {
        found.add(place.id);
        grew = true;
      }
    }
  }
  return found;
};
