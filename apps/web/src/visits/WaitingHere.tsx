import type { CampaignId, EncounterId, LevelVisitEncounter } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Button, Icon } from "@taverns/ui";

/**
 * The encounters placed on a visit's level and not yet played
 * (`LevelVisit.encounters`), as the DM's stage lists them in its *Waiting
 * here* drawer: each one's name, opening the encounter, how many of its
 * creatures wait, whether it has a trigger area, and which creatures cannot
 * stand where they were put on this copy of the level (past its edge, or on a
 * square the copy blocks), by name, so the DM moves them on the encounter's
 * page. One the party has noticed (`LevelVisitEncounter.noticed`) is marked
 * *In sight*, with *Start*, the start flow the stage's prompt opens: the
 * prompt's *Not yet* only closes the prompt, so nothing is lost here.
 */
export function WaitingHere({
  campaignId,
  encounters,
  onStart,
}: {
  readonly campaignId: CampaignId;
  readonly encounters: ReadonlyArray<LevelVisitEncounter>;
  /** Open the start flow for a noticed encounter; absent while a fight holds the visit. */
  readonly onStart: ((encounterId: EncounterId) => void) | undefined;
}) {
  if (encounters.length === 0) {
    return (
      <p className="text-body-s leading-body text-muted-foreground">
        No encounter waits on this level. Place one from its page, on its battle map.
      </p>
    );
  }
  return (
    <ul data-slot="waiting-here" className="flex flex-col gap-3">
      {encounters.map((encounter) => {
        const stuck = encounter.creatures.filter((creature) => creature.problem !== null);
        const count = encounter.creatures.length;
        return (
          <li key={encounter.id} className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <Link
                to="/campaigns/$campaignId/encounters/$encounterId"
                params={{ campaignId, encounterId: encounter.id }}
                hash="placement"
                className="min-w-0 font-sans text-body leading-body font-semibold text-link hover:text-link-hover"
              >
                {encounter.name}
              </Link>
              {encounter.noticed && (
                <Badge variant="destructive" data-slot="waiting-in-sight">
                  <Icon name="eye" size={12} />
                  In sight
                </Badge>
              )}
            </span>
            <span className="text-body-s leading-body text-muted-foreground">
              {count === 0
                ? "A trigger area, with no creature placed"
                : `${String(count)} ${count === 1 ? "creature waits" : "creatures wait"}${
                    encounter.trigger === null ? "" : ", with a trigger area"
                  }`}
            </span>
            {stuck.length > 0 && (
              <span className="flex items-start gap-1.5 text-body-s leading-body text-danger-ink">
                <Icon name="triangle-alert" size={14} className="mt-0.5 shrink-0" />
                <span>
                  Needs moving:{" "}
                  {stuck
                    .map(
                      (creature) =>
                        `${creature.name} (${creature.problem === "offBoard" ? "past the edge" : "nothing can stand there"})`,
                    )
                    .join(", ")}
                </span>
              </span>
            )}
            {encounter.noticed && onStart !== undefined && (
              <span>
                <Button size="sm" onClick={() => onStart(encounter.id)}>
                  <Icon name="swords" size={13} />
                  Start
                </Button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
