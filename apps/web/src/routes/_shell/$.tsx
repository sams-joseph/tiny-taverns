import { createFileRoute } from "@tanstack/react-router";
import { CampaignsScreen } from "../../campaign/CampaignsScreen";

/**
 * Anything else is the campaign home.
 *
 * The last resort of the fall-back chain, and the reason a mangled id, a
 * mangled invitation token and a URL nobody ever minted all land somewhere
 * usable rather than on a not-found screen: the list is where you go to find
 * what you meant.
 */
export const Route = createFileRoute("/_shell/$")({
  component: CampaignsScreen,
});
