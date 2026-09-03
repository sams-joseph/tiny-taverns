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
    options: [
      { value: "beast", label: "Beast" },
      { value: "undead", label: "Undead" },
    ],
  },
  { kind: "range", key: "cr", label: "CR" },
  { kind: "boolean", key: "legendary", label: "Legendary" },
];

/** The component is controlled; the harness is the consumer holding the value. */
function Harness({
  initial = EMPTY_FILTER_VALUE,
  facets = FACETS,
  seen,
}: {
  readonly initial?: FilterInputValue;
  readonly facets?: ReadonlyArray<FilterInputFacet>;
  readonly seen: { current: FilterInputValue };
}) {
  const [value, setValue] = useState(initial);
  seen.current = value;
  return <FilterInput value={value} onChange={setValue} facets={facets} label="Search things" />;
}

const renderInput = (props?: {
  readonly initial?: FilterInputValue;
  readonly facets?: ReadonlyArray<FilterInputFacet>;
}) => {
  const seen = { current: EMPTY_FILTER_VALUE };
  render(<Harness {...props} seen={seen} />);
  return { seen, input: screen.getByRole("combobox", { name: "Search things" }) };
};

describe("FilterInput", () => {
  it("typed text is the search, and Enter alone commits no filter", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.type(input, "goblin{Enter}");
    expect(seen.current.text).toBe("goblin");
    expect(seen.current.tokens).toEqual([]);
  });

  it("opens the facet suggestions on click and commits a value through the drill-down", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.click(input);
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByRole("option", { name: "Type" }));

    // Drilling in rewrote the input to `type:` and now lists the values.
    expect(input).toHaveValue("type:");
    await user.click(await screen.findByRole("option", { name: "Type: Beast" }));

    expect(seen.current.tokens).toEqual([{ facet: "type", value: "beast" }]);
    expect(seen.current.text).toBe("");
    expect(screen.getByText("Type: Beast")).toBeInTheDocument();
  });

  it("commits a typed facet:value with the keyboard alone", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.type(input, "type:bea{Enter}");
    expect(seen.current.tokens).toEqual([{ facet: "type", value: "beast" }]);
    expect(seen.current.text).toBe("");
  });

  it("keeps the search text while a facet is composed after it", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.type(input, "goblin type:bea{Enter}");
    expect(seen.current.tokens).toEqual([{ facet: "type", value: "beast" }]);
    expect(seen.current.text).toBe("goblin ");
    expect(input).toHaveValue("goblin ");
  });

  it("commits a range once it parses, replacing the facet's previous token", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.type(input, "cr:0-5{Enter}");
    expect(seen.current.tokens).toEqual([{ facet: "cr", value: "0-5" }]);

    await user.type(input, "cr:3-{Enter}");
    expect(seen.current.tokens).toEqual([{ facet: "cr", value: "3-" }]);
    expect(screen.getByText("CR: 3 and up")).toBeInTheDocument();
  });

  it("offers a boolean facet as a ready token", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.click(input);
    await user.click(await screen.findByRole("option", { name: "Legendary" }));
    expect(seen.current.tokens).toEqual([{ facet: "legendary", value: "true" }]);
  });

  it("removes a chip from its own remove button", async () => {
    const user = userEvent.setup();
    const { seen } = renderInput({
      initial: { text: "", tokens: [{ facet: "type", value: "beast" }] },
    });

    expect(screen.getByText("Type: Beast")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Type: Beast" }));
    expect(seen.current.tokens).toEqual([]);
  });

  it("Backspace on an empty input removes the last chip", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput({
      initial: {
        text: "",
        tokens: [
          { facet: "type", value: "beast" },
          { facet: "legendary", value: "true" },
        ],
      },
    });

    await user.click(input);
    await user.keyboard("{Backspace}");
    expect(seen.current.tokens).toEqual([{ facet: "type", value: "beast" }]);
  });

  it("selecting an already-committed value toggles it off", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput({
      initial: { text: "", tokens: [{ facet: "type", value: "beast" }] },
    });

    await user.type(input, "type:bea{Enter}");
    expect(seen.current.tokens).toEqual([]);
  });

  it("with no facets it is a plain search box — no popup ever", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput({ facets: [] });

    await user.click(input);
    await user.type(input, "crate");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(seen.current.text).toBe("crate");
  });

  it("an unknown prefix stays search text", async () => {
    const user = userEvent.setup();
    const { seen, input } = renderInput();

    await user.type(input, "time: dusk{Enter}");
    expect(seen.current.tokens).toEqual([]);
    expect(seen.current.text).toBe("time: dusk");
  });
});
