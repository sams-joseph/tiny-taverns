import { cn, Sidebar, SidebarProvider } from "@taverns/ui";
import { createContext, useContext, useRef, type CSSProperties, type ReactNode } from "react";
import { HobPanel, type HobPanelProps } from "./HobPanel";
import { HOB_INLINE_MIN } from "./useHobPanel";

/**
 * Where the panel sits, and what it does to the content when there is no room.
 *
 * **This is shadcn's `sidebar`, on the right, at the delivery's width.** The dock
 * was hand-built before; the component answers the same two questions and
 * answers them the same way, so what is left here is the wiring and the two
 * measurements the delivery names.
 *
 * - **Inline**, above 1020px: the sidebar's desktop form — a gap element beside
 *   the whole shell that reserves the panel's width, and the panel itself
 *   positioned over that gap. The shell — its bars and the content under them —
 *   loses exactly 400px, which is the point of Option A: you are editing, and
 *   Hob is a second pair of hands.
 * - **Overlay**, below it: the sidebar's `Sheet` form, over a scrim. Nothing
 *   squeezes; the content keeps the width it had and the DM dismisses the panel
 *   to get back to it.
 *
 * `useHobPanel` still owns open, ⌘K and Esc — the provider is controlled from it
 * and its own shortcut is turned off (`keyboardShortcut={null}`), because two
 * listeners toggling one state on one keystroke cancel out.
 *
 * ### The layering, which is the part that has bitten this project before
 *
 * The overlaid form's scrim takes `z-scrim` and its panel `z-dialog` — two
 * *different* rungs of the scale in `packages/ui/src/styles.css`, never one. A
 * select opened at 40 under a dialog at 50 did not merely render behind it: the
 * backdrop is `inset-0`, so it ate the click. Equal layers are that same bug with
 * the answer left to document order. Both rungs come from `sheet.tsx`; nothing
 * here names a layer, and `layering.test.ts` fails if it starts to.
 *
 * ### Beside the whole app, over the content
 *
 * The two forms answer to two different boxes, and that is the part a
 * restructure is most likely to lose.
 *
 * - **Inline, the panel is a column of the app.** `HobFrame` is the app's
 *   full-height row: the shell's column (every bar and `main`) and then a slot
 *   for the dock that is `sticky` at the viewport's height. The sidebar's
 *   container is `absolute inset-y-0`, so it measures against that slot and is
 *   exactly the viewport tall, top to bottom, pinned while the document scrolls;
 *   its gap is the slot's width, so opening it pushes the whole shell — bars
 *   included — over by 400px rather than tucking the panel under them.
 * - **Overlaid, the panel covers the content and not the app.** `HobRegion` is
 *   the positioned row under the bars, and it is the reason the overlay dims the
 *   prep UI while the shell's own top bar stays live above it, which is what
 *   `ui_kits/dm-screen/AppShell.jsx` draws. The region publishes itself through
 *   `HobRegionContext`, and `SidebarProvider`'s `container` hands it to the
 *   sheet, where one prop switches the portal *and* the geometry from the
 *   viewport to that element (see `sheet.tsx`). A dock that finds no region gets
 *   neither, and its overlay would cover the page.
 *
 * The dock is the region's *sibling* in the shell, not its child, so the frame
 * lifts the region's context above both: the frame owns the ref, the one region
 * inside it attaches it, and the dock beside it reads it. A second region in the
 * same frame would take the ref from the first.
 */

/**
 * The element the overlay is measured against and rendered into.
 *
 * A context rather than a prop because the region is the *shell's* element and
 * the dock is mounted beside it as an opaque node — the shell hands down a
 * `panel` node, not a ref. `null` means there is no region, which is a real
 * state (a bare `HobDock` in a test) and the one the sheet falls back to `<body>`
 * for.
 */
const HobRegionContext = createContext<React.RefObject<HTMLDivElement | null> | null>(null);

/**
 * The row the overlay covers: the content column, and — where there is no
 * `HobFrame`, as in the gallery — the dock after it.
 *
 * `relative` is load-bearing: it is what the overlay positions against. It
 * grows with its content *vertically*, because every screen is a document the
 * window scrolls; clipping it there would turn the content column into a
 * second page scroller. It carries no `min-h-full` either: `flex-1` already fills, and in the shell's
 * column — a stretched flex item, so a definite height — 100% is the whole
 * viewport *below* the chrome, which put the chrome's 168px of overflow under
 * the frame and let the document scroll past the pinned panel (measured).
 *
 * **Horizontally it must clip either way** when the dock is inside it: a
 * collapsed off-canvas sidebar is still mounted and still laid out — at
 * `right: calc(var(--sidebar-width) * -1)`, 400px past its box's right edge —
 * so an unclipped row hands the document 400px of scrollable width and a
 * horizontal scrollbar the reader never asked for. `overflow-x-clip` rather
 * than `overflow-x-hidden` is the whole point: `hidden` on one axis computes
 * the `visible` axis to `auto`, which makes this row a scroll container again
 * and puts back the vertical scrollbar a document screen just got rid of.
 * `clip` leaves the other axis genuinely `visible`. `HobFrame` clips the same
 * way for the same reason.
 */
export function HobRegion({ children }: { readonly children: ReactNode }) {
  const frame = useContext(HobRegionContext);
  const own = useRef<HTMLDivElement>(null);
  const region = frame ?? own;

  return (
    <HobRegionContext.Provider value={region}>
      <div ref={region} className="relative flex flex-1 overflow-x-clip">
        {children}
      </div>
    </HobRegionContext.Provider>
  );
}

/**
 * The app's full-height row: the shell's column, then the panel beside it.
 *
 * `children` is the whole shell — the sticky chrome and a `HobRegion` under it —
 * and `panel` is `Hob`, bare. The slot around the panel is the positioned box
 * the inline sidebar measures against (see this file's header): `sticky top-0`
 * at `h-screen`, `self-start` so the row's stretch does not make it as tall as
 * the document, and as wide as the sidebar's gap, which is 400px or nothing.
 * Below the threshold the sheet portals the panel into the region and the slot
 * is an empty 0px box.
 *
 * The row grows with the document and clips only sideways, where the
 * off-canvas column sits 400px past the right edge, as `HobRegion` does.
 * `overflow-x-clip` makes no scroll container, so the chrome's `sticky` and the
 * slot's still pin against the viewport.
 */
export function HobFrame({
  panel,
  className,
  children,
}: {
  readonly panel: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const region = useRef<HTMLDivElement>(null);

  return (
    <HobRegionContext.Provider value={region}>
      <div className={cn("flex min-h-screen overflow-x-clip", className)}>
        {children}
        {panel !== undefined && panel !== null && (
          <div className="sticky top-0 flex h-screen shrink-0 self-start">{panel}</div>
        )}
      </div>
    </HobRegionContext.Provider>
  );
}

export interface HobDockProps extends HobPanelProps {
  readonly open: boolean;
  /** Above `HOB_INLINE_MIN`. Passed rather than measured so a test can name it. */
  readonly inline?: boolean;
}

/**
 * The delivery's 400px, reaching the gap element and the positioned container
 * through the sidebar's own custom property. It is `--panel-chat-w` in
 * `packages/ui/src/local-tokens.css` — a measurement the delivery states in
 * prose and never tokenised, which is exactly what that file is for.
 *
 * `w-chat-panel` says it a second time on purpose: the overlaid form is
 * portalled *out* of the provider's subtree, so the custom property does not
 * inherit to it and the sheet would otherwise take the sidebar's own mobile
 * default. `max-w-full` is for a window narrower than the panel.
 */
const PANEL_WIDTH = { "--sidebar-width": "var(--spacing-chat-panel)" } as CSSProperties;

export function HobDock({ open, inline, ...panel }: HobDockProps) {
  const region = useContext(HobRegionContext);

  return (
    <SidebarProvider
      // `contents`, so the provider's own wrapper adds no box: the gap element
      // becomes a flex item of the region and the positioned container measures
      // against the region itself.
      className="contents"
      style={PANEL_WIDTH}
      open={open}
      onOpenChange={(next) => {
        if (!next) panel.onClose?.();
      }}
      isMobile={inline === undefined ? undefined : !inline}
      mobileBreakpoint={HOB_INLINE_MIN}
      // ⌘K and Esc belong to `useHobPanel`, which the shell already composes.
      keyboardShortcut={null}
      container={region}
    >
      <Sidebar side="right" collapsible="offcanvas" className="w-chat-panel max-w-full">
        <HobPanel {...panel} />
      </Sidebar>
    </SidebarProvider>
  );
}
