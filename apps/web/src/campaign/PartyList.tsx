import type { Character } from "@taverns/api";
import { Badge, Button, Card, Icon } from "@taverns/ui";

/**
 * The Party tab: one `--row-h` row per character, hairline-separated.
 *
 * The prototype stores the whole line as a string ("Ilse — Brannoc, half-orc
 * paladin"); the model does not, and `Character.ts` says why — `descriptor` and
 * `playerName` are separate columns and the display line is assembled. So the
 * character's own name leads, in body text, and who plays them follows muted.
 *
 * `shield` is the documented glyph for a player character, and AC/HP set in the
 * mono face because numbers must column up.
 *
 * Editing is a pencil on the row, exactly as it is on a note's card, and for
 * the same reason: the row itself is not a link to anywhere, so taking its
 * click for an editor would spend an affordance a later screen wants.
 */
function Stat({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-label-s leading-none font-medium text-faint">{label}</span>
      <span className="font-mono text-mono leading-none font-medium text-foreground">{value}</span>
    </span>
  );
}

/**
 * `44 / 52`, or `52` when nobody has said where they are.
 *
 * `hpCurrent` is null until something writes it, and that is not the same as
 * full — so the row shows the one number it actually has rather than inventing
 * the pair. Once a fight has touched them, or the DM has, this is where the
 * party list stops being prep data: it is the same number the initiative row
 * is showing, written by the same transaction.
 */
const hitPoints = (current: number | null, max: number | null): string | null =>
  max === null
    ? current === null
      ? null
      : String(current)
    : current === null
      ? String(max)
      : `${String(current)} / ${String(max)}`;

export function PartyList({
  party,
  onEdit,
}: {
  readonly party: ReadonlyArray<Character>;
  readonly onEdit: (character: Character) => void;
}) {
  return (
    <Card>
      {party.map((character, index) => {
        const detail = [character.descriptor, character.playerName].filter(
          (part): part is string => part !== null && part !== "",
        );
        const hp = hitPoints(character.hpCurrent, character.hpMax);
        return (
          <div
            key={character.id}
            className={
              index === 0
                ? "flex min-h-row flex-wrap items-center gap-2.5 px-card py-2"
                : "flex min-h-row flex-wrap items-center gap-2.5 border-t border-hairline px-card py-2"
            }
          >
            <Icon name="shield" size={15} className="text-faint" />
            <span className="text-body-s leading-body text-foreground">{character.name}</span>
            {detail.length > 0 && (
              <span className="text-body-s leading-body text-muted-foreground">
                {detail.join(" · ")}
              </span>
            )}
            <span className="ml-auto flex items-center gap-4">
              {character.sheetUrl !== null && (
                // A stored link nobody can reach is the same lie as a stubbed
                // field, so the one column that names somewhere else is a real
                // one. Words rather than a glyph: the icon table grows when a
                // delivery names a glyph, and none has named this one.
                <a
                  href={character.sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-label-s leading-none font-medium text-muted-foreground underline decoration-hairline underline-offset-2 hover:text-foreground"
                >
                  Sheet
                </a>
              )}
              {character.ac !== null && <Stat label="AC" value={character.ac} />}
              {hp !== null && <Stat label="HP" value={hp} />}
              {character.tempHp > 0 && <Stat label="TEMP" value={character.tempHp} />}
              {character.conditions.map((condition) => (
                // The DM's own words, so the badge takes whatever it is given —
                // the vocabulary is open here exactly as it is on a combatant.
                <Badge key={condition} variant="secondary">
                  {condition}
                </Badge>
              ))}
              {character.visibility === "shared" && <Badge variant="info">Shared</Badge>}
              <Button
                variant="ghost"
                size="icon"
                className="-my-1 -mr-1 size-7 shrink-0"
                aria-label={`Edit ${character.name}`}
                onClick={() => onEdit(character)}
              >
                <Icon name="pencil" size={14} />
              </Button>
            </span>
          </div>
        );
      })}
    </Card>
  );
}
