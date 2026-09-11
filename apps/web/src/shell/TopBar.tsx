import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TopBarSlot } from "./slots";

/**
 * The per-screen header: what you are looking at, and what you can do to it.
 *
 * Rendered anywhere in a screen's tree and drawn in the layout's slot, above
 * `main`. Outside a layout there is no slot and it draws nothing, which is the
 * absent state rather than a second place for the bar to be.
 *
 * `--fs-display-s` at `--ls-display`, which is where the delivery puts it now
 * that the wordmark sits in its own row above — one step down from the rail-era
 * `--fs-display-m`, because this is no longer the only display-sized thing on
 * the screen.
 *
 * ### Tabs get their own row, below the header — the captain's rule
 *
 * > If we ever have tabs in the app like we do in the library I want those to
 * > be on their own row below the header. And any actions we have that belong
 * > to that tab should be inside of the content of that tab and not on the
 * > same hierarchical level as the tabs themselves.
 *
 * So `tabs` is a distinct full-width row under the title row, inside the same
 * header so the strip's underline lands on the header's own bottom hairline
 * (the recipe's `-mb-px`, the campaign row's mechanism). `children` stays for
 * things that are genuinely header-level — a tab-scoped action does not belong
 * here or on the tab row; it goes inside that tab's content, which for the
 * Library screens is `FilterBar`'s `actions` slot.
 */
export function TopBar(props: TopBarProps) {
  const slot = useContext(TopBarSlot);
  return slot === null ? null : createPortal(<ScreenBar {...props} />, slot);
}

interface TopBarProps {
  readonly title: string;
  readonly subtitle?: string;
  /** A tab strip, on its own row below the title — never beside it. */
  readonly tabs?: ReactNode;
  readonly children?: ReactNode;
}

function ScreenBar({ title, subtitle, tabs, children }: TopBarProps) {
  return (
    <header className="border-b border-hairline bg-surface-card">
      {/* `flex-wrap` with a floor under the title: on a phone-width column the
          action cluster drops under the title rather than squeezing the subtitle
          into a one-word column beside three buttons. A `min-w-0` title would
          never wrap anything — it fits any line at zero width — so the floor is
          what makes the wrap reachable. Measured at 390 on the character sheet;
          at 760 and above no screen's bar wraps. */}
      <div className="flex flex-wrap items-center gap-gutter px-page-sm py-3.5 sm:px-page">
        <div className="min-w-48 flex-1">
          <h1 className="font-display text-display-s leading-tight font-semibold tracking-display text-heading">
            {title}
          </h1>
          {subtitle !== undefined && (
            <p className="mt-1 text-body-s leading-body text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2.5">{children}</div>
      </div>
      {tabs !== undefined && (
        // `items-stretch` with no bottom padding: the strip's items reach the
        // header's hairline, exactly as the campaign row's do.
        <div className="flex h-10 items-stretch overflow-x-auto px-page-sm sm:px-page">{tabs}</div>
      )}
    </header>
  );
}
