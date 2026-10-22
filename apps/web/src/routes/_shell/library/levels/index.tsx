import { createFileRoute } from "@tanstack/react-router";
import { LevelLibraryScreen } from "../../../../levels/LevelLibraryScreen";

/** The account's own levels: battle maps built of floors, walls, props and lights. */
export const Route = createFileRoute("/_shell/library/levels/")({
  component: LevelLibraryScreen,
});
