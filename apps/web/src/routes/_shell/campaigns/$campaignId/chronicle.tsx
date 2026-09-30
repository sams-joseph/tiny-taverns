import { createFileRoute } from "@tanstack/react-router";
import { sessionSearch } from "../../../-params";
import { ChronicleRouteScreen } from "../../../../chronicle/ChronicleRoute";

/**
 * The Chronicle names a campaign for the same reason the bestiary does: every
 * source it reads — `chronicle.read`, `chronicle.readAsPlayer` — hangs off
 * `/campaigns/:campaignId`.
 *
 * Remounted per campaign: which nights are open belongs to the record being
 * read.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/chronicle")({
  /**
   * Which night to open and scroll to, so the Encounters preview's *View log*
   * lands on the night an encounter was played. A bad or missing id is no
   * choice, and the page opens on the newest night — see `useOpenNights`.
   */
  validateSearch: sessionSearch,
  component: ChronicleRouteScreen,
  remountDeps: ({ params }) => params.campaignId,
});
