import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
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
 * - **The top bar holds the title, the count, the shelf nav and the write
 *   action(s), and never a filter.** Three tabs proved the bar cannot fit a
 *   filter row without breaking its own layout.
 * - **`FilterBar` is the first element of the content column**, on every tab, in
 *   the same order: search, sort, the facets that make sense for the corpus,
 *   boolean toggles, then — supplied by the bar itself so no tab forgets them —
 *   a *Clear filters* button whenever something narrows, and a quiet "Looking…"
 *   while a narrowed answer is on its way.
 * - **Controls are the design system's.** `FilterSelect` and `FilterMultiSelect`
 *   replace the raw `<select>`s; `FilterToggle` replaces button-as-toggle.
 * - **Search is debounced** (`useSearchTerm`), so typing a name is one request
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
  children,
}: {
  /** Whether anything narrows the list — shows *Clear filters*. */
  readonly narrowed: boolean;
  readonly onClear: () => void;
  /** A narrowed answer is on its way — shows a quiet status. */
  readonly busy?: boolean;
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
    </div>
  );
}

/** The search box: same width, height and idiom on every tab. */
export function FilterSearch({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Input
      aria-label={label}
      placeholder={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-control-sm w-56"
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
 * An any-of facet: several values may be pressed at once and the list shows
 * rows matching any of them — the capability the creatures chip wall had,
 * kept, in a control that does not fill the first screenful.
 *
 * The trigger counts rather than lists: `Type: beast` for one, `Type · 3` for
 * several. The popup stays open across presses, which is what any-of means.
 */
export function FilterMultiSelect({
  label,
  values,
  onChange,
  options,
  className = "w-40",
}: {
  readonly label: string;
  readonly values: ReadonlyArray<string>;
  readonly onChange: (values: ReadonlyArray<string>) => void;
  readonly options: ReadonlyArray<FilterOption>;
  readonly className?: string;
}) {
  const shown = (): string => {
    if (values.length === 0) return label;
    if (values.length === 1) {
      const entry = options.find((option) => option.value === values[0]);
      return `${label}: ${entry?.label ?? values[0] ?? ""}`;
    }
    return `${label} · ${String(values.length)}`;
  };
  return (
    <Select
      multiple
      value={values as Array<string>}
      onValueChange={(next) => onChange(next as ReadonlyArray<string>)}
    >
      {/* "Filter by X" rather than the bare facet name, so the control cannot
          collide with a form field of the same name on the same screen — the
          Library's "Type" box did exactly that. */}
      <SelectTrigger aria-label={`Filter by ${label}`} className={`h-control-sm ${className}`}>
        <SelectValue>{() => shown()}</SelectValue>
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

/** A boolean facet — `Legendary`, `Ritual` — as the design system's toggle. */
export function FilterToggle({
  pressed,
  onChange,
  children,
}: {
  readonly pressed: boolean;
  readonly onChange: (pressed: boolean) => void;
  readonly children: string;
}) {
  return (
    <Toggle size="sm" pressed={pressed} onPressedChange={(next) => onChange(next)}>
      {children}
    </Toggle>
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
