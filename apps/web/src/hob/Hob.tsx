import { useCampaignId, useCampaignRelation, useSharedWorldId } from "../shell/location";
import { HobDock } from "./HobDock";
import { useHobConversation, type HobScope } from "./conversation";
import { SHARED_WORLD_HOB_STARTERS } from "./hob.fixtures";
import type { HobPanelState } from "./useHobPanel";

/**
 * What the panel is about, read off the route.
 *
 * The persistent layout mounts one panel for every screen, so the scope cannot
 * be a prop: it changes under the panel as the reader moves, and the panel stays
 * open while it does. A campaign or a Shared World, never both; neither is a real
 * state on global screens, where the panel says there is no context instead of
 * offering a composer.
 *
 * **A player's campaign is no scope.** The docked panel's verbs are creator
 * writes, which is why *Ask Hob* is absent for a player (`AskHobSlot`); a panel
 * carried open into a player's table goes quiet rather than asking on their
 * behalf. While the relation is settling it is no scope either, for the same
 * reason the campaign row draws no items then.
 */
function useHobScope(): HobScope | undefined {
  const campaignId = useCampaignId();
  const worldId = useSharedWorldId();
  const relation = useCampaignRelation(campaignId);
  if (campaignId !== undefined) {
    return relation === "creator" ? { type: "campaign", id: campaignId } : undefined;
  }
  return worldId === undefined ? undefined : { type: "sharedWorld", id: worldId };
}

/**
 * The panel, wired to whatever is behind it. This is what a shell mounts.
 *
 * Three things, and no more: it asks `conversation.ts` for a conversation, it
 * hands `HobDock` the open/inline decision the shell already owns, and it
 * passes on the campaign or Shared World in view. Everything else — the parts,
 * the states, the 1020px threshold, the layering — lives below it, and the
 * shell needs to know none of it.
 *
 * ```tsx
 * const hob = useHobPanel();
 * // …in the top bar: <Button onClick={hob.toggle}>Ask Hob ⌘K</Button>
 * <HobRegion>
 *   <div className="relative flex min-w-0 flex-1 flex-col overflow-auto">…</div>
 *   <Hob hob={hob} />
 * </HobRegion>
 * ```
 */
export function Hob({ hob }: { readonly hob: HobPanelState }) {
  return <ScopedHob hob={hob} scope={useHobScope()} />;
}

/**
 * The same panel with the scope named rather than read — for a test that has
 * no route to stand at, and for asserting what a change of scope does.
 */
export function ScopedHob({
  hob,
  scope,
}: {
  readonly hob: HobPanelState;
  readonly scope: HobScope | undefined;
}) {
  const conversation = useHobConversation(scope, hob.open);
  const sharedWorld = scope?.type === "sharedWorld";

  return (
    <HobDock
      open={hob.open}
      inline={hob.inline}
      onClose={hob.close}
      turns={conversation.turns}
      thinking={conversation.thinking}
      activity={conversation.activity}
      context={conversation.context}
      savedArtifactIds={conversation.savedArtifactIds}
      onSend={conversation.send}
      unavailable={conversation.unavailable}
      emptyTitle={sharedWorld ? "What should we remember together?" : undefined}
      emptyDescription={
        sharedWorld
          ? "I know the Chronicle and the played history shared across this world."
          : undefined
      }
      starters={sharedWorld ? SHARED_WORLD_HOB_STARTERS : undefined}
      onSave={conversation.save}
      onDiscard={conversation.discard}
      onRetry={conversation.retry}
      onNewThread={conversation.reset}
    />
  );
}
