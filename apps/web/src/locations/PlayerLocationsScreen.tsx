import type { CampaignId } from "@taverns/api";
import { Link, useSearch } from "@tanstack/react-router";
import { EmptyState, Loading } from "@taverns/ui";
import { useCallback } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { reads } from "../api/keys";
import { campaignAtom } from "../campaign/load";
import { usePlayerTableStream } from "../play/tableStream";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { TopBar } from "../shell/TopBar";
import { playerLocationsAtom, playerPartyTravelAtom } from "./load";
import { PlaceTree } from "./PlaceTree";
import { TableMap } from "./TableMap";
import { TravelLog } from "./TravelLog";

/**
 * The places a player's table has revealed: `playerLocations`, a distinct
 * read with no notes and no owner. A place shows under its parent only when
 * the parent is revealed too; the server says so, and the tree follows.
 *
 * While a night is open it listens to the table's doorbell, so a move the DM
 * makes during play reaches the map without a reload.
 */
export function PlayerLocationsScreen({ campaignId }: { readonly campaignId: CampaignId }) {
  const [resource, retry] = useApiAtom(playerLocationsAtom(campaignId));
  const { place: open } = useSearch({ from: "/_shell/campaigns/$campaignId/locations" });
  const [travel] = useApiAtom(playerPartyTravelAtom(campaignId));
  const [campaign] = useApiAtom(campaignAtom(campaignId));
  const invalidate = useInvalidate();
  const night =
    campaign.state === "ready" ? (campaign.value.currentSessionId ?? undefined) : undefined;
  usePlayerTableStream({
    campaignId,
    sessionId: night,
    enabled: night !== undefined,
    onTick: useCallback(
      () => invalidate([reads.partyTravel(campaignId), reads.locations(campaignId)]),
      [invalidate, campaignId],
    ),
  });
  const moves = travel.state === "ready" ? travel.value : [];
  const at = moves[0];

  return (
    // The campaign destinations' frame: centred at the Overview's width,
    // header included.
    <div className="mx-auto w-full max-w-overview">
      <TopBar
        title="Locations"
        subtitle={
          resource.state === "ready"
            ? [
                `${String(resource.value.length)} ${resource.value.length === 1 ? "place" : "places"}`,
                ...(at === undefined ? [] : [`the party is at ${at.locationName}`]),
              ].join(" · ")
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
              <TableMap
                campaignId={campaignId}
                places={resource.value}
                placeId={open}
                partyAt={at?.locationId ?? undefined}
              />
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
            <TravelLog campaignId={campaignId} moves={moves} canTakeBack={false} />
          </div>
        ))}
    </div>
  );
}
