import { createFileRoute } from "@tanstack/react-router";
import { encounterIdParam } from "../../../../../-params";

/**
 * An encounter's id, decoded once for its page and its edit. A bad id falls
 * back to the list (`encounters/$.tsx`) rather than to the campaign.
 */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/encounters/$encounterId")({
  params: encounterIdParam,
});
