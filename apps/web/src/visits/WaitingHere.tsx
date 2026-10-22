import type { CampaignId, LevelVisitEncounter } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Icon } from "@taverns/ui";

/**
 * The encounters placed on a visit's level and not yet played
 * (`LevelVisit.encounters`), as the DM's stage lists them in its *Waiting
 * here* drawer: each one's name, opening the encounter, how many of its
 * creatures wait, whether it has a trigger area, and which creatures cannot
 * stand where they were put on this copy of the level (past its edge, or on a
 * square the copy blocks), by name, so the DM moves them on the encounter's
 * page. No start: a fight is not started from here yet.
 */
export function WaitingHere({
  campaignId,
  encounters,
}: {
  readonly campaignId: CampaignId;
  readonly encounters: ReadonlyArray<LevelVisitEncounter>;
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
            <Link
              to="/campaigns/$campaignId/encounters/$encounterId"
              params={{ campaignId, encounterId: encounter.id }}
              hash="placement"
              className="font-sans text-body leading-body font-semibold text-link hover:text-link-hover"
            >
              {encounter.name}
            </Link>
            <span className="text-body-s leading-body text-muted-foreground">
              {count} {count === 1 ? "creature waits" : "creatures wait"}
              {encounter.trigger === null ? "" : ", with a trigger area"}
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
          </li>
        );
      })}
    </ul>
  );
}
