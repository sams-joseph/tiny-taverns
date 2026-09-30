import { createFileRoute } from "@tanstack/react-router";
import { NpcFollowUpScreen } from "../../../../../cast/NpcFollowUpScreen";

export const Route = createFileRoute("/_shell/campaigns/$campaignId/cast/follow-up")({
  component: NpcFollowUpScreen,
  remountDeps: ({ params }) => params.campaignId,
});
