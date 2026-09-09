import type { CampaignId, NpcId } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Button, Icon } from "@taverns/ui";
import { useEffect, useRef } from "react";
import { Composer, NothingListens, UserTurn } from "../hob/ChatParts";
import { NpcAvatar } from "./NpcCard";
import type { Rehearsal } from "./rehearsal";

/**
 * The rehearsal chat — Hob's turn visuals, branded as the NPC.
 *
 * `UserTurn`, `Composer` and `NothingListens` are Hob's parts, reused because
 * a line the creator typed and a composer are the same thing in either
 * conversation. What is *not* reused is anything that says Hob: the reply row
 * wears the NPC's initials rather than the mark, the thinking line names the
 * NPC, the composer's label names the NPC, and there is no "Knows" strip, no
 * starter grid and no slash commands — a rehearsal is a scene, not a palette.
 * The report's rule, kept as a shape: nothing on this panel can say "Hob".
 */
export function RehearsalPanel({
  name,
  rehearsal,
  subtitle = "Rehearse · only the creator can read this",
  emptyTitle = `Rehearse with ${name}`,
  emptyBody = "Say something in the scene and hear how they answer. Nothing here reaches your players, and nothing they say changes the campaign.",
  label = `Say something to ${name}`,
  ariaLabel = `Rehearse with ${name}`,
  reviewTarget,
}: {
  readonly name: string;
  readonly rehearsal: Rehearsal;
  readonly subtitle?: string;
  readonly emptyTitle?: string;
  readonly emptyBody?: string;
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly reviewTarget?: { readonly campaignId: CampaignId; readonly npcId: NpcId };
}) {
  const thread = useRef<HTMLDivElement>(null);

  // Jump to the newest line while there is one; the empty state reads top-down.
  useEffect(() => {
    const element = thread.current;
    if (element !== null && rehearsal.turns.length > 0) {
      element.scrollTop = element.scrollHeight;
    }
  }, [rehearsal.turns, rehearsal.thinking]);

  return (
    <section
      aria-label={ariaLabel}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-card border border-hairline bg-surface-card"
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-hairline p-3.5">
        <NpcAvatar name={name} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-s leading-tight font-medium text-heading">{name}</span>
          <span className="truncate text-micro leading-snug text-faint">{subtitle}</span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-label="New thread"
          disabled={rehearsal.reset === undefined}
          onClick={rehearsal.reset}
        >
          <Icon name="plus" size={14} />
        </Button>
      </header>

      <div ref={thread} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-3.5">
        {rehearsal.turns.length === 0 && !rehearsal.thinking ? (
          <div className="flex shrink-0 flex-col items-center px-2 pt-6 pb-1 text-center">
            <NpcAvatar name={name} size="lg" />
            <h3 className="mt-3 font-display text-display-s leading-tight font-semibold tracking-display text-heading">
              {emptyTitle}
            </h3>
            <p className="mt-1.5 max-w-measure text-body-s leading-body text-muted-foreground">
              {emptyBody}
            </p>
          </div>
        ) : (
          rehearsal.turns.map((turn) =>
            turn.who === "user" ? (
              <AttributedUserTurn key={turn.id} speakerName={turn.speakerName}>
                {turn.text}
              </AttributedUserTurn>
            ) : (
              <NpcReply key={turn.id} name={name}>
                {turn.text}
              </NpcReply>
            ),
          )
        )}
        {rehearsal.thinking && (
          <div role="status" className="flex shrink-0 items-center gap-2.5">
            <NpcAvatar name={name} />
            <span className="font-serif text-caption leading-body italic text-faint">
              {name} is thinking…
            </span>
          </div>
        )}
        {rehearsal.proposals.length > 0 && reviewTarget !== undefined && (
          <ProposalNotice
            count={rehearsal.proposals.length}
            campaignId={reviewTarget.campaignId}
            npcId={reviewTarget.npcId}
          />
        )}
      </div>

      <div className="shrink-0">
        {rehearsal.notice !== undefined && (
          <p
            role="alert"
            className="border-t border-hairline px-3.5 py-2 text-caption text-accent-ink"
          >
            {rehearsal.notice}
          </p>
        )}
        {rehearsal.send === undefined ? (
          <NothingListens reason={rehearsal.unavailable} />
        ) : (
          <Composer
            onSend={rehearsal.send}
            label={label}
            placeholder={label}
            showCommands={false}
          />
        )}
      </div>
    </section>
  );
}

function ProposalNotice({
  count,
  campaignId,
  npcId,
}: {
  readonly count: number;
  readonly campaignId: CampaignId;
  readonly npcId: NpcId;
}) {
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-2 rounded-card border border-accent/40 bg-accent-soft px-3 py-2 text-caption text-accent-ink"
    >
      <Badge variant="outline">
        <Icon name="sparkles" size={11} />
        {count} {count === 1 ? "proposal" : "proposals"}
      </Badge>
      <span className="min-w-0 flex-1">
        {count === 1 ? "A proposal is" : "Proposals are"} waiting for creator review.
      </span>
      <Button
        size="sm"
        variant="ghost"
        nativeButton={false}
        render={
          <Link
            to="/campaigns/$campaignId/cast/$npcId"
            params={{ campaignId, npcId }}
            hash="proposals"
          />
        }
      >
        Review in Cast
      </Button>
    </div>
  );
}

/** What a table participant said, with attribution when this is a shared session transcript. */
function AttributedUserTurn({
  speakerName,
  children,
}: {
  readonly speakerName?: string | null;
  readonly children: string;
}) {
  if (speakerName == null || speakerName === "") return <UserTurn>{children}</UserTurn>;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1 pl-10">
      <span className="text-micro leading-snug text-faint">{speakerName}</span>
      <UserTurn>{children}</UserTurn>
    </div>
  );
}

/** What the NPC said — the reply row, wearing the NPC's initials. */
function NpcReply({ name, children }: { readonly name: string; readonly children: string }) {
  return (
    <div className="flex shrink-0 items-start gap-2.5">
      <NpcAvatar name={name} />
      <div className="min-w-0 flex-1 pt-0.5 text-body-s leading-body whitespace-pre-wrap text-foreground">
        {children}
      </div>
    </div>
  );
}
