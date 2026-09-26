import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * The shape of content that has not arrived.
 *
 * `--surface-raised` rather than a grey: the system carries no true grey, and a
 * placeholder that is not on the ramp reads as a broken tile rather than as a
 * waiting one.
 *
 * It holds still. The theme resets `--animate-*` to `initial`, so Tailwind's
 * `animate-pulse` is not a class that exists here, and no token times a motion
 * with no start and no end.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-sm bg-surface-raised", className)}
      {...props}
    />
  );
}

export { Skeleton };
