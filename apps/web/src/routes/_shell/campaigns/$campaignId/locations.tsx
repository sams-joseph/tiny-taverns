import { createFileRoute } from "@tanstack/react-router";
import { LocationsRouteScreen } from "../../../../locations/LocationsRoute";

/**
 * A table's places: the creator's arrangement and reveals, or what a player
 * has been shown — one URL, chosen per pair in `LocationsRoute.tsx`. Remounted
 * per campaign, as the Chronicle is.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/locations")({
  component: LocationsRouteScreen,
  remountDeps: ({ params }) => params.campaignId,
});
