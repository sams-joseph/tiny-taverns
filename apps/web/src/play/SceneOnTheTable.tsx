import { type EncounterKind, NEUTRAL_RUN_NAMES } from "@taverns/api";
import { Card, CardContent, CardHeader, CardTitle } from "@taverns/ui";

/** What the table is asked to do in each kind of scene — the only instruction a player gets. */
const ASKED: Readonly<Record<Exclude<EncounterKind, "combat">, string>> = {
  social: "Talk it through in character. Roll when the DM calls for a check.",
  challenge: "Roll when the DM calls for a check.",
  hazard: "Roll your saving throw when the DM calls for one.",
};

/**
 * A conversation, a skill challenge or a hazard, as a player's table shows it
 * in place of the initiative order it does not have.
 *
 * **Its kind and nothing of it** (the captain's decision of 2026-09-25): the
 * read-aloud beside it and the player's own rolls are the rest of what a
 * player has of a scene. There is no field on the wire for its DC, targets,
 * tally, attitude or beats (`PlayerLiveFight.mode`), so none is drawn here.
 * The title is the kind's neutral name ("A skill challenge") because the
 * table never carries the encounter's name.
 */
export function SceneOnTheTable({ mode }: { readonly mode: Exclude<EncounterKind, "combat"> }) {
  return (
    <Card>
      <CardHeader>
        <span className="text-caption font-medium tracking-caps uppercase text-faint">
          On the table
        </span>
        <CardTitle>{NEUTRAL_RUN_NAMES[mode]}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="max-w-measure text-body-s leading-body text-muted-foreground">
          {ASKED[mode]}
        </p>
      </CardContent>
    </Card>
  );
}
