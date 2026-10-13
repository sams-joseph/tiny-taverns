import { describe, expect, it } from "vitest";
import { attackLands, attackModeAt, rollAttack } from "./Attack.js";

/** Each answer in turn, then the last forever: `(face - 1) / sides` picks a face. */
const seeded = (...values: ReadonlyArray<number>) => {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
};
const d20 = (face: number) => (face - 1) / 20;
const d8 = (face: number) => (face - 1) / 8;

const longsword = { toHit: 5, damage: [{ dice: "1d8+3", type: "slashing" }] } as const;

describe("rollAttack", () => {
  it("hits at the AC and rolls the damage", () => {
    expect(
      rollAttack({ ...longsword, ac: 15, mode: "normal", random: seeded(d20(10), d8(6)) }),
    ).toEqual({
      d20s: [10],
      d20: 10,
      mode: "normal",
      toHit: 5,
      total: 15,
      ac: 15,
      verdict: "hit",
      damage: [{ notation: "1d8+3", faces: [6], modifier: 3, total: 9, type: "slashing" }],
      amount: 9,
    });
  });

  it("misses under the AC and on a natural 1, rolling no damage", () => {
    const miss = rollAttack({ ...longsword, ac: 16, mode: "normal", random: seeded(d20(10)) });
    expect(miss).toMatchObject({ verdict: "miss", damage: [], amount: 0 });
    const fumble = rollAttack({ ...longsword, ac: 2, mode: "normal", random: seeded(d20(1)) });
    expect(fumble).toMatchObject({ verdict: "natural-1", amount: 0 });
  });

  it("crits on a natural 20 with the damage dice doubled", () => {
    const crit = rollAttack({
      ...longsword,
      ac: 30,
      mode: "normal",
      random: seeded(d20(20), d8(4), d8(5)),
    });
    expect(crit.verdict).toBe("critical");
    expect(crit.damage).toEqual([
      { notation: "2d8+3", faces: [4, 5], modifier: 3, total: 12, type: "slashing" },
    ]);
  });

  it("keeps the lower d20 at disadvantage and the higher at advantage", () => {
    const worse = rollAttack({
      ...longsword,
      ac: 15,
      mode: "disadvantage",
      random: seeded(d20(18), d20(4)),
    });
    expect(worse).toMatchObject({ d20s: [18, 4], d20: 4, total: 9, verdict: "miss" });
    const better = rollAttack({
      ...longsword,
      ac: 15,
      mode: "advantage",
      random: seeded(d20(4), d20(18), d8(1)),
    });
    expect(better).toMatchObject({ d20s: [4, 18], d20: 18, verdict: "hit", amount: 4 });
  });

  it("leaves a target with no AC to the DM, damage rolled", () => {
    const rolled = rollAttack({ ...longsword, ac: null, mode: "normal", random: seeded(d20(9)) });
    expect(rolled.verdict).toBe("no-ac");
    expect(attackLands(rolled.verdict)).toBe(true);
  });
});

describe("attackModeAt", () => {
  it("is disadvantage at long range only", () => {
    expect(attackModeAt("long")).toBe("disadvantage");
    expect(attackModeAt("normal")).toBe("normal");
    expect(attackModeAt("reach")).toBe("normal");
    expect(attackModeAt(undefined)).toBe("normal");
  });
});
