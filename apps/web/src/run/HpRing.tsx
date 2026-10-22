import { type HpBand, cn, hpBand } from "@taverns/ui";
import type { ReactNode } from "react";

/** The ring per band, by the same semantic slots as `HpBar`'s fill. */
const BAND_STROKE: Readonly<Record<HpBand, string>> = {
  down: "stroke-danger",
  low: "stroke-accent",
  well: "stroke-success",
};

/** The ring's own drawing units: a circle in a 100-unit box, scaled with the disc. */
const R = 46;
const ROUND = 2 * Math.PI * R;

/**
 * A disc with its hit points drawn as a ring round it, the canvas HUD's
 * portrait (the party's, whoever is up): the fraction in `hpBand`'s colour,
 * so the ring and every bar agree on what is low. Presentational: the reader
 * says the numbers. With no exact hit points (a player told only a band)
 * the ring is the track alone.
 */
export function HpRing({
  fraction,
  className,
  children,
}: {
  /** Current over max, or `undefined` where the reader is not told them. */
  readonly fraction: number | undefined;
  /** The disc's size and its edge. */
  readonly className?: string;
  /** The disc's face: the initials, with the portrait over them. */
  readonly children: ReactNode;
}) {
  const clamped = fraction === undefined ? 0 : Math.max(0, Math.min(1, fraction));
  return (
    <span aria-hidden="true" className={cn("relative block shrink-0", className)}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth="6"
          className="stroke-surface-raised"
        />
        {fraction !== undefined && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={ROUND}
            strokeDashoffset={ROUND * (1 - clamped)}
            className={cn(
              "transition-[stroke-dashoffset] duration-(--dur-base) ease-out",
              BAND_STROKE[hpBand(clamped)],
            )}
          />
        )}
      </svg>
      <span className="absolute inset-[12%] flex items-center justify-center overflow-hidden rounded-full bg-surface-raised text-label leading-none font-semibold text-heading">
        {children}
      </span>
    </span>
  );
}
