import { cn } from "@taverns/ui";
import type { ReactNode } from "react";

/**
 * Where the fight's cards go, at every width of `main` (a container query, as
 * every layout that depends on a column's width is).
 *
 * The redesign draws three columns — initiative, the battle map, the selected
 * creature's card with the DM's dice under it — as a flex wrap, which leaves
 * blanks as it narrows: at 1024 the card drops under the list with ~580px of
 * nothing beside it, and at 760 the list stands alone with ~350px beside it.
 * So this is a grid of named areas that re-deals the same cards instead:
 *
 * - **`@7xl` and up** (1280px of content): initiative | map | aside, the drawn
 *   composition, the two side columns at the inspector's width.
 * - **`@2xl` to `@7xl`**: the map across the top at full width, where its
 *   squares are big enough to read, then initiative | aside under it.
 * - **Below `@2xl`** (a phone): one column in the order it is used —
 *   initiative, the selected card, the map, then everything else.
 *
 * The aside is two areas, `card` and `rest`, because the phone puts the map
 * between them. The last row is `1fr` so the tall spanning column (the list, or
 * the list and the map) grows that row, not the card's, and the aside's cards
 * stay stacked with no gap between them. Every item sits at its own height and
 * the window is the only scroller.
 *
 * With no board there is no map area, and the two-column arrangement holds at
 * every width above a phone rather than leaving the middle column empty.
 */
export function RunLayout({
  initiative,
  map,
  card,
  rest,
}: {
  readonly initiative: ReactNode;
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
        withMap
          ? [
              "[grid-template-areas:'init'_'card'_'map'_'rest']",
              "@2xl:grid-cols-[minmax(0,1fr)_var(--spacing-aside)] @2xl:grid-rows-[auto_auto_1fr]",
              "@2xl:[grid-template-areas:'map_map'_'init_card'_'init_rest']",
              "@7xl:grid-cols-[var(--spacing-aside)_minmax(0,1fr)_var(--spacing-aside)] @7xl:grid-rows-[auto_1fr]",
              "@7xl:[grid-template-areas:'init_map_card'_'init_map_rest']",
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
