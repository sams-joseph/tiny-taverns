import { Button, Icon } from "@taverns/ui";
import type { Loop } from "./autopilotLoop";

/**
 * **Where Hob's autopilot stands**, under the runner's header while it is on:
 * a line saying what it is doing or why it paused, the countdown before it
 * moves on, and the DM's way in: *Stop*, *Resume*, *Next now*. *Undo* is on
 * the card, beside what it takes back. On another tab or device than the one
 * driving, it says so and offers to drive here.
 */
export function AutopilotBar({
  mine,
  loop,
  status,
  countdown,
  busy,
  onStop,
  onResume,
  onNextNow,
  onDriveHere,
}: {
  /** This tab drives it. */
  readonly mine: boolean;
  readonly loop: Loop;
  readonly status: string;
  readonly countdown: number | undefined;
  /** The switch is being written. */
  readonly busy: boolean;
  readonly onStop: () => void;
  readonly onResume: () => void;
  readonly onNextNow: () => void;
  readonly onDriveHere: () => void;
}) {
  const paused = loop.phase === "paused";
  return (
    <section
      aria-label="Hob's autopilot"
      className="flex flex-wrap items-center gap-3 rounded-card border border-hairline bg-surface-card px-card py-2.5 shadow-1"
    >
      <Icon name="sparkles" size={13} className="text-magic-ink" />
      <p role="status" className="mb-0 min-w-0 flex-1 text-body-s leading-body text-foreground">
        {mine ? status : "Autopilot is on, driven from another tab or device."}
        {mine && countdown !== undefined && (
          <span className="text-muted-foreground">{` Next in ${String(countdown)}s.`}</span>
        )}
      </p>
      {!mine && (
        <Button size="sm" variant="outline" disabled={busy} onClick={onDriveHere}>
          Drive here
        </Button>
      )}
      {mine && loop.phase === "counting" && (
        <Button size="sm" variant="outline" onClick={onNextNow}>
          Next now
        </Button>
      )}
      {mine && paused && (
        <Button size="sm" variant="outline" onClick={onResume}>
          Resume
        </Button>
      )}
      {mine && !paused && (
        <Button size="sm" variant="outline" onClick={onStop}>
          <Icon name="octagon-x" size={13} />
          Stop
        </Button>
      )}
    </section>
  );
}
