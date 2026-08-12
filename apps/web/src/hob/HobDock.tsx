import { Sidebar, SidebarProvider } from "@taverns/ui";
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
 *   the content that reserves the panel's width, and the panel itself positioned
 *   over that gap. The content column loses exactly 400px, which is the point of
 *   Option A: you are editing, and Hob is a second pair of hands.
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
 * ### Over the content, not over the app
 *
 * `HobRegion` is the positioned, clipped row the panel belongs to, and it is the
 * whole reason the overlay dims the prep UI while the shell's own top bar stays
 * live above it — which is what `ui_kits/dm-screen/AppShell.jsx` draws. Two
 * things carry that: the region publishes itself through
 * `HobRegionContext`, and `SidebarProvider`'s `container` hands it to the sheet,
 * where one prop switches the portal *and* the geometry from the viewport to
 * that element (see `sheet.tsx`). A dock rendered outside a region gets neither,
 * and its overlay would cover the page.
 */

/**
 * The element the overlay is measured against and rendered into.
 *
 * A context rather than a prop because the region is the *shell's* element and
 * the dock is mounted into it as an opaque child — the shell hands down a
 * `panel` node, not a ref. `null` means there is no region, which is a real
 * state (a bare `HobDock` in a test) and the one the sheet falls back to `<body>`
 * for.
 */
const HobRegionContext = createContext<React.RefObject<HTMLDivElement | null> | null>(null);

/**
 * The row the dock lives in: the content column, then the panel.
 *
 * `relative` is load-bearing (it is what the overlay positions against) and so
 * is `min-h-0` — the panel is a column with a list that scrolls inside it, and
 * a flex child that has not been told it may be shorter than its content will
 * simply grow instead. `overflow-hidden` is what clips the panel to the row,
 * both when it is overlaid and while it is sliding off-canvas.
 */
export function HobRegion({ children }: { readonly children: ReactNode }) {
  const region = useRef<HTMLDivElement>(null);

  return (
    <HobRegionContext.Provider value={region}>
      <div ref={region} className="relative flex min-h-0 flex-1 overflow-hidden">
        {children}
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
