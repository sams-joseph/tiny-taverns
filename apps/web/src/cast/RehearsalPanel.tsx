import type { CampaignId, NpcId, NpcImages } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Button, Icon, SectionHeading } from "@taverns/ui";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Composer, NothingListens, UserTurn } from "../hob/ChatParts";
import { NpcAvatar } from "./NpcAvatar";
import type { Rehearsal } from "./rehearsal";

/**
 * The rehearsal chat — Hob's turn visuals, branded as the NPC.
 *
 * `UserTurn`, `Composer` and `NothingListens` are Hob's parts, reused because
 * a line the creator typed and a composer are the same thing in either
 * conversation. What is *not* reused is anything that says Hob: the reply row
 * wears the NPC's own plate (its portrait, or its initials) rather than the mark, the thinking line names the
 * NPC, the composer's label names the NPC, and there is no "Knows" strip, no
 * starter grid and no slash commands — a rehearsal is a scene, not a palette.
 * The report's rule, kept as a shape: nothing on this panel can say "Hob".
 *
 * The transcript is not a scroll box: it takes its whole height in the page and
 * the window scrolls it, with the composer `sticky` at the viewport's bottom
 * while any of the panel is on screen. So "keep the newest line in view" is a
 * window scroll to the panel's end — on open when the panel is the page
 * (`jumpOnOpen`), when the reader sends, and when a line arrives while they
 * were already at the end. A reader who has scrolled elsewhere on the page is
 * left where they are.
 */
export function RehearsalPanel({
  name,
  image,
  rehearsal,
  subtitle = "Rehearse · only the creator can read this",
  emptyTitle = `Rehearse with ${name}`,
  emptyBody = "Say something in the scene and hear how they answer. Nothing here reaches your players, and nothing they say changes the campaign.",
  label = `Say something to ${name}`,
  ariaLabel = `Rehearse with ${name}`,
  reviewTarget,
  jumpOnOpen = false,
}: {
  readonly name: string;
  /** The NPC's portrait, from the read that returned it; `null` draws the initials. */
  readonly image: NpcImages | null;
  readonly rehearsal: Rehearsal;
  readonly subtitle?: string;
  readonly emptyTitle?: string;
  readonly emptyBody?: string;
  readonly label?: string;
  readonly ariaLabel?: string;
  readonly reviewTarget?: { readonly campaignId: CampaignId; readonly npcId: NpcId };
  /** Scroll the window to the newest line when the transcript first has one. */
  readonly jumpOnOpen?: boolean;
}) {
  const end = useRef<HTMLDivElement>(null);
  const atEnd = useRef(false);
  const opened = useRef(false);

  // Whether the panel's end is on screen, read before a new line moves it.
  useEffect(() => {
    const element = end.current;
    if (element === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      atEnd.current = entry?.isIntersecting ?? false;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A layout effect, so it runs before the observer hears that the new line
  // pushed the end off screen. The empty state reads top-down.
  useLayoutEffect(() => {
    const element = end.current;
    if (element === null || (rehearsal.turns.length === 0 && !rehearsal.thinking)) return;
    const first = !opened.current;
    opened.current = true;
    if ((first && jumpOnOpen) || rehearsal.thinking || atEnd.current) {
      if (typeof element.scrollIntoView === "function")
        element.scrollIntoView({ block: "nearest" });
    }
  }, [rehearsal.turns, rehearsal.thinking, jumpOnOpen]);

  return (
    <section
      aria-label={ariaLabel}
      className="flex flex-1 flex-col overflow-clip rounded-card border border-hairline bg-surface-card"
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-hairline p-3.5">
        <NpcAvatar name={name} image={image} />
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

      <div className="flex flex-1 flex-col gap-3.5 p-3.5">
        {rehearsal.turns.length === 0 && !rehearsal.thinking ? (
          <div className="flex shrink-0 flex-col items-center px-2 pt-6 pb-1 text-center">
            <NpcAvatar name={name} image={image} size="lg" />
            <SectionHeading as="h3" size="display" className="mt-3">
              {emptyTitle}
            </SectionHeading>
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
              <NpcReply key={turn.id} name={name} image={image}>
                {turn.text}
              </NpcReply>
            ),
          )
        )}
        {rehearsal.thinking && (
          <div role="status" className="flex shrink-0 items-center gap-2.5">
            <NpcAvatar name={name} image={image} />
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

      <div className="sticky bottom-0 bg-surface-card">
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
      <div ref={end} aria-hidden="true" />
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

/** What the NPC said — the reply row, wearing the NPC's plate. */
function NpcReply({
  name,
  image,
  children,
}: {
  readonly name: string;
  readonly image: NpcImages | null;
  readonly children: string;
}) {
  return (
    <div className="flex shrink-0 items-start gap-2.5">
      <NpcAvatar name={name} image={image} />
      <div className="min-w-0 flex-1 pt-0.5 text-body-s leading-body whitespace-pre-wrap text-foreground">
        {children}
      </div>
    </div>
  );
}
