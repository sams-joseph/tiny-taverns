import { describe, expect, it } from "vitest";
import { parseDiceExpression, rollDiceExpression, rollFace } from "./Dice.js";

/** A source that answers each face in turn for a die of `sides`, the last one forever after. */
const faces = (sides: number, ...answers: ReadonlyArray<number>) => {
  let index = 0;
  return () => {
    const face = answers[index] ?? answers[answers.length - 1] ?? 1;
    index += 1;
    return (face - 1) / sides;
  };
};

describe("dice", () => {
  it("parses a notation and refuses text that is not one", () => {
    expect(parseDiceExpression("1d10+4")).toEqual({
      count: 1,
      faces: 10,
      modifier: 4,
      notation: "1d10+4",
    });
    expect(parseDiceExpression("2d8 - 1")).toEqual({
      count: 2,
      faces: 8,
      modifier: -1,
      notation: "2d8-1",
    });
    expect(parseDiceExpression("—")).toBeUndefined();
    expect(parseDiceExpression("forty goblins")).toBeUndefined();
    expect(parseDiceExpression("41d6")).toBeUndefined();
  });

  it("rolls a face from 1 to the die's sides, whatever the source answers", () => {
    expect(rollFace(6, () => 0)).toBe(1);
    expect(rollFace(6, () => 0.999_999_999_9)).toBe(6);
    expect(rollFace(6, () => 1)).toBe(6);
  });

  it("rolls ordinary dice with the modifier in the notation", () => {
    expect(rollDiceExpression("Halberd", "1d10+4", "normal", faces(10, 6))).toEqual({
      label: "Halberd",
      notation: "1d10+4",
      dice: [6],
      kept: [6],
      modifier: 4,
      mode: "normal",
      total: 10,
    });
  });

  it("throws two d20s at advantage or disadvantage, and ignores the mode for other dice", () => {
    expect(rollDiceExpression("Save", "1d20+2", "disadvantage", faces(20, 15, 1))).toMatchObject({
      dice: [15, 1],
      kept: [1],
      mode: "disadvantage",
      total: 3,
      natural: 1,
    });
    expect(rollDiceExpression("Fire", "2d6", "advantage", faces(6, 3, 4))).toMatchObject({
      dice: [3, 4],
      kept: [3, 4],
      mode: "normal",
      total: 7,
    });
  });
});
