import { describe, expect, it } from "vitest";

import {
  compositionOf,
  conditionLabelOf,
  operatorLabelOf,
  operatorsFor,
  rangeBoundsOf,
  rangeConditionOf,
  searchTextOf,
  suggestionsFor,
  valuesLabelOf,
  valuesOf,
  visiblePillCount,
  withComposition,
  withNextOperator,
  withValue,
  type FilterCondition,
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
      { value: "humanoid", label: "Humanoid" },
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
  {
    kind: "enum",
    key: "attunement",
    label: "Attunement",
    multiple: false,
    options: [
      { value: "required", label: "Required" },
      { value: "none", label: "None" },
    ],
  },
  { kind: "range", key: "cr", label: "CR" },
  { kind: "boolean", key: "legendary", label: "Legendary" },
];

const empty: FilterInputValue = { text: "", filters: [], match: "all" };

describe("compositionOf", () => {
  it("reads the trailing facet:query segment and keeps the head as text", () => {
    const composition = compositionOf("goblin type:bea", FACETS);
    expect(composition?.facet.key).toBe("type");
    expect(composition?.query).toBe("bea");
    expect(composition?.head).toBe("goblin ");
  });

  it("carries spaces in the value query — enum labels are things like Level 3", () => {
    const composition = compositionOf("goblin type:some beast", FACETS);
    expect(composition?.facet.key).toBe("type");
    expect(composition?.query).toBe("some beast");
    expect(composition?.head).toBe("goblin ");
  });

  it("matches the facet's label as well as its key, case-insensitively", () => {
    expect(compositionOf("Type:undead", FACETS)?.facet.key).toBe("type");
    expect(compositionOf("CR:3-", FACETS)?.facet.key).toBe("cr");
  });

  it("treats an unknown prefix as text, not a filter", () => {
    expect(compositionOf("time: dusk", FACETS)).toBeUndefined();
    expect(compositionOf("weird:thing", FACETS)).toBeUndefined();
  });

  it("never composes a boolean facet — its suggestion is the condition", () => {
    expect(compositionOf("legendary:true", FACETS)).toBeUndefined();
  });
});

describe("searchTextOf", () => {
  it("is the text minus the composition in progress", () => {
    expect(searchTextOf("goblin type:bea", FACETS)).toBe("goblin");
    expect(searchTextOf("goblin king", FACETS)).toBe("goblin king");
    expect(searchTextOf("type:", FACETS)).toBe("");
  });
});

describe("ranges", () => {
  it("parses the four shapes into their comparison operators", () => {
    expect(rangeConditionOf("cr", "0-5")).toEqual({
      facet: "cr",
      operator: "between",
      values: ["0", "5"],
    });
    expect(rangeConditionOf("cr", "3-")).toEqual({ facet: "cr", operator: "gte", values: ["3"] });
    expect(rangeConditionOf("cr", "-8")).toEqual({ facet: "cr", operator: "lte", values: ["8"] });
    expect(rangeConditionOf("cr", "5")).toEqual({ facet: "cr", operator: "eq", values: ["5"] });
    expect(rangeConditionOf("cr", "1/4-2")).toEqual({
      facet: "cr",
      operator: "between",
      values: ["1/4", "2"],
    });
    expect(rangeConditionOf("cr", " 3 - 8 ")?.values).toEqual(["3", "8"]);
  });

  it("refuses what does not parse", () => {
    expect(rangeConditionOf("cr", "")).toBeUndefined();
    expect(rangeConditionOf("cr", "-")).toBeUndefined();
    expect(rangeConditionOf("cr", "abc")).toBeUndefined();
    expect(rangeConditionOf("cr", "1-2-3")).toBeUndefined();
  });

  it("reads the two ends off whichever operator holds them", () => {
    expect(rangeBoundsOf({ facet: "cr", operator: "between", values: ["0", "5"] })).toEqual({
      min: "0",
      max: "5",
    });
    expect(rangeBoundsOf({ facet: "cr", operator: "eq", values: ["5"] })).toEqual({
      min: "5",
      max: "5",
    });
    expect(rangeBoundsOf({ facet: "cr", operator: "gte", values: ["3"] })).toEqual({
      min: "3",
      max: undefined,
    });
    expect(rangeBoundsOf({ facet: "cr", operator: "lte", values: ["8"] })).toEqual({
      min: undefined,
      max: "8",
    });
  });
});

describe("operators", () => {
  it("derives the set from the facet's kind — exclusion only where declared", () => {
    expect(operatorsFor(FACETS[0]!)).toEqual(["in"]);
    expect(operatorsFor(FACETS[1]!)).toEqual(["in", "not"]);
    expect(operatorsFor(FACETS[3]!)).toEqual(["eq", "gte", "lte", "between"]);
    expect(operatorsFor(FACETS[4]!)).toEqual(["is"]);
  });

  it("words the operator by the value count, the way Linear does", () => {
    const one: FilterCondition = { facet: "type", operator: "in", values: ["beast"] };
    const two: FilterCondition = { facet: "type", operator: "in", values: ["beast", "undead"] };
    expect(operatorLabelOf(one)).toBe("is");
    expect(operatorLabelOf(two)).toBe("is any of");
    expect(operatorLabelOf({ ...one, operator: "not" })).toBe("is not");
    expect(operatorLabelOf({ ...two, operator: "not" })).toBe("is none of");
    expect(operatorLabelOf({ facet: "cr", operator: "gte", values: ["3"] })).toBe("is at least");
  });

  it("cycles an enum's operator and keeps its values", () => {
    const tag: FilterCondition = { facet: "tag", operator: "in", values: ["Marsh"] };
    const next = withNextOperator(tag, FACETS[1]!);
    expect(next).toEqual({ facet: "tag", operator: "not", values: ["Marsh"] });
    expect(withNextOperator(next, FACETS[1]!).operator).toBe("in");
  });

  it("cycles a range's comparison, reshaping the values", () => {
    const between: FilterCondition = { facet: "cr", operator: "between", values: ["1", "5"] };
    const eq = withNextOperator(between, FACETS[3]!);
    expect(eq).toEqual({ facet: "cr", operator: "eq", values: ["1"] });
    const gte = withNextOperator(eq, FACETS[3]!);
    expect(gte).toEqual({ facet: "cr", operator: "gte", values: ["1"] });
    const lte = withNextOperator(gte, FACETS[3]!);
    expect(lte).toEqual({ facet: "cr", operator: "lte", values: ["1"] });
    expect(withNextOperator(lte, FACETS[3]!)).toEqual({
      facet: "cr",
      operator: "between",
      values: ["1", "1"],
    });
  });

  it("a boolean's press flips its value; the operator stays a plain is", () => {
    const on: FilterCondition = { facet: "legendary", operator: "is", values: ["true"] };
    const off = withNextOperator(on, FACETS[4]!);
    expect(off.values).toEqual(["false"]);
    // The pill reads `Legendary is No` — the polarity lives in the value.
    expect(operatorLabelOf(off)).toBe("is");
  });
});

describe("segment labels", () => {
  it("aggregates several values with the facet's noun", () => {
    expect(valuesLabelOf({ facet: "type", operator: "in", values: ["beast"] }, FACETS)).toBe(
      "Beast",
    );
    expect(
      valuesLabelOf({ facet: "type", operator: "in", values: ["beast", "undead"] }, FACETS),
    ).toBe("2 types");
  });

  it("renders a range readably and a boolean as Yes/No", () => {
    expect(valuesLabelOf({ facet: "cr", operator: "between", values: ["0", "5"] }, FACETS)).toBe(
      "0–5",
    );
    expect(valuesLabelOf({ facet: "cr", operator: "gte", values: ["3"] }, FACETS)).toBe("3");
    expect(valuesLabelOf({ facet: "legendary", operator: "is", values: ["true"] }, FACETS)).toBe(
      "Yes",
    );
  });

  it("names the whole pill in one sentence", () => {
    expect(
      conditionLabelOf({ facet: "type", operator: "in", values: ["beast", "undead"] }, FACETS),
    ).toBe("Type is any of 2 types");
  });
});

describe("suggestionsFor", () => {
  it("offers every facet field when nothing is typed, booleans as ready conditions", () => {
    const suggestions = suggestionsFor("", FACETS);
    expect(suggestions.map((s) => (s.kind === "facet" ? s.key : s.facet))).toEqual([
      "type",
      "tag",
      "attunement",
      "cr",
      "legendary",
    ]);
    expect(suggestions.at(-1)).toEqual({
      kind: "value",
      facet: "legendary",
      value: "true",
      label: "Legendary",
    });
  });

  it("narrows fields by the trailing word and cross-matches enum values", () => {
    expect(suggestionsFor("beast", FACETS)).toEqual([
      { kind: "value", facet: "type", value: "beast", label: "Type: Beast" },
    ]);
  });

  it("lists a composed enum facet's values bare, narrowed by the query", () => {
    expect(suggestionsFor("type:un", FACETS)).toEqual([
      { kind: "value", facet: "type", value: "undead", label: "Undead" },
    ]);
  });

  it("offers a composed range exactly when it parses, worded as the pill will be", () => {
    expect(suggestionsFor("cr:", FACETS)).toEqual([]);
    expect(suggestionsFor("cr:0-5", FACETS)).toEqual([
      { kind: "value", facet: "cr", value: "0-5", label: "CR is between 0–5" },
    ]);
  });

  it("skips an enum facet with no vocabulary", () => {
    const facets: ReadonlyArray<FilterInputFacet> = [
      { kind: "enum", key: "empty", label: "Empty", options: [] },
    ];
    expect(suggestionsFor("", facets)).toEqual([]);
  });
});

describe("withValue", () => {
  it("a typed query is spent whole; a browsed picker keeps its key:", () => {
    const typed = withValue({ ...empty, text: "goblin type:bea" }, "type", "beast", FACETS);
    expect(typed.filters).toEqual([{ facet: "type", operator: "in", values: ["beast"] }]);
    expect(typed.text).toBe("goblin ");

    // Browsing — the query empty, values picked from the popup — stays on the
    // facet for the next pick; closing the popup sweeps the bare remnant.
    const browsed = withValue({ ...empty, text: "goblin type:" }, "type", "beast", FACETS);
    expect(browsed.text).toBe("goblin type:");
  });

  it("widens the same facet's condition — any-of — rather than adding a second pill", () => {
    const one = withValue(empty, "type", "beast", FACETS);
    const two = withValue(one, "type", "undead", FACETS);
    expect(two.filters).toEqual([{ facet: "type", operator: "in", values: ["beast", "undead"] }]);
  });

  it("toggles a chosen value back out, and an emptied condition leaves whole", () => {
    const one = withValue(empty, "type", "beast", FACETS);
    expect(withValue(one, "type", "beast", FACETS).filters).toEqual([]);
  });

  it("keeps the operator while values change", () => {
    const excluded: FilterInputValue = {
      ...empty,
      filters: [{ facet: "tag", operator: "not", values: ["Marsh"] }],
    };
    expect(withValue(excluded, "tag", "Night", FACETS).filters).toEqual([
      { facet: "tag", operator: "not", values: ["Marsh", "Night"] },
    ]);
  });

  it("replaces the value of a single-select facet", () => {
    const one = withValue(empty, "attunement", "required", FACETS);
    expect(withValue(one, "attunement", "none", FACETS).filters).toEqual([
      { facet: "attunement", operator: "in", values: ["none"] },
    ]);
  });

  it("a range value re-parses into its comparison and replaces the facet's pill", () => {
    const first = withValue(empty, "cr", "0-5", FACETS);
    expect(first.filters).toEqual([{ facet: "cr", operator: "between", values: ["0", "5"] }]);
    expect(withValue(first, "cr", "3-", FACETS).filters).toEqual([
      { facet: "cr", operator: "gte", values: ["3"] },
    ]);
  });

  it("a boolean value sets its one-value condition, and the same value toggles it off", () => {
    const on = withValue(empty, "legendary", "true", FACETS);
    expect(on.filters).toEqual([{ facet: "legendary", operator: "is", values: ["true"] }]);
    expect(withValue(on, "legendary", "true", FACETS).filters).toEqual([]);
  });
});

describe("withComposition and valuesOf", () => {
  it("rewrites the trailing word into the facet key and a colon", () => {
    expect(withComposition({ ...empty, text: "goblin ty" }, "type", FACETS).text).toBe(
      "goblin type:",
    );
  });

  it("reads the inclusion list, and nothing from an exclusion", () => {
    const value: FilterInputValue = {
      ...empty,
      filters: [
        { facet: "type", operator: "in", values: ["beast", "undead"] },
        { facet: "tag", operator: "not", values: ["Marsh"] },
      ],
    };
    expect(valuesOf(value, "type")).toEqual(["beast", "undead"]);
    expect(valuesOf(value, "tag")).toEqual([]);
  });
});

describe("visiblePillCount", () => {
  const layout = { gap: 6, overflowWidth: 60 };

  it("shows everything that fits, with no chip reserved", () => {
    expect(visiblePillCount({ ...layout, available: 400, pillWidths: [120, 120, 120] })).toBe(3);
  });

  it("keeps the newest pills and reserves the chip once anything hides", () => {
    // 3 × 126 = 378 > 300; chip 66 + newest 126 = 192, + next 126 = 318 > 300.
    expect(visiblePillCount({ ...layout, available: 300, pillWidths: [120, 120, 120] })).toBe(1);
  });

  it("can hide everything when even one pill and the chip cannot share the line", () => {
    expect(visiblePillCount({ ...layout, available: 100, pillWidths: [120, 120] })).toBe(0);
  });

  it("fits by width, not by count — a narrow newest pill lets an older one stay", () => {
    // Newest first: 46 + chip 66 = 112, + 80 = 192, + 200 = 392 > 320 → 2 visible.
    expect(visiblePillCount({ ...layout, available: 320, pillWidths: [200, 74, 40] })).toBe(2);
  });

  it("is exact at the boundary", () => {
    // 2 × 126 = 252 fits 252 exactly.
    expect(visiblePillCount({ ...layout, available: 252, pillWidths: [120, 120] })).toBe(2);
  });
});
