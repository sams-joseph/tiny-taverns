import {
  Button,
  FilterInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type FilterInputFacet,
  type FilterInputValue,
} from "@taverns/ui";
import type { ReactNode } from "react";
import { FailureNotice } from "../ui/states";
import type { ApiFailure } from "../api/failure";

/**
 * The one Library filter pattern, written once.
 *
 * Every Library shelf — and the campaign screens sharing their parts — used to
 * put its controls somewhere different: the creatures tab split a search box in
 * the top bar from a whole card of facet chips in the body, while spells,
 * equipment and magic items crammed native `<select>`s into the top bar until
 * the title wrapped letter by letter. The captain's complaint, verbatim: *"the
 * filters are located in different places in the ui"*.
 *
 * The standard, applied by every list screen over a Library corpus:
 *
 * - **The top bar holds the title and the count, and never a filter.** The tab
 *   strip is its own row below the header (`TopBar`'s `tabs` slot), and a
 *   tab-scoped write action lives inside that tab's content — the captain's
 *   rule, quoted on `TopBar`. Three tabs proved the bar cannot fit a filter
 *   row without breaking its own layout.
 * - **`FilterBar` is the first element of the content column**, on every tab, in
 *   the same order: the search-and-filter box, sort, then — supplied by the bar
 *   itself so no tab forgets them — a *Clear filters* button whenever something
 *   narrows, and a quiet "Looking…" while a narrowed answer is on its way. The
 *   tab's write action(s) sit at the right end of this same row (`actions`),
 *   which is the one consistent in-content placement every tab uses.
 * - **Search and filters are one box** (`FilterBox`, over `@taverns/ui`'s
 *   `FilterInput`) — the Linear filter-builder idiom the captain asked for.
 *   Free text searches; `type:beast`, a popup pick or a typed range lands as a
 *   removable chip in the same input. The per-facet dropdown row it replaced
 *   (`FilterMultiSelect` and friends) is gone; a tab describes its facets as a
 *   schema instead and everything else — suggestions, parsing, chips, the
 *   keyboard — reads identically on every tab.
 * - **Sort stays its own `FilterSelect`.** Reordering is not filtering: a sort
 *   always has an answer, so a removable chip is the wrong shape for it, and
 *   `clear` keeps it — the rule every tab already followed.
 * - **Search is debounced** (`useFilterQuery`), so typing a name is one request
 *   rather than eight — the creatures tab always did this and the other tabs
 *   fired one request per keystroke.
 */

/**
 * The bar itself. Children are the tab's own controls; the clear affordance and
 * the loading whisper are the bar's, so they read identically everywhere and no
 * tab can forget either.
 */
export function FilterBar({
  narrowed,
  onClear,
  busy = false,
  actions,
  children,
}: {
  /** Whether anything narrows the list — shows *Clear filters*. */
  readonly narrowed: boolean;
  readonly onClear: () => void;
  /** A narrowed answer is on its way — shows a quiet status. */
  readonly busy?: boolean;
  /**
   * The tab's own action(s) — *Write a creature* and its siblings — pushed to
   * the right end of the row. Inside the tab's content by the captain's rule
   * (quoted on `TopBar`), and on this row rather than somewhere per screen so
   * every tab puts the verb in the same place.
   */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2">
      {children}
      {narrowed && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
      {busy && (
        <span role="status" className="text-caption leading-body text-faint">
          Looking…
        </span>
      )}
      {actions !== undefined && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">{actions}</div>
      )}
    </div>
  );
}

/**
 * The one search-and-filter box, standard width and grammar on every tab.
 *
 * `FilterInput` is the component (`@taverns/ui`); this wrapper is only the
 * standard sizing and the `FilterQuery` plumbing, so every tab's box grows,
 * wraps and reads the same. `facets` is the tab's own schema — a tab with none
 * gets a plain search box with the same look, popup-free.
 */
export function FilterBox({
  label,
  list,
  facets = [],
}: {
  readonly label: string;
  readonly list: {
    readonly value: FilterInputValue;
    readonly onChange: (value: FilterInputValue) => void;
  };
  readonly facets?: ReadonlyArray<FilterInputFacet>;
}) {
  return (
    <FilterInput
      value={list.value}
      onChange={list.onChange}
      facets={facets}
      label={label}
      className="max-w-3xl min-w-64 shrink grow basis-80"
    />
  );
}

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A single-choice facet. The trigger always says which facet it is, and what is
 * chosen — `Sort: Name`, `Category: Armor` — because a bare value floating in a
 * row of controls does not say what it filters.
 *
 * An `options` entry with value `""` is the way out — "Any rarity" — and the
 * trigger then shows the facet's name alone.
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  className = "w-40",
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: ReadonlyArray<FilterOption>;
  readonly className?: string;
}) {
  const shown = (chosen: string): string => {
    if (chosen === "") return label;
    const entry = options.find((option) => option.value === chosen);
    return `${label}: ${entry?.label ?? chosen}`;
  };
  return (
    <Select value={value} onValueChange={(next) => onChange(next as string)}>
      <SelectTrigger aria-label={label} className={`h-control-sm ${className}`}>
        {/* Written out rather than left to Base UI: `Select.Value` with neither
            `items` nor children serialises the raw value. */}
        <SelectValue>{(chosen) => shown(chosen as string)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The rest of the list, when there is one — the creatures tab's *Show more*
 * pattern, shared so every paged tab says it the same way.
 *
 * A button rather than an infinite scroll (the grid lives in a column the
 * reader also scrolls to read a card), counting what is already on screen so a
 * reader who asked for more can see that it arrived. A failed page keeps the
 * rows in hand and offers the same press again.
 */
export function ShowMore({
  hasMore,
  loadingMore,
  onMore,
  count,
  failure,
}: {
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly onMore: () => void;
  /** How many rows are already on screen. */
  readonly count: number;
  readonly failure?: ApiFailure | undefined;
}) {
  if (!hasMore && failure === undefined) return null;
  return (
    <div className="flex flex-col items-center gap-3">
      {failure !== undefined && (
        <div className="w-full max-w-3xl">
          <FailureNotice failure={failure} onRetry={onMore} />
        </div>
      )}
      {hasMore && (
        <Button variant="secondary" onClick={onMore} disabled={loadingMore}>
          {loadingMore ? "Reading…" : `Show more (${String(count)} so far)`}
        </Button>
      )}
    </div>
  );
}
