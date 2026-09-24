import { useParams } from "@tanstack/react-router";
import { SharedWorldChronicleScreen } from "./SharedWorldChronicleScreen";
import { SharedWorldScreen } from "./SharedWorldScreen";

export function SharedWorldRouteScreen() {
  const { worldId } = useParams({ from: "/_shell/worlds/$worldId" });
  return <SharedWorldScreen worldId={worldId} />;
}

export function SharedWorldChronicleRouteScreen() {
  const { worldId } = useParams({ from: "/_shell/worlds/$worldId/chronicle" });
  return <SharedWorldChronicleScreen worldId={worldId} />;
}
