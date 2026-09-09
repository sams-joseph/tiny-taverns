import { useParams } from "@tanstack/react-router";
import { GroupScreen } from "./GroupScreen";

export function LegacyGroupRouteScreen() {
  const { groupId } = useParams({ from: "/groups/$groupId" });
  return <GroupScreen groupId={groupId} />;
}

export function WorldRouteScreen() {
  const { groupId } = useParams({ from: "/worlds/$groupId" });
  return <GroupScreen groupId={groupId} />;
}
