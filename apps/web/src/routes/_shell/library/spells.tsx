import { createFileRoute } from "@tanstack/react-router";
import { SpellLibraryScreen } from "../../../spells/SpellLibraryScreen";

/** The spell shelf under the global Library destination. */
export const Route = createFileRoute("/_shell/library/spells")({
  component: SpellLibraryScreen,
});
