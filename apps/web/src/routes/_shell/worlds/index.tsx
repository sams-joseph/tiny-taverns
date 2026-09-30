import { createFileRoute } from "@tanstack/react-router";
import { SharedWorldsScreen } from "../../../shared-world/SharedWorldsScreen";

/** Every explicit Shared World this account belongs to. */
export const Route = createFileRoute("/_shell/worlds/")({
  component: SharedWorldsScreen,
});
