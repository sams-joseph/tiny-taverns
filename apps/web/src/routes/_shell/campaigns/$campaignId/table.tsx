import { createFileRoute } from "@tanstack/react-router";
import { PlayerTableScreen } from "../../../../play/PlayerTableScreen";

/** The player-safe view of a live table, reached only when this account has a seat. */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/table")({
  component: PlayerTableScreen,
  remountDeps: ({ params }) => params.campaignId,
});
