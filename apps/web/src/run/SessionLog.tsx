import type { Combatant, CombatantId, SessionEvent } from "@taverns/api";
import { Card, CardContent, CardHeader, CardTitle, Icon } from "@taverns/ui";
import { DateTime } from "effect";
import { SENTENCE } from "./logSentence";
import type { LiveStatus } from "./stream";

/**
 * What just happened, straight off the stream — a scene's log. A fight's is
 * merged into its *Rolls* dock (`rollsLog.ts`), which prints these same
 * sentences for every line it has no numbers for.
 *
 * These rows are the events the connection already delivered — no second
 * request, and no polling. That makes the panel the honest indicator of whether
 * the stream is working: if the log is moving, the doorbell is ringing.
 *
 * **It renders `kind` and the two id columns, and never reaches into
 * `payload`.** `SessionEvent.payload` is untyped on the wire; the only shapes a
 * client may read are the few `SessionEventPayload.ts` declares, and the dock
 * is their reader. A sentence assembled from any other payload would be this
 * client quietly depending on an undeclared shape.
 */

/**
 * `21:04` — the time the DM would say, not a date they already know.
 *
 * Assembled from a `Date` rather than through `toLocaleTimeString`, so it is
 * the same two numbers on every machine and in the test suite. The `Date` is
 * the instant, so the hours and minutes are the reader's own clock.
 */
const clockOf = (event: SessionEvent): string => {
  const at = DateTime.toDateUtc(event.createdAt);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
};

const STATUS_LINE: Record<LiveStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  stopped: "Not listening",
};

export function SessionLog({
  events,
  combatants,
  noun,
  status,
}: {
  /** Newest first, and already cut to the last few — `LOG_KEPT` in `RunScreen`. */
  readonly events: ReadonlyArray<SessionEvent>;
  readonly combatants: ReadonlyArray<Combatant>;
  /** What the run is played as — `"fight"`, `"conversation"`… */
  readonly noun: string;
  readonly status: LiveStatus;
}) {
  const names = new Map<CombatantId, string>(
    combatants.map((combatant) => [combatant.id, combatant.displayName]),
  );

  return (
    <Card tone="panel" role="log" aria-label="What just happened">
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2.5">
          <CardTitle className="text-subtitle">What just happened</CardTitle>
          <span
            className={`flex items-center gap-1.5 text-caption leading-body ${
              status === "live" ? "text-success-ink" : "text-muted-foreground"
            }`}
          >
            <Icon name={status === "live" ? "zap" : "clock"} size={12} />
            {STATUS_LINE[status]}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pb-card">
        {events.length === 0 ? (
          <p className="text-caption leading-body text-muted-foreground">
            Nothing yet. Every hit, turn and change lands here as it happens.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {events.map((event) => (
              <li key={event.id} className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-micro leading-body text-faint">
                  {clockOf(event)}
                </span>
                <span className="min-w-0 flex-1 text-caption leading-body text-on-dark-muted">
                  {SENTENCE[event.kind](
                    event.combatantId === null ? undefined : names.get(event.combatantId),
                    noun,
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
