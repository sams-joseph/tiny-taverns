import { createFileRoute } from "@tanstack/react-router";
import { NpcLibraryScreen } from "../../../../cast/NpcLibraryScreen";

/** A half-typed source link still knows it meant the NPC shelf. */
export const Route = createFileRoute("/_shell/library/npcs/$")({
  component: NpcLibraryScreen,
});
