import type { Creature, CreatureId, CreatureSort } from "@taverns/api";
import { Input, Label } from "@taverns/ui";
import type { ReactNode } from "react";
import {
  FilterBar,
  FilterMultiSelect,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  type FilterOption,
} from "../library/filters";
import { CreatureCard } from "./CreatureCard";
import type { Corpus } from "./corpus";
import type { CorpusView, FacetList } from "./load";

/**
 * The furniture both creature lists draw, written once.
 *
 * The campaign bestiary and the Library are two reads over one corpus, and
 * `corpus.ts` is where the *behaviour* they share lives. This is the rest of
 * it: the filter bar and the grid. Only the shell, the copy and the empty
 * states differ between the two screens, which is what those files are.
 *
 * **`CreatureFilters` is the Library standard applied to the richest corpus.**
 * It replaced two pieces of furniture in two different places — a search box
 * and sort in the top bar, and a whole card of facet chips in the body that
 * filled the first screenful before a single creature was visible (the
 * captain's *"filtering on the creatures tab is just terrible"*). Every facet
 * the chip wall offered is still here, as the compact any-of selects the other
 * tabs use, in the one place every tab's filters now live.
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

const FACETS: ReadonlyArray<{
  readonly key: FacetList;
  readonly label: string;
  readonly values: (view: CorpusView) => ReadonlyArray<string>;
}> = [
  { key: "environments", label: "Environment", values: (view) => view.facets.environments },
  { key: "sizes", label: "Size", values: (view) => view.facets.sizes },
  { key: "types", label: "Type", values: (view) => view.facets.types },
  { key: "subtypes", label: "Subtype", values: (view) => view.facets.subtypes },
  { key: "alignments", label: "Alignment", values: (view) => view.facets.alignments },
  {
    key: "damageResistances",
    label: "Resists",
    values: (view) => view.facets.damageResistances,
  },
  {
    key: "damageImmunities",
    label: "Damage immunity",
    values: (view) => view.facets.damageImmunities,
  },
  {
    key: "conditionImmunities",
    label: "Condition immunity",
    values: (view) => view.facets.conditionImmunities,
  },
  { key: "movementModes", label: "Movement", values: (view) => view.facets.movementModes },
];

/**
 * One facet's vocabulary, grouped case-insensitively.
 *
 * The corpus really does hold `beast` and `Beast` as distinct values — the
 * starter bundle spells types lowercase and the SRD capitalises them — and a
 * chip per spelling read as a data bug on screen. A *filter* meaning "beasts"
 * means both, so one option stands for the group and choosing it sends every
 * raw spelling; the predicate is any-of, so widening the value list is exactly
 * what the reader asked for.
 */
const grouped = (
  vocabulary: ReadonlyArray<string>,
): {
  readonly options: ReadonlyArray<FilterOption>;
  readonly raws: ReadonlyMap<string, ReadonlyArray<string>>;
} => {
  const raws = new Map<string, Array<string>>();
  for (const value of vocabulary) {
    const key = value.toLowerCase();
    const entry = raws.get(key);
    if (entry === undefined) raws.set(key, [value]);
    else entry.push(value);
  }
  const options = [...raws.keys()].map((key) => ({
    value: key,
    label: (key[0]?.toUpperCase() ?? "") + key.slice(1),
  }));
  return { options, raws };
};

const groupKeysOf = (selected: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(selected.map((value) => value.toLowerCase())),
];

function FacetSelect<V extends CorpusView>({
  corpus,
  facet,
}: {
  readonly corpus: Corpus<V>;
  readonly facet: (typeof FACETS)[number];
}) {
  const view = corpus.shown;
  if (view === undefined) return null;
  const vocabulary = facet.values(view);
  if (vocabulary.length === 0) return null;
  const { options, raws } = grouped(vocabulary);
  return (
    <FilterMultiSelect
      label={facet.label}
      values={groupKeysOf(corpus[facet.key])}
      onChange={(keys) =>
        corpus.setFacet(
          facet.key,
          keys.flatMap((key) => raws.get(key) ?? [key]),
        )
      }
      options={options}
      // Wide enough that the two long facet names read whole in the trigger.
      className={facet.label.length > 10 ? "w-48" : "w-40"}
    />
  );
}

/**
 * The whole filter row, in the standard order: search, sort, the facets, the
 * numeric range, the boolean toggles. The clear affordance and the "Looking…"
 * whisper are `FilterBar`'s own.
 *
 * `label` is on the search box rather than baked in, because "Search creatures"
 * and "Search the library" are the same control asking about different sets and
 * a reader should be told which.
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
  const view = corpus.shown;
  return (
    <FilterBar
      narrowed={corpus.narrowed}
      onClear={corpus.clear}
      busy={corpus.resource.state === "loading" && view !== undefined}
      actions={actions}
    >
      <FilterSearch label={label} value={corpus.term} onChange={corpus.setTerm} />
      <FilterSelect
        label="Sort"
        value={corpus.sort}
        onChange={(value) => corpus.setSort(value as CreatureSort)}
        options={SORTS}
        className="w-32"
      />
      {FACETS.map((facet) => (
        <FacetSelect key={facet.key} corpus={corpus} facet={facet} />
      ))}
      {view !== undefined && (
        <div className="flex items-center gap-1.5">
          <Label className="text-faint">CR</Label>
          <Input
            aria-label="Minimum challenge rating"
            inputMode="decimal"
            placeholder={view.facets.crMin === null ? "Min" : `Min ${String(view.facets.crMin)}`}
            value={corpus.crMin}
            onChange={(event) => corpus.setCrMin(event.target.value)}
            className="h-control-sm w-20"
          />
          <Input
            aria-label="Maximum challenge rating"
            inputMode="decimal"
            placeholder={view.facets.crMax === null ? "Max" : `Max ${String(view.facets.crMax)}`}
            value={corpus.crMax}
            onChange={(event) => corpus.setCrMax(event.target.value)}
            className="h-control-sm w-20"
          />
        </div>
      )}
      {view?.facets.legendary === true && (
        <FilterToggle
          pressed={corpus.legendary === true}
          onChange={(pressed) => corpus.setLegendary(pressed ? true : undefined)}
        >
          Legendary
        </FilterToggle>
      )}
      {view?.facets.spellcaster === true && (
        <FilterToggle
          pressed={corpus.spellcaster === true}
          onChange={(pressed) => corpus.setSpellcaster(pressed ? true : undefined)}
        >
          Spellcaster
        </FilterToggle>
      )}
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
