import type { Session, SessionId } from "@taverns/api";
import { Button, Card, Icon, SectionHeading } from "@taverns/ui";
import { Fragment, type ReactNode } from "react";
import { rangeOf, type ActGroup } from "./acts";

/**
 * What the DM's Chronicle and the player's have in common beyond the night
 * card and its body: the page's two columns, the nights under their acts,
 * *Jump to* and *Expand all* (and, in `nights.ts`, which nights are open and
 * the header's summary line; in `acts.ts`, which act a night falls in). Each
 * screen supplies its own read of the record; none of the layout is decided
 * twice.
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
      <div className="flex min-w-0 shrink grow-3 basis-overview-main flex-col gap-6">{main}</div>
      <aside className="hidden max-w-aside min-w-0 shrink grow basis-overview-aside flex-col gap-5 @4xl:flex">
        {aside}
      </aside>
    </div>
  );
}

/**
 * The nights, each act's under its heading: the title as the DM typed it and
 * the span of nights it holds (`rangeOf`). Nights older than every act have no
 * heading, so a campaign with no acts reads as one list.
 *
 * The heading is an `h2` over the nights' `h3`s. What sits beside it is the
 * screen's: the DM's commands on the act, and nothing on a player's.
 */
export function ActSections({
  groups,
  actions,
  night,
}: {
  readonly groups: ReadonlyArray<ActGroup>;
  /** Drawn at the end of an act's heading. */
  readonly actions?: (
    group: ActGroup & { readonly act: NonNullable<ActGroup["act"]> },
  ) => ReactNode;
  readonly night: (session: Session) => ReactNode;
}) {
  return groups.map((group) => {
    const act = group.act;
    return (
      <section
        key={act?.id ?? "before-acts"}
        aria-label={act?.title}
        className="flex flex-col gap-3"
      >
        {act !== undefined && (
          <div className="flex min-h-control-sm items-center gap-2.5 px-1">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <SectionHeading as="h2" size="title" className="min-w-0 break-words">
                {act.title}
              </SectionHeading>
              <span className="text-label leading-snug text-muted-foreground">
                {rangeOf(group.sessions)}
              </span>
            </div>
            {actions?.({ ...group, act })}
          </div>
        )}
        {group.sessions.map((session) => (
          <Fragment key={session.id}>{night(session)}</Fragment>
        ))}
      </section>
    );
  });
}

/**
 * *Jump to*: one row per night, under its act's title, which opens it and
 * brings it under the chrome.
 *
 * **Unbounded.** The drawing caps the list at 360px and scrolls it inside
 * itself; a page here scrolls with the window and nothing else, and a long
 * record makes the aside as long as it needs to be.
 */
export function JumpTo({
  groups,
  onJump,
}: {
  readonly groups: ReadonlyArray<ActGroup>;
  readonly onJump: (id: SessionId) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-hairline px-card py-3.5">
        <SectionHeading size="title">Jump to</SectionHeading>
      </div>
      <ul aria-label="Jump to" className="m-0 flex list-none flex-col p-0 py-1.5">
        {groups.map((group) => (
          <Fragment key={group.act?.id ?? "before-acts"}>
            {group.act !== undefined && (
              <li
                data-slot="jump-act"
                className="truncate px-card pt-2.5 pb-1 text-caption leading-none font-medium text-muted-foreground"
              >
                {group.act.title}
              </li>
            )}
            {group.sessions.map((session) => (
              <li key={session.id}>
                <JumpRow session={session} onJump={onJump} />
              </li>
            ))}
          </Fragment>
        ))}
      </ul>
    </Card>
  );
}

function JumpRow({
  session,
  onJump,
}: {
  readonly session: Session;
  readonly onJump: (id: SessionId) => void;
}) {
  return (
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
