import type { CampaignId, PlayerCombatant, PlayerRecapFight, SessionId } from "@taverns/api";
import { Badge, Card, Icon, type IconName } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { FailureNotice, Loading } from "../ui/states";
import { fightStory, playerStanding } from "./fight";
import { loadPlayerRecap } from "./load";
import { Facet, RecapDocument } from "./recapParts";

/**
 * One night, as somebody who played in it is told it.
 *
 * **`recap.readAsPlayer`, and there is no path from this file to the DM's
 * read.** That is the whole safety property of this screen: `recap.read` is
 * behind the `DmActor` gate and answers whole `Combatant` rows with exact hit
 * points and armour class — reaching for it here would 404 rather than leak, but
 * the narrow endpoint exists precisely so nothing has to rely on that. See
 * `PlayerRecap.ts` for what the projection is and why it is a distinct schema
 * rather than a filter.
 *
 * ### The roll call is the one thing the DM's card does not draw
 *
 * `RecapBody`'s fight card counts (*"6 in initiative, 2 at zero"*) because the
 * DM has the initiative list on the runner and does not need it repeated. A
 * player never saw that list, so this draws it — and it is the only surface in
 * the product where `PlayerCombatant`'s two arms are rendered. **A monster
 * carries a band and no armour class; somebody at the table carries their exact
 * hit points**, which is not a leniency but the agreement a table already has:
 * that number is read out loud when the cleric decides whether to move.
 *
 * There is no `ac` in this file and no field to put one in — `PlayerRecap.ts`
 * leaves armour class off the type rather than nullable, so a disclosure here
 * would have to start by widening the contract, one repository away.
 */

/**
 * How hurt a monster is, in the three words a table already says.
 *
 * `hpBand` is derived in SQL beside the columns the query declines to select
 * (`repo/playerCombatant.ts`), so this is a rendering of the whole answer rather
 * than a rounding of a number that arrived. `down` wears the muted tone the
 * runner gives a combatant at zero; nothing is struck through, because a recap
 * reports a night rather than offering to act on it.
 */
const BAND: Record<
  "healthy" | "bloodied" | "down",
  { readonly label: string; readonly icon: IconName; readonly tone: string }
> = {
  healthy: { label: "Healthy", icon: "heart-pulse", tone: "text-muted-foreground" },
  bloodied: { label: "Bloodied", icon: "droplet", tone: "text-danger-ink" },
  down: { label: "Down", icon: "skull", tone: "text-crimson-200" },
};

function Vitals({ combatant }: { readonly combatant: PlayerCombatant }) {
  if (combatant.kind === "pc") {
    return (
      // `6/52`, the spelling `run/InitiativeList.tsx` already uses — hit points
      // are written one way in this product.
      <span className="font-mono text-mono leading-none font-medium text-muted-foreground">
        {combatant.hpCurrent}/{combatant.hpMax} hp
      </span>
    );
  }
  const band = BAND[combatant.hpBand];
  return (
    <span
      className={`flex items-center gap-1.5 text-caption leading-none font-medium ${band.tone}`}
    >
      <Icon name={band.icon} size={12} />
      {band.label}
    </span>
  );
}

function RollCall({ combatants }: { readonly combatants: ReadonlyArray<PlayerCombatant> }) {
  return (
    <ul className="flex flex-col">
      {combatants.map((combatant) => (
        <li
          key={combatant.id}
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-hairline py-1.5 first:border-t-0"
        >
          {/* The number the order was read out in. `initiativeOrder` is the
              server's and is kept — a second sort here could only disagree. */}
          <span className="w-6 shrink-0 text-right font-mono text-mono leading-none font-medium text-faint">
            {combatant.initiative}
          </span>
          <span className="text-body-s leading-body text-foreground">{combatant.displayName}</span>
          {combatant.playerName !== null && combatant.playerName !== "" && (
            <span className="text-caption leading-body text-faint">{combatant.playerName}</span>
          )}
          {combatant.conditions.map((condition) => (
            <Badge key={condition} variant="secondary">
              {condition}
            </Badge>
          ))}
          <span className="ml-auto">
            <Vitals combatant={combatant} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Fights({ fights }: { readonly fights: ReadonlyArray<PlayerRecapFight> }) {
  return (
    <Facet icon="swords" label="At the table">
      <div className="flex flex-col gap-2">
        {fights.map((fight) => {
          // The same `fightStory` the DM's card uses, which is what keeps a
          // carried fight's two rounds saying the same thing on both screens.
          const story = fightStory(fight);
          const { total, down } = playerStanding(fight);
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
              </div>
              <p className="text-body-s leading-body text-foreground">{story.state}</p>
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
              {total === 0 ? (
                // The DM may have shared the fight and none of what was in it.
                // Saying so is honest; drawing an empty list is not.
                <p className="text-caption leading-body text-faint">
                  Your DM did not share who was in it.
                </p>
              ) : (
                <>
                  <RollCall combatants={fight.combatants} />
                  <p className="text-caption leading-body text-faint">
                    {`${String(total)} in initiative${down === 0 ? "" : `, ${String(down)} down`}.`}
                  </p>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </Facet>
  );
}

/**
 * One night, read back — the player's projection, keyed on the pair that names it.
 *
 * A **record** key, which `Atom.family` compares structurally (see
 * `api/atoms.ts`). Module scope, because an atom is its own identity: built in
 * the component it would be a fresh one every render and load forever.
 */
const playerRecapAtom = Atom.family(
  ({ campaignId, sessionId }: { readonly campaignId: CampaignId; readonly sessionId: SessionId }) =>
    apiAtom(loadPlayerRecap(campaignId, sessionId)),
);

export function PlayerRecapBody({
  campaignId,
  sessionId,
  readAloud,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly readAloud: boolean;
}) {
  const [resource, reload] = useApiAtom(playerRecapAtom({ campaignId, sessionId }));

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
      // Not *"Questions you answered"*: a player did not write the checklist,
      // and "you" would name the wrong person for the same reason a `Player`
      // badge on every row of a mode's list says nothing.
      ticked="What the night settled"
      fights={recap.fights.length > 0 ? <Fights fights={recap.fights} /> : null}
      readAloud={readAloud}
    />
  );
}
