import type { Session, SessionId } from "@taverns/api";
import { Button, Card, Icon, SectionHeading } from "@taverns/ui";
import type { ReactNode } from "react";

/**
 * What the DM's Chronicle and the player's have in common beyond the night
 * card: the page's two columns, *Jump to* and *Expand all* (and, in
 * `nights.ts`, which nights are open and the header's summary line). Each screen supplies its own
 * reads and its own body (`RecapBody`, `PlayerRecapBody`); none of the layout
 * is decided twice.
 */

/**
 * The drawing's two wrapping columns — the nights, and an aside beside them.
 *
 * The Overview's own wrap (`OverviewPage`): the main column's basis beside the
 * aside's, side by side while both fit and the aside under the whole main
 * column when they do not. The main column takes the larger share of what is
 * left over, as the drawing's `flex: 3` does, and the aside stops at the
 * inspector's width.
 *
 * **The aside is left out once the columns stack**, rather than drawn after
 * the last night: everything in it indexes or summarises the nights, and under
 * them it is a list of what the reader has just scrolled past. `@4xl` (896px)
 * is the page's own threshold — the shell's `main` is the container — and sits
 * just above the width where the two columns wrap, so the aside is only ever
 * drawn beside the nights. It is **not sticky**: the window is the scroller and
 * the chrome is already sticky at its top, so an aside pinned to the same edge
 * parks its first line under the campaign row.
 */
export function ChronicleColumns({
  main,
  aside,
}: {
  readonly main: ReactNode;
  readonly aside: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 shrink grow-3 basis-overview-main flex-col gap-3">{main}</div>
      <aside className="hidden max-w-aside min-w-0 shrink grow basis-overview-aside flex-col gap-5 @4xl:flex">
        {aside}
      </aside>
    </div>
  );
}

/**
 * *Jump to*: one row per night, which opens it and brings it under the chrome.
 *
 * **Unbounded.** The drawing caps the list at 360px and scrolls it inside
 * itself; a page here scrolls with the window and nothing else, and a long
 * record makes the aside as long as it needs to be.
 */
export function JumpTo({
  sessions,
  onJump,
}: {
  readonly sessions: ReadonlyArray<Session>;
  readonly onJump: (id: SessionId) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-hairline px-card py-3.5">
        <SectionHeading size="title">Jump to</SectionHeading>
      </div>
      <ul aria-label="Jump to" className="m-0 flex list-none flex-col p-0 py-1.5">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              onClick={() => onJump(session.id)}
              className="flex min-h-row w-full cursor-pointer items-center gap-2.5 px-card py-1.5 text-left outline-none transition-control hover:bg-surface-raised focus-visible:ring-focus"
            >
              <span className="w-6 shrink-0 font-mono text-mono leading-none font-medium text-faint">
                {session.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-label leading-snug font-medium text-foreground">
                {session.title ?? `Session ${String(session.number)}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The header's *Expand all*, which reads *Collapse all* once every night is
 * open — by any route, a card's own toggle included. Ghost, as drawn: the
 * campaign row's press is the page's one primary.
 */
export function ExpandAll({
  allOpen,
  onToggle,
}: {
  readonly allOpen: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onToggle}>
      <Icon name={allOpen ? "chevrons-down-up" : "chevrons-up-down"} size={14} />
      {allOpen ? "Collapse all" : "Expand all"}
    </Button>
  );
}
