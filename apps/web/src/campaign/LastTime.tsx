import type { CampaignId } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { fightStory } from "../chronicle/fight";
import { dayOf } from "../chronicle/format";
import type { LastNight } from "./overview";
import { type Audience, OverviewCard, sectionLink } from "./OverviewParts";

/** How many of the night's beats the card quotes before sending you to the rest. */
const QUOTED = 3;

/**
 * *Last time*: what the record says about the previous night, in its own words.
 *
 * **The drawing's paragraph is prose nobody wrote.** Nothing stores a summary of
 * a night — `Recap.ts` is assembled per read, by decision, and a model call in
 * a read path is ruled out — so the captain's answer is the night's recorded
 * events: its first few beats **verbatim**, which are already the DM's words at
 * the right length. A night with no beats is told by its fights, in the
 * Chronicle's own sentences (`chronicle/fight.ts`), and a night with neither
 * says so. The rest is one press away.
 *
 * A player's is the same card over `recap.readAsPlayer`: their beats are the
 * shared ones and their fights carry no monster's numbers, and `fightStory`
 * reads neither. A night with nothing shared is not a night where nothing was
 * written, so the last sentence is theirs.
 */
export function LastTime({
  lastNight,
  campaignId,
  audience,
}: {
  readonly lastNight: LastNight;
  readonly campaignId: CampaignId;
  readonly audience: Audience;
}) {
  const { session, recap } = lastNight;
  const played = session.startedAt ?? session.endedAt;
  const quoted = recap.beats.slice(0, QUOTED);
  const more = recap.beats.length - quoted.length;

  return (
    <OverviewCard
      title="Last time"
      meta={
        <span className="text-label leading-none text-muted-foreground">
          {[`Session ${String(session.number)}`, played === null ? null : dayOf(played)]
            .filter((part): part is string => part !== null)
            .join(" · ")}
        </span>
      }
      action={
        <Link to="/campaigns/$campaignId/chronicle" params={{ campaignId }} className={sectionLink}>
          Read the chronicle
        </Link>
      }
    >
      <div className="flex flex-col gap-2.5 px-card py-4">
        {quoted.length > 0 ? (
          <>
            {quoted.map((beat) => (
              <p
                key={beat.id}
                className="mb-0 max-w-measure text-body leading-body text-foreground"
              >
                {beat.body}
              </p>
            ))}
            {more > 0 && (
              <p className="mb-0 text-caption leading-snug text-faint">
                {more} more {more === 1 ? "moment" : "moments"} in the chronicle
              </p>
            )}
          </>
        ) : recap.fights.length > 0 ? (
          recap.fights.map((fight) => {
            const story = fightStory(fight);
            return (
              <p key={fight.run.id} className="mb-0 text-body leading-body text-foreground">
                <span className="font-medium text-heading">{story.name}.</span> {story.state}
              </p>
            );
          })
        ) : (
          <p className="mb-0 text-body-s leading-body text-muted-foreground">
            {audience === "creator"
              ? "Nothing was written down that night."
              : "Nothing from that night has been shared with you."}
          </p>
        )}
      </div>
    </OverviewCard>
  );
}
