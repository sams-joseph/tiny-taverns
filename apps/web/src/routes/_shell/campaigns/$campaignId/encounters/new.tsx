import { createFileRoute } from "@tanstack/react-router";
import { creatorOnly } from "../../../../../campaign/CreatorOnly";
import { EncounterBuilderScreen } from "../../../../../campaign/EncounterBuilderScreen";

/**
 * Writing an encounter: a new one, and one already made. One page for both
 * (`EncounterBuilderScreen`), the creator's alone — its read is the creator's
 * prep, which the server refuses a player, and a player who types the URL
 * reads what the encounter's own page tells them. The static `new` outranks
 * `$encounterId` beside it, and a different encounter is a different draft, so
 * the edit (`$encounterId/edit.tsx`) remounts on its id.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/encounters/new")({
  component: creatorOnly("Encounters", EncounterBuilderScreen),
  remountDeps: ({ params }) => params.campaignId,
});
