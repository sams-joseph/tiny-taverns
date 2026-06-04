import { CampaignId } from "@app/domain/api/campaign-rpc";
import { NpcId } from "@app/domain/api/npc-rpc";
import { createFileRoute } from "@tanstack/react-router";
import { NpcDetail } from "./-lib/npc-detail";

export const Route = createFileRoute(
  "/campaigns/$campaignId/npcs/$npcId",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { campaignId, npcId } = Route.useParams();
  return (
    <NpcDetail
      campaignId={CampaignId.make(campaignId)}
      npcId={NpcId.make(npcId)}
    />
  );
}
