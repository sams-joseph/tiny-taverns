import type { Creature, CreatureId, CreatureSort } from "@taverns/api";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
} from "@taverns/ui";
import { FailureNotice } from "../ui/states";
import { CreatureCard } from "./CreatureCard";
import type { Corpus } from "./corpus";
import type { CorpusView, FacetList } from "./load";

/**
 * The three pieces of furniture both creature lists draw, written once.
 *
 * The campaign bestiary and the Library are two reads over one corpus, and
 * `corpus.ts` is where the *behaviour* they share lives. This is the rest of it:
 * the search box and the sort that sit in the top bar, the chip row under it,
 * and the grid. Only the shell, the copy and the empty states differ between the
 * two screens, which is what those files are.
 *
 * Nothing here writes. The authoring the Library has lives in `CreatureForm` and
 * reaches the grid as one optional per-row callback; the campaign bestiary
 * passes none, because what it lists are copies and it has never been an
 * authoring surface.
 */

const SORTS: ReadonlyArray<{ readonly value: CreatureSort; readonly label: string }> = [
  { value: "cr", label: "Sort: CR" },
  { value: "name", label: "Sort: Name" },
  { value: "recent", label: "Sort: Recent" },
];

/**
 * The two controls that reach the server, for a screen's `TopBar` children.
 *
 * `label` is on the search box rather than baked in, because "Search creatures"
 * and "Search the library" are the same control asking about different sets and
 * a reader should be told which.
 */
export function CorpusControls<V extends CorpusView>({
  corpus,
  label,
}: {
  readonly corpus: Corpus<V>;
  readonly label: string;
}) {
  return (
    <>
      <Input
        aria-label={label}
        placeholder={label}
        value={corpus.term}
        onChange={(event) => corpus.setTerm(event.target.value)}
        className="h-control-sm w-44"
      />
      <Select value={corpus.sort} onValueChange={(value) => corpus.setSort(value as CreatureSort)}>
        <SelectTrigger aria-label="Sort creatures" className="h-control-sm w-36">
          {/* Written out rather than left to Base UI: `Select.Value` with
              neither `items` nor children serialises the *value*, which would
              put `cr` on screen. */}
          <SelectValue>
            {(value) => SORTS.find((entry) => entry.value === value)?.label ?? "Sort: CR"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORTS.map((entry) => (
            <SelectItem key={entry.value} value={entry.value}>
              {entry.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

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
    label: "Immune to damage",
    values: (view) => view.facets.damageImmunities,
  },
  {
    key: "conditionImmunities",
    label: "Immune to conditions",
    values: (view) => view.facets.conditionImmunities,
  },
  { key: "movementModes", label: "Movement", values: (view) => view.facets.movementModes },
];

const activeValues = <V extends CorpusView>(
  corpus: Corpus<V>,
  key: FacetList,
): ReadonlyArray<string> => corpus[key];

/**
 * The creature filters: the vocabulary the corpus actually uses, not the
 * prototype's hard-coded four (`Bestiary.jsx:4`).
 *
 * **Pressing one is a request now**, and the rows are read separately for
 * exactly that reason — a vocabulary derived from a narrowed, paged answer
 * could not offer the chip you would press to get back out. See `load.ts`'s
 * `CorpusView`. Renders nothing at all until the corpus has mentioned a facet.
 */
export function EnvironmentChips<V extends CorpusView>({ corpus }: { readonly corpus: Corpus<V> }) {
  const view = corpus.shown;
  if (view === undefined) return null;
  const hasFacets = FACETS.some((facet) => facet.values(view).length > 0);
  if (!hasFacets && view.facets.crMin === null && view.facets.crMax === null) return null;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line-subtle bg-surface-card p-3 shadow-1">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="mr-1 text-faint">Challenge</Label>
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
        {view.facets.legendary && (
          <Toggle
            size="sm"
            pressed={corpus.legendary === true}
            onPressedChange={(pressed) => corpus.setLegendary(pressed ? true : undefined)}
          >
            Legendary
          </Toggle>
        )}
        {view.facets.spellcaster && (
          <Toggle
            size="sm"
            pressed={corpus.spellcaster === true}
            onPressedChange={(pressed) => corpus.setSpellcaster(pressed ? true : undefined)}
          >
            Spellcaster
          </Toggle>
        )}
        {corpus.narrowed && (
          <Button variant="ghost" size="sm" onClick={corpus.clear}>
            Clear
          </Button>
        )}
        {corpus.resource.state === "loading" && (
          <span role="status" className="text-caption leading-body text-faint">
            Looking…
          </span>
        )}
      </div>
      {FACETS.map((facet) => {
        const values = facet.values(view);
        if (values.length === 0) return null;
        return (
          <div key={facet.key} className="flex flex-wrap items-center gap-2">
            <Label className="mr-1 text-faint">{facet.label}</Label>
            {values.map((value) => (
              <Toggle
                key={value}
                size="sm"
                pressed={activeValues(corpus, facet.key).includes(value)}
                onPressedChange={() => corpus.toggleFacet(facet.key, value)}
              >
                {value}
              </Toggle>
            ))}
          </div>
        );
      })}
    </div>
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

/**
 * The rest of the list, when there is one.
 *
 * A button rather than an infinite scroll: the grid is inside a scrolling
 * column that a DM also scrolls to read a card, and a list that grows under the
 * thumb is a list you cannot get to the bottom of. It says how many are already
 * on screen because the subtitle counts the same rows, and a reader who asked
 * for more should be able to see that they arrived.
 *
 * A failed page keeps everything already read on screen and offers the same
 * press again — the rows in hand are still good, which is the difference
 * between this and the screen's own `FailureNotice`.
 */
export function MorePages<V extends CorpusView>({ corpus }: { readonly corpus: Corpus<V> }) {
  if (!corpus.hasMore && corpus.moreFailure === undefined) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      {corpus.moreFailure !== undefined && (
        <div className="w-full max-w-3xl">
          <FailureNotice failure={corpus.moreFailure} onRetry={corpus.loadMore} />
        </div>
      )}
      {corpus.hasMore && (
        <Button variant="secondary" onClick={corpus.loadMore} disabled={corpus.loadingMore}>
          {corpus.loadingMore
            ? "Reading…"
            : `Show more (${String(corpus.creatures.length)} so far)`}
        </Button>
      )}
    </div>
  );
}
