import { createFileRoute } from "@tanstack/react-router";
import { creatorOnly } from "../../../../../../campaign/CreatorOnly";
import { EncounterScreen } from "../../../../../../campaign/EncounterScreen";

/**
 * One encounter: its details and its battle map, which the Encounters
 * preview's heading opens. The creator's alone, like the list — a player's
 * reads of this URL are refused by the server, which is the gate
 * (`BattleMapsGroup`), and `creatorOnly` tells the player so before any is
 * made. A different encounter is a different board, so the leaf remounts on
 * the id.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/encounters/$encounterId/")({
  component: creatorOnly("Encounters", EncounterScreen),
  remountDeps: ({ params }) => params.encounterId,
});
