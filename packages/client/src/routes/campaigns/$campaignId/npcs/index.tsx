import { CampaignId } from "@app/domain/api/campaign-rpc";
import { createFileRoute } from "@tanstack/react-router";
import { NpcList } from "./-lib/npc-list";

export const Route = createFileRoute("/campaigns/$campaignId/npcs/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { campaignId } = Route.useParams();
  return <NpcList campaignId={CampaignId.make(campaignId)} />;
}
