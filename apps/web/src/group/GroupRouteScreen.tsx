import { useParams } from "@tanstack/react-router";
import { SharedWorldScreen } from "./GroupScreen";

export function SharedWorldRouteScreen() {
  const { groupId } = useParams({ from: "/worlds/$groupId" });
  return <SharedWorldScreen groupId={groupId} />;
}
