import type { Encounter, EncounterDifficulty } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cardLinkClassName,
  Icon,
} from "@taverns/ui";

/**
 * One authored encounter, as `CampaignHome.jsx` draws it.
 *
 * **"On the table now"** is a property of the *session*, not of this row —
 * `Encounter.ts` says why: one pointer, so two encounters cannot both claim the
 * table. So it arrives as a prop from the screen, which found the session's one
 * unended `encounter_run`; there is no field on `Encounter` to read it from and
 * there should not be.
 *
 * The prototype's other line, **"6 creatures"**, is `Encounter.creatureCount` —
 * `sum(encounter_creature.count)` computed per read, over the roster *this
 * actor can see*. It leads the description because it is what the prototype
 * puts there and what tells a DM whether an encounter is finished. The note
 * count follows it when there is one, which the Notes tab has already loaded.
 *
 * Zero creatures is written out rather than shown as "0 creatures": an
 * encounter with an empty roster is one the DM has not finished, and the card
 * saying so is the whole reason the number is on it.
 */

/**
 * The computed difficulty band, coloured (`EncounterDifficulty.ts` — the DMG
 * method over the roster's XP and the seated party, never the DM's pick).
 *
 * The prototype maps three (`CampaignHome.jsx:13`): Deadly destructive, Medium
 * default, Easy success. `Hard` completes the band and needs a step between
 * Medium and Deadly — so it takes the *soft* half of the same crimson family
 * Deadly fills solid, which is what the `--danger-soft` / `--danger-ink` pair
 * exists for. `Trivial`, below Easy, is the quiet neutral. Read down the grid
 * it escalates neutral → soft success → accent → soft danger → solid danger.
 *
 * Unrated is its own thing rather than a missing badge: an encounter the rule
 * cannot rate yet is information, and `describeDifficulty` says why.
 */
export function DifficultyBadge({ difficulty }: { readonly difficulty: EncounterDifficulty }) {
  if (difficulty._tag === "unrated") {
    return <Badge variant="outline">Unrated</Badge>;
  }
  switch (difficulty.band) {
    case "Trivial":
      return <Badge variant="secondary">Trivial</Badge>;
    case "Easy":
      return <Badge variant="success">Easy</Badge>;
    case "Medium":
      return <Badge>Medium</Badge>;
    case "Hard":
      return (
        <Badge variant="outline" className="border-transparent bg-danger-soft text-danger-ink">
          Hard
        </Badge>
      );
    default:
      return <Badge variant="destructive">Deadly</Badge>;
  }
}

/** "6 creatures", or that there are none yet. */
export const describeRoster = (encounter: Encounter): string =>
  encounter.creatureCount === 0
    ? "No creatures yet"
    : `${encounter.creatureCount} ${encounter.creatureCount === 1 ? "creature" : "creatures"}`;

/** "6 creatures · 1 note" — the roster first, because it is what the card is for. */
const describe = (encounter: Encounter, noteCount: number): string => {
  const creatures = describeRoster(encounter);
  return noteCount === 0
    ? creatures
    : `${creatures} · ${noteCount} ${noteCount === 1 ? "note" : "notes"}`;
};

export function EncounterCard({
  encounter,
  noteCount,
  running,
  onEdit,
  onRun,
}: {
  readonly encounter: Encounter;
  readonly noteCount: number;
  /** This is the fight on the table right now — `CampaignHome.jsx:21-25`. */
  readonly running: boolean;
  readonly onEdit: () => void;
  /**
   * Put it on the table, or go back to it.
   *
   * The prototype makes the whole card clickable for this. Here the card's face
   * opens the encounter's own page instead — a card stands for its object —
   * and *Run* stays a button above that link, as the pencil does.
   */
  readonly onRun: () => void;
}) {
  return (
    <Card linked className={running ? "h-full border-accent" : "h-full"}>
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <CardTitle className="flex-1">
            <Link
              to="/campaigns/$campaignId/encounters/$encounterId"
              params={{ campaignId: encounter.campaignId, encounterId: encounter.id }}
              data-card-link
              className={cardLinkClassName}
            >
              {encounter.name}
            </Link>
          </CardTitle>
          <DifficultyBadge difficulty={encounter.difficulty} />
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-1 size-7 shrink-0"
            aria-label={`Edit ${encounter.name}`}
            onClick={onEdit}
          >
            <Icon name="pencil" size={14} />
          </Button>
        </div>
        <CardDescription>{describe(encounter, noteCount)}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-wrap items-center gap-1.5">
        {encounter.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
        {/* Every row defaults to `dm`, so the exception is what is worth marking:
            this one is visible to players. */}
        {encounter.visibility === "shared" && <Badge variant="info">Shared</Badge>}
        {/* Named for its encounter, as the pencil beside it already is: a grid
            of these is a page of identical *Run* buttons otherwise, and which
            fight goes on the table is exactly what the name has to say. The
            visible word leads, verbatim, so the accessible name still contains
            what a voice-control user would say. */}
        <Button
          variant={running ? "secondary" : "outline"}
          size="sm"
          className="ml-auto"
          aria-label={running ? `On the table now — ${encounter.name}` : `Run ${encounter.name}`}
          onClick={onRun}
        >
          <Icon name="swords" size={13} />
          {running ? "On the table now" : "Run"}
        </Button>
      </CardContent>
    </Card>
  );
}
