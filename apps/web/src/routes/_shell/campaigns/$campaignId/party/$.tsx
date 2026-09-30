import { createFileRoute } from "@tanstack/react-router";
import { PartyScreen } from "../../../../../party/PartyScreen";

/** A half-typed seat link still knows it meant the party. */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/party/$")({
  component: PartyScreen,
  remountDeps: ({ params }) => params.campaignId,
});
