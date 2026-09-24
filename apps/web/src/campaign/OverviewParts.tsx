import { Card, SectionHeading } from "@taverns/ui";
import type { ReactNode } from "react";

/**
 * The pieces every card on the Overview is built from.
 *
 * The redesign draws its summary cards one way: a title on a hairline-ruled
 * header, sometimes a quiet figure beside it, the way to the tab that holds the
 * whole list at the far end, and rows under it. **The rows open nothing.** The
 * captain's answer on the drawing is that the Overview is a summary and the
 * header's link (*Manage*, *All notes*, *Read the chronicle*) is the way in, so
 * a row is not a link and the card is not `linked`.
 */

/**
 * Who the Overview is drawn for. The creator's and a player's pages are one
 * layout over two loads (`CampaignScreen.tsx`, `play/PlayerCampaignScreen.tsx`);
 * a card that says something different to each takes this rather than a flag
 * per difference, so the player's version of a card is one named branch.
 */
export type Audience = "creator" | "player";

/** The id of the player Overview's shared-notes section, which their *All notes* opens. */
export const SHARED_NOTES = "shared-with-you";

/** The section link — accent-coloured, quiet, and a real `<a>`. */
export const sectionLink =
  "text-label leading-none font-medium text-accent-ink hover:text-link-hover";

export function OverviewCard({
  title,
  meta,
  action,
  children,
}: {
  readonly title: string;
  /** A figure beside the title — the party's level. */
  readonly meta?: ReactNode;
  /** The way to the tab this card summarises, at the header's far end. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-hairline px-card py-4">
        <SectionHeading size="title" className="whitespace-nowrap">
          {title}
        </SectionHeading>
        {meta}
        {action !== undefined && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </Card>
  );
}

/** What a card says when it has no rows, in the row's own inset. */
export function OverviewEmpty({ children }: { readonly children: ReactNode }) {
  return (
    <p className="mb-0 px-card py-4 text-body-s leading-body text-muted-foreground">{children}</p>
  );
}

/**
 * The Overview's page: centred at its own width rather than the window's, what
 * leads it (the live banner, the hero) on top, then two columns — all one
 * width, so the header's left edge is the columns'.
 *
 * The columns are the drawing's own wrap rather than a breakpoint: `flex: 2 1
 * 560px` beside `flex: 1 1 300px`, so the two stand side by side while 560 + 24
 * + 300 fits and the aside drops under the whole main column when it does not —
 * whatever narrows the page, a docked Hob panel included.
 */
export function OverviewPage({
  lead,
  main,
  aside,
}: {
  readonly lead: ReactNode;
  readonly main: ReactNode;
  readonly aside: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-overview flex-col gap-6">
      {lead}
      <div className="flex flex-wrap items-start gap-6">
        <div className="@container flex min-w-0 shrink grow-2 basis-overview-main flex-col gap-6">
          {main}
        </div>
        <aside className="flex min-w-0 shrink grow basis-overview-aside flex-col gap-6">
          {aside}
        </aside>
      </div>
    </div>
  );
}
