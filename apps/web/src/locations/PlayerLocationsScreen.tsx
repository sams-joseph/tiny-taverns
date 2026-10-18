import type { CampaignId } from "@taverns/api";
import { Link, useSearch } from "@tanstack/react-router";
import { EmptyState, Loading } from "@taverns/ui";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { TopBar } from "../shell/TopBar";
import { playerLocationsAtom } from "./load";
import { PlaceTree } from "./PlaceTree";
import { TableMap } from "./TableMap";

/**
 * The places a player's table has revealed: `playerLocations`, a distinct
 * read with no notes and no owner. A place shows under its parent only when
 * the parent is revealed too; the server says so, and the tree follows.
 */
export function PlayerLocationsScreen({ campaignId }: { readonly campaignId: CampaignId }) {
  const [resource, retry] = useApiAtom(playerLocationsAtom(campaignId));
  const { place: open } = useSearch({ from: "/_shell/campaigns/$campaignId/locations" });

  return (
    // The campaign destinations' frame: centred at the Overview's width,
    // header included.
    <div className="mx-auto w-full max-w-overview">
      <TopBar
        title="Locations"
        subtitle={
          resource.state === "ready"
            ? `${String(resource.value.length)} ${resource.value.length === 1 ? "place" : "places"}`
            : undefined
        }
      />
      {resource.state === "loading" && <Loading label="Reading the places…" />}
      {resource.state === "failed" && (
        <ApiFailureNotice failure={resource.failure} onRetry={retry} />
      )}
      {resource.state === "ready" &&
        (resource.value.length === 0 ? (
          <EmptyState icon="map-pin" title="Nowhere yet">
            The places your DM shows you will be here.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-6">
            {open !== undefined && (
              <TableMap campaignId={campaignId} places={resource.value} placeId={open} />
            )}
            <PlaceTree
              label="Places you know"
              places={resource.value}
              highlight={open}
              name={(place) => (
                <Link
                  to="/campaigns/$campaignId/locations"
                  params={{ campaignId }}
                  search={{ place: place.id }}
                  className="hover:underline"
                >
                  {place.name}
                </Link>
              )}
            />
          </div>
        ))}
    </div>
  );
}
