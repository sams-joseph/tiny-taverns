import { useParams } from "@tanstack/react-router";
import { useApiAtom } from "../api/atoms";
import { PlayerCampaignScreen } from "../play/PlayerCampaignScreen";
import { TopBar } from "../shell/TopBar";
import { FailureNotice, Loading } from "../ui/states";
import { CampaignScreen } from "./CampaignScreen";
import { membershipsAtom } from "./load";

/**
 * One campaign URL, two projections — chosen by **what this account is at the
 * table**, which is the group architecture's replacement for the global
 * DM/player mode.
 *
 * The creator gets the campaign frame with everything on it; a participant
 * gets the player projection over the reads a player may make. The chooser is
 * the membership row's derived `relation`, off the same `GET /me/campaigns`
 * the frame reads anyway, so choosing costs no extra request.
 *
 * **No projection renders until the relation is known.** The creator screen's
 * first round composes `runs.list`, which is behind the creator gate and would
 * fail a player's whole frame — and a flash of creator chrome at a player is
 * chrome for somebody it does not belong to. The moment of blank is the same
 * one the atom's first read always was, inside a shell that is already drawn.
 *
 * An account that is no participant at all falls through to the creator
 * screen, whose own load answers the honest `NotFound` — the same sentence a
 * stranger has always read here.
 */
export function CampaignRouteScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const [resource, retry] = useApiAtom(membershipsAtom);

  if (resource.state === "loading") {
    return (
      <>
        <TopBar title="Campaign" />
        <Loading label="Opening the table…" />
      </>
    );
  }
  if (resource.state === "failed") {
    return (
      <>
        <TopBar title="Campaign" />
        <FailureNotice failure={resource.failure} onRetry={retry} />
      </>
    );
  }

  const relation = resource.value.find((row) => row.campaign.id === campaignId)?.relation;
  return relation === "player" ? (
    <PlayerCampaignScreen campaignId={campaignId} />
  ) : (
    <CampaignScreen />
  );
}
