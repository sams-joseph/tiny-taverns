import { createFileRoute } from "@tanstack/react-router";
import { worldIdParam } from "../../../-params";

/**
 * A Shared World's id, decoded once for every route under it, exactly as the
 * campaign's parent does it, so a bad id is a bad link that falls back to the
 * campaign home.
 */
export const Route = createFileRoute("/_shell/worlds/$worldId")({
  params: worldIdParam,
});
