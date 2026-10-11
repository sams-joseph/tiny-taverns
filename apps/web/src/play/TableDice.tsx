import type { CharacterSheet, Roll, RollMode } from "@taverns/api";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@taverns/ui";
import { rollAbilityCheck, rollDetail } from "../characters/rolls";
import { SaveFailure } from "../ui/form";
import type { TableRolls } from "./tableRolls";

/**
 * The player's dice, the *Rolls* region of their table (bottom left on the
 * canvas, as the DM's dock is): how the next d20 is rolled, a check for each
 * ability, and the tray of what they rolled tonight. Other players' trays are
 * not on this table.
 */
export function TableDice({
  sheet,
  mode,
  onMode,
  rolls,
  dice,
}: {
  /** Your seated character's sheet; no checks without one. */
  readonly sheet: CharacterSheet | undefined;
  readonly mode: RollMode;
  readonly onMode: (mode: RollMode) => void;
  readonly rolls: ReadonlyArray<Roll>;
  readonly dice: TableRolls;
}) {
  return (
    <Card role="region" aria-label="Your rolls">
      <CardHeader>
        <CardTitle>Your rolls</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Roll the next d20 with">
          {(["normal", "advantage", "disadvantage"] as const).map((each) => (
            <Button
              key={each}
              size="sm"
              variant={mode === each ? "secondary" : "ghost"}
              aria-pressed={mode === each}
              onClick={() => onMode(each)}
            >
              {each === "normal" ? "Normal" : each === "advantage" ? "Advantage" : "Disadvantage"}
            </Button>
          ))}
        </div>
        {sheet !== undefined && sheet.abilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ability checks">
            {sheet.abilities.slice(0, 6).map((ability) => (
              <Button
                key={ability.label}
                size="sm"
                variant="outline"
                onClick={() =>
                  dice.file(rollAbilityCheck(`${ability.label} check`, ability.modifier, mode))
                }
              >
                {ability.label}
              </Button>
            ))}
          </div>
        )}
        {dice.failure !== undefined && <SaveFailure failure={dice.failure} />}
      </CardContent>
      <div aria-label="Dice tray" role="log">
        {dice.pending.map((roll) => (
          <TrayLine
            key={roll.localId}
            label={roll.label}
            total={roll.total}
            detail={`${rollDetail(roll)} · ${roll.message}`}
          />
        ))}
        {rolls.map((roll) => (
          <TrayLine
            key={roll.id}
            label={roll.label}
            total={roll.total}
            detail={`${roll.notation} · dice ${roll.dice.join(", ")}${
              roll.kept.length !== roll.dice.length ? ` · kept ${roll.kept.join(", ")}` : ""
            }`}
          />
        ))}
        {dice.pending.length === 0 && rolls.length === 0 && (
          <p className="mb-0 border-t border-hairline px-card py-3 text-body-s text-muted-foreground">
            Your rolls for this live table appear here. Other players' tray is not shown.
          </p>
        )}
      </div>
    </Card>
  );
}

function TrayLine({
  label,
  total,
  detail,
}: {
  readonly label: string;
  readonly total: number;
  readonly detail: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-card py-2">
      <span className="text-body-s font-medium text-foreground">{label}</span>
      <span className="text-body-s text-accent-ink">{String(total)}</span>
      <span className="text-caption text-muted-foreground">{detail}</span>
    </div>
  );
}
