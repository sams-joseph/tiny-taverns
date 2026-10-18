import { createFileRoute } from "@tanstack/react-router";
import { locationSearch } from "../../../-params";
import { LocationLibraryScreen } from "../../../../locations/LocationLibraryScreen";

/** The account's own places, which campaigns and Shared Worlds have by placement. */
export const Route = createFileRoute("/_shell/library/locations/")({
  /**
   * Which place to mark, so a kept Hob card's *Open it* lands on it. A bad or
   * missing id marks nothing.
   */
  validateSearch: locationSearch,
  component: LocationLibraryScreen,
});
