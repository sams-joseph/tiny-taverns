import { describe, expect, it } from "vitest";
import {
  ABILITY_LABELS,
  abilitiesFrom,
  abilityDrafts,
  assignScores,
  modifierFor,
  roll4d6DropLowest,
  rollAbilityScores,
  signed,
  STANDARD_ARRAY,
  swapScores,
  type Die,
} from "./abilities";

/**
 * The abilities editor's arithmetic and its dice, measured rather than argued.
 *
 * Every one of these is wrong *silently* in a browser: a modifier that
 * disagrees with its score renders, a flat 8–16 posing as 4d6 produces
 * plausible numbers, and a swap that loses a value leaves a sheet still drawing
 * six cells. The die is injected so the roll is a fact here rather than a
 * distribution somebody eyeballs.
 */

/** A d6 that hands back a scripted sequence, looping. */
const scripted = (faces: ReadonlyArray<number>): Die => {
  let at = 0;
  return () => {
    const face = faces[at % faces.length] as number;
    at += 1;
    return face;
  };
};

describe("the modifier", () => {
  it("is the rule, pre-signed, including at nought", () => {
    expect(modifierFor(18)).toBe("+4");
    expect(modifierFor(10)).toBe("+0");
    expect(modifierFor(11)).toBe("+0");
    expect(modifierFor(9)).toBe("-1");
    expect(modifierFor(1)).toBe("-5");
    expect(modifierFor(20)).toBe("+5");
  });

  it("rounds down, which for an odd low score is away from zero", () => {
    // ⌊(7 − 10) / 2⌋ is −2, not −1: `Math.trunc` would be the common bug.
    expect(modifierFor(7)).toBe("-2");
    expect(signed(0)).toBe("+0");
  });
});

describe("4d6, drop the lowest", () => {
  it("drops exactly one die, the lowest one", () => {
    expect(roll4d6DropLowest(scripted([1, 6, 6, 6]))).toBe(18);
    expect(roll4d6DropLowest(scripted([1, 1, 1, 1]))).toBe(3);
    expect(roll4d6DropLowest(scripted([6, 6, 6, 6]))).toBe(18);
    expect(roll4d6DropLowest(scripted([2, 5, 3, 4]))).toBe(12);
  });

  it("drops only one of a tied lowest pair", () => {
    expect(roll4d6DropLowest(scripted([2, 2, 5, 5]))).toBe(12);
  });

  /**
   * **The prototype's `8 + floor(random × 9)` cannot produce this**, which is
   * the whole reason the rule is here rather than copied: a flat 8–16 has no 17
   * and no 18 at all, and rolls a 3 as often as a 13.
   */
  it("reaches the ends a flat 8–16 never could", () => {
    const rolls = Array.from({ length: 4000 }, () => roll4d6DropLowest());
    expect(rolls.every((score) => score >= 3 && score <= 18)).toBe(true);
    expect(rolls.some((score) => score > 16)).toBe(true);
  });

  it("rolls one per cell, in the order the cells are drawn", () => {
    const scores = rollAbilityScores(scripted([1, 6, 6, 6]));
    expect(scores).toHaveLength(ABILITY_LABELS.length);
    expect(scores).toEqual([18, 18, 18, 18, 18, 18]);
  });
});

describe("the rows the dialog opens with", () => {
  it("draws the six even on a sheet that has none", () => {
    const drafts = abilityDrafts([]);
    expect(drafts.map((draft) => draft.label)).toEqual([...ABILITY_LABELS]);
    expect(drafts.every((draft) => draft.score === "")).toBe(true);
  });

  it("seeds from the document and keeps the saving throw with its mark", () => {
    const drafts = abilityDrafts([
      { label: "WIS", score: "13", modifier: "+1", save: "+4", proficient: true },
    ]);
    const wis = drafts.find((draft) => draft.label === "WIS");
    expect(wis).toMatchObject({ score: "13", save: "+4", proficient: true });
    expect(drafts.find((draft) => draft.label === "STR")?.score).toBe("");
  });

  /** A cell the DM's own form wrote is carried through, not dropped. */
  it("keeps a label that is not one of the six", () => {
    const drafts = abilityDrafts([{ label: "HON", score: "12", modifier: "+1" }]);
    expect(drafts).toHaveLength(7);
    expect(drafts[6]).toMatchObject({ label: "HON", score: "12", extra: true });
  });
});

describe("filling the boxes", () => {
  it("lays the standard array into the six, in order", () => {
    const filled = assignScores(abilityDrafts([]), [...STANDARD_ARRAY]);
    expect(filled.map((draft) => draft.score)).toEqual(["15", "14", "13", "12", "10", "8"]);
  });

  it("leaves a seventh cell alone", () => {
    const drafts = abilityDrafts([{ label: "HON", score: "12", modifier: "+1" }]);
    const filled = assignScores(drafts, [...STANDARD_ARRAY]);
    expect(filled[6]).toMatchObject({ label: "HON", score: "12" });
  });
});

describe("swapping", () => {
  const drafts = assignScores(abilityDrafts([]), [...STANDARD_ARRAY]);

  it("trades the two scores and moves nothing else", () => {
    const swapped = swapScores(drafts, "STR", "CHA");
    expect(swapped.find((draft) => draft.label === "STR")?.score).toBe("8");
    expect(swapped.find((draft) => draft.label === "CHA")?.score).toBe("15");
    expect(swapped.find((draft) => draft.label === "DEX")?.score).toBe("14");
  });

  /**
   * The saving throw belongs to the ability rather than to the number — a
   * paladin proficient in Charisma saves stays so when the 16 goes elsewhere.
   */
  it("leaves the saving throw and its mark where they were", () => {
    const withSave = abilityDrafts([
      { label: "STR", score: "18", modifier: "+4", save: "+7", proficient: true },
      { label: "CHA", score: "8", modifier: "-1" },
    ]);
    const swapped = swapScores(withSave, "STR", "CHA");
    expect(swapped.find((draft) => draft.label === "STR")).toMatchObject({
      score: "8",
      save: "+7",
      proficient: true,
    });
    expect(swapped.find((draft) => draft.label === "CHA")).toMatchObject({
      score: "18",
      save: "",
      proficient: false,
    });
  });

  it("is a no-op against itself or against a label that is not there", () => {
    expect(swapScores(drafts, "STR", "STR")).toBe(drafts);
    expect(swapScores(drafts, "STR", "LUK")).toBe(drafts);
  });
});

describe("what goes on the wire", () => {
  it("writes the modifier beside the score it came from", () => {
    const filled = assignScores(abilityDrafts([]), [...STANDARD_ARRAY]);
    expect(abilitiesFrom(filled)).toEqual([
      { label: "STR", score: "15", modifier: "+2" },
      { label: "DEX", score: "14", modifier: "+2" },
      { label: "CON", score: "13", modifier: "+1" },
      { label: "INT", score: "12", modifier: "+1" },
      { label: "WIS", score: "10", modifier: "+0" },
      { label: "CHA", score: "8", modifier: "-1" },
    ]);
  });

  /** `Ability.score` is a `NonEmptyString`, so a blank cell is not expressible. */
  it("drops a cell nobody filled in", () => {
    expect(abilitiesFrom(abilityDrafts([]))).toEqual([]);
    const partial = abilityDrafts([{ label: "STR", score: "18", modifier: "+4" }]);
    expect(abilitiesFrom(partial)).toEqual([{ label: "STR", score: "18", modifier: "+4" }]);
  });

  it("omits the saving throw and the mark rather than writing them empty", () => {
    const drafts = abilityDrafts([{ label: "STR", score: "18", modifier: "+4" }]);
    const [str] = abilitiesFrom(drafts);
    expect(str).not.toHaveProperty("save");
    expect(str).not.toHaveProperty("proficient");
  });

  it("cannot be made to disagree with itself", () => {
    // The document's own modifier is not carried through: the score is the
    // input and the modifier is computed from it, in the same literal.
    const stale = abilityDrafts([{ label: "STR", score: "18", modifier: "-99" }]);
    expect(abilitiesFrom(stale)[0]?.modifier).toBe("+4");
  });
});
