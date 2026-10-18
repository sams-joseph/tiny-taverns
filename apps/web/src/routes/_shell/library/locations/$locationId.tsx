import { createFileRoute } from "@tanstack/react-router";
import { locationIdParam } from "../../../-params";
import { LocationMapScreen } from "../../../../locations/LocationMapScreen";

/**
 * One of the owner's places: its picture with the places inside it pinned on
 * it. A different place is a different map, so the leaf remounts on the id; a
 * bad id falls back to the shelf.
 */
export const Route = createFileRoute("/_shell/library/locations/$locationId")({
  params: locationIdParam,
  component: LocationMapScreen,
  remountDeps: ({ params }) => params.locationId,
});
