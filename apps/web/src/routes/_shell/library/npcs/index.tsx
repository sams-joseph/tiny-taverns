import { createFileRoute } from "@tanstack/react-router";
import { NpcLibraryScreen } from "../../../../cast/NpcLibraryScreen";

/** Reusable account-owned NPC sources, copied into campaigns as snapshots. */
export const Route = createFileRoute("/_shell/library/npcs/")({
  component: NpcLibraryScreen,
});
