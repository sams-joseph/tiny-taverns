import type { Creature, CreatureId, CreatureSort } from "@taverns/api";
import type { ReactNode } from "react";
import { FilterBar, FilterBox, FilterSelect, type FilterOption } from "../library/filters";
import { CreatureCard } from "./CreatureCard";
import type { Corpus } from "./corpus";
import type { CorpusView } from "./load";

/**
 * The furniture both creature lists draw, written once.
 *
 * The campaign bestiary and the Library are two reads over one corpus, and
 * `corpus.ts` is where the *behaviour* they share lives. This is the rest of
 * it: the filter bar and the grid. Only the shell, the copy and the empty
 * states differ between the two screens, which is what those files are.
 *
 * **`CreatureFilters` is the unified filter box applied to the richest
 * corpus.** Every facet the old chip wall (and the row of dropdowns after it)
 * offered is still expressible — nine any-of facets, the CR range and the two
 * booleans — as tokens of the one search-and-filter input, whose schema
 * `corpus.ts` builds from the server's vocabulary read.
 *
 * Nothing here writes. The authoring the Library has lives in `CreatureForm`
 * and reaches the grid as one optional per-row callback; the campaign bestiary
 * passes none, because what it lists are copies and it has never been an
 * authoring surface.
 */

const SORTS: ReadonlyArray<FilterOption> = [
  { value: "cr", label: "CR" },
  { value: "name", label: "Name" },
  { value: "recent", label: "Recent" },
];

/**
 * The whole filter row: the unified box, then the sort. The clear affordance
 * and the "Looking…" whisper are `FilterBar`'s own.
 *
 * `label` is on the box rather than baked in, because "Search creatures" and
 * "Search the library" are the same control asking about different sets and a
 * reader should be told which.
 */
export function CreatureFilters<V extends CorpusView>({
  corpus,
  label,
  actions,
}: {
  readonly corpus: Corpus<V>;
  readonly label: string;
  /** The tab's own write action(s), forwarded to `FilterBar`'s slot. */
  readonly actions?: ReactNode;
}) {
  return (
    <FilterBar
      narrowed={corpus.narrowed}
      onClear={corpus.clear}
      busy={corpus.resource.state === "loading" && corpus.shown !== undefined}
      actions={actions}
    >
      <FilterBox label={label} list={corpus.list} facets={corpus.facets} />
      <FilterSelect
        label="Sort"
        value={corpus.sort}
        onChange={(value) => corpus.setSort(value as CreatureSort)}
        options={SORTS}
        className="w-32"
      />
    </FilterBar>
  );
}

/**
 * The grid.
 *
 * The column's width, not the viewport's — `main` is the container. The
 * prototype fills at `minmax(300px, 1fr)`: with a `gap-4` two cards need 616px
 * and three need 932px, which is where `@2xl` (672) and `@5xl` (1024) are the
 * first steps that fit.
 */
export function CreatureGrid({
  creatures,
  onEdit,
  onOpen,
}: {
  readonly creatures: ReadonlyArray<Creature>;
  /**
   * How to edit a row, **per row** — `undefined` for one this reader may not
   * write, which in the Library is every bundled creature and in the campaign
   * bestiary is all of them.
   *
   * A function of the creature rather than one handler for the grid, because
   * whether a row is editable is a fact about the row (`accountId`) and the card
   * draws the button only when it is handed one.
   */
  readonly onEdit?: (creature: Creature) => (() => void) | undefined;
  readonly onOpen: (id: CreatureId) => void;
}) {
  return (
    <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
      {creatures.map((creature) => (
        <CreatureCard
          key={creature.id}
          creature={creature}
          onEdit={onEdit?.(creature)}
          onOpen={() => onOpen(creature.id)}
        />
      ))}
    </div>
  );
}
