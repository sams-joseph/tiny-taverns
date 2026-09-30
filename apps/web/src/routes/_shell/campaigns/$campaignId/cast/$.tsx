import { createFileRoute } from "@tanstack/react-router";
import { CastScreen } from "../../../../../cast/CastScreen";

/** A half-typed NPC link still knows it meant the cast. */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/cast/$")({
  component: CastScreen,
  remountDeps: ({ params }) => params.campaignId,
});
