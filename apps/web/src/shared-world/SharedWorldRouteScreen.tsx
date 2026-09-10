import { useParams } from "@tanstack/react-router";
import { SharedWorldScreen } from "./SharedWorldScreen";

export function SharedWorldRouteScreen() {
  const { worldId } = useParams({ from: "/worlds/$worldId" });
  return <SharedWorldScreen worldId={worldId} />;
}
