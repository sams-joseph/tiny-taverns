import { Icon, SectionHeading, cn } from "@taverns/ui";
import { DICE, TONE_TEXT, type DmDice } from "./dice";
import { dmLines } from "./rollsLog";

/**
 * The DM's dice in a scene: the seven dice, and the newest six things the DM
 * rolled, from a die or from a card — kept by the server as the DM's own, so a
 * reload and a second tab show the same six (`run/dice.ts`). A fight's are in
 * its *Rolls* dock (`RollsDock.tsx`).
 */

const SHOWN = 6;

export function DmDiceCard({ dice }: { readonly dice: DmDice }) {
  const lines = dmLines(dice.rolls).slice(0, SHOWN);
  const roll = dice.roll;
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
      {roll !== undefined && (
        <div className="grid grid-cols-7 gap-1">
          {DICE.map((die) => (
            <button
              key={die}
              type="button"
              aria-label={`Roll a ${die}`}
              onClick={() => roll(die, `1${die}`)}
              className="h-control-sm cursor-pointer rounded-control border border-strong bg-surface-sunken font-mono text-mono font-medium text-foreground transition-control outline-none hover:bg-surface-raised focus-visible:ring-focus"
            >
              {die}
            </button>
          ))}
        </div>
      )}
      {lines.length === 0 ? (
        <p className="text-body-s leading-body text-faint">
          Rolls show up here. Tap a die, a stat or an attack.
        </p>
      ) : (
        <ol aria-label="Your rolls" className="flex flex-col gap-1.5">
          {lines.map((roll, index) => (
            <li
              key={roll.key}
              className={`flex items-center gap-2 rounded-control bg-surface-sunken px-2.5 py-2 ${
                index === 0 ? "" : "opacity-70"
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-body-s leading-snug text-foreground">
                {roll.label}
              </span>
              <span className="font-mono text-micro leading-none whitespace-nowrap text-faint">
                {roll.detail}
              </span>
              <span
                className={cn(
                  "min-w-7 text-right font-display text-subtitle leading-none font-semibold",
                  TONE_TEXT[roll.tone],
                )}
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
