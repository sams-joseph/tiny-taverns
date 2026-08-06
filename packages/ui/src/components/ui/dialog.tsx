import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Icon } from "./icon";

/**
 * Modal for a decision the DM must make now.
 *
 * The scrim is `--scrim` with a 3px blur; the box fades up 6px from `scale(.98)`
 * on `--ease-out`. Keep dialogs ≤520px wide and never nest them.
 *
 * Backdrop and popup take two *different* rungs of the layering scale in
 * `styles.css` (`z-scrim` under `z-dialog`) rather than one. They were one for a
 * while, and the popup landed on top only because it is rendered second — the
 * same "document order decides" fragility that lost the toast behind the scrim.
 * A select opened from inside sits higher still, on `z-popup`.
 */
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-scrim bg-scrim",
        "supports-backdrop-filter:backdrop-blur-scrim",
        "transition-opacity duration-(--dur-base) ease-out",
        "data-starting-style:opacity-0 data-ending-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-dialog flex w-full max-w-115 -translate-x-1/2 -translate-y-1/2 flex-col",
          "rounded-dialog border border-strong bg-surface-card text-foreground shadow-3 outline-none",
          "animate-dialog-in data-ending-style:animate-dialog-out",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label="Close"
            render={
              <Button variant="ghost" size="icon" className="absolute top-2 right-2 size-8" />
            }
          >
            <Icon name="x" size={14} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 px-gutter pt-gutter pb-3", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex items-center justify-end gap-3 rounded-b-dialog border-t border-hairline",
        "bg-surface-sunken px-gutter pt-3 pb-gutter",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-display text-title leading-snug font-semibold tracking-tight text-heading",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-body-s leading-body text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
