import { createFileRoute } from "@tanstack/react-router";
import { creatorOnly } from "../../../../../campaign/CreatorOnly";
import { VisitsScreen } from "../../../../../visits/VisitsScreen";

/**
 * The levels the party has been to at this table, and the way to another.
 * The creator's: the server refuses every read behind it to a player, and
 * `creatorOnly` is what a player who types the URL reads instead.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/levels/")({
  component: creatorOnly("Levels", VisitsScreen),
  remountDeps: ({ params }) => params.campaignId,
});
