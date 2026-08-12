import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";

import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Icon } from "./icon";

/**
 * A panel that slides in from an edge. A dialog underneath, and layered like one.
 *
 * Backdrop and popup take two *different* rungs of the scale in `styles.css` §3 —
 * `z-scrim` under `z-dialog` — for the reason `dialog.tsx` records: equal layers
 * leave document order to decide, and that is how a select once opened
 * underneath the dialog it belonged to and the backdrop ate the click.
 *
 * ### `container`: over a region, rather than over the page
 *
 * Upstream's sheet is `fixed`, portalled to `<body>`, and covers the window. That
 * is right for a page-level navigation drawer and wrong for a panel that overlays
 * *part* of an app — the Hob chat panel covers the content column and leaves the
 * app's own top bar reachable above it, which is what the delivery draws
 * (`ui_kits/dm-screen/AppShell.jsx` positions its scrim `absolute` inside the
 * content region, not over the shell).
 *
 * So `container` is one prop that answers one question in both places it has to
 * be answered: it is handed to `Dialog.Portal`, so the sheet renders inside that
 * element, **and** it switches the backdrop and the popup from `fixed` to
 * `absolute`, so they size to it. Passing only one of the two would be
 * incoherent — a portal into a region with the geometry still measured from the
 * viewport — which is exactly why it is not two props. The container must be a
 * positioned element; an `overflow: hidden` on it is a feature here, since it is
 * what stops the panel painting outside the region it belongs to.
 *
 * Motion is the design system's: `--dur-base` on `--ease-out`, so
 * `prefers-reduced-motion` flattens it upstream in `tokens/motion.css`. The
 * enter/leave delta is carried by `translate-*` utilities alone — never mixed
 * with a hand-written `transform`, which is the trap `motion.test.ts` exists for.
 */

type SheetContainer = React.RefObject<HTMLElement | null> | HTMLElement | null;

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  contained = false,
  ...props
}: SheetPrimitive.Backdrop.Props & { contained?: boolean }) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        contained ? "absolute" : "fixed",
        "inset-0 z-scrim bg-scrim supports-backdrop-filter:backdrop-blur-scrim",
        "transition-opacity duration-(--dur-base) ease-out",
        "data-starting-style:opacity-0 data-ending-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

/** Where the panel comes from, and the delta it travels to get there. */
const SIDES = {
  right:
    "inset-y-0 right-0 h-full w-3/4 border-l data-starting-style:translate-x-10 data-ending-style:translate-x-10",
  left: "inset-y-0 left-0 h-full w-3/4 border-r data-starting-style:-translate-x-10 data-ending-style:-translate-x-10",
  top: "inset-x-0 top-0 h-auto border-b data-starting-style:-translate-y-10 data-ending-style:-translate-y-10",
  bottom:
    "inset-x-0 bottom-0 h-auto border-t data-starting-style:translate-y-10 data-ending-style:translate-y-10",
} as const;

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  container,
  overlayProps,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: keyof typeof SIDES;
  showCloseButton?: boolean;
  /** Render into this element and measure against it, instead of the viewport. */
  container?: SheetContainer;
  /** For the one thing a caller ever needs on the backdrop: its own click. */
  overlayProps?: SheetPrimitive.Backdrop.Props;
}) {
  const contained = container !== undefined && container !== null;

  return (
    <SheetPortal container={container ?? undefined}>
      <SheetOverlay contained={contained} {...overlayProps} />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          contained ? "absolute" : "fixed",
          "z-dialog flex flex-col border-hairline bg-surface-card text-foreground shadow-3 outline-none",
          "transition duration-(--dur-base) ease-out",
          "data-starting-style:opacity-0 data-ending-style:opacity-0",
          SIDES[side],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            aria-label="Close"
            render={
              <Button variant="ghost" size="icon" className="absolute top-2 right-2 size-8" />
            }
          >
            <Icon name="x" size={14} />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 p-gutter", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-gutter", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-display text-title leading-snug font-semibold tracking-tight text-heading",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-body-s leading-body text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
export type { SheetContainer };
