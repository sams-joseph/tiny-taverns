import { createFileRoute } from "@tanstack/react-router";
import { creatorOnly } from "../../../../../campaign/CreatorOnly";
import { VisitsScreen } from "../../../../../visits/VisitsScreen";

/** A half-typed visit link still knows it meant the table's levels. */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/levels/$")({
  component: creatorOnly("Levels", VisitsScreen),
  remountDeps: ({ params }) => params.campaignId,
});
