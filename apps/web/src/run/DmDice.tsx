import { Icon, SectionHeading } from "@taverns/ui";
import type { LocalRoll } from "../characters/rolls";
import type { DmDice } from "./dice";

/**
 * The DM's dice card: the seven dice, and what the DM rolled here, from a die
 * or from the selected card (`run/dice.ts` says why none of it is sent).
 */

const DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"] as const;

/** `1d20+4 [10]`: the notation and the faces, which is what a DM checks a total against. */
const faces = (roll: LocalRoll): string => `${roll.notation} [${roll.dice.join(", ")}]`;

export function DmDiceCard({ dice }: { readonly dice: DmDice }) {
  return (
    <section
      aria-label="Dice"
      className="flex flex-col gap-3 rounded-card border border-hairline bg-surface-card p-panel shadow-1"
    >
      <div className="flex items-center gap-2">
        <Icon name="dices" size={15} className="text-muted-foreground" />
        <SectionHeading as="h3" size="title">
          Dice
        </SectionHeading>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DICE.map((die) => (
          <button
            key={die}
            type="button"
            aria-label={`Roll a ${die}`}
            onClick={() => dice.roll(die, `1${die}`)}
            className="h-control-sm cursor-pointer rounded-control border border-strong bg-surface-sunken font-mono text-mono font-medium text-foreground transition-control outline-none hover:bg-surface-raised focus-visible:ring-focus"
          >
            {die}
          </button>
        ))}
      </div>
      {dice.rolls.length === 0 ? (
        <p className="text-body-s leading-body text-faint">
          Rolls show up here. Tap a die, a stat or an attack.
        </p>
      ) : (
        <ol aria-label="Your rolls" className="flex flex-col gap-1.5">
          {dice.rolls.map((roll, index) => (
            <li
              key={roll.id}
              className={`flex items-center gap-2 rounded-control bg-surface-sunken px-2.5 py-2 ${
                index === 0 ? "" : "opacity-70"
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-body-s leading-snug text-foreground">
                {roll.label}
              </span>
              <span className="font-mono text-micro leading-none whitespace-nowrap text-faint">
                {faces(roll)}
              </span>
              <span
                className={`min-w-7 text-right font-display text-subtitle leading-none font-semibold ${
                  roll.natural === 20
                    ? "text-success"
                    : roll.natural === 1
                      ? "text-danger"
                      : "text-accent-ink"
                }`}
              >
                {roll.total}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
