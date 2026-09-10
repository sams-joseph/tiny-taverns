import type { CampaignId, SharedWorldId } from "@taverns/api";
import { HobDock } from "./HobDock";
import { useHobConversation, type HobScope } from "./conversation";
import { SHARED_WORLD_HOB_STARTERS } from "./hob.fixtures";
import type { HobPanelState } from "./useHobPanel";

/**
 * The panel, wired to whatever is behind it. This is what a shell mounts.
 *
 * Three things, and no more: it asks `conversation.ts` for a conversation, it
 * hands `HobDock` the open/inline decision the shell already owns, and it
 * passes on the campaign or Shared World in view. Everything else — the parts,
 * the states, the 1020px threshold, the layering — lives below it, and the
 * shell needs to know none of it.
 *
 * The two id props are mutually exclusive: a panel is bound to one campaign or
 * one Shared World, never both. Their absence is a real state on global screens,
 * where the panel says there is no context instead of offering a composer.
 *
 * ```tsx
 * const hob = useHobPanel();
 * // …in the top bar: <Button onClick={hob.toggle}>Ask Hob ⌘K</Button>
 * <HobRegion>
 *   <div className="relative flex min-w-0 flex-1 flex-col overflow-auto">…</div>
 *   <Hob hob={hob} campaignId={campaign.id} />
 * </HobRegion>
 * ```
 */
type HobProps = { readonly hob: HobPanelState } & (
  | { readonly campaignId: CampaignId; readonly worldId?: never }
  | { readonly worldId: SharedWorldId; readonly campaignId?: never }
  | { readonly campaignId?: never; readonly worldId?: never }
);

export function Hob({ hob, campaignId, worldId }: HobProps) {
  const scope: HobScope | undefined =
    campaignId !== undefined
      ? { type: "campaign", id: campaignId }
      : worldId !== undefined
        ? { type: "sharedWorld", id: worldId }
        : undefined;
  const conversation = useHobConversation(scope, hob.open);
  const sharedWorld = worldId !== undefined;

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
