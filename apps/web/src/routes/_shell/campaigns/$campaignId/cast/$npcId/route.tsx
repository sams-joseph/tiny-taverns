import { createFileRoute } from "@tanstack/react-router";
import { npcIdParam } from "../../../../../-params";

/** An NPC's id, decoded once for its page and its talk. A bad id falls back to the cast list. */
export const Route = createFileRoute("/_shell/campaigns/$campaignId/cast/$npcId")({
  params: npcIdParam,
});
