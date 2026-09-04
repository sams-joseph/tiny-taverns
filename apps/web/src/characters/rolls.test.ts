import { describe, expect, it } from "vitest";
import {
  notationForD20,
  parseDiceExpression,
  rollAbilityCheck,
  rollDetail,
  rollDiceExpression,
} from "./rolls";

const dice = (...faces: ReadonlyArray<number>) => {
  let index = 0;
  return () => {
    const face = faces[index] ?? faces[faces.length - 1] ?? 1;
    index += 1;
    return (face - 1) / 20;
  };
};

const d10 = (...faces: ReadonlyArray<number>) => {
  let index = 0;
  return () => {
    const face = faces[index] ?? faces[faces.length - 1] ?? 1;
    index += 1;
    return (face - 1) / 10;
  };
};

describe("local character rolls", () => {
  it("parses the sheet's dice notation and refuses non-dice text", () => {
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
  });

  it("rolls ordinary action dice with the modifier in the expression", () => {
    expect(rollDiceExpression("Halberd", "1d10+4", "normal", d10(6))).toEqual({
      label: "Halberd",
      notation: "1d10+4",
      dice: [6],
      kept: [6],
      modifier: 4,
      mode: "normal",
      total: 10,
    });
  });

  it("keeps the high d20 at advantage and the low one at disadvantage", () => {
    expect(rollAbilityCheck("STR check", "+4", "advantage", dice(2, 18))).toMatchObject({
      notation: "1d20+4",
      dice: [2, 18],
      kept: [18],
      modifier: 4,
      mode: "advantage",
      total: 22,
    });
    expect(rollAbilityCheck("STR check", "+4", "disadvantage", dice(2, 18))).toMatchObject({
      dice: [2, 18],
      kept: [2],
      mode: "disadvantage",
      total: 6,
    });
  });

  it("builds d20 notation from the stored signed modifier", () => {
    expect(notationForD20("-1")).toBe("1d20-1");
    expect(notationForD20("+0")).toBe("1d20+0");
    expect(notationForD20("not a number")).toBeUndefined();
  });

  it("formats the local log with faces, kept die, modifier, mode and total", () => {
    const roll = rollAbilityCheck("DEX check", "+1", "advantage", dice(20, 3));
    expect(roll).toMatchObject({ total: 21, natural: 20 });
    expect(roll === undefined ? undefined : rollDetail(roll)).toBe(
      "1d20+1 · dice 20, 3 · kept 20 · +1 · advantage",
    );
  });
});
