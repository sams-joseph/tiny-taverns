import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/**
 * A key, drawn as a chip: `⌘K` beside *Ask Hob*, `SPACE` inside a tooltip.
 *
 * A hint, never the shortcut itself — the key handler lives with whatever it
 * opens and works whether or not a chip is drawn, so a caller is free to hide
 * the chip on a bar with no room for it.
 *
 * `quiet` sits on the app's own surfaces; `inverse` sits on the tooltip's
 * lighter slate, where the quiet chip's sunken fill would read as a hole.
 */
const kbdVariants = cva("rounded-xs font-mono text-micro", {
  variants: {
    tone: {
      quiet: "bg-surface-sunken px-1 leading-none font-medium text-faint",
      inverse: "bg-slate-50/15 px-1.5 py-px leading-tight text-slate-50",
    },
  },
  defaultVariants: {
    tone: "quiet",
  },
});

function Kbd({
  className,
  tone = "quiet",
  ...props
}: React.ComponentProps<"kbd"> & VariantProps<typeof kbdVariants>) {
  return <kbd data-slot="kbd" className={cn(kbdVariants({ tone }), className)} {...props} />;
}

export { Kbd, kbdVariants };
