import { createFileRoute } from "@tanstack/react-router";
import { ArchivedCastScreen } from "../../../../../cast/ArchivedCastScreen";

/** The NPCs archived off the Cast: a second URL, as every archived shelf is. */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/cast/archived")({
  component: ArchivedCastScreen,
  remountDeps: ({ params }) => params.campaignId,
});
