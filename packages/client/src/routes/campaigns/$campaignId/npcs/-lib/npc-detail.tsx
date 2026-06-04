import type { CampaignId } from "@app/domain/api/campaign-rpc";
import type { NpcId } from "@app/domain/api/npc-rpc";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { Loader2Icon } from "lucide-react";
import { npcDataFamily } from "./npcs-atoms";

export const NpcDetail = ({
  campaignId,
  npcId,
}: {
  readonly campaignId: CampaignId;
  readonly npcId: NpcId;
}) => {
  const npc = useAtomValue(npcDataFamily({ campaignId, npcId }));

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
};
