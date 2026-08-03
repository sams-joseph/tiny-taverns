"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";

import { cn } from "../../lib/utils";
import { Icon } from "./icon";

/**
 * 18px square control with a 4px radius, `checked` + `onCheckedChange`. Renders no
 * label — compose one.
 *
 * Solid accent fill when on: this is a genuine on/off control, so it does not use
 * the soft `--accent-soft` treatment that Toggle and SelectItem use for selection.
 *
 * Partial group state is Base UI's `indeterminate` prop (the delivered prototype
 * spelled it `checked="indeterminate"`).
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer flex size-4.5 shrink-0 items-center justify-center",
        "rounded-xs border border-strong bg-surface-card text-on-accent",
        "cursor-pointer transition-control outline-none",
        "data-checked:border-accent data-checked:bg-accent",
        "data-indeterminate:border-accent data-indeterminate:bg-accent",
        "focus-visible:ring-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            <Icon name={state.indeterminate ? "minus" : "check"} size={12} strokeWidth={3} />
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
