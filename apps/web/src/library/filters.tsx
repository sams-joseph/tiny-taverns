import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  FilterInput,
  Icon,
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
 * - **Sort stays its own control, an icon-button dropdown (`SortMenu`).**
 *   Reordering is not filtering: a sort always has an answer, so a removable
 *   chip is the wrong shape for it, and `clear` keeps it — the rule every tab
 *   already followed. The captain asked for the icon-button menu over the old
 *   labelled select (2026-09-03), so the control is one quiet button beside
 *   the box with the active order checked in its menu.
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
 * The one search-and-filter box, standard sizing and grammar on every tab.
 *
 * `FilterInput` is the component (`@taverns/ui`); this wrapper is only the
 * standard sizing and the `FilterQuery` plumbing, so every tab's box grows,
 * wraps and reads the same. The box is content-sized — the component's own
 * compact default, growing with text and pills — and this wrapper adds only
 * the shelves' shared ceiling (`max-w-3xl`), past which the overflow chip
 * takes over. `facets` is the tab's own schema — a tab with none gets a plain
 * search box with the same look, popup-free.
 */
export function FilterBox({
  label,
  list,
  facets = [],
  matchToggle = false,
}: {
  readonly label: string;
  readonly list: {
    readonly value: FilterInputValue;
    readonly onChange: (value: FilterInputValue) => void;
  };
  readonly facets?: ReadonlyArray<FilterInputFacet>;
  /** Offer Match all / Match any — only where the consumer honours "any". */
  readonly matchToggle?: boolean;
}) {
  return (
    <FilterInput
      value={list.value}
      onChange={list.onChange}
      facets={facets}
      label={label}
      matchToggle={matchToggle}
      className="max-w-3xl"
    />
  );
}

export interface FilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * The sort control — an icon button opening a dropdown of the orderings, the
 * active one checked. It replaced a labelled `Select` (`Sort: Name`) at the
 * captain's request; the current order still reads without opening anything,
 * from the button's own accessible name and title (`Sort — Name`).
 *
 * A menu rather than a select because a sort is a command over the list, not a
 * form value — and radio rows are the direction affordance's future home if a
 * sort ever grows one; today every ordering is a single choice.
 */
export function SortMenu({
  label = "Sort",
  value,
  onChange,
  options,
}: {
  readonly label?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: ReadonlyArray<FilterOption>;
}) {
  const active = options.find((option) => option.value === value)?.label ?? value;
  const name = `${label} — ${active}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={name}
        title={name}
        render={<Button variant="ghost" size="icon" className="size-control-sm" />}
      >
        <Icon name="arrow-up-down" size={15} className="pointer-events-none" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as string)}>
          {/* Inside the radio group — Base UI's GroupLabel throws outside one. */}
          <DropdownMenuLabel>{label} by</DropdownMenuLabel>
          {options.map((option) => (
            // `closeOnClick`: a sort is one choice, not a set — Base UI's
            // radio items stay open by default for the checkbox-like case.
            <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
