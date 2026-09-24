import type { EncounterRun, Session } from "@taverns/api";
import { Button, Card, Icon } from "@taverns/ui";
import { useCampaignAct } from "./act";
import { agoOf, useNow } from "./when";

/**
 * The night is running and a fight is on the table: which, how far in, and the
 * way back to it.
 *
 * Drawn only while there is a live run, above everything else on the Overview,
 * because it is the one thing on the page about *right now*. The press is the
 * campaign's own (`useCampaignAct`), so it cannot disagree with the one the
 * chrome draws on every other tab about where the fight is; it is `outline`
 * because the banner is a notice, not the screen's next step.
 *
 * **Finishing the night is here too.** The redesign dropped it from the Overview
 * with nowhere else to go, and a one-way door is a bug: while a fight is on the
 * table this is the card about the night, so it carries the night's ending. With
 * no fight on the table the *Next session* card carries it instead.
 */
export function LiveBanner({
  session,
  run,
  onFinish,
}: {
  readonly session: Session;
  readonly run: EncounterRun;
  readonly onFinish: () => void;
}) {
  const { act, dialogs } = useCampaignAct(session.campaignId);
  const now = useNow();
  const detail = [
    `Round ${String(run.round)} of ${run.encounterName}`,
    session.startedAt === null ? null : `started ${agoOf(session.startedAt, now).toLowerCase()}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <Card className="flex-row flex-wrap items-center gap-x-3 gap-y-2 border-t-3 border-t-accent px-4 py-3">
      <Icon name="swords" size={16} className="shrink-0 text-accent-ink" />
      <span className="text-body-s leading-snug font-semibold text-heading">
        Session {session.number} is running
      </span>
      <span className="text-body-s leading-snug text-muted-foreground">{detail}</span>
      <span className="ml-auto flex flex-wrap gap-2">
        {act !== undefined && (
          <Button variant="outline" size="sm" onClick={act.press}>
            <Icon name={act.icon} size={13} />
            {act.label}
          </Button>
        )}
        {/* Outline, not destructive: it opens a confirmation, and a red button
            here would read as the ending itself. */}
        <Button variant="outline" size="sm" className="text-muted-foreground" onClick={onFinish}>
          <Icon name="moon" size={13} />
          Finish the night
        </Button>
      </span>
      {dialogs}
    </Card>
  );
}
