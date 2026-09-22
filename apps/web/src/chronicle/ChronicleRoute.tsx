import { useParams } from "@tanstack/react-router";
import { useApiAtom } from "../api/atoms";
import { membershipsAtom } from "../campaign/load";
import { TopBar } from "../shell/TopBar";
import { ChronicleScreen } from "./ChronicleScreen";
import { PlayerChronicleScreen } from "./PlayerChronicleScreen";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { Loading } from "@taverns/ui";

/**
 * One Chronicle URL, two projections — the same chooser `CampaignRoute.tsx`
 * is, over the same membership read, for the same reason: the wide screen
 * reads `recap.read`, which is behind the creator gate and answers a player a
 * 404, and the narrow one reads `recap.readAsPlayer`. Which record you get is
 * what you are at the table, per pair, with no mode anywhere.
 */
export function ChronicleRouteScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const [resource, retry] = useApiAtom(membershipsAtom);

  if (resource.state === "loading") {
    return (
      <>
        <TopBar title="Chronicle" />
        <Loading label="Opening the record…" />
      </>
    );
  }
  if (resource.state === "failed") {
    return (
      <>
        <TopBar title="Chronicle" />
        <ApiFailureNotice failure={resource.failure} onRetry={retry} />
      </>
    );
  }

  const relation = resource.value.find((row) => row.campaign.id === campaignId)?.relation;
  return relation === "player" ? (
    <PlayerChronicleScreen campaignId={campaignId} />
  ) : (
    <ChronicleScreen />
  );
}
