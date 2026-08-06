import type { Character } from "@taverns/api";
import { Card, Icon } from "@taverns/ui";

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
 */
function Stat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-label-s leading-none font-medium text-faint">{label}</span>
      <span className="font-mono text-mono leading-none font-medium text-foreground">{value}</span>
    </span>
  );
}

export function PartyList({ party }: { readonly party: ReadonlyArray<Character> }) {
  return (
    <Card>
      {party.map((character, index) => {
        const detail = [character.descriptor, character.playerName].filter(
          (part): part is string => part !== null && part !== "",
        );
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
              {character.ac !== null && <Stat label="AC" value={character.ac} />}
              {character.hpMax !== null && <Stat label="HP" value={character.hpMax} />}
            </span>
          </div>
        );
      })}
    </Card>
  );
}
