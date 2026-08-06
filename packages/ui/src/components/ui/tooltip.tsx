import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "../../lib/utils";

/**
 * Hard-bordered dark label on hover/focus. Always pass `shortcut` when the action
 * has a key — this is a keyboard-heavy tool.
 *
 * No arrow, no fade, no delay: it appears and disappears in one frame.
 *
 * Top of the layering scale (`z-tooltip`): it can label a control on any layer
 * below — a dialog's close button, a toast's action, a select item — and it is
 * the one overlay that never takes a pointer, so being above costs nothing.
 */
function TooltipProvider({ delay = 0, closeDelay = 0, ...props }: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      closeDelay={closeDelay}
      {...props}
    />
  );
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

interface TooltipContentProps
  extends
    TooltipPrimitive.Popup.Props,
    Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset"> {
  /** Shortcut rendered as a kbd chip, e.g. "SPACE" or "R". This system's addition. */
  shortcut?: string;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 8,
  align = "center",
  alignOffset = 0,
  shortcut,
  children,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-tooltip"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "inline-flex w-fit max-w-60 items-center gap-1.5 px-2.5 py-1.5",
            "rounded-sm border border-slate-600 bg-slate-700 shadow-2",
            "font-sans text-label-s leading-snug font-medium text-slate-50",
            shortcut && "whitespace-nowrap",
            className,
          )}
          {...props}
        >
          {children}
          {shortcut && (
            <kbd
              data-slot="kbd"
              className="rounded-xs bg-slate-50/15 px-1.5 py-px font-mono text-micro leading-tight text-slate-50"
            >
              {shortcut}
            </kbd>
          )}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
export type { TooltipContentProps };
