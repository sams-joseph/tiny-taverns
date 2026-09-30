import { createFileRoute } from "@tanstack/react-router";
import { NpcScreen } from "../../../../../../cast/NpcScreen";

export const Route = createFileRoute("/_shell/campaigns/$campaignId/cast/$npcId/")({
  component: NpcScreen,
  // A different NPC is a different rehearsal: nothing said to one may survive
  // into another's panel.
  remountDeps: ({ params }) => params.npcId,
});
