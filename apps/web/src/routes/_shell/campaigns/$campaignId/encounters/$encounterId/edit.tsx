import { createFileRoute } from "@tanstack/react-router";
import { creatorOnly } from "../../../../../../campaign/CreatorOnly";
import { EncounterBuilderScreen } from "../../../../../../campaign/EncounterBuilderScreen";

/** Writing an encounter already made — see `../new.tsx`. */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/encounters/$encounterId/edit")({
  component: creatorOnly("Encounters", EncounterBuilderScreen),
  remountDeps: ({ params }) => params.encounterId,
});
