import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Standalone 13px medium label. Required companion to `Input` and `Select`, which
 * render no label of their own — pair via `htmlFor`.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 font-sans text-label leading-snug font-medium select-none",
        "group-data-[disabled]:pointer-events-none group-data-[disabled]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
