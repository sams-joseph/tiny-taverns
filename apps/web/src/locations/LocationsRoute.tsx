import { useParams } from "@tanstack/react-router";
import { Loading } from "@taverns/ui";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { membershipsAtom } from "../campaign/load";
import { TopBar } from "../shell/TopBar";
import { CampaignLocationsScreen } from "./CampaignLocationsScreen";
import { PlayerLocationsScreen } from "./PlayerLocationsScreen";

/**
 * One Locations URL, two projections — `ChronicleRoute.tsx`'s chooser over the
 * same membership read: the creator's screen reads `locations.list`, behind
 * the creator gate, and a player's reads `playerLocations.list`.
 */
export function LocationsRouteScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const [resource, retry] = useApiAtom(membershipsAtom);

  if (resource.state === "loading") {
    return (
      <>
        <TopBar title="Locations" />
        <Loading label="Opening the table…" />
      </>
    );
  }
  if (resource.state === "failed") {
    return (
      <>
        <TopBar title="Locations" />
        <ApiFailureNotice failure={resource.failure} onRetry={retry} />
      </>
    );
  }

  const relation = resource.value.find((row) => row.campaign.id === campaignId)?.relation;
  return relation === "player" ? (
    <PlayerLocationsScreen campaignId={campaignId} />
  ) : (
    <CampaignLocationsScreen />
  );
}
