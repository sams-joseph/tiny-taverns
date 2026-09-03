import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { FilterInput } from "./filter-input";
import {
  EMPTY_FILTER_VALUE,
  PILL_LAYOUT,
  type FilterInputFacet,
  type FilterInputValue,
} from "./filter-input-model";

const FACETS: ReadonlyArray<FilterInputFacet> = [
  {
    kind: "enum",
    key: "type",
    label: "Type",
    many: "types",
    options: [
      { value: "beast", label: "Beast" },
      { value: "undead", label: "Undead" },
    ],
  },
  {
    kind: "enum",
    key: "tag",
    label: "Tag",
    not: true,
    options: [
      { value: "Marsh", label: "Marsh" },
      { value: "Night", label: "Night" },
    ],
  },
  { kind: "range", key: "cr", label: "CR" },
  { kind: "boolean", key: "legendary", label: "Legendary" },
];

/** The component is controlled; the harness is the consumer holding the value. */
function Harness({
  initial = EMPTY_FILTER_VALUE,
  facets = FACETS,
  matchToggle = false,
  seen,
}: {
  readonly initial?: FilterInputValue;
  readonly facets?: ReadonlyArray<FilterInputFacet>;
  readonly matchToggle?: boolean;
  readonly seen: { current: FilterInputValue };
}) {
  const [value, setValue] = useState(initial);
  seen.current = value;
  return (
    <FilterInput
      value={value}
      onChange={setValue}
      facets={facets}
      label="Search things"
      matchToggle={matchToggle}
    />
  );
}

const renderInput = (props?: {
  readonly initial?: FilterInputValue;
  readonly facets?: ReadonlyArray<FilterInputFacet>;
  readonly matchToggle?: boolean;
}) => {
  const seen = { current: EMPTY_FILTER_VALUE };
  render(<Harness {...props} seen={seen} />);
  return { seen, input: screen.getByRole("combobox", { name: "Search things" }) };
};

const pillOf = (name: RegExp | string) => {
  // The first match is the visible line's pill; the measurement clones sit in
  // an aria-hidden row after it in the DOM.
  const pills = [...document.querySelectorAll("[data-pill]")] as Array<HTMLElement>;
  const wanted = pills.find((pill) =>
    typeof name === "string"
      ? (pill.getAttribute("aria-label") ?? "") === name
      : name.test(pill.getAttribute("aria-label") ?? ""),
  );
  if (wanted === undefined) throw new Error(`no pill named ${String(name)}`);
  return wanted;
};

describe("FilterInput", () => {
  it("typed text is the search, and Enter alone commits no filter", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.type(input, "goblin{Enter}");
    expect(seen.current.text).toBe("goblin");
    expect(seen.current.filters).toEqual([]);
  });

  it("field then values: the drill-down commits into one segmented pill", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.click(input);
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByRole("option", { name: "Type" }));

    // Drilling in rewrote the input to `type:` and now lists the values bare.
    expect(input).toHaveValue("type:");
    await user.click(await screen.findByRole("option", { name: "Beast" }));
    expect(seen.current.filters).toEqual([{ facet: "type", operator: "in", values: ["beast"] }]);

    // The popup stayed open — any-of — and a second value widens the same
    // pill rather than adding another.
    await user.click(await screen.findByRole("option", { name: "Undead" }));
    expect(seen.current.filters).toEqual([
      { facet: "type", operator: "in", values: ["beast", "undead"] },
    ]);

    const pill = pillOf("Type is any of 2 types");
    expect(within(pill).getByText("Type")).toBeInTheDocument();
    expect(within(pill).getByRole("button", { name: "Change how Type matches" })).toHaveTextContent(
      "is any of",
    );
    expect(within(pill).getByRole("button", { name: "Edit Type values" })).toHaveTextContent(
      "2 types",
    );
  });

  it("commits a typed facet:value with the keyboard alone, keeping the search text", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.type(input, "goblin type:bea{Enter}");
    expect(seen.current.filters).toEqual([{ facet: "type", operator: "in", values: ["beast"] }]);
    expect(seen.current.text).toBe("goblin ");
  });

  it("a range types as min-max and cycles its comparison from the operator segment", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.type(input, "cr:1-5{Enter}");
    expect(seen.current.filters).toEqual([
      { facet: "cr", operator: "between", values: ["1", "5"] },
    ]);
    const operator = within(pillOf(/^CR /)).getByRole("button", { name: "Change how CR matches" });
    expect(operator).toHaveTextContent("is between");

    await user.click(operator);
    expect(seen.current.filters).toEqual([{ facet: "cr", operator: "eq", values: ["1"] }]);
    await user.click(operator);
    expect(seen.current.filters).toEqual([{ facet: "cr", operator: "gte", values: ["1"] }]);
    expect(operator).toHaveTextContent("is at least");
  });

  it("cycles an enum's operator to exclusion where the facet declares it", async () => {
    const user = userEvent.setup();
    const { seen } = renderInput({
      initial: {
        ...EMPTY_FILTER_VALUE,
        filters: [{ facet: "tag", operator: "in", values: ["Marsh"] }],
      },
    });

    await user.click(screen.getByRole("button", { name: "Change how Tag matches" }));
    expect(seen.current.filters).toEqual([{ facet: "tag", operator: "not", values: ["Marsh"] }]);
    expect(screen.getByRole("button", { name: "Change how Tag matches" })).toHaveTextContent(
      "is not",
    );
  });

  it("keeps an undeclared operator set closed — the segment is inert, not a lie", async () => {
    const user = userEvent.setup();
    const { seen } = renderInput({
      initial: {
        ...EMPTY_FILTER_VALUE,
        filters: [{ facet: "type", operator: "in", values: ["beast"] }],
      },
    });

    const operator = screen.getByRole("button", { name: "Change how Type matches" });
    expect(operator).toBeDisabled();
    await user.click(operator);
    expect(seen.current.filters[0]?.operator).toBe("in");
  });

  it("a boolean pill is field | is | Yes, and its segments flip it", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.click(input);
    await user.click(await screen.findByRole("option", { name: "Legendary" }));
    expect(seen.current.filters).toEqual([
      { facet: "legendary", operator: "is", values: ["true"] },
    ]);

    const pill = pillOf("Legendary is Yes");
    // The operator is fixed for a boolean; the value segment flips it, so the
    // pill reads `Legendary is No` and never a double negative.
    expect(
      within(pill).getByRole("button", { name: "Change how Legendary matches" }),
    ).toBeDisabled();
    await user.click(within(pill).getByRole("button", { name: "Switch Legendary to No" }));
    expect(seen.current.filters).toEqual([
      { facet: "legendary", operator: "is", values: ["false"] },
    ]);
    expect(pillOf("Legendary is No")).toBeInTheDocument();
  });

  it("the value segment reopens the facet's picker with the chosen values checked", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput({
      initial: {
        ...EMPTY_FILTER_VALUE,
        filters: [{ facet: "type", operator: "in", values: ["beast"] }],
      },
    });

    await user.click(screen.getByRole("button", { name: "Edit Type values" }));
    expect(input).toHaveValue("type:");
    await user.click(await screen.findByRole("option", { name: "Undead" }));
    expect(seen.current.filters).toEqual([
      { facet: "type", operator: "in", values: ["beast", "undead"] },
    ]);

    // Picking a chosen value in the same picker takes it back out.
    await user.click(await screen.findByRole("option", { name: "Beast" }));
    expect(seen.current.filters).toEqual([{ facet: "type", operator: "in", values: ["undead"] }]);
  });

  it("the add-filter button opens the field picker without typing", async () => {
    const user = userEvent.setup();
    renderInput();

    await user.click(screen.getByRole("button", { name: "Add filter" }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "Type" })).toBeInTheDocument();
  });

  it("removes a whole pill from its own ×", async () => {
    const user = userEvent.setup();
    const { seen } = renderInput({
      initial: {
        ...EMPTY_FILTER_VALUE,
        filters: [{ facet: "type", operator: "in", values: ["beast", "undead"] }],
      },
    });

    await user.click(screen.getByRole("button", { name: "Remove filter Type" }));
    expect(seen.current.filters).toEqual([]);
  });

  it("Backspace on an empty input removes the last pill whole", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput({
      initial: {
        ...EMPTY_FILTER_VALUE,
        filters: [
          { facet: "type", operator: "in", values: ["beast"] },
          { facet: "legendary", operator: "is", values: ["true"] },
        ],
      },
    });

    await user.click(input);
    await user.keyboard("{Backspace}");
    expect(seen.current.filters).toEqual([{ facet: "type", operator: "in", values: ["beast"] }]);
  });

  it("offers Match all / Match any once two filters exist, and flips it", async () => {
    const user = userEvent.setup();
    const one: FilterInputValue = {
      ...EMPTY_FILTER_VALUE,
      filters: [{ facet: "type", operator: "in", values: ["beast"] }],
    };
    const { seen } = renderInput({
      matchToggle: true,
      initial: {
        ...one,
        filters: [...one.filters, { facet: "legendary", operator: "is", values: ["true"] }],
      },
    });

    const toggle = screen.getByRole("button", { name: "Match all" });
    await user.click(toggle);
    expect(seen.current.match).toBe("any");
    expect(screen.getByRole("button", { name: "Match any" })).toBeInTheDocument();
  });

  it("hides the match control where the consumer cannot honour it", () => {
    renderInput({
      initial: {
        ...EMPTY_FILTER_VALUE,
        filters: [
          { facet: "type", operator: "in", values: ["beast"] },
          { facet: "legendary", operator: "is", values: ["true"] },
        ],
      },
    });
    expect(screen.queryByRole("button", { name: /Match/ })).toBeNull();
  });

  it("with no facets it is a plain search box — no popup and no add-filter", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput({ facets: [] });

    await user.click(input);
    await user.type(input, "crate");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add filter" })).toBeNull();
    expect(seen.current.text).toBe("crate");
  });

  it("an unknown prefix stays search text", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.type(input, "time: dusk{Enter}");
    expect(seen.current.filters).toEqual([]);
    expect(seen.current.text).toBe("time: dusk");
  });
});

describe("content-driven width", () => {
  /**
   * jsdom lays nothing out, so the width contract is pinned as classes: the
   * box is `w-fit` — a compact `min-w-48` default that grows with its
   * contents to the consumer's `max-w-*` — and the growth engine is the
   * input's `field-sizing-content`, which sizes the input to its own text so
   * the fitted container follows it with no JS in the loop.
   */
  it("the box is content-sized: a compact default growing to the consumer's max", () => {
    renderInput();
    const box = document.querySelector('[data-slot="combobox-chips"]');
    expect(box).toHaveClass("w-fit", "min-w-48");
    // No max-w-* of its own: the merge config knows only the named "measure"
    // container scale, so a default here and a consumer's max-w-3xl would both
    // survive and CSS order — not the consumer — would pick the winner.
    expect([...(box?.classList ?? [])].some((name) => name.startsWith("max-w-"))).toBe(false);
  });

  it("the input is content-sized and keeps exactly the reserve the fit subtracts", () => {
    const { input } = renderInput();
    expect(input).toHaveClass("field-sizing-content", "flex-auto");
    // The invariant the fit depends on (see the component's doc block): the
    // input's minimum width — `min-w-30`, 120px — must equal
    // `PILL_LAYOUT.inputReserve`. On an unclamped `w-fit` box the fit
    // subtracts the reserve from a clientWidth that only contains the input's
    // real width; a reserve wider than the input's minimum under-counts, and
    // pills collect into the chip while there is visibly room.
    expect(input).toHaveClass("min-w-30");
    expect(PILL_LAYOUT.inputReserve).toBe(120);
  });
});

describe("overflow: the line never wraps, the oldest collect into a chip", () => {
  /**
   * jsdom lays nothing out, so the measurement is driven: the chips container
   * reports the width under test, every pill clone measures 120, the overflow
   * clone 60, and the chrome rects stay 0. With `PILL_LAYOUT` (gap 6, padding
   * 16, input reserve 120) a 400-wide box has 252px for pills — one 120px pill
   * beside the 60px chip — and an 800-wide box fits all three.
   */
  let containerWidth = 400;
  const restore: Array<() => void> = [];

  const stub = (proto: object, property: string, get: (this: HTMLElement) => number) => {
    const original = Object.getOwnPropertyDescriptor(proto, property);
    Object.defineProperty(proto, property, { configurable: true, get });
    restore.push(() => {
      if (original !== undefined) Object.defineProperty(proto, property, original);
      else delete (proto as Record<string, unknown>)[property];
    });
  };

  beforeEach(() => {
    containerWidth = 400;
    stub(HTMLElement.prototype, "offsetWidth", function (this: HTMLElement) {
      if (this.dataset["measure"] === "pill") return 120;
      if (this.dataset["measure"] === "overflow") return 60;
      return 20;
    });
    stub(Element.prototype, "clientWidth", function (this: HTMLElement) {
      return this.getAttribute("data-slot") === "combobox-chips" ? containerWidth : 0;
    });
  });
  afterEach(() => {
    while (restore.length > 0) restore.pop()?.();
  });

  const THREE: FilterInputValue = {
    ...EMPTY_FILTER_VALUE,
    filters: [
      { facet: "type", operator: "in", values: ["beast"] },
      { facet: "cr", operator: "gte", values: ["3"] },
      { facet: "legendary", operator: "is", values: ["true"] },
    ],
  };

  it("keeps the newest pill visible and collects the older into the chip", () => {
    renderInput({ initial: THREE });

    // The newest — Legendary — is on the line; Type and CR are collected.
    expect(pillOf("Legendary is Yes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove filter Type" })).toBeNull();
    expect(screen.getByRole("button", { name: "2 more filters" })).toHaveTextContent("+2 filters");
  });

  it("shows everything when the box is wide enough, with no chip at all", () => {
    containerWidth = 800;
    renderInput({ initial: THREE });

    expect(screen.queryByRole("button", { name: /more filter/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove filter Type" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove filter CR" })).toBeInTheDocument();
  });

  it("opens the collected pills in a popover, every segment still live", async () => {
    const user = userEvent.setup();
    const { seen } = renderInput({ initial: THREE });

    await user.click(screen.getByRole("button", { name: "2 more filters" }));
    // The collected pills are whole in the popover — operator editable…
    await user.click(await screen.findByRole("button", { name: "Change how CR matches" }));
    expect(seen.current.filters[1]).toEqual({ facet: "cr", operator: "lte", values: ["3"] });

    // …and removable. Dropping one re-fits the line: one pill still hides.
    await user.click(screen.getByRole("button", { name: "Remove filter Type" }));
    expect(seen.current.filters.map((condition) => condition.facet)).toEqual(["cr", "legendary"]);
    expect(screen.getByRole("button", { name: "1 more filter" })).toHaveTextContent("+1 filter");

    // Removing the last collected pill retires the chip and its popover.
    await user.click(screen.getByRole("button", { name: "Remove filter CR" }));
    expect(seen.current.filters.map((condition) => condition.facet)).toEqual(["legendary"]);
    expect(screen.queryByRole("button", { name: /more filter/ })).toBeNull();
  });

  it("a filter added while overflowing lands visible, not collected", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput({ initial: THREE });

    await user.type(input, "tag:Marsh{Enter}");
    // Close the picker before reading the line — an open popup holds the
    // accessibility tree.
    await user.keyboard("{Escape}");
    expect(seen.current.filters.at(-1)).toEqual({
      facet: "tag",
      operator: "in",
      values: ["Marsh"],
    });
    expect(pillOf("Tag is Marsh")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3 more filters" })).toBeInTheDocument();
    // The newest pill is the interactive one on the line.
    expect(screen.getByRole("button", { name: "Remove filter Tag" })).toBeInTheDocument();
  });
});
