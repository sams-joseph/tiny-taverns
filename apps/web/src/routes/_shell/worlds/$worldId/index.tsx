import { createFileRoute } from "@tanstack/react-router";
import { SharedWorldRouteScreen } from "../../../../shared-world/SharedWorldRouteScreen";

/** One Shared World: its Overview — campaigns, Story So Far, members — and Hob. */
export const Route = createFileRoute("/_shell/worlds/$worldId/")({
  component: SharedWorldRouteScreen,
  remountDeps: ({ params }) => params.worldId,
});
