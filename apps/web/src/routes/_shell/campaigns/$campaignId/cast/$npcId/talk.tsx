import { createFileRoute } from "@tanstack/react-router";
import { PlayerNpcChatScreen } from "../../../../../../cast/PlayerNpcChatScreen";

export const Route = createFileRoute("/_shell/campaigns/$campaignId/cast/$npcId/talk")({
  component: PlayerNpcChatScreen,
  remountDeps: ({ params }) => params.npcId,
});
