import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * The shape of content that has not arrived.
 *
 * `--surface-raised` rather than a grey: the system carries no true grey, and a
 * placeholder that is not on the ramp reads as a broken tile rather than as a
 * waiting one.
 *
 * The pulse is Tailwind's `animate-pulse`, which is the one animation in this
 * package **not** timed from a `--dur-*` token — it has no start and no end, so
 * there is no design duration for it to take. `prefers-reduced-motion` therefore
 * does not flatten it the way the token-timed animations flatten; the rule in
 * `styles.css` §7 stops it for the same people.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-sm bg-surface-raised", className)}
      {...props}
    />
  );
}

export { Skeleton };
