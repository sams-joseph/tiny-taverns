import { describe, expect, it } from "vitest";
import { segments } from "./search";

/**
 * Where the emphasis goes, and what is never done to an excerpt.
 *
 * The API returns a plain-text snippet on purpose (`Search.ts`), so the
 * highlighting has to be reconstructed from the query. These pin that it splits
 * rather than substitutes: nothing here builds a string containing markup, and
 * a snippet that already contains angle brackets keeps them as characters.
 */
describe("picking the query's words out of an excerpt", () => {
  it("splits the text into matched and unmatched runs, losing nothing", () => {
    const pieces = segments("the ferryman waits", "ferryman");
    expect(pieces.map((piece) => piece.text).join("")).toBe("the ferryman waits");
    expect(pieces.filter((piece) => piece.match).map((piece) => piece.text)).toEqual(["ferryman"]);
  });

  it("matches without regard to case, and treats each word separately", () => {
    const pieces = segments("Cazril will not take coin", "cazril coin");
    expect(pieces.filter((piece) => piece.match).map((piece) => piece.text)).toEqual([
      "Cazril",
      "coin",
    ]);
  });

  it("leaves angle brackets as characters — the snippet is never markup", () => {
    const pieces = segments("the ferryman <b>waits</b>", "ferryman");
    expect(pieces.map((piece) => piece.text).join("")).toBe("the ferryman <b>waits</b>");
  });

  it("does not highlight a term the search excluded, or its operators", () => {
    // `websearch_to_tsquery` reads a leading `-` as "without" and `or` as a
    // join. Highlighting either would misreport why the row matched.
    const pieces = segments("the ferryman or the boatman", "ferryman -boatman or");
    expect(pieces.filter((piece) => piece.match).map((piece) => piece.text)).toEqual(["ferryman"]);
  });

  it("survives a query made of regex punctuation", () => {
    expect(
      segments("a (b) c", "(b)")
        .map((piece) => piece.text)
        .join(""),
    ).toBe("a (b) c");
    expect(segments("a (b) c", "(b)").filter((piece) => piece.match)).toHaveLength(1);
  });

  it("leaves a one-letter query alone rather than lighting up every word", () => {
    const pieces = segments("the ferryman waits", "a");
    expect(pieces).toEqual([{ text: "the ferryman waits", match: false }]);
  });
});
