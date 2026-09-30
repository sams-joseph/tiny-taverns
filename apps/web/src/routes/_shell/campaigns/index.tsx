import { createFileRoute } from "@tanstack/react-router";
import { CampaignsScreen } from "../../../campaign/CampaignsScreen";

/** The campaign-first home. */
export const Route = createFileRoute("/_shell/campaigns/")({
  component: CampaignsScreen,
});
