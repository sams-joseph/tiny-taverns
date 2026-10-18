import type { CampaignId, LocationId } from "@taverns/api";
import { Link, useNavigate } from "@tanstack/react-router";
import { Icon } from "@taverns/ui";
import { type MapPlace, PlaceMap } from "./PlaceMap";

/** A place in a table's list: what the map draws, and the place around it in this view. */
interface TablePlace extends MapPlace {
  readonly parentId: LocationId | null;
}

/**
 * The map of one place at a table, read only, over the list that table's
 * reader already has — the creator's every place in the world, or the places
 * a player's table has revealed. Zooming in and out moves `?place=`, so the
 * way through the maps is history. A parent the reader may not see is not in
 * the list (its id never reached the wire), so the way out stops there.
 */
export function TableMap({
  campaignId,
  places,
  placeId,
  partyAt,
}: {
  readonly campaignId: CampaignId;
  readonly places: ReadonlyArray<TablePlace>;
  readonly placeId: LocationId;
  /** Where the party is, when it is at a place this reader may see. */
  readonly partyAt?: LocationId | undefined;
}) {
  const navigate = useNavigate();
  const place = places.find((candidate) => candidate.id === placeId);
  if (place === undefined) return null;

  const byId = new Map(places.map((candidate) => [candidate.id, candidate] as const));
  const ancestors: Array<TablePlace> = [];
  for (
    let parent = place.parentId === null ? undefined : byId.get(place.parentId);
    parent !== undefined && !ancestors.includes(parent);
    parent = parent.parentId === null ? undefined : byId.get(parent.parentId)
  ) {
    ancestors.unshift(parent);
  }
  const up = ancestors.at(-1);

  // The party, seen from this map: on this place, or in one of its pins'.
  const partyChain: Array<LocationId> = [];
  for (
    let at = partyAt === undefined ? undefined : byId.get(partyAt);
    at !== undefined && !partyChain.includes(at.id);
    at = at.parentId === null ? undefined : byId.get(at.parentId)
  ) {
    partyChain.unshift(at.id);
  }
  const step = partyChain.indexOf(place.id);
  const party =
    step === -1
      ? undefined
      : step === partyChain.length - 1
        ? ({ here: true } as const)
        : { in: partyChain[step + 1]! };
  const open = (id: LocationId | undefined) =>
    void navigate({
      to: "/campaigns/$campaignId/locations",
      params: { campaignId },
      search: id === undefined ? {} : { place: id },
    });

  return (
    <section aria-label={`Map of ${place.name}`} className="flex flex-col gap-3">
      <nav aria-label="Where it is" className="flex flex-wrap items-center gap-1.5 text-caption">
        <Link
          to="/campaigns/$campaignId/locations"
          params={{ campaignId }}
          className="text-muted-foreground hover:text-heading"
        >
          Every place
        </Link>
        {ancestors.map((ancestor) => (
          <span key={ancestor.id} className="flex items-center gap-1.5">
            <Icon name="chevron-right" size={12} className="text-faint" />
            <Link
              to="/campaigns/$campaignId/locations"
              params={{ campaignId }}
              search={{ place: ancestor.id }}
              className="text-muted-foreground hover:text-heading"
            >
              {ancestor.name}
            </Link>
          </span>
        ))}
        <Icon name="chevron-right" size={12} className="text-faint" />
        <span aria-current="page" className="text-heading">
          {place.name}
        </span>
      </nav>
      <PlaceMap
        place={place}
        inside={places.filter((candidate) => candidate.parentId === place.id)}
        onEnter={(child) => open(child.id)}
        onUp={() => open(up?.id)}
        upLabel={up?.name ?? "every place"}
        party={party}
      />
    </section>
  );
}
