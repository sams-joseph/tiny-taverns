import * as React from "react";

import { cn } from "../../lib/utils";
import {
  Combobox,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "./combobox";
import {
  compositionOf,
  conditionLabelOf,
  conditionOf,
  fieldLabelOf,
  operatorLabelOf,
  operatorsFor,
  PILL_LAYOUT,
  sameSuggestion,
  strippedOnClose,
  suggestionsFor,
  valuesLabelOf,
  visiblePillCount,
  withComposition,
  withNextOperator,
  withoutCondition,
  withValue,
  type FilterCondition,
  type FilterInputFacet,
  type FilterInputSuggestion,
  type FilterInputValue,
} from "./filter-input-model";
import { Icon } from "./icon";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * One box that is both the search and the filters — Linear's filter row. Free
 * text is the search query; an active filter is a **segmented pill**,
 * `field | operator | value(s) | ×`, whose operator and value segments are
 * buttons of their own: the operator cycles through the facet's operator set,
 * the values reopen that facet's picker. Filters are composed by typing
 * (`type:beast` is still the fast path), by picking a field from the
 * suggestion popup and then its values (checkbox rows, any-of), or from the
 * add-filter button. `filter-input-model.ts` is the grammar; this is the
 * wiring of that grammar onto the composed combobox.
 *
 * **The box is always one line, and it is sized by its contents.** Empty it is
 * a compact search box (`min-w-48`); it grows with the text and the pills —
 * the input is `field-sizing-content`, so typing widens the box character by
 * character with no JS in the loop — up to whatever `max-w-*` its consumer
 * gives it, where the overflow behaviour below takes over. **The ceiling is
 * the consumer's to supply** (every current one does): the component sets no
 * `max-w-*` of its own, because `tw-theme.ts`'s tailwind-merge config knows
 * only the named `measure` container scale, so a default here and a
 * consumer's `max-w-3xl` would *both* survive the merge and CSS source order
 * — not the consumer — would pick the winner. When the pills no
 * longer fit beside the typing room the line always keeps, the *oldest*
 * collect into one overflow chip — the filter just added stays visible — and
 * the chip opens a popover holding the collected pills, every segment still
 * live. The fit is measured off an invisible clone row (`data-measure`),
 * recomputed on every change and on resize; a container that measures zero
 * wide (jsdom, `display: none`) shows everything, so the overflow never fires
 * on a box nobody can see.
 *
 * The fit is measured against the box's *limit* — its computed `max-width`
 * bounded by its parent — never its current width, whose feedback loop is
 * written out on `recompute`. One invariant pairs with that: **the input's own
 * `min-w-30` (120px) equals `PILL_LAYOUT.inputReserve`**, so a set of pills
 * the fit counted as fitting beside the reserve really does fit beside the
 * input at its minimum, and the box the fit promised is the box CSS lays out.
 * `filter-input.test.tsx` pins the pair.
 *
 * Controlled by `FilterInputValue` — `{ text, filters, match }` — which a
 * consumer maps onto its own query state (`searchTextOf` gives the text minus
 * any composition in progress; `valuesOf`/`conditionOf` read the conditions).
 * It deliberately owns no debounce and no request: it is a control, and the
 * reading behaviour belongs to the screen's own query layer.
 *
 * The keyboard is the primitive's: ArrowDown opens and walks the popup, Enter
 * commits the highlighted row, Escape closes, and Backspace on an empty input
 * removes the newest pill whole. Suggestions auto-highlight only while a
 * `facet:` composition is open — free text must never commit a filter on a
 * bare Enter, or searching for "goblin" plants a filter nobody asked for.
 *
 * `matchToggle` renders the Match all / Match any control once two filters
 * exist. Offer it **only where the consumer honours "any"** — a server that
 * can only AND its filter clauses must not render a toggle that lies.
 */
export function FilterInput({
  value,
  onChange,
  facets,
  label,
  placeholder,
  matchToggle = false,
  className,
  id,
}: {
  readonly value: FilterInputValue;
  readonly onChange: (value: FilterInputValue) => void;
  readonly facets: ReadonlyArray<FilterInputFacet>;
  /** The accessible name — "Search creatures", "Search the record". */
  readonly label: string;
  /** Defaults to the label; override when the hint should say more. */
  readonly placeholder?: string;
  /** Whether the Match all / Match any control is offered — see above. */
  readonly matchToggle?: boolean;
  readonly className?: string;
  readonly id?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(value.filters.length);
  const [overflowOpen, setOverflowOpen] = React.useState(false);

  // The combobox's selected entries are one sentinel per condition — the
  // pills. The sentinel's `value` is unmatchable by any real suggestion, so a
  // press in the popup is always an *addition* for this component to
  // interpret (committing an already-chosen value toggles it out), and only a
  // pill's own × or a Backspace removes an entry.
  const selected = React.useMemo<Array<FilterInputSuggestion>>(
    () =>
      value.filters.map((condition) => ({
        kind: "value",
        facet: condition.facet,
        value: " condition",
        label: conditionLabelOf(condition, facets),
      })),
    [value.filters, facets],
  );
  const suggestions = suggestionsFor(value.text, facets);
  const composition = compositionOf(value.text, facets);

  const isChosen = (item: FilterInputSuggestion): boolean => {
    if (item.kind !== "value") return false;
    const condition = conditionOf(value, item.facet);
    return condition !== undefined && condition.values.includes(item.value);
  };

  const handleValueChange = (next: Array<FilterInputSuggestion>) => {
    const added = next.find(
      (candidate) => !selected.some((current) => sameSuggestion(current, candidate)),
    );
    if (added !== undefined) {
      if (added.kind === "facet") onChange(withComposition(value, added.key, facets));
      else onChange(withValue(value, added.facet, added.value, facets));
      return;
    }
    // A removal — Backspace on the empty input takes the newest pill whole.
    const kept = new Set(
      next.flatMap((candidate) => (candidate.kind === "value" ? [candidate.facet] : [])),
    );
    onChange({
      ...value,
      filters: value.filters.filter((condition) => kept.has(condition.facet)),
    });
  };

  const handleInputValueChange = (text: string, details: { readonly reason: string }) => {
    // Base UI clears the input itself after a selection (`input-clear`) and on
    // its own resets (`none`); the committed text is this component's to
    // decide, so only what the user actually did reaches the controlled value.
    if (
      details.reason === "input-change" ||
      details.reason === "input-paste" ||
      details.reason === "clear-press"
    ) {
      onChange({ ...value, text });
    }
  };

  /**
   * The pill's value segment: point the composition at this facet — the
   * segment is itself a popup trigger, so the press has already opened the
   * picker — and hand focus back to the input so typing narrows the values.
   */
  const reopenValues = (condition: FilterCondition) => {
    setOverflowOpen(false);
    onChange(withComposition(value, condition.facet, facets));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  /**
   * Which of the newest pills fit on the one line, measured off the clone row
   * rather than the live one so the answer never depends on what is already
   * hidden. The chrome beside the pills (icon, add-filter, match toggle) is
   * measured live; the input contributes its reserve, not its stretched width.
   *
   * The room the pills are fitted against is the box's **limit** — its
   * computed `max-width`, bounded by its parent's width — never its current
   * width. On a content-sized (`w-fit`) box the current width *depends on
   * which pills are already hidden*: the render that first hides one shrinks
   * the box to icon + chip + input, and a fit read off that narrower box
   * concludes the pill still does not fit, so a single pill on a wide screen
   * collects into its own chip and the wrong answer holds itself up. A box
   * with no computed pixel limit (a fixed-width consumer, or a stubbed jsdom
   * container) falls back to `clientWidth`, which for a non-`w-fit` box is
   * the limit.
   */
  const recompute = React.useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (container === null || measure === null) return;
    const count = value.filters.length;
    const parentWidth = container.parentElement?.clientWidth ?? 0;
    const cap = (width: string): number =>
      width.endsWith("px")
        ? Number.parseFloat(width)
        : width.endsWith("%") && parentWidth > 0
          ? (parentWidth * Number.parseFloat(width)) / 100
          : Number.POSITIVE_INFINITY;
    const bounded = Math.min(
      cap(getComputedStyle(container).maxWidth),
      parentWidth > 0 ? parentWidth : Number.POSITIVE_INFINITY,
    );
    const limit = Number.isFinite(bounded) ? bounded : container.clientWidth;
    if (limit === 0) {
      setVisible(count);
      return;
    }
    const clones = [...measure.children] as Array<HTMLElement>;
    const pillWidths = clones
      .filter((clone) => clone.dataset["measure"] === "pill")
      .map((clone) => clone.offsetWidth);
    const overflowWidth =
      clones.find((clone) => clone.dataset["measure"] === "overflow")?.offsetWidth ?? 0;
    // Everything on the line that is neither a pill, the overflow chip, the
    // input (its reserve is a constant) nor the clone row itself. The icon is
    // an SVG, so widths come from rects rather than offsetWidth.
    const chrome = [...container.children]
      .filter(
        (child) =>
          child.getAttribute("data-measure") === null &&
          child.getAttribute("data-slot") !== "combobox-chips-input" &&
          child.getAttribute("data-pill") === null,
      )
      .reduce((sum, child) => sum + child.getBoundingClientRect().width + PILL_LAYOUT.gap, 0);
    const available = limit - PILL_LAYOUT.paddingX - PILL_LAYOUT.inputReserve - chrome;
    setVisible(visiblePillCount({ available, pillWidths, overflowWidth, gap: PILL_LAYOUT.gap }));
  }, [value.filters.length]);

  React.useLayoutEffect(recompute, [recompute, value.filters, facets, matchToggle]);
  React.useEffect(() => {
    const container = containerRef.current;
    if (container === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    // The parent too: the limit is bounded by the parent's width, and a parent
    // that grows does not resize a content-sized box sitting in its chip state
    // — without this, widening the window never lets collected pills back out.
    if (container.parentElement !== null) observer.observe(container.parentElement);
    return () => observer.disconnect();
  }, [recompute]);

  const hiddenCount = Math.max(0, value.filters.length - visible);
  const hidden = value.filters.slice(0, hiddenCount);
  const shown = value.filters.slice(hiddenCount);
  React.useEffect(() => {
    if (hiddenCount === 0) setOverflowOpen(false);
  }, [hiddenCount]);

  const pillProps = { facets, value, onChange, reopenValues };

  return (
    <Combobox
      multiple
      value={selected}
      onValueChange={handleValueChange}
      inputValue={value.text}
      onInputValueChange={handleInputValueChange}
      items={suggestions}
      filter={null}
      isItemEqualToValue={sameSuggestion}
      autoHighlight={composition !== undefined}
      openOnInputClick={facets.length > 0}
      onOpenChange={(open, details) => {
        // Base UI closes the popup on a selection made while the input held a
        // filter query. Composing is the normal way a value is picked here,
        // and any-of means the popup stays open across commits — checkbox
        // rows, like Linear's value picker. Escape and an outside press still
        // close, and a close sweeps up a spent composition's bare `key:`.
        if (!open && details.reason === "item-press") {
          details.cancel();
          return;
        }
        if (!open) {
          const swept = strippedOnClose(value.text, facets);
          if (swept !== value.text) onChange({ ...value, text: swept });
        }
      }}
    >
      <ComboboxChips
        ref={containerRef}
        className={cn("relative w-fit min-w-48 flex-nowrap overflow-hidden", className)}
      >
        <Icon name="search" size={14} className="ml-1 shrink-0 text-faint" />
        {shown.map((condition) => (
          <FilterPill key={condition.facet} condition={condition} {...pillProps} />
        ))}
        {hiddenCount > 0 && (
          <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
            <PopoverTrigger
              data-pill
              aria-label={`${String(hiddenCount)} more ${hiddenCount === 1 ? "filter" : "filters"}`}
              className={cn(
                "flex shrink-0 cursor-pointer items-center rounded-xs border border-hairline",
                "bg-surface-raised px-2 py-0.5 font-sans text-label-s leading-snug font-medium",
                "whitespace-nowrap text-slate-300 transition-control outline-none",
                "hover:bg-surface-sunken focus-visible:border-accent",
              )}
            >
              +{String(hiddenCount)} {hiddenCount === 1 ? "filter" : "filters"}
            </PopoverTrigger>
            <PopoverContent align="start" aria-label="More filters">
              {hidden.map((condition) => (
                <FilterPill
                  key={condition.facet}
                  condition={condition}
                  {...pillProps}
                  className="w-fit"
                />
              ))}
            </PopoverContent>
          </Popover>
        )}
        <ComboboxChipsInput
          id={id}
          ref={inputRef}
          aria-label={label}
          placeholder={placeholder ?? label}
          // `field-sizing-content` is what makes the box content-sized: the
          // input's width tracks its text (its placeholder, when empty), and
          // the `w-fit` container follows it. `min-w-30` must stay equal to
          // `PILL_LAYOUT.inputReserve` — see the fit invariant above —
          // and `flex-auto` (basis auto, not `flex-1`'s basis 0) is what lets
          // the content size reach the container while still filling leftover
          // room on a clamped or consumer-fixed box.
          className="min-w-30 flex-auto field-sizing-content"
        />
        {facets.length > 0 && (
          <ComboboxTrigger
            aria-label="Add filter"
            title="Add filter"
            className={cn(
              "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-xs",
              "text-faint transition-control outline-none hover:text-foreground",
              "focus-visible:border-accent focus-visible:text-foreground",
            )}
          >
            <Icon name="plus" size={14} className="pointer-events-none" />
          </ComboboxTrigger>
        )}
        {matchToggle && value.filters.length >= 2 && (
          <button
            type="button"
            className={cn(
              "ml-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-xs px-1.5 py-0.5",
              "font-sans text-label-s font-medium whitespace-nowrap text-faint",
              "transition-control outline-none hover:text-foreground focus-visible:text-foreground",
            )}
            onClick={() => onChange({ ...value, match: value.match === "all" ? "any" : "all" })}
          >
            Match {value.match === "all" ? "all" : "any"}
          </button>
        )}
        {/* The clone row the fit is measured from: every pill plus the widest
            overflow chip, out of flow and invisible, so the answer does not
            depend on which pills the previous answer hid. */}
        <div
          ref={measureRef}
          data-measure="row"
          aria-hidden
          // `w-0 overflow-hidden` keeps the clone row out of the container's
          // scrollWidth — an absolutely positioned row wider than the box
          // would otherwise read as clipped content to anything measuring it.
          className="pointer-events-none invisible absolute top-0 left-0 flex w-0 items-center gap-1.5 overflow-hidden"
        >
          {value.filters.map((condition) => (
            <div key={condition.facet} data-measure="pill">
              <FilterPill condition={condition} facets={facets} />
            </div>
          ))}
          <div
            data-measure="overflow"
            className="border border-hairline px-2 py-0.5 font-sans text-label-s leading-snug font-medium whitespace-nowrap"
          >
            +{String(value.filters.length)} filters
          </div>
        </div>
      </ComboboxChips>
      {/* No popup at all for plain search text that suggests nothing — a box
          floating "no matches" over every ordinary search is noise, and an
          open popup holds the page's accessibility tree. A composition keeps
          it open to say how to finish. */}
      {facets.length > 0 && (composition !== undefined || suggestions.length > 0) && (
        <ComboboxContent>
          {suggestions.length === 0 && composition !== undefined ? (
            <div className="px-3 py-2 text-body-s leading-body text-faint">
              {composition.facet.kind === "range"
                ? (composition.facet.hint ?? "Type a range — 0-5, 3-, or -10 — then press Enter.")
                : "Nothing matches. Keep typing, or press Backspace."}
            </div>
          ) : (
            <ComboboxEmpty />
          )}
          <ComboboxList>
            {(item: FilterInputSuggestion) => (
              <ComboboxItem
                key={item.kind === "facet" ? `facet:${item.key}` : `${item.facet} ${item.value}`}
                value={item}
              >
                {item.kind === "facet" ? (
                  <>
                    <span className="flex-1">{item.label}</span>
                    <Icon
                      name="chevron-right"
                      size={14}
                      className="pointer-events-none shrink-0 text-faint"
                    />
                  </>
                ) : composition !== undefined && composition.facet.kind === "enum" ? (
                  <>
                    {/* Value mode: checkbox rows, so an any-of pick reads as
                        membership rather than navigation. Drawn from the
                        condition — the built-in selection indicator keys on
                        the sentinel entries and stays quiet on purpose. */}
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-3.5 shrink-0 items-center justify-center rounded-xs border border-strong",
                        isChosen(item) && "border-accent bg-accent text-on-accent",
                      )}
                    >
                      {isChosen(item) && <Icon name="check" size={11} />}
                    </span>
                    <span className="flex-1">{item.label}</span>
                  </>
                ) : (
                  item.label
                )}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      )}
    </Combobox>
  );
}

const SEGMENT =
  "flex cursor-pointer items-center self-stretch border-l border-hairline px-1.5 " +
  "transition-control outline-none hover:bg-surface-sunken focus-visible:bg-surface-sunken";

/**
 * One segmented pill — `field | operator | value(s) | ×`. The same component
 * draws the visible line, the overflow popover and (handler-free, cloned for
 * width) the measurement row, so the three can never disagree about a pill's
 * size or its segments.
 */
function FilterPill({
  condition,
  facets,
  value,
  onChange,
  reopenValues,
  className,
}: {
  readonly condition: FilterCondition;
  readonly facets: ReadonlyArray<FilterInputFacet>;
  readonly value?: FilterInputValue;
  readonly onChange?: (value: FilterInputValue) => void;
  readonly reopenValues?: (condition: FilterCondition) => void;
  readonly className?: string;
}) {
  const facet = facets.find((candidate) => candidate.key === condition.facet);
  const field = fieldLabelOf(condition, facets);
  const editableOperator = facet !== undefined && operatorsFor(facet).length > 1;
  const cycle = () => {
    if (facet === undefined || value === undefined || onChange === undefined) return;
    onChange({
      ...value,
      filters: value.filters.map((candidate) =>
        candidate.facet === condition.facet ? withNextOperator(candidate, facet) : candidate,
      ),
    });
  };
  return (
    <div
      data-pill
      aria-label={conditionLabelOf(condition, facets)}
      className={cn(
        "flex w-fit shrink-0 items-center gap-0 overflow-hidden rounded-xs border border-hairline",
        "bg-surface-raised font-sans text-label-s leading-snug font-medium whitespace-nowrap",
        "text-slate-300",
        className,
      )}
    >
      <span className="flex items-center py-0.5 pr-1.5 pl-2">{field}</span>
      <button
        type="button"
        aria-label={`Change how ${field} matches`}
        title={`Change how ${field} matches`}
        disabled={!editableOperator}
        className={cn(
          SEGMENT,
          "text-faint disabled:cursor-default",
          editableOperator && "hover:text-foreground",
        )}
        onClick={(event) => {
          event.stopPropagation();
          cycle();
        }}
      >
        {operatorLabelOf(condition)}
      </button>
      {facet?.kind === "boolean" ? (
        /* A boolean's value flips in place — Yes ⇄ No — so the pill reads
           `Legendary | is | Yes` and never a double negative. */
        <button
          type="button"
          aria-label={`Switch ${field} to ${condition.values[0] === "false" ? "Yes" : "No"}`}
          title={`Switch ${field} to ${condition.values[0] === "false" ? "Yes" : "No"}`}
          className={SEGMENT}
          onClick={(event) => {
            event.stopPropagation();
            cycle();
          }}
        >
          {valuesLabelOf(condition, facets)}
        </button>
      ) : (
        /* A real popup trigger, so pressing it opens the picker the way the
           primitive opens it; the click handler only points the composition
           at this facet and hands focus to the input. */
        <ComboboxTrigger
          aria-label={`Edit ${field} values`}
          title={`Edit ${field} values`}
          className={SEGMENT}
          onClick={(event: React.MouseEvent) => {
            event.stopPropagation();
            reopenValues?.(condition);
          }}
        >
          {valuesLabelOf(condition, facets)}
        </ComboboxTrigger>
      )}
      <button
        type="button"
        aria-label={`Remove filter ${field}`}
        title={`Remove filter ${field}`}
        className={cn(SEGMENT, "px-1 text-faint hover:text-foreground")}
        onClick={(event) => {
          event.stopPropagation();
          if (value !== undefined && onChange !== undefined)
            onChange(withoutCondition(value, condition.facet));
        }}
      >
        <Icon name="x" size={12} className="pointer-events-none" />
      </button>
    </div>
  );
}
