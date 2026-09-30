import { createFileRoute } from "@tanstack/react-router";
import { CompendiumLibraryScreen } from "../../../compendium/CompendiumLibraryScreen";

/** The 2014 reference rules and authored rule-section articles. */
export const Route = createFileRoute("/_shell/library/compendium")({
  component: CompendiumLibraryScreen,
});
