import { Link } from "@tanstack/react-router";
import { FailureNotice, type IconName } from "@taverns/ui";
import type { ReactNode } from "react";
import { useHostedSession } from "../auth/hostedSession";
import type { ApiFailure } from "./failure";

/**
 * What a failed read or write says, written once — the words for
 * `@taverns/ui`'s `FailureNotice`, which owns the shape.
 *
 * The voice guide is explicit: *"Errors are matter-of-fact and bounded."* The
 * copy is the app's rather than the package's because it depends on why the
 * request failed and on whether hosted sign-in is configured, neither of which
 * a component library can know.
 */

/** Where a machine token is pasted, named the same way in every failure notice. */
function ServerPanelPointer() {
  return (
    <>
      Paste a machine token on the{" "}
      <Link to="/server" className="text-link hover:text-link-hover">
        Server page
      </Link>
      . <code className="font-mono text-mono text-slate-300">pnpm -F server token:issue</code>{" "}
      prints one.
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
export function ApiFailureNotice({
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
      case "conflict":
        return { icon: "triangle-alert" as const, title: "Already there", body: failure.message };
      case "unavailable":
        // The server answered, and it answered that something optional is not
        // configured. Its own sentence carries the fix, so nothing is composed
        // here — see `ApiFailure`.
        return { icon: "info" as const, title: "Not switched on", body: failure.message };
      case "rate-limited":
        return { icon: "clock" as const, title: "Too many messages", body: failure.message };
      case "invalid":
        return {
          icon: "triangle-alert" as const,
          title: "That will not save as written",
          body: failure.detail,
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
    <FailureNotice icon={icon} title={title} {...(onRetry !== undefined && { onRetry })}>
      {body}
    </FailureNotice>
  );
}
