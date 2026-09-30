import { createFileRoute } from "@tanstack/react-router";
import { MagicItemLibraryScreen } from "../../../magic-items/MagicItemLibraryScreen";

/** The magic item shelf under the global Library destination. */
export const Route = createFileRoute("/_shell/library/magic-items")({
  component: MagicItemLibraryScreen,
});
