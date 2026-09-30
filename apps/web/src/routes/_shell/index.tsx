import { createFileRoute } from "@tanstack/react-router";
import { CampaignsScreen } from "../../campaign/CampaignsScreen";

export const Route = createFileRoute("/_shell/")({
  component: CampaignsScreen,
});
