import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "../../lib/utils";

/**
 * A hairline between two groups of content.
 *
 * The delivered system draws every division as a 1px `--border-hairline` rule and
 * nothing else — no inset, no shadow, no second weight — so this is the token and
 * the orientation, and there is no variant to choose. `border-strong` exists for
 * a control's own edge; a divider is never that.
 */
function Separator({ className, orientation = "horizontal", ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 bg-hairline data-horizontal:h-px data-horizontal:w-full",
        "data-vertical:w-px data-vertical:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
