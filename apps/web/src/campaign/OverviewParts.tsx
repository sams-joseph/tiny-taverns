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
