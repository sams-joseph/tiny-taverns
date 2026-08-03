import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/**
 * Small status chip. 4px radius, 12px medium, sentence case.
 *
 * `default` and `destructive` are solid fills; the semantic variants
 * (`success` / `magic` / `info`, this system's additions for table meanings) are
 * soft tints with matching ink, which keeps a row of badges calm.
 */
const badgeVariants = cva(
  [
    "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1",
    "rounded-xs border px-2 py-0.5",
    "font-sans text-label-s leading-snug font-medium whitespace-nowrap",
    "transition-control [&>svg]:pointer-events-none [&>svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent text-on-accent",
        secondary: "border-transparent bg-surface-raised text-slate-300",
        destructive: "border-transparent bg-danger text-on-solid",
        outline: "border-strong bg-transparent text-muted-foreground",
        success: "border-transparent bg-success-soft text-success-ink",
        magic: "border-transparent bg-magic-soft text-magic-ink",
        info: "border-transparent bg-info-soft text-info-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">({ className: cn(badgeVariants({ variant }), className) }, props),
    render,
    state: { slot: "badge", variant },
  });
}

export { Badge, badgeVariants };
