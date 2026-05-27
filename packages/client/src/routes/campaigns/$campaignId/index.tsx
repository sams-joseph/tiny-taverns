import { createFileRoute } from "@tanstack/react-router";
import { CampaignOverviewPage } from "../-lib/campaign-page.js";

export const Route = createFileRoute("/campaigns/$campaignId/")({
  component: CampaignOverviewPage,
});
