"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "../../lib/utils";

/**
 * 40×22 toggle for settings that take effect immediately. `checked` +
 * `onCheckedChange`; no label of its own.
 *
 * A pill track with a circular 16px knob that glides on `--ease-out`. Sized so it
 * stays visibly distinct from the 18px square Checkbox.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch relative inline-flex h-5.5 w-10 shrink-0 items-center",
        "rounded-pill border border-transparent bg-slate-700",
        "cursor-pointer outline-none",
        "transition-[background-color] duration-(--dur-fast) ease-out",
        "data-checked:bg-accent",
        "focus-visible:ring-focus",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none absolute top-0.5 left-0.5 block size-4 rounded-circle",
          "bg-slate-100 shadow-1",
          "transition-transform duration-(--dur-fast) ease-out",
          "data-unchecked:translate-x-0 data-checked:translate-x-4.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
