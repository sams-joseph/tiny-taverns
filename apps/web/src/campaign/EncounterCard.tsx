import type { Difficulty, Encounter } from "@taverns/api";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@taverns/ui";

/**
 * One authored encounter, as `CampaignHome.jsx` draws it.
 *
 * Two things the prototype's card shows are not on the wire and are not
 * oversights — `Encounter.ts` says why. **"6 creatures"** is
 * `sum(encounter_creature.count)` and arrives with the bestiary; a count that is
 * structurally `0` would be a worse lie than an absent line. **"On the table
 * now"** is a pointer on the session, not a flag per encounter, and arrives with
 * the live-session step. Neither is stubbed here: a card that renders data the
 * product does not have is how a scaffold survives into production.
 *
 * What is on the wire and worth the space instead: how many notes hang off this
 * encounter, which the Notes tab already loaded.
 */

/**
 * The DMG difficulty band, coloured.
 *
 * The prototype maps three (`CampaignHome.jsx:13`): Deadly destructive, Medium
 * default, Easy success. `Hard` completes the band and needs a step between
 * Medium and Deadly — so it takes the *soft* half of the same crimson family
 * Deadly fills solid, which is what the `--danger-soft` / `--danger-ink` pair
 * exists for. Read down the grid it escalates soft emerald → verdigris → soft
 * crimson → solid crimson.
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

export function EncounterCard({
  encounter,
  noteCount,
}: {
  readonly encounter: Encounter;
  readonly noteCount: number;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <CardTitle className="flex-1">{encounter.name}</CardTitle>
          <DifficultyBadge difficulty={encounter.difficulty} />
        </div>
        {noteCount > 0 && (
          <CardDescription>
            {noteCount} {noteCount === 1 ? "note" : "notes"}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="mt-auto flex flex-wrap gap-1.5">
        {encounter.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
        {/* Every row defaults to `dm`, so the exception is what is worth marking:
            this one is visible to players. */}
        {encounter.visibility === "shared" && <Badge variant="info">Shared</Badge>}
      </CardContent>
    </Card>
  );
}
