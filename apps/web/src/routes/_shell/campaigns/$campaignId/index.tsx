import { createFileRoute } from "@tanstack/react-router";
import { CampaignRouteScreen } from "../../../../campaign/CampaignRoute";

/**
 * The campaign's home — the sixth delivery's `CampOverview`.
 *
 * **The campaign view was one screen with three tabs and is now three
 * destinations**, because the delivery's second nav row is a row of URLs and a
 * tab is not one. `CampaignScreens.jsx` splits it exactly this way, and the
 * split is what the row is for: *Encounters* and *Notes* are places you can be
 * sent, bookmark, reload into and middle-click, none of which a `useState` tab
 * was.
 *
 * The index is the Overview rather than a redirect to Encounters, so the way
 * home the campaign row's title points at lands somewhere that answers *"where
 * were we and what happens when we sit down"*.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/")({
  component: CampaignRouteScreen,
});
