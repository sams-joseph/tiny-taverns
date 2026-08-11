import type { ReactNode } from "react";
import { HobPanel, type HobPanelProps } from "./HobPanel";

/**
 * Where the panel sits, and what it does to the content when there is no room.
 *
 * Two modes, one component, because they are the same panel and the delivery
 * treats them as one decision (`AppShell.jsx`, `CHAT_INLINE_MIN`):
 *
 * - **Inline**, above 1020px: a plain flex item beside the content column. It
 *   takes width from the content rather than covering it, which is the whole
 *   point of Option A — you are editing, and Hob is a second pair of hands.
 * - **Overlay**, below it: the same panel pinned to the right edge over a
 *   scrim. Nothing squeezes; the content keeps the width it had and the DM
 *   dismisses the panel to get back to it.
 *
 * ### The layering, which is the part that has bitten this project before
 *
 * The scrim takes `z-scrim` and the panel takes `z-dialog` — two *different*
 * rungs of the scale in `packages/ui/src/styles.css`, never one. A select
 * opened at 40 under a dialog at 50 did not merely render behind it: the
 * backdrop is `inset-0`, so it ate the click. Equal layers are that same bug
 * with the answer left to document order.
 *
 * The panel is an overlay over the *content*, not over the app: both halves are
 * `absolute`, so they fill whichever positioned ancestor `HobRegion` provides
 * and the shell's own navigation stays reachable above them. `z-chrome` is
 * below `z-scrim`, so a *sticky* header inside the region is covered, which is
 * correct — it belongs to the content the scrim is dimming.
 *
 * ### Mounting it
 *
 * The shell wraps its content column in `HobRegion` and renders `HobDock` as
 * that region's last child. `HobRegion` is what makes `absolute` mean "over the
 * content", so a dock without one would position against the page instead.
 */

/**
 * The row the dock lives in: the content column, then the panel.
 *
 * `relative` is load-bearing (it is what the overlay positions against) and so
 * is `min-h-0` — the panel is a column with a list that scrolls inside it, and
 * a flex child that has not been told it may be shorter than its content will
 * simply grow instead.
 */
export function HobRegion({ children }: { readonly children: ReactNode }) {
  return <div className="relative flex min-h-0 flex-1 overflow-hidden">{children}</div>;
}

export interface HobDockProps extends HobPanelProps {
  readonly open: boolean;
  /** Above `HOB_INLINE_MIN`. Passed rather than measured so a test can name it. */
  readonly inline: boolean;
}

/**
 * `w-100` is 400px on Tailwind's spacing scale — the delivery's panel width,
 * and the one measurement this surface introduces. It is not a design token
 * because the delivered system does not tokenise it either; `--aside-w` is the
 * 340px inspector, which is a different thing.
 */
const PANEL = "flex w-100 max-w-full shrink-0 flex-col border-l border-hairline";

export function HobDock({ open, inline, ...panel }: HobDockProps) {
  if (!open) return null;

  if (inline) {
    return (
      <aside className={PANEL}>
        <HobPanel {...panel} />
      </aside>
    );
  }

  return (
    <>
      <div
        // Clicking the dimmed content is the ordinary way out of an overlay, and
        // it is why the scrim has to be a real element rather than a shadow.
        onClick={panel.onClose}
        aria-hidden="true"
        className="absolute inset-0 z-scrim bg-scrim supports-backdrop-filter:backdrop-blur-scrim"
      />
      <aside className={`absolute inset-y-0 right-0 z-dialog shadow-3 ${PANEL}`}>
        <HobPanel {...panel} />
      </aside>
    </>
  );
}
