import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

/**
 * The one heading recipe below a page title.
 *
 * The delivery's display type is Instrument Sans 600 at `--ls-display`, stepped
 * by size alone (`readme.md`, *Type*), so the sizes are the whole choice:
 *
 * - `hero` — a landing-page section; steps up a size in a wide container.
 * - `display` — the head of a dialog, a panel or a night's entry.
 * - `title` — a card or a detail pane; the same type `CardTitle` draws.
 * - `subtitle` — a list section or a notice.
 * - `section` — the delivery's `SectionHead`: a quiet head over a group.
 * - `label` — the small-caps eyebrow over a block of fields.
 *
 * The page title is not here; it belongs to the page header.
 */
const sectionHeadingVariants = cva("font-semibold", {
  variants: {
    size: {
      hero: "font-display text-display-m leading-tight tracking-display text-heading @2xl:text-display-l",
      display: "font-display text-display-s leading-tight tracking-display text-heading",
      title: "font-display text-title leading-snug tracking-tight text-heading",
      subtitle: "font-display text-subtitle leading-snug text-heading",
      section: "font-display text-body leading-tight tracking-display text-heading",
      label: "font-sans text-label-s leading-none tracking-caps text-muted-foreground uppercase",
    },
  },
  defaultVariants: {
    size: "section",
  },
});

type SectionHeadingProps = React.ComponentProps<"h2"> &
  VariantProps<typeof sectionHeadingVariants> & {
    /** The heading level; the size is chosen separately so the outline stays honest. */
    readonly as?: "h2" | "h3" | "h4";
    /**
     * Drawn after the heading on the same baseline: the way to the whole of the
     * section, or a count. With it, `className` lands on the row, not the heading.
     */
    readonly action?: React.ReactNode;
  };

function SectionHeading({
  as: Tag = "h2",
  size = "section",
  action,
  className,
  ...props
}: SectionHeadingProps) {
  if (action === undefined) {
    return (
      <Tag
        data-slot="section-heading"
        className={cn(sectionHeadingVariants({ size }), className)}
        {...props}
      />
    );
  }
  return (
    <div
      data-slot="section-heading"
      className={cn("flex items-baseline justify-between gap-2.5", className)}
    >
      <Tag className={sectionHeadingVariants({ size })} {...props} />
      {action}
    </div>
  );
}

export { SectionHeading, sectionHeadingVariants };
