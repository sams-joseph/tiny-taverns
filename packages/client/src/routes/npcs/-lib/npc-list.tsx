import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { npcListAtom } from "./npcs-atoms";
import { AsyncResult } from "effect/unstable/reactivity";
import { Loader2Icon } from "lucide-react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import React from "react";

export const NpcList = () => {
  const npcListResult = useAtomValue(npcListAtom);
  const refreshNpcList = useAtomRefresh(npcListAtom);

  // TODO: There has to be a better way to do this.
  React.useEffect(() => {
    refreshNpcList();
  }, [refreshNpcList]);

  return (
    <div className="overflow-y-auto flex-1 px-2 flex flex-col gap-2">
      {AsyncResult.isInitial(npcListResult) || npcListResult.waiting ? (
        <div className="flex justify-center py-4">
          <Loader2Icon className="size-5 animate-spin text-muted" />
        </div>
      ) : AsyncResult.isFailure(npcListResult) ? (
        <div className="px-3 py-2 text-sm text-danger">Failed to load NPCs</div>
      ) : (
        npcListResult.value.items.map((npc) => (
          <Link to="/npcs/$npcId" params={{ npcId: npc.id }} key={npc.id}>
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>{npc.title}</ItemTitle>
                <ItemDescription>
                  A simple item with title and description.
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button variant="outline" size="sm">
                  Action
                </Button>
              </ItemActions>
            </Item>
          </Link>
        ))
      )}
    </div>
  );
};
