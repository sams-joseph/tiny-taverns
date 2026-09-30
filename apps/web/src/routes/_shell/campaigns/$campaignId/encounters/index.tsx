import { createFileRoute } from "@tanstack/react-router";
import { encounterSearch } from "../../../../-params";
import { creatorOnly } from "../../../../../campaign/CreatorOnly";
import { EncountersScreen } from "../../../../../campaign/EncountersScreen";

/**
 * The encounters built for this table. Like Notes, it is
 * `remountDeps`-per-campaign for the reason every campaign-scoped screen is:
 * which row is being edited and what has been searched for belong to the table
 * being read, and none of it may survive into another.
 *
 * The encounter screens and Notes are the creator's. The server refuses every
 * read behind them to a player, and that is the gate; `creatorOnly` is what a
 * player who types one of these URLs reads instead of the refusal. A player
 * reads the shared notes on their own Overview.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/encounters/")({
  /**
   * Which encounter the preview shows, so a reload, a shared link and the
   * Overview's rows land on it. A bad or missing id is no choice, and the
   * screen shows the first encounter it lists — see `EncountersScreen`.
   */
  validateSearch: encounterSearch,
  component: creatorOnly("Encounters", EncountersScreen),
  remountDeps: ({ params }) => params.campaignId,
});
