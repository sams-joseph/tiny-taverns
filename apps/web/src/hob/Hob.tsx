import { HobDock } from "./HobDock";
import { useHobConversation } from "./conversation";
import type { HobPanelState } from "./useHobPanel";

/**
 * The panel, wired to whatever is behind it. This is what a shell mounts.
 *
 * Two things, and no more: it asks `conversation.ts` for a conversation and it
 * hands `HobDock` the open/inline decision the shell already owns. Everything
 * else — the parts, the states, the 1020px threshold, the layering — lives
 * below it, and the shell needs to know none of it.
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
  const conversation = useHobConversation();

  return (
    <HobDock
      open={hob.open}
      inline={hob.inline}
      onClose={hob.close}
      turns={conversation.turns}
      thinking={conversation.thinking}
      savedArtifactIds={conversation.savedArtifactIds}
      onSend={conversation.send}
      onSave={conversation.save}
      onDiscard={conversation.discard}
      onRetry={conversation.retry}
      onNewThread={conversation.reset}
    />
  );
}
