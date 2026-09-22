import type { ReactNode } from "react";

import { Button } from "./button";
import { Card } from "./card";
import { Icon, type IconName } from "./icon";
import { sectionHeadingVariants } from "./section-heading";

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
 * A load in flight.
 *
 * Deliberately a line of text and not a spinner or a shimmering skeleton: the
 * theme resets `--animate-*` to `initial`, so `animate-spin` and `animate-pulse`
 * are not classes that exist here, and the motion rules ("nothing overshoots and
 * nothing steps") are what put them out of reach in the first place.
 */
function Loading({ label = "Loading…" }: { readonly label?: string }) {
  return (
    <p role="status" data-slot="loading" className="text-body-s leading-body text-faint">
      {label}
    </p>
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
