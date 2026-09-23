import type { ReactNode } from "react";

/**
 * The per-screen header: what you are looking at, and what you can do to it.
 *
 * `--fs-display-s` at `--ls-display`, which is where the delivery puts it now
 * that the wordmark sits in its own row above — one step down from the rail-era
 * `--fs-display-m`, because this is no longer the only display-sized thing on
 * the screen.
 *
 * ### The height is fixed, and the subtitle's line is reserved whether or not
 * there is one
 *
 * Measured in Chromium at 1440 before this: 61px on a screen with no subtitle,
 * 89 with one, 141 on the Cast at 760 where the action cluster wrapped under the
 * title. So the content's top edge moved 152 → 180 → 220 walking across one
 * campaign's own tabs, and the page appeared to jump every time a DM changed
 * tab. It is one row of `h-19` now, whose title cell is `h-12` — the display
 * line, the 4px gap and the body line, which is what a title *and* a subtitle
 * measure — and the cell is that tall with a subtitle or without, so the title
 * lands at the same y on every screen in the product.
 *
 * `mb-0` on the subtitle is not decoration: the delivered `base.css` gives every
 * `p` a `0 0 var(--s-5)` margin, and that 12px below the subtitle was two thirds
 * of the difference between this bar and the sum of its parts.
 *
 * **From the `@4xl/app` container up, nothing wraps.** A fixed height and a
 * wrapping row are the same bug written twice; the title truncates instead —
 * the title is the one part of the bar that is arbitrary length, so it is the
 * one that gives way.
 *
 * **Below it, the actions take their own row and wrap.** A phone has no width
 * to give: at 390 the Cast's five controls in one unwrapping row were drawn on
 * top of one another (the shell audit's overlap check), and shrinking them
 * would shrink tap targets. So the narrow bar is the title's reserved `h-12`
 * and then as many rows of actions as the screen has, and its height follows
 * the screen there; the fixed-height guarantee is a desktop one.
 *
 * ### Screen actions live here, never in the body
 *
 * `actions` is the screen's verbs, and a screen's one peach primary is among
 * them. A screen-level button right-aligned in the body is the same control
 * drawn in the wrong place; a card's own verbs stay on the card.
 *
 * ### Tabs get their own row, below the header — the captain's rule
 *
 * > If we ever have tabs in the app like we do in the library I want those to
 * > be on their own row below the header. And any actions we have that belong
 * > to that tab should be inside of the content of that tab and not on the
 * > same hierarchical level as the tabs themselves.
 *
 * So `tabs` is a distinct full-width 40px row under the title row, inside the
 * same header so the strip's underline lands on the header's own bottom hairline
 * (`tabsTriggerVariants`' `-mb-px`). A tab-scoped action does not belong in
 * `actions` or on the tab row; it goes inside that tab's content.
 *
 * The gutters answer the app shell's `app` container, which is the column this
 * header is drawn in.
 */
function PageHeader({ title, subtitle, actions, tabs }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className="border-b border-hairline bg-surface-card">
      <div className="flex flex-wrap items-center gap-x-gutter gap-y-2.5 px-page-sm py-3.5 @3xl/app:px-page @4xl/app:h-19 @4xl/app:flex-nowrap @4xl/app:py-0">
        {/* `h-12` is the reserved pair of lines; see above. The title block is
            top-aligned inside it so the `h1` sits at the same y whether a
            subtitle follows it or not. */}
        <div className="h-12 min-w-32 flex-1 basis-full @4xl/app:basis-0">
          <h1 className="truncate font-display text-display-s leading-tight font-semibold tracking-display text-heading">
            {title}
          </h1>
          {subtitle !== undefined && (
            <p className="mt-1 mb-0 truncate text-body-s leading-body text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {/* The header is not a scrolling surface. `min-w-32` on the title is
            the floor that makes its arbitrary text give way first; wide, the
            controls are one ordinary flex row, and narrow they wrap on their
            own row. If a screen cannot fit its controls at a wide width, that
            screen must simplify its composition rather than handing the
            header a second scrollbar. */}
        {actions !== undefined && (
          <div
            data-slot="page-header-actions"
            className="flex min-w-0 flex-wrap items-center gap-2.5 not-has-[>:not(:empty)]:hidden @4xl/app:flex-nowrap"
          >
            {actions}
          </div>
        )}
      </div>
      {tabs !== undefined && (
        // `items-stretch` with no bottom padding: the strip's items reach the
        // header's hairline, exactly as the campaign row's do.
        <div className="flex h-10 items-stretch px-page-sm @3xl/app:px-page">{tabs}</div>
      )}
    </header>
  );
}

interface PageHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  /** The screen's verbs, and a `BackLink` when the screen has a parent. */
  readonly actions?: ReactNode;
  /** A tab strip, on its own row below the title — never beside it. */
  readonly tabs?: ReactNode;
}

export { PageHeader };
export type { PageHeaderProps };
