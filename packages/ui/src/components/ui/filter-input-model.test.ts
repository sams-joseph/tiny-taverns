import { describe, expect, it } from "vitest";

import {
  compositionOf,
  rangeBoundsOf,
  rangeValueOf,
  searchTextOf,
  suggestionsFor,
  tokenLabelOf,
  tokenValuesOf,
  withComposition,
  withToken,
  type FilterInputFacet,
} from "./filter-input-model";

const FACETS: ReadonlyArray<FilterInputFacet> = [
  {
    kind: "enum",
    key: "type",
    label: "Type",
    options: [
      { value: "beast", label: "Beast" },
      { value: "humanoid", label: "Humanoid" },
      { value: "undead", label: "Undead" },
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

  it("never composes a boolean facet — its suggestion is the token", () => {
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
  it("parses the four shapes, with decimals and fractions", () => {
    expect(rangeValueOf("0-5")).toBe("0-5");
    expect(rangeValueOf("3-")).toBe("3-");
    expect(rangeValueOf("-8")).toBe("-8");
    expect(rangeValueOf("5")).toBe("5");
    expect(rangeValueOf("1/4-2")).toBe("1/4-2");
    expect(rangeValueOf("0.5-1.5")).toBe("0.5-1.5");
    expect(rangeValueOf(" 3 - 8 ")).toBe("3-8");
  });

  it("refuses what does not parse", () => {
    expect(rangeValueOf("")).toBeUndefined();
    expect(rangeValueOf("-")).toBeUndefined();
    expect(rangeValueOf("abc")).toBeUndefined();
    expect(rangeValueOf("1-2-3")).toBeUndefined();
  });

  it("reads an exact value as both ends", () => {
    expect(rangeBoundsOf("0-5")).toEqual({ min: "0", max: "5" });
    expect(rangeBoundsOf("5")).toEqual({ min: "5", max: "5" });
    expect(rangeBoundsOf("3-")).toEqual({ min: "3", max: undefined });
    expect(rangeBoundsOf("-8")).toEqual({ min: undefined, max: "8" });
  });
});

describe("tokenLabelOf", () => {
  it("says the facet and the option's label", () => {
    expect(tokenLabelOf({ facet: "type", value: "beast" }, FACETS)).toBe("Type: Beast");
  });
  it("renders a range readably", () => {
    expect(tokenLabelOf({ facet: "cr", value: "0-5" }, FACETS)).toBe("CR: 0–5");
    expect(tokenLabelOf({ facet: "cr", value: "5" }, FACETS)).toBe("CR: 5");
    expect(tokenLabelOf({ facet: "cr", value: "3-" }, FACETS)).toBe("CR: 3 and up");
    expect(tokenLabelOf({ facet: "cr", value: "-8" }, FACETS)).toBe("CR: up to 8");
  });
  it("a boolean chip is just its label", () => {
    expect(tokenLabelOf({ facet: "legendary", value: "true" }, FACETS)).toBe("Legendary");
  });
  it("keeps a token whose facet is gone legible rather than crashing", () => {
    expect(tokenLabelOf({ facet: "old", value: "x" }, FACETS)).toBe("old: x");
  });
});

describe("suggestionsFor", () => {
  it("offers every facet when nothing is typed, booleans as ready tokens", () => {
    const suggestions = suggestionsFor("", FACETS);
    expect(suggestions.map((s) => (s.kind === "facet" ? s.key : s.token.facet))).toEqual([
      "type",
      "attunement",
      "cr",
      "legendary",
    ]);
    expect(suggestions.find((s) => s.kind === "token")?.token).toEqual({
      facet: "legendary",
      value: "true",
    });
  });

  it("narrows facets by the trailing word and cross-matches enum values", () => {
    const suggestions = suggestionsFor("beast", FACETS);
    expect(suggestions).toEqual([
      { kind: "token", token: { facet: "type", value: "beast" }, label: "Type: Beast" },
    ]);
  });

  it("lists a composed enum facet's values, narrowed by the query", () => {
    const suggestions = suggestionsFor("type:un", FACETS);
    expect(suggestions).toEqual([
      { kind: "token", token: { facet: "type", value: "undead" }, label: "Type: Undead" },
    ]);
  });

  it("offers a composed range exactly when it parses", () => {
    expect(suggestionsFor("cr:", FACETS)).toEqual([]);
    expect(suggestionsFor("cr:0-5", FACETS)).toEqual([
      { kind: "token", token: { facet: "cr", value: "0-5" }, label: "CR: 0–5" },
    ]);
  });

  it("skips an enum facet with no vocabulary", () => {
    const facets: ReadonlyArray<FilterInputFacet> = [
      { kind: "enum", key: "empty", label: "Empty", options: [] },
    ];
    expect(suggestionsFor("", facets)).toEqual([]);
  });
});

describe("withToken", () => {
  const value = { text: "goblin type:bea", tokens: [] };

  it("commits the token and spends the composing segment", () => {
    const next = withToken(value, { facet: "type", value: "beast" }, FACETS);
    expect(next.tokens).toEqual([{ facet: "type", value: "beast" }]);
    expect(next.text).toBe("goblin ");
  });

  it("spends the matched trailing word on a cross-match commit", () => {
    const next = withToken(
      { text: "goblin bea", tokens: [] },
      { facet: "type", value: "beast" },
      FACETS,
    );
    expect(next.text).toBe("goblin ");
  });

  it("toggles an existing token off", () => {
    const armed = { text: "", tokens: [{ facet: "type", value: "beast" }] };
    expect(withToken(armed, { facet: "type", value: "beast" }, FACETS).tokens).toEqual([]);
  });

  it("stands beside another value of an any-of facet", () => {
    const armed = { text: "", tokens: [{ facet: "type", value: "beast" }] };
    expect(withToken(armed, { facet: "type", value: "undead" }, FACETS).tokens).toHaveLength(2);
  });

  it("replaces the previous token of a single-valued facet", () => {
    const attuned = { text: "", tokens: [{ facet: "attunement", value: "required" }] };
    expect(withToken(attuned, { facet: "attunement", value: "none" }, FACETS).tokens).toEqual([
      { facet: "attunement", value: "none" },
    ]);
    const ranged = { text: "", tokens: [{ facet: "cr", value: "0-5" }] };
    expect(withToken(ranged, { facet: "cr", value: "3-" }, FACETS).tokens).toEqual([
      { facet: "cr", value: "3-" },
    ]);
  });
});

describe("withComposition and tokenValuesOf", () => {
  it("rewrites the trailing word into the facet key and a colon", () => {
    expect(withComposition({ text: "goblin ty", tokens: [] }, "type", FACETS).text).toBe(
      "goblin type:",
    );
  });
  it("reads one facet's committed values in order", () => {
    const value = {
      text: "",
      tokens: [
        { facet: "type", value: "beast" },
        { facet: "cr", value: "0-5" },
        { facet: "type", value: "undead" },
      ],
    };
    expect(tokenValuesOf(value, "type")).toEqual(["beast", "undead"]);
  });
});
