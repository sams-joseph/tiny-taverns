import { describe, expect, it } from "vitest";
import { speedsOf, walkingFeet } from "./Speed.js";

describe("a written speed", () => {
  it("reads the walking speed off the front, as a sheet or the import writes it", () => {
    expect(walkingFeet("30 ft.")).toBe(30);
    expect(walkingFeet(" 25 ft.")).toBe(25);
    expect(walkingFeet("30 ft., climb 30 ft.")).toBe(30);
    expect(walkingFeet("30 feet")).toBe(30);
  });

  it("keeps a walking speed of zero, which a flier or a swimmer may write", () => {
    expect(speedsOf("0 ft., fly 30 ft. (hover)")).toEqual({ walk: 0, fly: 30, hover: true });
  });

  it("reads every mode the import writes", () => {
    expect(speedsOf("40 ft., burrow 30 ft., climb 20 ft., fly 80 ft., swim 40 ft.")).toEqual({
      walk: 40,
      burrow: 30,
      climb: 20,
      fly: 80,
      swim: 40,
      hover: false,
    });
    expect(speedsOf("30 ft., fly 60 ft., hover").hover).toBe(true);
  });

  it("gives no walking speed when the text has none, rather than a guess", () => {
    expect(walkingFeet("swim 40 ft.")).toBeUndefined();
    expect(speedsOf("swim 40 ft.")).toEqual({ swim: 40, hover: false });
    expect(walkingFeet("varies")).toBeUndefined();
    expect(walkingFeet("")).toBeUndefined();
    expect(walkingFeet(undefined)).toBeUndefined();
  });
});
