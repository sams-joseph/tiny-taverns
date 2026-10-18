import { createFileRoute } from "@tanstack/react-router";
import { LocationLibraryScreen } from "../../../../locations/LocationLibraryScreen";

/** A half-typed place link still knows it meant the Locations shelf. */
export const Route = createFileRoute("/_shell/library/locations/$")({
  component: LocationLibraryScreen,
});
