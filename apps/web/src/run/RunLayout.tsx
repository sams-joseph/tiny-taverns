import { cn } from "@taverns/ui";
import type { ReactNode } from "react";

/**
 * Where the fight's cards go when it is not on the canvas (`RunStage.tsx`):
 * below `@3xl` of `main`, where the board is too small to play on, and at any
 * width for a fight with no board, which has nothing to pan. A container query,
 * as every layout that depends on a column's width is.
 *
 * The redesign drew the cards as a flex wrap, which leaves blanks as it
 * narrows (at 760 the list stood alone with ~350px beside it), so this is a
 * grid of named areas that re-deals the same cards instead:
 *
 * - **`@2xl` and up** (672px of content), while turns are taken: the
 *   initiative strip across the top, as the canvas has it, then the map at
 *   full width, where its squares are big enough to read, then the rest | the
 *   selected card under it — the rolls on the left and the card on the right,
 *   as on the canvas. With no board, the strip over rest | card.
 * - **`@2xl` and up, rolling initiative**: the map across the top, then *Roll
 *   initiative* | aside under it, since a box per row wants a column. With no
 *   board, *Roll initiative* | aside.
 * - **Below `@2xl`** (a phone): one column in the order it is used —
 *   initiative, the selected card, the map, then everything else.
 *
 * While rolling, the aside is two areas, `card` and `rest`, because the phone
 * puts the map between them. The last row is `1fr` so the tall spanning
 * column (*Roll initiative*) grows that row, not the card's, and the aside's
 * cards stay stacked with no gap between them. Every item sits at its own
 * height and the window is the only scroller.
 */
export function RunLayout({
  initiative,
  strip,
  map,
  card,
  rest,
}: {
  readonly initiative: ReactNode;
  /** Whether `initiative` is the strip, which goes across the top, or *Roll initiative*. */
  readonly strip: boolean;
  /** `null` when the fight has no board: the layout closes the gap. */
  readonly map: ReactNode | null;
  readonly card: ReactNode;
  readonly rest: ReactNode;
}) {
  const withMap = map !== null;
  return (
    <div
      data-slot="run-layout"
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] items-start gap-4",
        strip
          ? withMap
            ? [
                "[grid-template-areas:'init'_'card'_'map'_'rest']",
                "@2xl:grid-cols-[minmax(0,1fr)_var(--spacing-aside)]",
                "@2xl:[grid-template-areas:'init_init'_'map_map'_'rest_card']",
              ]
            : [
                "[grid-template-areas:'init'_'card'_'rest']",
                "@2xl:grid-cols-[minmax(0,1fr)_var(--spacing-aside)]",
                "@2xl:[grid-template-areas:'init_init'_'rest_card']",
              ]
          : withMap
            ? [
                "[grid-template-areas:'init'_'card'_'map'_'rest']",
                "@2xl:grid-cols-[minmax(0,1fr)_var(--spacing-aside)] @2xl:grid-rows-[auto_auto_1fr]",
                "@2xl:[grid-template-areas:'map_map'_'init_card'_'init_rest']",
              ]
            : [
                "[grid-template-areas:'init'_'card'_'rest']",
                "@2xl:grid-cols-[minmax(0,1fr)_var(--spacing-aside)] @2xl:grid-rows-[auto_1fr]",
                "@2xl:[grid-template-areas:'init_card'_'init_rest']",
              ],
      )}
    >
      <div className="min-w-0 [grid-area:init]">{initiative}</div>
      {withMap && <div className="min-w-0 [grid-area:map]">{map}</div>}
      <div className="min-w-0 [grid-area:card]">{card}</div>
      <div className="flex min-w-0 flex-col gap-4 [grid-area:rest]">{rest}</div>
    </div>
  );
}
