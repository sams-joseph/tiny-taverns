import {
  EmptyState,
  FailureNotice,
  Loading,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  type SheetContainer,
} from "@taverns/ui";
import { agoOf, useNow } from "../campaign/when";
import type { HobThreadList } from "./transcript";

/**
 * The reader's other conversations, over the panel they would open in.
 *
 * A sheet **contained by the panel** (`container`), so it covers the thread
 * and not the screen beside it, inline or overlaid alike. It is the Hob
 * sidebar's own arrangement one box in (`sidebar.tsx`, note 7): non-modal, so
 * an inline panel does not make the page beside it inert, and dismissed only
 * by its scrim, its close button and Escape — a press on the header control
 * that opened it is under the scrim, so there is no outside press to race.
 * Escape closes the list and not the panel: the dialog consumes the key, and
 * `useHobPanel` leaves a consumed key alone.
 *
 * The rows are the server's `threads`, newest first, each the question that
 * started it and when it last moved. Nothing here renames or deletes one;
 * the wire has neither.
 */
export function HobThreads({
  open,
  onOpenChange,
  container,
  list,
  current,
  onPick,
  onRetry,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly container: SheetContainer;
  readonly list: HobThreadList;
  /** The thread on screen, marked in the list. */
  readonly current: string | undefined;
  readonly onPick: (id: string) => void;
  readonly onRetry: () => void;
}) {
  const now = useNow();

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false} disablePointerDismissal>
      <SheetContent
        side="left"
        container={container}
        data-slot="hob-threads"
        overlayProps={{ onClick: () => onOpenChange(false) }}
      >
        <SheetHeader className="shrink-0 pr-12">
          <SheetTitle className="text-subtitle">Conversations</SheetTitle>
          <SheetDescription>Newest first. Pick one to carry on where it left off.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-gutter">
          {list.state === "loading" ? (
            <Loading inline label="Reading your conversations…" />
          ) : list.state === "failed" ? (
            <FailureNotice icon="history" title="The list did not load" onRetry={onRetry}>
              The server did not answer with your conversations.
            </FailureNotice>
          ) : list.threads.length === 0 ? (
            <EmptyState icon="history" title="No conversations yet">
              Ask Hob something, and the conversation is kept here.
            </EmptyState>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {list.threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    aria-current={thread.id === current ? "true" : undefined}
                    onClick={() => onPick(thread.id)}
                    className="flex w-full cursor-pointer flex-col gap-0.5 rounded-md border border-transparent bg-transparent px-3 py-2.5 text-left font-sans transition-control outline-none hover:bg-surface-raised focus-visible:ring-focus aria-current:border-accent aria-current:bg-surface-raised"
                  >
                    <span className="line-clamp-2 text-body-s leading-snug font-medium text-heading">
                      {thread.title}
                    </span>
                    <span className="text-micro leading-snug text-faint">
                      {agoOf(thread.updatedAt, now)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
