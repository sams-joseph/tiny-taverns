import type { EncounterDifficulty } from "@taverns/api";

export type Rated = Extract<EncounterDifficulty, { readonly _tag: "rated" }>;

/**
 * The five bands as one bar, each as wide as the XP it spans for *this* party,
 * with a mark at the encounter's adjusted XP.
 *
 * The bar runs to a quarter past Deadly's threshold: the drawing's bar is the
 * same party-of-four-at-fifth-level thresholds over 5,500 XP, which is exactly
 * that, so this draws the drawing's proportions for its party and the right
 * ones for any other. It is a picture of the line above it, which says the band
 * and the number, so it is hidden from assistive technology.
 *
 * One meter for a saved encounter and one being written: the preview draws the
 * row the server rated, the builder's difficulty card the draft's band as the
 * roster moves, which is why the mark slides rather than jumps.
 */
export function DifficultyMeter({ difficulty }: { readonly difficulty: Rated }) {
  const { easy, medium, hard, deadly } = difficulty.thresholds;
  const top = deadly * 1.25;
  const bands = [
    { name: "Trivial", span: easy, fill: "bg-surface-sunken" },
    { name: "Easy", span: medium - easy, fill: "bg-success/35" },
    { name: "Medium", span: hard - medium, fill: "bg-info/35" },
    { name: "Hard", span: deadly - hard, fill: "bg-accent/40" },
    { name: "Deadly", span: top - deadly, fill: "bg-danger/40" },
  ];
  const at = Math.min(98, Math.max(2, (difficulty.adjustedXp / top) * 100));
  return (
    <div aria-hidden="true" data-slot="difficulty-meter" className="relative pt-1">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-pill">
        {bands.map((band) => (
          <div
            key={band.name}
            className={`basis-0 ${band.fill}`}
            style={{ flexGrow: Math.max(band.span, 1) }}
          />
        ))}
      </div>
      <div
        data-slot="difficulty-mark"
        className="absolute top-0 -ml-px h-4 w-0.75 rounded-pill bg-heading ring-2 ring-surface-card transition-[left] duration-(--dur-base) ease-out"
        style={{ left: `${at.toFixed(1)}%` }}
      />
      <div className="mt-2 flex gap-0.5 text-micro leading-none font-medium text-faint">
        {bands.map((band) => (
          <span
            key={band.name}
            className="min-w-0 basis-0 truncate"
            style={{ flexGrow: Math.max(band.span, 1) }}
          >
            {band.name}
          </span>
        ))}
      </div>
    </div>
  );
}
