import { NpcId } from "@app/domain/api/npc-rpc";
import { useAtomValue } from "@effect/atom-react";
import { createFileRoute } from "@tanstack/react-router";
import { npcDataFamily } from "../-lib/npcs-atoms";
import { AsyncResult } from "effect/unstable/reactivity";
import { Loader2Icon } from "lucide-react";

export const Route = createFileRoute("/npcs/$npcId/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { npcId } = Route.useParams();
  const npc = useAtomValue(npcDataFamily(NpcId.make(npcId)));

  if (AsyncResult.isInitial(npc) || npc.waiting) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted" />
      </div>
    );
  }

  if (AsyncResult.isFailure(npc)) {
    return <div className="p-6 text-danger">Failed to load Campaign</div>;
  }

  return (
    <main className="min-h-full">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        {npc.value.title}
      </div>
    </main>
  );
}
