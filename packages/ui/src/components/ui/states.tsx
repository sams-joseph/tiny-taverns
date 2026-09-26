import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

import { Button } from "./button";
import { Card } from "./card";
import { Icon, type IconName } from "./icon";
import { sectionHeadingVariants } from "./section-heading";
import { Skeleton } from "./skeleton";

/**
 * The three states every data-backed screen has, written once.
 *
 * The designers drew the empty state for the bestiary and the voice guide is
 * explicit about it: *"Empty states say what to do next, in two short
 * sentences."* Never "No data available", never an exclamation mark, never an
 * emoji. Same for failures — "Errors are matter-of-fact and bounded."
 *
 * These are the shapes; the words are the caller's. What a failed request says
 * depends on why it failed, which is the app's to know.
 */

/**
 * A load in flight: the shape of the page that has not arrived.
 *
 * One skeleton for every screen, not one per screen. It sits under the header
 * the screen has already drawn, so it is only the body: a heading line and a
 * few card-sized blocks. `inline` is the two-line form for a dialog or a
 * picker, where a page's worth of blocks would push the dialog open and then
 * snap it shut.
 *
 * The page form sits in the Overview's centred frame (`max-w-overview`), the
 * width every page is moving to, so a load's left edge is where the page's
 * content will land. Inside a frame that is already centred it changes nothing.
 *
 * Static on purpose: the theme resets `--animate-*` to `initial`, so there is
 * no pulse to reach for, and the motion rules ("nothing overshoots and nothing
 * steps") are what put one out of reach in the first place.
 *
 * The label is the `status` a screen reader announces; the blocks are hidden
 * from it. `data-slot="loading"` is what the tests wait on to disappear.
 */
function Loading({
  label = "Loading…",
  inline = false,
}: {
  readonly label?: string;
  readonly inline?: boolean;
}) {
  return (
    <div
      role="status"
      data-slot="loading"
      className={cn("flex flex-col gap-3", !inline && "mx-auto w-full max-w-overview")}
    >
      <span className="sr-only">{label}</span>
      {inline ? (
        <>
          <Skeleton aria-hidden className="h-3.5 w-full" />
          <Skeleton aria-hidden className="h-3.5 w-2/3" />
        </>
      ) : (
        <>
          <Skeleton aria-hidden className="h-5 w-48" />
          <Skeleton aria-hidden className="h-28 rounded-card" />
          <Skeleton aria-hidden className="h-28 rounded-card" />
          <Skeleton aria-hidden className="h-28 rounded-card" />
        </>
      )}
    </div>
  );
}

/** The sunken card both the empty and the failed state are drawn on. */
function StateCard({
  slot,
  icon,
  title,
  role,
  children,
  footer,
}: {
  readonly slot: string;
  readonly icon: IconName;
  readonly title: string;
  readonly role?: "alert";
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <Card tone="sunken" data-slot={slot} className="items-center gap-3 px-card py-11 text-center">
      <Icon name={icon} size={28} className="text-faint" />
      {/* Heading type on a `p`: a state is not a section of the page outline. */}
      <p role={role} className={sectionHeadingVariants({ size: "subtitle" })}>
        {title}
      </p>
      <p className="max-w-measure text-body-s leading-body text-muted-foreground">{children}</p>
      {footer}
    </Card>
  );
}

/** Nothing here yet: what it is, and what to do next. */
function EmptyState({
  icon,
  title,
  children,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <StateCard slot="empty-state" icon={icon} title={title}>
      {children}
    </StateCard>
  );
}

/**
 * A failed load, said plainly, with the one thing that might fix it. The title
 * is the `alert`, so it is announced without the body's detail.
 */
function FailureNotice({
  icon,
  title,
  children,
  onRetry,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly children: ReactNode;
  readonly onRetry?: () => void;
}) {
  return (
    <StateCard
      slot="failure-notice"
      icon={icon}
      title={title}
      role="alert"
      footer={
        onRetry !== undefined && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {children}
    </StateCard>
  );
}

export { EmptyState, FailureNotice, Loading };
