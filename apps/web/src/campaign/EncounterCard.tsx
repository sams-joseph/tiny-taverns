import type { Difficulty, Encounter } from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
 * The DMG difficulty band, coloured.
 *
 * The prototype maps three (`CampaignHome.jsx:13`): Deadly destructive, Medium
 * default, Easy success. `Hard` completes the band and needs a step between
 * Medium and Deadly — so it takes the *soft* half of the same crimson family
 * Deadly fills solid, which is what the `--danger-soft` / `--danger-ink` pair
 * exists for. Read down the grid it escalates soft success → accent → soft
 * danger → solid danger.
 *
 * Unrated is its own thing rather than a missing badge: a sketched encounter the
 * DM has not weighed yet is information.
 */
function DifficultyBadge({ difficulty }: { readonly difficulty: Difficulty | null }) {
  if (difficulty === null) {
    return <Badge variant="outline">Unrated</Badge>;
  }
  switch (difficulty) {
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

/** "6 creatures · 1 note" — the roster first, because it is what the card is for. */
const describe = (encounter: Encounter, noteCount: number): string => {
  const creatures =
    encounter.creatureCount === 0
      ? "No creatures yet"
      : `${encounter.creatureCount} ${encounter.creatureCount === 1 ? "creature" : "creatures"}`;
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
   * The prototype makes the whole card clickable for this. It stays a button
   * here: the card already carries a pencil, and a card that is itself a
   * control with another control inside it is a keyboard trap and an
   * accessibility problem — the prototype's inline `onClick` on a `<div>` is
   * the visual specification, not the interaction.
   */
  readonly onRun: () => void;
}) {
  return (
    <Card className={running ? "h-full border-accent" : "h-full"}>
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <CardTitle className="flex-1">{encounter.name}</CardTitle>
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
        <Button
          variant={running ? "default" : "outline"}
          size="sm"
          className="ml-auto"
          onClick={onRun}
        >
          <Icon name="swords" size={13} />
          {running ? "On the table now" : "Run"}
        </Button>
      </CardContent>
    </Card>
  );
}
