import type { CampaignId, RecapFight, SessionId } from "@taverns/api";
import { Badge, Card, Icon } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { FailureNotice, Loading } from "../ui/states";
import { fightStory, standing } from "./fight";
import { loadRecap } from "./load";
import { Drafted, Facet, RecapDocument } from "./recapParts";

/**
 * One night, read back from the five sources `SessionRecap` assembles — **the
 * DM's projection.**
 *
 * **Mounted only while its card is open**, which is what makes the recap a
 * per-card read rather than one of twenty fired to draw a timeline — see
 * `load.ts`. Closing the card unmounts this and the next open re-reads, which is
 * correct rather than wasteful: a recap is a view assembled per read and has no
 * stored version to go stale against, so a cached one is the only thing here
 * that could be out of date.
 *
 * Everything but the fights is in `recapParts.tsx`, shared with
 * `PlayerRecapBody` — see that file for why the read-aloud rule has one
 * implementation. What is not shared is `Fights`: `recap.read` is behind the
 * `DmActor` gate and answers whole `Combatant` rows, so this is the projection
 * that may say a monster's exact hit points and does not have to think about it.
 */

function Fights({ fights }: { readonly fights: ReadonlyArray<RecapFight> }) {
  return (
    <Facet icon="swords" label="At the table">
      <div className="flex flex-col gap-2">
        {fights.map((fight) => {
          const story = fightStory(fight);
          const { total, down } = standing(fight);
          return (
            <Card key={fight.run.id} tone="sunken" className="gap-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-label leading-snug font-semibold text-heading">
                  {story.name}
                </span>
                {story.live ? (
                  <Badge>On the table</Badge>
                ) : fight.run.endedReason === "carried" ? (
                  <Badge variant="info">Carried</Badge>
                ) : (
                  <Badge variant="secondary">Resolved</Badge>
                )}
                <Drafted origin={fight.run.origin} />
              </div>
              <p className="text-body-s leading-body text-foreground">{story.state}</p>
              {/* The two directions of a carried fight, each naming the round
                  that end actually means. See `fight.ts` — they are different
                  numbers and swapping them is invisible. */}
              {story.resumedFrom !== null && (
                <p className="flex items-center gap-1.5 text-caption leading-body text-muted-foreground">
                  <Icon name="git-branch" size={12} className="shrink-0 text-faint" />
                  {story.resumedFrom}
                </p>
              )}
              {story.carriedInto !== null && (
                <p className="flex items-center gap-1.5 text-caption leading-body text-muted-foreground">
                  <Icon name="arrow-right" size={12} className="shrink-0 text-faint" />
                  {story.carriedInto}
                </p>
              )}
              <p className="text-caption leading-body text-faint">
                {total === 0
                  ? "Nobody left in initiative."
                  : `${String(total)} in initiative${down === 0 ? "" : `, ${String(down)} at zero`}.`}
              </p>
            </Card>
          );
        })}
      </div>
    </Facet>
  );
}

/**
 * One night, read back — the DM's projection, keyed on the pair that names it.
 *
 * A **record** key, which `Atom.family` compares structurally (see
 * `api/atoms.ts`). Module scope, because an atom is its own identity: built in
 * the component it would be a fresh one every render and load forever.
 */
const recapAtom = Atom.family(
  ({ campaignId, sessionId }: { readonly campaignId: CampaignId; readonly sessionId: SessionId }) =>
    apiAtom(loadRecap(campaignId, sessionId), [reads.recap(sessionId)]),
);

export function RecapBody({
  campaignId,
  sessionId,
  readAloud,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly readAloud: boolean;
}) {
  const [resource, reload] = useApiAtom(recapAtom({ campaignId, sessionId }));

  if (resource.state === "loading") return <Loading label="Reading the night back…" />;
  if (resource.state === "failed") {
    return <FailureNotice failure={resource.failure} onRetry={reload} />;
  }

  const recap = resource.value;

  return (
    <RecapDocument
      beats={recap.beats}
      notes={recap.notes}
      prepDone={recap.prepDone}
      ticked="Questions you answered"
      fights={recap.fights.length > 0 ? <Fights fights={recap.fights} /> : null}
      readAloud={readAloud}
    />
  );
}
