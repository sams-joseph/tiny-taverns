import { createFileRoute } from "@tanstack/react-router";
import { placeSearch } from "../../../-params";
import { LocationsRouteScreen } from "../../../../locations/LocationsRoute";

/**
 * A table's places: the creator's arrangement and reveals, or what a player
 * has been shown — one URL, chosen per pair in `LocationsRoute.tsx`. Remounted
 * per campaign, as the Chronicle is.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/locations")({
  /**
   * Which place's map is open, so zooming in and out is history and a link.
   * A bad id, or one this reader cannot see, opens no map.
   */
  validateSearch: placeSearch,
  component: LocationsRouteScreen,
  remountDeps: ({ params }) => params.campaignId,
});
