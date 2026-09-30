import { createFileRoute } from "@tanstack/react-router";
import { CampaignRouteScreen } from "../../../../campaign/CampaignRoute";

/**
 * A section under a campaign that is not one we serve is that campaign.
 *
 * The splat is what makes "fall back a level" a property of the tree rather
 * than of a hand-written `if`: a rejected id or an unknown section leaves the
 * router backtracking, and this is the nearest candidate that still matches. It
 * is also where a half-typed run link lands — it still knows which campaign was
 * meant, so that is where it goes.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/$")({
  component: CampaignRouteScreen,
});
