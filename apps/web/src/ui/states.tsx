import { Button, Card, Icon, type IconName } from "@taverns/ui";
import type { ReactNode } from "react";
import type { ApiFailure } from "../api/resource";
import { useHostedSession } from "../auth/hostedSession";

/**
 * The three states every data-backed screen has, written once.
 *
 * The designers drew the empty state for the bestiary and the voice guide is
 * explicit about it: *"Empty states say what to do next, in two short
 * sentences."* Never "No data available", never an exclamation mark, never an
 * emoji. Same for failures — "Errors are matter-of-fact and bounded."
 */

/**
 * A load in flight.
 *
 * Deliberately a line of text and not a spinner or a shimmering skeleton: the
 * theme resets `--animate-*` to `initial`, so `animate-spin` and `animate-pulse`
 * are not classes that exist here, and the motion rules ("nothing overshoots and
 * nothing steps") are what put them out of reach in the first place.
 */
export function Loading({ label = "Loading…" }: { readonly label?: string }) {
  return (
    <p role="status" className="text-body-s leading-body text-faint">
      {label}
    </p>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  readonly icon: IconName;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <Card tone="sunken" className="items-center gap-3 px-card py-11 text-center">
      <Icon name={icon} size={28} className="text-faint" />
      <p className="font-display text-subtitle leading-snug font-semibold text-heading">{title}</p>
      <p className="max-w-measure text-body-s leading-body text-muted-foreground">{children}</p>
    </Card>
  );
}

/** Where a machine token is pasted, named the same way in every failure notice. */
function ServerPanelPointer() {
  return (
    <>
      Paste a machine token under <span className="text-heading">Components → Server</span>.{" "}
      <code className="font-mono text-mono text-slate-300">pnpm -F server token:issue</code> prints
      one.
    </>
  );
}

/**
 * A failed load, said plainly, with the one thing that might fix it.
 *
 * The `unauthorized` branch is the state a developer who has never opened the
 * Clerk dashboard sees first, so it must not read as breakage: no credential is
 * a normal way to run this app, and the notice says where to get one.
 */
export function FailureNotice({
  failure,
  onRetry,
}: {
  readonly failure: ApiFailure;
  readonly onRetry?: () => void;
}) {
  const { configured } = useHostedSession();

  const { icon, title, body }: { icon: IconName; title: string; body: ReactNode } = (() => {
    switch (failure.kind) {
      case "unauthorized":
        return {
          icon: "lock" as const,
          title: "No credential yet",
          body: configured ? (
            <>
              Sign in from the header, or work with a machine token instead. <ServerPanelPointer />
            </>
          ) : (
            <>
              Hosted sign-in is not configured, which is a fine way to run this.{" "}
              <ServerPanelPointer />
            </>
          ),
        };
      case "missing":
        return {
          icon: "eye-off" as const,
          title: "Not here",
          body: `That ${failure.resource} is gone, or it belongs to someone else. The server answers the same either way.`,
        };
      case "unreachable":
        return {
          icon: "octagon-x" as const,
          title: "The server did not answer",
          body: (
            <>
              Start it with{" "}
              <code className="font-mono text-mono text-slate-300">
                pnpm db:up &amp;&amp; pnpm -F server dev
              </code>
              , then try again.
            </>
          ),
        };
      default:
        return {
          icon: "triangle-alert" as const,
          title: "That did not work",
          body: failure.detail,
        };
    }
  })();

  return (
    <Card tone="sunken" className="items-center gap-3 px-card py-11 text-center">
      <Icon name={icon} size={28} className="text-faint" />
      <p
        role="alert"
        className="font-display text-subtitle leading-snug font-semibold text-heading"
      >
        {title}
      </p>
      <p className="max-w-measure text-body-s leading-body text-muted-foreground">{body}</p>
      {onRetry !== undefined && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}
