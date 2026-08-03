"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/**
 * Pressable filter chip. Pill-shaped, 1px border. Pressed is a soft
 * `--accent-soft` fill with `--accent-ink` text and an `--accent` border — solid
 * accent fill is reserved for genuine on/off controls (Checkbox, Switch).
 *
 * For static metadata use `Badge variant="outline"` instead.
 */
const toggleVariants = cva(
  [
    "group/toggle inline-flex shrink-0 items-center justify-center gap-1.5",
    "rounded-tag border px-3 font-sans font-medium whitespace-nowrap",
    "cursor-pointer transition-control outline-none select-none",
    "border-strong bg-surface-card text-foreground hover:bg-surface-raised",
    "data-pressed:border-accent data-pressed:bg-accent-soft data-pressed:text-accent-ink",
    "focus-visible:ring-focus",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      size: {
        default: "h-9 text-label",
        sm: "h-control-sm text-label-s",
        lg: "h-10.5 text-label-l",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

function Toggle({
  className,
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
