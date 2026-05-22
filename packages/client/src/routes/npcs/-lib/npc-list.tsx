import { useAtomValue } from "@effect/atom-react";
import { npcListAtom } from "./npcs-atoms";
import { AsyncResult } from "effect/unstable/reactivity";
import { Loader2Icon } from "lucide-react";

export const NpcList = () => {
  const npcListResult = useAtomValue(npcListAtom);
  return (
    <div className="overflow-y-auto flex-1 px-2">
      {AsyncResult.isInitial(npcListResult) || npcListResult.waiting ? (
        <div className="flex justify-center py-4">
          <Loader2Icon className="size-5 animate-spin text-muted" />
        </div>
      ) : AsyncResult.isFailure(npcListResult) ? (
        <div className="px-3 py-2 text-sm text-danger">Failed to load NPCs</div>
      ) : (
        npcListResult.value.items.map((npc) => (
          <div key={npc.id}>{npc.title}</div>
        ))
      )}
    </div>
  );
};
