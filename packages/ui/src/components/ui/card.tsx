import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/**
 * 12px-radius container on `--surface-card` with a 1px hairline.
 *
 * **Dark only** — there is no light tone. `tone` steps through the dark surface
 * stack (`sunken` → `default` → `raised`), with `panel` for the live DM screen.
 * Depth comes from surface lightness plus a black shadow, never from a border
 * alone, and never from a coloured left border.
 */
const cardVariants = cva("group/card relative flex flex-col rounded-card border text-foreground", {
  variants: {
    tone: {
      default: "border-hairline bg-surface-card shadow-1",
      raised: "border-hairline bg-surface-raised shadow-1",
      sunken: "border-hairline bg-surface-sunken shadow-1",
      panel: "border-strong bg-surface-card shadow-2",
    },
    /**
     * A card that stands for one object opens it from anywhere on its face.
     * The object's name is a real link carrying `cardLinkClassName`, whose
     * `::after` covers the card; every other link or button inside is lifted
     * above that overlay by `relative`, so secondary actions keep working and do
     * not navigate. The focus ring lands on the card, not on the name.
     */
    linked: {
      true: "transition-control hover:border-strong has-[a[data-card-link]:focus-visible]:ring-focus [&_:is(a,button):not([data-card-link])]:relative",
      false: "",
    },
  },
  defaultVariants: {
    tone: "default",
    linked: false,
  },
});

/**
 * The class for the one link in a `linked` card: pair it with
 * `data-card-link` so the card can find it.
 */
const cardLinkClassName =
  "text-inherit no-underline after:absolute after:inset-0 hover:text-inherit focus-visible:shadow-none";

function Card({
  className,
  tone = "default",
  linked = false,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-tone={tone}
      className={cn(cardVariants({ tone, linked }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 p-card", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-display text-title leading-snug font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-body-s leading-body text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("absolute end-card top-card", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-card pb-card", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "mt-auto flex items-center gap-3 border-t border-hairline px-card py-3",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  cardLinkClassName,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
