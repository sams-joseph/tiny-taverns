import { Button, Icon } from "@taverns/ui";
import { useEffect, useRef } from "react";
import { ArtifactCard } from "./ArtifactCard";
import {
  Composer,
  ContextBar,
  EmptyThread,
  HobAvatar,
  HobReply,
  NothingListens,
  Thinking,
  UserTurn,
} from "./ChatParts";
import type { HobArtifact, HobTurn } from "./transcript";

/**
 * The Hob chat panel — Option A of the designers' three, and the one that ships.
 *
 * `ui_kits/dm-screen/ChatPanel.jsx` is the specification; `chat-prep.html` is
 * the record of B and C and why they lost. This component is only the surface:
 * it renders the turns it is handed and reports what the DM did with them. It
 * holds no conversation of its own, keeps no draft between mounts, and has no
 * opinion about where an answer comes from — see `conversation.ts` for the one
 * seam a real assistant attaches to.
 *
 * **Everything is optional except the turns**, and the panel disables or
 * replaces what it is not given. That is what lets it be honest today: with
 * nothing behind it, `onSend` is absent and the composer is replaced by a line
 * saying so, rather than an input that accepts a question and drops it.
 */

export interface HobPanelProps {
  /** Newest last. Empty is the state every DM meets first. */
  readonly turns: ReadonlyArray<HobTurn>;
  /** An answer on its way. Nothing can set this yet. */
  readonly thinking?: boolean;
  /** Which artifacts are already in the session. Ids, so a re-read cannot lose it. */
  readonly savedArtifactIds?: ReadonlyArray<string>;
  /** Absent means nothing is listening, and the panel says so instead of asking. */
  readonly onSend?: (text: string) => void;
  readonly onSave?: (artifact: HobArtifact) => void;
  readonly onDiscard?: (artifact: HobArtifact) => void;
  readonly onRetry?: (artifact: HobArtifact) => void;
  readonly onRename?: (artifact: HobArtifact, title: string) => void;
  readonly onRefine?: (artifact: HobArtifact, chip: string) => void;
  readonly onOpenArtifact?: (artifact: HobArtifact) => void;
  /** Start over. Absent while there is no thread to start over from. */
  readonly onNewThread?: () => void;
  readonly onClose?: () => void;
}

export function HobPanel({
  turns,
  thinking = false,
  savedArtifactIds = [],
  onSend,
  onSave,
  onDiscard,
  onRetry,
  onRename,
  onRefine,
  onOpenArtifact,
  onNewThread,
  onClose,
}: HobPanelProps) {
  const thread = useRef<HTMLDivElement>(null);

  // The newest turn is the one being read. Jump rather than smooth-scroll: the
  // motion rules are about controls settling, not about chasing a growing list,
  // and `prefers-reduced-motion` would have to be honoured by hand here.
  //
  // Not while the thread is empty: the starter grid reads top-down, and in a
  // panel shorter than the grid this would open on the *last* starter with the
  // question scrolled off — which is the first thing a DM sees, scrolled past.
  useEffect(() => {
    const element = thread.current;
    if (element !== null && turns.length > 0) element.scrollTop = element.scrollHeight;
  }, [turns, thinking]);

  return (
    <section
      aria-label="Hob"
      className="flex h-full min-h-0 flex-col bg-surface-card text-foreground"
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-hairline p-3.5">
        <HobAvatar size={26} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-s leading-tight font-medium text-heading">Hob</span>
          <span className="truncate text-micro leading-snug text-faint">
            Keeps the ledger behind the bar
          </span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-label="New thread"
          disabled={onNewThread === undefined}
          onClick={onNewThread}
        >
          <Icon name="plus" size={14} />
        </Button>
        {onClose !== undefined && (
          <Button size="sm" variant="ghost" aria-label="Close" onClick={onClose}>
            <Icon name="panel-right-close" size={14} />
          </Button>
        )}
      </header>

      <ContextBar />

      <div ref={thread} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-3.5">
        {turns.length === 0 && !thinking ? (
          <EmptyThread onPick={onSend} />
        ) : (
          turns.map((turn) => {
            switch (turn.who) {
              case "user":
                return <UserTurn key={turn.id}>{turn.text}</UserTurn>;
              case "hob":
                return (
                  <HobReply key={turn.id} aside={turn.aside}>
                    {turn.text}
                  </HobReply>
                );
              default:
                return (
                  <ArtifactCard
                    key={turn.id}
                    artifact={turn.artifact}
                    saved={savedArtifactIds.includes(turn.artifact.id)}
                    onSave={onSave}
                    onDiscard={onDiscard}
                    onRetry={onRetry}
                    onRename={onRename}
                    onRefine={onRefine}
                    onOpen={onOpenArtifact}
                  />
                );
            }
          })
        )}
        {thinking && <Thinking />}
      </div>

      {onSend === undefined ? <NothingListens /> : <Composer onSend={onSend} />}
    </section>
  );
}
