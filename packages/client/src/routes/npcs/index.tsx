import { createFileRoute } from "@tanstack/react-router";

import { NpcList } from "./-lib/npc-list";

export const Route = createFileRoute("/npcs/")({
  component: () => <NpcList />,
});
