import type { SharedWorldId } from "@taverns/api";
import { EmptyState, Loading, SectionHeading } from "@taverns/ui";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { worldLocationsAtom } from "./load";
import { PlaceTree } from "./PlaceTree";

/**
 * A Shared World's atlas on its page: every place a member put into the world,
 * read only. A place is arranged at a table (the campaign's Locations) and
 * written on its owner's shelf, so nothing here edits one.
 */
export function WorldPlaces({ worldId }: { readonly worldId: SharedWorldId }) {
  const [resource, retry] = useApiAtom(worldLocationsAtom(worldId));
  return (
    <section className="flex flex-col gap-3" aria-label="Places">
      <SectionHeading size="title">Places</SectionHeading>
      {resource.state === "loading" && <Loading label="Reading the places…" />}
      {resource.state === "failed" && (
        <ApiFailureNotice failure={resource.failure} onRetry={retry} />
      )}
      {resource.state === "ready" &&
        (resource.value.length === 0 ? (
          <EmptyState icon="map-pin" title="No places yet">
            A creator adds one of their own places from their campaign’s Locations, and every
            campaign here has it.
          </EmptyState>
        ) : (
          <PlaceTree
            label="Places in this Shared World"
            places={resource.value}
            aside={(place) => (
              <p className="text-caption leading-body text-faint">
                {place.mine ? "Yours" : `From ${place.ownerName}`}
              </p>
            )}
          />
        ))}
    </section>
  );
}
