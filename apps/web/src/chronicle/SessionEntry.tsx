import type { Session } from "@taverns/api";
import { Card, cn, Icon, SectionHeading } from "@taverns/ui";
import type { ReactNode } from "react";
import { dayOf, spanOf } from "./format";
import { nightAnchor } from "./nights";

/**
 * One night on the Chronicle: a card whose whole header opens it.
 *
 * `Campaign Overview.dc.html`'s night card in shipped components: a mono
 * number tile, the title, the date, a chevron, and the body indented to the
 * title's edge. It is an accordion rather than a linked card — the night is
 * read here, not somewhere else — so the header is one `button` carrying
 * `aria-expanded`, and nothing in the body toggles it.
 *
 * **The title is only ever what the DM typed.** An untitled night is "Session
 * N"; it never borrows an encounter's name, because a Shared World is told a
 * night's title whatever its own switch says (`shared-worlds.md`) and an
 * encounter's name may be one nobody at that table was shown.
 *
 * **The closed card clamps the night's summary to two lines**, as drawn, and
 * carries the night's length in its place when the DM has written none — what
 * the `session` row itself knows, rather than a stubbed line pretending to be
 * prose. The summary is on the row (`Session.summary`), so a closed card needs
 * nothing the Chronicle's one read did not already answer. The body is a child,
 * which is what lets the DM's and the player's Chronicles share this card while
 * reading different endpoints.
 *
 * **"Spotlight on X"** follows the date when the night names a seat the reader
 * can put a name to (`spotlightName`); otherwise the line is the date alone.
 */
export function SessionEntry({
  session,
  spotlight,
  open,
  onToggle,
  children,
}: {
  readonly session: Session;
  /** Whose night it was, by name, when there is one to give. */
  readonly spotlight: string | undefined;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The night, read back (`NightBody`). Mounted only while `open`. */
  readonly children: ReactNode;
}) {
  const title = session.title ?? `Session ${String(session.number)}`;
  const span = spanOf(session.startedAt, session.endedAt);

  return (
    <article
      id={nightAnchor(session)}
      // A jump lands the card under the sticky chrome rather than behind it.
      className="@container scroll-mt-(--chrome-height)"
    >
      <Card>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full cursor-pointer items-start gap-3.5 rounded-card p-card text-left outline-none focus-visible:ring-focus"
        >
          <NumberTile number={session.number} muted={false} />
          <div className="min-w-0 flex-1">
            <SectionHeading as="h3" size="title">
              {title}
            </SectionHeading>
            <p className="mt-0.5 text-label leading-snug text-muted-foreground">
              {session.startedAt === null ? "Not played yet" : dayOf(session.startedAt)}
              {spotlight !== undefined && (
                <>
                  <span aria-hidden="true" className="px-2 text-faint">
                    ·
                  </span>
                  Spotlight on {spotlight}
                </>
              )}
            </p>
            {!open && (
              <p
                data-slot="night-preview"
                className="mt-2 line-clamp-2 max-w-measure text-body-s leading-body text-foreground"
              >
                {session.summary ?? span}
              </p>
            )}
          </div>
          <Icon
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            className="mt-2.5 shrink-0 text-faint"
          />
        </button>

        {open && (
          // The body starts at the title's edge while there is room for the
          // tile's column, and at the card's own edge on a phone, where that
          // indent would leave the text a third of the screen.
          <div className="flex gap-3.5 px-card pb-card">
            <div aria-hidden="true" className="hidden w-9 shrink-0 @lg:block" />
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <p className="text-caption leading-body text-faint">{span}</p>
              {children}
            </div>
          </div>
        )}
      </Card>
    </article>
  );
}

/**
 * The night's number, in the drawing's 36px mono tile. The composer's is
 * muted, as the drawing's draft tile is: a night not yet written up.
 */
export function NumberTile({
  number,
  muted,
}: {
  readonly number: number;
  readonly muted: boolean;
}) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-sunken font-mono text-mono-l leading-none font-medium",
        muted ? "text-muted-foreground" : "text-heading",
      )}
    >
      {number}
    </span>
  );
}
