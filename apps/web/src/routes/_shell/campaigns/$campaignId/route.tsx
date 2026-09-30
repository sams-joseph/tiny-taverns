import { createFileRoute } from "@tanstack/react-router";
import { campaignIdParam } from "../../../-params";

/**
 * Everything inside one table.
 *
 * A parent with no component of its own — it renders `<Outlet />` — because the
 * chrome is the persistent layout's, and the campaign row inside it reads the
 * id off the route. What the parent is for is the id: one `params.parse`, so
 * every screen below inherits a decoded `CampaignId` and a bad one is refused
 * once rather than at each route.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId")({
  params: campaignIdParam,
});
