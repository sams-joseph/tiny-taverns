import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FilterInputFacet } from "@taverns/ui";
import { FilterBar, FilterBox, ShowMore, SortMenu } from "./filters";
import { listCount, useFilterQuery } from "./query";

/**
 * The shared filter pattern, pinned as components.
 *
 * Every tab renders these; what each tab's own test pins is which facets it
 * offers and what reaches its wire. What is pinned here is the behaviour no
 * tab may vary: where the clear affordance comes from, how the unified box's
 * state debounces and reads back, and that the whole pattern is one input
 * rather than a row of controls.
 */

describe("listCount", () => {
  const noun = { one: "spell", many: "spells" };
  const state = { empty: "Nothing here yet", suffix: "yours, and the bundled corpus" };

  it("says what the whole list is when nothing narrows", () => {
    expect(listCount(3, noun, { ...state, narrowed: false, hasMore: false })).toBe(
      "3 spells — yours, and the bundled corpus",
    );
  });

  it("says a page is only the first of them", () => {
    expect(listCount(24, noun, { ...state, narrowed: false, hasMore: true })).toBe(
      "The first 24 spells",
    );
    expect(listCount(24, noun, { ...state, narrowed: true, hasMore: true })).toBe(
      "The first 24 spells that match",
    );
  });

  it("counts matches when a filter narrows, and keeps the empty sentence for zero", () => {
    expect(listCount(1, noun, { ...state, narrowed: true, hasMore: false })).toBe(
      "1 spell matches what you're looking for",
    );
    expect(listCount(0, noun, { ...state, narrowed: false, hasMore: false })).toBe(
      "Nothing here yet",
    );
  });
});

describe("FilterBar", () => {
  it("offers the way out exactly when something narrows, and it is the bar's own", async () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <FilterBar narrowed={false} onClear={onClear}>
        <span>controls</span>
      </FilterBar>,
    );
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();

    rerender(
      <FilterBar narrowed onClear={onClear}>
        <span>controls</span>
      </FilterBar>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("whispers that a narrowed answer is on its way", () => {
    render(
      <FilterBar narrowed onClear={() => {}} busy>
        <span>controls</span>
      </FilterBar>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Looking…");
  });

  it("carries the tab's own action inside the bar — the captain's placement", () => {
    // Tab-scoped verbs live inside the tab's content, not beside the tab strip
    // — the rule quoted on `TopBar`. The bar's `actions` slot is the one
    // consistent in-content placement every tab uses.
    render(
      <FilterBar narrowed={false} onClear={() => {}} actions={<button>Write a thing</button>}>
        <span>controls</span>
      </FilterBar>,
    );
    const bar = screen.getByRole("group", { name: "Filters" });
    expect(bar).toContainElement(screen.getByRole("button", { name: "Write a thing" }));
  });
});

describe("SortMenu", () => {
  const SORTS = [
    { value: "cr", label: "CR" },
    { value: "name", label: "Name" },
  ];

  it("is an icon button whose name carries the active order, opening a checked menu", async () => {
    function Harness() {
      const [value, setValue] = useState("cr");
      return <SortMenu value={value} onChange={setValue} options={SORTS} />;
    }
    render(<Harness />);

    // The active order reads without opening anything — the button's own name.
    const trigger = screen.getByRole("button", { name: "Sort — CR" });

    await userEvent.click(trigger);
    // The menu marks the active order; picking another moves the check and the
    // name, and the menu closes on the pick.
    expect(await screen.findByRole("menuitemradio", { name: "CR" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Name" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Name" }));

    expect(screen.getByRole("button", { name: "Sort — Name" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});

describe("ShowMore", () => {
  it("counts what is already on screen, and vanishes when the list is whole", () => {
    const { rerender } = render(
      <ShowMore hasMore loadingMore={false} onMore={() => {}} count={24} />,
    );
    expect(screen.getByRole("button", { name: "Show more (24 so far)" })).toBeInTheDocument();

    rerender(<ShowMore hasMore={false} loadingMore={false} onMore={() => {}} count={24} />);
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  });
});

describe("useFilterQuery with FilterBox", () => {
  const FACETS: ReadonlyArray<FilterInputFacet> = [
    {
      kind: "enum",
      key: "kind",
      label: "Kind",
      options: [
        { value: "class", label: "Class" },
        { value: "race", label: "Race" },
      ],
    },
    { kind: "range", key: "cr", label: "CR" },
    { kind: "boolean", key: "ritual", label: "Ritual" },
  ];

  function Harness() {
    const list = useFilterQuery(FACETS);
    return (
      <FilterBar narrowed={list.narrowed} onClear={list.clear}>
        <FilterBox label="Search" list={list} facets={FACETS} />
        <output data-testid="query">
          {JSON.stringify({
            q: list.q,
            kinds: list.valuesOf("kind"),
            ritual: list.flagOf("ritual") ?? null,
            cr: list.rangeOf("cr"),
          })}
        </output>
      </FilterBar>
    );
  }

  const read = () =>
    JSON.parse(screen.getByTestId("query").textContent ?? "{}") as {
      q: string;
      kinds: ReadonlyArray<string>;
      ritual: true | null;
      cr: { min?: string; max?: string };
    };

  it("debounces the search into the query, so typing is one request rather than eight", async () => {
    render(<Harness />);

    await userEvent.type(screen.getByRole("combobox", { name: "Search" }), "gob");
    expect(read().q).toBe("");
    await waitFor(() => expect(read().q).toBe("gob"));
  });

  it("a composition in progress never reaches the query as text", async () => {
    render(<Harness />);

    await userEvent.type(screen.getByRole("combobox", { name: "Search" }), "gob kind:cl");
    await waitFor(() => expect(read().q).toBe("gob"));
  });

  it("commits tokens the readers hand back typed — enum, range and boolean", async () => {
    render(<Harness />);
    const box = screen.getByRole("combobox", { name: "Search" });

    await userEvent.type(box, "kind:class{Enter}");
    await userEvent.type(box, "cr:0-5{Enter}");
    await waitFor(() => expect(read().kinds).toEqual(["class"]));
    expect(read().cr).toEqual({ min: "0", max: "5" });

    // A boolean facet's suggestion is the token itself.
    await userEvent.type(box, "ritu");
    await userEvent.click(await screen.findByRole("option", { name: "Ritual" }));
    await waitFor(() => expect(read().ritual).toBe(true));
  });

  it("clear empties the search and every token, from the bar's own button", async () => {
    render(<Harness />);
    const box = screen.getByRole("combobox", { name: "Search" });

    await userEvent.type(box, "kind:class{Enter}");
    await userEvent.type(box, "gob");
    await waitFor(() => expect(read().q).toBe("gob"));

    // The suggestion popup is open from typing; close it before reaching for
    // the bar (an open popup holds the accessibility tree, like any popup).
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(read()).toEqual({ q: "", kinds: [], ritual: null, cr: {} }));
    expect(box).toHaveValue("");
  });
});
