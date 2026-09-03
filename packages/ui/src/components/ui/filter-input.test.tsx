import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { FilterInput } from "./filter-input";
import {
  EMPTY_FILTER_VALUE,
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
  const pills = [...document.querySelectorAll("[data-slot=combobox-chip]")] as Array<HTMLElement>;
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
