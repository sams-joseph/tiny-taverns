import { cn } from "../../lib/utils";

/**
 * Which band a hit-point fraction sits in: the one rule every hit-point bar's
 * colour reads, and every word a screen says about who is hurting (the Party
 * header's *"is down"* and *"is low"*), so no two can name different thresholds.
 *
 * The bands are the encounter runner drawing's (`Encounter Runner.dc.html`,
 * `hpColor`): `down` is exactly zero, `low` is at or below half, `well` is above
 * half. That one drawing colours the initiative strip, the tokens and the panel
 * alike, which is why the sheet and Party follow it rather than keep steps of
 * their own.
 */
export type HpBand = "down" | "low" | "well";

export const hpBand = (fraction: number): HpBand =>
  fraction <= 0 ? "down" : fraction <= 0.5 ? "low" : "well";

/** The fill per band, by semantic slot so a palette change does not date it. */
const BAND_FILL: Readonly<Record<HpBand, string>> = {
  down: "bg-danger",
  low: "bg-accent",
  well: "bg-success",
};

export interface HpBarProps {
  /** Current over max, already clamped to 0–1 by the reader that knows the nulls. */
  readonly fraction: number;
  /** The track's size where a surface draws it thinner or narrower. */
  readonly className?: string;
}

/**
 * The hit-point bar on its own. Presentational: the number beside it is the
 * reader's, so the bar is hidden from assistive tech.
 */
function HpBar({ fraction, className }: HpBarProps) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <div
      data-slot="hp-bar"
      aria-hidden="true"
      className={cn("h-2 overflow-hidden rounded-pill bg-surface-sunken", className)}
    >
      <div
        data-slot="hp-fill"
        className={cn(
          "h-full transition-[width] duration-(--dur-base) ease-out",
          BAND_FILL[hpBand(clamped)],
        )}
        // A percentage of the track, which is the one measurement that cannot
        // come from a token: it is the datum.
        style={{ width: `${String(Math.round(clamped * 100))}%` }}
      />
    </div>
  );
}

export { HpBar };
