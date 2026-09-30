import { createFileRoute } from "@tanstack/react-router";
import { EquipmentLibraryScreen } from "../../../equipment/EquipmentLibraryScreen";

/** The mundane equipment shelf under the global Library destination. */
export const Route = createFileRoute("/_shell/library/equipment")({
  component: EquipmentLibraryScreen,
});
