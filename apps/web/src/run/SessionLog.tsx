import type { Combatant, CombatantId, SessionEvent, SessionEventKind } from "@taverns/api";
import { Card, CardContent, CardHeader, CardTitle, Icon } from "@taverns/ui";
import { DateTime } from "effect";
import type { LiveStatus } from "./stream";

/**
 * What just happened, straight off the stream.
 *
 * These rows are the events the connection already delivered — no second
 * request, and no polling. That makes the panel the honest indicator of whether
 * the stream is working: if the log is moving, the doorbell is ringing.
 *
 * **It renders `kind` and the two id columns, and never reaches into
 * `payload`.** `SessionEvent.payload` is deliberately untyped and documented as
 * "the human-legible remainder … not a contract anything branches on" — so a
 * sentence assembled from it would be this client quietly depending on an
 * undeclared shape, which would break the next time a repository added a field
 * to it. The cost is that "12 damage" reads as "took a hit" here, and the
 * number the DM actually needs is on the initiative row where they are looking.
 */

/**
 * `noun` is what the run is played as now (`sceneNoun`): a conversation that
 * went on the table is not "the fight" until it turns into one.
 */
const SENTENCE: Record<SessionEventKind, (who: string | undefined, noun: string) => string> = {
  "run-started": (_, noun) => `The ${noun} went on the table`,
  "run-updated": (_, noun) => `The ${noun} changed`,
  "run-ended": (_, noun) => `The ${noun} came off the table`,
  // The night finished over this fight, so it came off the table and is waiting
  // for the next one. Distinct from `run-ended` on purpose — a recap that
  // conflated them would report a fight the party is still standing in as over.
  "run-carried": (_, noun) => `The night ended — the ${noun} carries over`,
  "run-resumed": (_, noun) => `The ${noun} was picked up from last time`,
  "combatant-added": (who) => `${who ?? "Someone"} joined the order`,
  "combatant-updated": (who) => `${who ?? "A combatant"} changed`,
  // The foreign key is `on delete set null`, so by the time this row is read
  // the combatant it names is gone and there is no name to resolve.
  "combatant-removed": () => "Someone left the order",
  "combatant-damaged": (who) => `${who ?? "A combatant"} took a hit`,
  "combatant-moved": (who) => `${who ?? "A combatant"} moved on the board`,
  "turn-advanced": (who) => `${who ?? "Nobody"} is up`,
  "run-escalated": () => "The conversation turned into a fight",
  // The scene is the DM's alone; these say only that it moved, never how.
  "scene-updated": () => "The scene changed",
  "check-logged": (who) => `${who ?? "Someone"} made a check`,
  "check-removed": () => "A check was taken back",
  // A character changed while the night was running — the party list, not the
  // initiative order. It names a combatant only when the write reached the
  // fight from outside it, which is why the name resolves here at all; a hit
  // taken *in* initiative is a `combatant-damaged` line and nothing else, so
  // this never doubles up with one.
  "character-updated": (who) => `${who ?? "Someone in the party"} changed`,
  "hob-resource-spent": (who) => `Hob spent ${who ?? "someone's"} resource`,
  "hob-resource-undone": (who) => `Hob's resource spend for ${who ?? "someone"} was undone`,
  // The prose is a `beat` row, not this event's payload — see `Beat`. The log
  // says only that one was jotted, and at what point in the fight.
  "beat-added": () => "A beat was jotted down",
  // The row is in `character_roll`; this marker is only the doorbell.
  "roll-made": () => "A roll hit the tray",
};

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
