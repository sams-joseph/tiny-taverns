import { createFileRoute } from "@tanstack/react-router";
import { SharedWorldChronicleRouteScreen } from "../../../../shared-world/SharedWorldRouteScreen";

/** A Shared World's whole Chronicle, which its Overview summarises. */
export const Route = createFileRoute("/_shell/worlds/$worldId/chronicle")({
  component: SharedWorldChronicleRouteScreen,
  remountDeps: ({ params }) => params.worldId,
});
