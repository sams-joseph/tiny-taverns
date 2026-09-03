import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "../../lib/utils";

/**
 * Composed popover on Base UI — the registry's `base-nova` popover restyled to
 * the design system, exactly as `select.tsx` was. A small anchored surface for
 * controls that belong to one trigger (the filter input's overflow chip is the
 * first consumer); a `Dialog` is for work that takes the screen.
 *
 * The popup portals to `document.body` on `z-popup`, above `z-dialog`, for the
 * select's reason: a popover opened from inside a dialog must not lose the
 * click to the dialog's own backdrop.
 */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />;
}

function PopoverTrigger({ className, ...props }: PopoverPrimitive.Trigger.Props) {
  return (
    <PopoverPrimitive.Trigger data-slot="popover-trigger" className={cn(className)} {...props} />
  );
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 6,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-popup"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "flex max-h-(--available-height) max-w-(--available-width) min-w-48 flex-col gap-1.5",
            "overflow-x-hidden overflow-y-auto rounded-md border border-strong",
            "bg-surface-raised p-2 shadow-3",
            "origin-(--transform-origin) outline-none",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
