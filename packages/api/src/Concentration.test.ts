import { describe, expect, it } from "vitest";
import { concentrationDc } from "./Concentration.js";

describe("the concentration save", () => {
  it("is DC 10 until half the damage is more, and halves rounding down", () => {
    expect(concentrationDc(1)).toBe(10);
    expect(concentrationDc(12)).toBe(10);
    expect(concentrationDc(21)).toBe(10);
    expect(concentrationDc(22)).toBe(11);
    expect(concentrationDc(25)).toBe(12);
    expect(concentrationDc(60)).toBe(30);
  });
});
