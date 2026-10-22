import { createFileRoute } from "@tanstack/react-router";
import { LevelLibraryScreen } from "../../../../levels/LevelLibraryScreen";

/** A half-typed level link still knows it meant the Levels shelf. */
export const Route = createFileRoute("/_shell/library/levels/$")({
  component: LevelLibraryScreen,
});
