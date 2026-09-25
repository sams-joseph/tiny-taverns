import { Card, SectionHeading, sectionHeadingVariants } from "@taverns/ui";
import type { ReactNode } from "react";
import { HobCover, type HobCoverImages } from "../hob/HobCover";
import { Description } from "../ui/description";

/**
 * The pieces every Overview is built from — the campaign's, a player's, and a
 * Shared World's (`shared-world/SharedWorldScreen.tsx`), which is the same page
 * over a different object.
 *
 * The redesign draws its summary cards one way: a title on a hairline-ruled
 * header, sometimes a quiet figure beside it, the way to the tab that holds the
 * whole list at the far end, and rows under it. **The Party and Recent notes
 * rows open nothing.** The captain's answer on the drawing is that the Overview
 * is a summary and the header's link (*Manage*, *All notes*, *Read the
 * chronicle*) is the way in, so a row there is not a link and the card is not
 * `linked`. *Next session*'s encounter rows are the exception the Encounters
 * redesign made: each opens its encounter on the Encounters tab
 * (`NextSession.tsx`).
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

/**
 * The top of an Overview, as the redesign (`Campaign Overview.dc.html`) draws
 * it: the cover, and the object's header laid over the bottom of it. The
 * campaign's (`CampaignHero.tsx`) and a Shared World's are this over their own
 * row; each decides only its meta line and its actions.
 *
 * **The name is the page's `h1`.** An Overview is the object itself, so it
 * draws no per-screen header (`TopBar`) and this is the only heading on it.
 *
 * **The header overlaps the cover only when there is a picture to overlap.**
 * With one, it is pulled up over the picture's faded bottom and inset from its
 * edges; with none — never drawn, Hob still drawing, the draw failed, the URL
 * would not load — it sits flat under whatever is above it. What decides is
 * `HobCover`'s `data-picture`, read through `group-has-*`, because a URL that
 * fails is only discovered inside the cover and a second copy of that state
 * here would be the one that forgot. The "Hob is drawing" band keeps its badge
 * clear for the same reason: pending is not a picture.
 *
 * **The actions never sit on the picture.** Only the name and its meta line
 * rise over it; with a picture that block is at least the overlap tall, so the
 * row under it, where the actions are, starts at or below the cover's bottom.
 *
 * **The description's slot is never shorter than the actions.** The pitch and
 * the actions share one wrapping row, so while they sit side by side the row
 * is as tall as the taller of them: an absent pitch still reserves the
 * buttons' own height, measured by the layout rather than restated, and a long
 * one grows as it always did. Beside a taller pitch the buttons sit at the
 * bottom of that row, level with the slot's bottom, not centred in it. When
 * the row is too narrow for both, the actions
 * wrap under the pitch and are themselves the space under the name, so an
 * empty slot then takes none.
 */
export function OverviewHero({
  image,
  imagePending,
  meta,
  name,
  description,
  children,
}: {
  readonly image: HobCoverImages | null;
  readonly imagePending: boolean;
  /** The quiet facts above the name, joined by dots; a blank one is dropped. */
  readonly meta: ReadonlyArray<string | null>;
  readonly name: string;
  readonly description: string | null;
  /** The header's actions, at its far end. */
  readonly children: ReactNode;
}) {
  const parts = meta.filter((part): part is string => part !== null && part.trim() !== "");

  return (
    <div
      data-slot="overview-hero"
      className="group/hero @container flex flex-col gap-6 has-data-picture:gap-0"
    >
      <HobCover image={image} pending={imagePending} shape="hero" />
      <header className="relative flex flex-col gap-2.5 group-has-data-picture/hero:-mt-overview-overlap group-has-data-picture/hero:px-6">
        <div className="group-has-data-picture/hero:min-h-overview-overlap">
          <p className="mb-0 flex flex-wrap items-center gap-2 text-label leading-none font-medium text-muted-foreground">
            {parts.map((part, index) => (
              <span key={part} className="contents">
                {index > 0 && (
                  <span aria-hidden className="text-faint">
                    ·
                  </span>
                )}
                <span>{part}</span>
              </span>
            ))}
          </p>
          <h1 className={sectionHeadingVariants({ size: "hero", className: "mt-3" })}>{name}</h1>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-4">
          <div data-slot="overview-hero-description" className="min-w-0 grow basis-md">
            <Description text={description} className="mb-0 max-w-overview-pitch" />
          </div>
          <div
            data-slot="overview-hero-actions"
            className="flex max-w-full flex-none flex-wrap content-end items-end gap-2"
          >
            {children}
          </div>
        </div>
      </header>
    </div>
  );
}
