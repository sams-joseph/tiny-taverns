import { createFileRoute } from "@tanstack/react-router";
import { creatorOnly } from "../../../../../campaign/CreatorOnly";
import { EncountersScreen } from "../../../../../campaign/EncountersScreen";

/** A half-typed encounter link still knows it meant the encounters. */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/encounters/$")({
  component: creatorOnly("Encounters", EncountersScreen),
  remountDeps: ({ params }) => params.campaignId,
});
