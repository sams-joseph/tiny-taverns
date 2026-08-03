import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/**
 * Heights 38 / 32 / 44 / 38(icon), 6px radius, 1px border. Solid variants carry a
 * level-1 shadow that swaps to a subtle inset on press — no transform, no bounce.
 *
 * On dark, hover makes a fill *lighter*, never darker, and never uses opacity.
 * `outline`, `ghost` and `link` inherit `color`, so they adapt to whichever
 * surface they sit on without a parallel variant set.
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-1.5",
    "rounded-control border font-sans font-medium tracking-normal whitespace-nowrap",
    "cursor-pointer transition-control outline-none select-none",
    "focus-visible:ring-focus",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-accent text-on-accent shadow-1 hover:bg-accent-hover active:bg-accent-press active:shadow-inset-press",
        secondary:
          "border-strong bg-surface-raised text-foreground shadow-1 hover:bg-slate-700 active:bg-slate-800 active:shadow-inset-press",
        destructive:
          "border-transparent bg-danger text-on-solid shadow-1 hover:bg-danger-hover active:bg-crimson-700 active:shadow-inset-press",
        outline:
          "border-current bg-transparent text-inherit hover:bg-slate-300/10 active:bg-slate-300/16",
        ghost:
          "border-transparent bg-transparent text-inherit hover:bg-slate-300/10 active:bg-slate-300/16",
        link: "border-transparent bg-transparent text-link underline underline-offset-2 hover:text-link-hover",
      },
      size: {
        default: "h-control px-3.5 text-label",
        sm: "h-8 px-3 text-label-s",
        lg: "h-row px-5 text-label-l",
        icon: "size-control p-0 text-label",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
