import { Icon, cn } from "@taverns/ui";
import { useState } from "react";
import { DICE, TONE_TEXT, type DmDice } from "./dice";
import type { DockLine } from "./rollsLog";

/**
 * The fight's *Rolls* dock (`Encounter Runner.dc.html`): one collapsible card
 * for everything rolled or taken at the table — the DM's own dice and attacks,
 * the players' tray and the night's hits, heals, saves and conditions, merged
 * by `rollsLog.ts`. Folded, it is the latest line, large, over the seven dice;
 * open, the twelve before it stand above that.
 *
 * On the canvas it sits bottom left on the HUD and its region scrolls itself
 * (`RunStage.tsx`); in the narrow grid it is a card like the rest, at its
 * natural height.
 */

/** The drawing's older lines, under the latest. */
const OLDER = 12;

function Line({ line, latest }: { readonly line: DockLine; readonly latest: boolean }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "mb-0 truncate leading-snug font-medium text-heading",
            latest ? "text-label" : "text-caption",
          )}
        >
          {line.label}
        </p>
        {line.detail !== "" && (
          <p className="mb-0 truncate font-mono text-micro leading-snug text-muted-foreground">
            {line.detail}
          </p>
        )}
      </div>
      {line.total !== undefined && (
        <span
          className={cn(
            "shrink-0 font-sans leading-none font-semibold whitespace-nowrap",
            latest ? "text-display-s" : "text-mono-l",
            TONE_TEXT[line.tone],
          )}
        >
          {line.total}
        </span>
      )}
    </>
  );
}

export function RollsDock({
  lines,
  dice,
}: {
  /** Newest first (`dockLines`). */
  readonly lines: ReadonlyArray<DockLine>;
  readonly dice: DmDice;
}) {
  const [open, setOpen] = useState(false);
  const [latest, ...rest] = lines;
  const older = rest.slice(0, OLDER);
  const roll = dice.roll;

  return (
    <section
      aria-label="Rolls"
      className="flex flex-col rounded-card border border-strong bg-surface-card shadow-3"
    >
      <button
        type="button"
        data-slot="rolls-toggle"
        aria-expanded={open}
        onClick={() => setOpen((now) => !now)}
        className="flex h-control items-center gap-2 px-3 text-left text-label leading-none font-semibold text-heading outline-none focus-visible:ring-focus"
      >
        <Icon name="dices" size={16} className="text-muted-foreground" />
        <span className="flex-1">Rolls</span>
        <span className="text-label-s leading-none font-normal text-muted-foreground">
          {open ? "Hide log" : `${String(lines.length)} in log`}
        </span>
        <Icon
          name={open ? "chevron-down" : "chevron-up"}
          size={15}
          className="text-muted-foreground"
        />
      </button>
      {open && older.length > 0 && (
        <ol aria-label="Earlier rolls" className="mb-0 flex flex-col border-t border-hairline">
          {older.map((line) => (
            <li
              key={line.key}
              className="flex items-center gap-2.5 border-b border-hairline px-3 py-1.5 last:border-b-0"
            >
              <Line line={line} latest={false} />
            </li>
          ))}
        </ol>
      )}
      <div
        role="status"
        aria-label="Latest roll"
        className="flex min-h-control items-center gap-2.5 border-t border-hairline bg-surface-page px-3 py-2.5"
      >
        {latest === undefined ? (
          <p className="mb-0 text-caption leading-body text-muted-foreground">
            Nothing rolled yet. Tap a die, an attack or a stat; the table's rolls and every hit land
            here too.
          </p>
        ) : (
          <Line line={latest} latest />
        )}
      </div>
      {roll !== undefined && (
        <div className="flex gap-1 border-t border-hairline p-2">
          {DICE.map((die) => (
            <button
              key={die}
              type="button"
              aria-label={`Roll a ${die}`}
              onClick={() => roll(die, `1${die}`)}
              className="h-control-sm min-w-0 flex-1 cursor-pointer rounded-control border border-strong bg-surface-sunken font-mono text-label-s font-medium text-foreground transition-control outline-none hover:bg-surface-raised focus-visible:ring-focus"
            >
              {die}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
