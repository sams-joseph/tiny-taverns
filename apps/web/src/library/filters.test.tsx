import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  FilterBar,
  FilterMultiSelect,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  ShowMore,
} from "./filters";
import { listCount, useListQuery } from "./query";

/**
 * The shared Library filter pattern, pinned as components.
 *
 * Every tab renders these; what each tab's own test pins is which facets it
 * offers and what reaches its wire. What is pinned here is the behaviour no
 * tab may vary: where the clear affordance comes from, what a trigger says,
 * and that an any-of facet really accumulates values.
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

describe("FilterSelect", () => {
  const SORTS = [
    { value: "cr", label: "CR" },
    { value: "name", label: "Name" },
  ];

  it("names the facet and the choice in the trigger, never the bare value", async () => {
    function Harness() {
      const [value, setValue] = useState("cr");
      return <FilterSelect label="Sort" value={value} onChange={setValue} options={SORTS} />;
    }
    render(<Harness />);

    const trigger = screen.getByRole("combobox", { name: "Sort" });
    expect(trigger).toHaveTextContent("Sort: CR");

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Name" }));
    expect(trigger).toHaveTextContent("Sort: Name");
  });
});

describe("FilterMultiSelect", () => {
  const OPTIONS = [
    { value: "beast", label: "Beast" },
    { value: "fey", label: "Fey" },
    { value: "undead", label: "Undead" },
  ];

  function Harness({ onChange }: { readonly onChange: (values: ReadonlyArray<string>) => void }) {
    const [values, setValues] = useState<ReadonlyArray<string>>([]);
    return (
      <FilterMultiSelect
        label="Type"
        values={values}
        onChange={(next) => {
          setValues(next);
          onChange(next);
        }}
        options={OPTIONS}
      />
    );
  }

  it("accumulates values across presses — any-of, with the popup staying open", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const trigger = screen.getByRole("combobox", { name: "Filter by Type" });
    expect(trigger).toHaveTextContent("Type");

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole("option", { name: "Beast" }));
    expect(onChange).toHaveBeenLastCalledWith(["beast"]);
    // One value: the trigger names it.
    expect(trigger).toHaveTextContent("Type: Beast");

    // The popup did not close, which is what any-of means.
    await userEvent.click(screen.getByRole("option", { name: "Fey" }));
    expect(onChange).toHaveBeenLastCalledWith(["beast", "fey"]);
    // Several: the trigger counts.
    expect(trigger).toHaveTextContent("Type · 2");

    // Pressing a chosen value takes it back out.
    await userEvent.click(screen.getByRole("option", { name: "Beast" }));
    expect(onChange).toHaveBeenLastCalledWith(["fey"]);
  });
});

describe("FilterToggle and ShowMore", () => {
  it("renders a pressed state the way the design system spells it", async () => {
    const onChange = vi.fn();
    render(
      <FilterToggle pressed={false} onChange={onChange}>
        Ritual
      </FilterToggle>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Ritual" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("counts what is already on screen, and vanishes when the list is whole", () => {
    const { rerender } = render(
      <ShowMore hasMore loadingMore={false} onMore={() => {}} count={24} />,
    );
    expect(screen.getByRole("button", { name: "Show more (24 so far)" })).toBeInTheDocument();

    rerender(<ShowMore hasMore={false} loadingMore={false} onMore={() => {}} count={24} />);
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  });
});

describe("useListQuery", () => {
  interface Query {
    readonly q: string;
    readonly sort: "name" | "recent";
    readonly kinds: ReadonlyArray<string>;
  }
  const initial: Query = { q: "", sort: "name", kinds: [] };

  function Harness() {
    const list = useListQuery(initial, {
      narrows: (query) => query.kinds.length > 0,
      onClear: (query) => ({ ...initial, sort: query.sort }),
    });
    return (
      <FilterBar narrowed={list.narrowed} onClear={list.clear}>
        <FilterSearch label="Search" value={list.term} onChange={list.setTerm} />
        <button onClick={() => list.patch({ kinds: ["class"] })}>narrow</button>
        <button onClick={() => list.patch({ sort: "recent" })}>reorder</button>
        <output>{JSON.stringify(list.query)}</output>
      </FilterBar>
    );
  }

  it("debounces the search into the query, so typing is one request rather than eight", async () => {
    render(<Harness />);
    const q = () => (JSON.parse(screen.getByRole("status").textContent ?? "{}") as Query).q;

    await userEvent.type(screen.getByRole("textbox", { name: "Search" }), "gob");
    expect(q()).toBe("");
    await waitFor(() => expect(q()).toBe("gob"));
  });

  it("clears everything but keeps the sort — reordering is not filtering", async () => {
    render(<Harness />);
    const query = () => JSON.parse(screen.getByRole("status").textContent ?? "{}") as Query;

    await userEvent.click(screen.getByRole("button", { name: "reorder" }));
    // Sort alone never narrows, so there is nothing to clear yet.
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "narrow" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search" }), "gob");
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(query()).toEqual({ q: "", sort: "recent", kinds: [] }));
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue("");
  });
});
