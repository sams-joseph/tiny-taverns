import type { EncounterRun, Session } from "@taverns/api";
import { Button, Card, CardContent, CardHeader, CardTitle, Icon } from "@taverns/ui";
import { DateTime } from "effect";

/**
 * The night itself, under the checklist that belongs to it.
 *
 * The aside is already the session's column — "Before you sit down" hangs off
 * `session`, not off the campaign — so this is where the one thing you can do
 * *to* a session goes. Deliberately not the top bar: `New encounter` and
 * `Start session` are what a DM presses all evening, and ending the night is
 * not a thing to put a thumb's width away from either of them.
 *
 * It renders only when there is a session. With none, the checklist above
 * already says so, and there is nothing here to end.
 */

/** `21:04` — the same clock `run/SessionLog.tsx` writes, for the same reason. */
const clockOf = (at: DateTime.Utc): string => {
  const date = DateTime.toDateUtc(at);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

export function SessionCard({
  session,
  liveRun,
  onFinish,
}: {
  readonly session: Session;
  /** The fight on the table, if there is one. */
  readonly liveRun: EncounterRun | undefined;
  readonly onFinish: () => void;
}) {
  const state =
    liveRun !== undefined
      ? `${liveRun.encounterName} is on the table.`
      : session.startedAt !== null
        ? `Playing since ${clockOf(session.startedAt)}.`
        : "Not started yet — nothing has been run in it.";

  return (
    <Card tone="sunken">
      <CardHeader>
        <CardTitle>{session.title ?? `Session ${String(session.number)}`}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-body-s leading-body text-muted-foreground">{state}</p>
        {/* Outline, not destructive: it opens a confirmation, and a red button
            here would read as the ending itself. The dialog's own confirm is
            the destructive one. */}
        <Button variant="outline" size="sm" className="text-muted-foreground" onClick={onFinish}>
          <Icon name="moon" size={14} />
          Finish the night
        </Button>
      </CardContent>
    </Card>
  );
}
