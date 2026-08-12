import type { CampaignId } from "@taverns/api";
import { HobDock } from "./HobDock";
import { useHobConversation } from "./conversation";
import type { HobPanelState } from "./useHobPanel";

/**
 * The panel, wired to whatever is behind it. This is what a shell mounts.
 *
 * Three things, and no more: it asks `conversation.ts` for a conversation, it
 * hands `HobDock` the open/inline decision the shell already owns, and it
 * passes on the campaign in view. Everything else — the parts, the states, the
 * 1020px threshold, the layering — lives below it, and the shell needs to know
 * none of it.
 *
 * **`campaignId` is optional, and its absence is a real state**: Hob's tools
 * all hang off a campaign, so on the campaign list there is nothing for it to
 * read and the panel says so rather than offering a composer. Same rule as
 * *Bestiary* in the nav, and for the same reason.
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
export function Hob({
  hob,
  campaignId,
}: {
  readonly hob: HobPanelState;
  readonly campaignId?: CampaignId;
}) {
  const conversation = useHobConversation(campaignId, hob.open);

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
      onSave={conversation.save}
      onDiscard={conversation.discard}
      onRetry={conversation.retry}
      onNewThread={conversation.reset}
    />
  );
}
