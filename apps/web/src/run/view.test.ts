import { describe, expect, it } from "vitest";
import {
  IDENTITY,
  ISOMETRIC,
  applyLinear,
  boundsUnder,
  cssMatrix,
  invertLinear,
  screenUpOnPlane,
  uprightTransform,
} from "./view";

describe("the board's view", () => {
  it("tilts the plane as the drawing's rotateX(60deg) rotateZ(45deg) does", () => {
    // A step across the plane goes down and to the right; a step down it, down and to the left.
    const across = applyLinear(ISOMETRIC, { x: 1, y: 0 });
    const down = applyLinear(ISOMETRIC, { x: 0, y: 1 });
    expect(across.x).toBeCloseTo(Math.SQRT1_2);
    expect(across.y).toBeCloseTo(Math.SQRT1_2 / 2);
    expect(down.x).toBeCloseTo(-Math.SQRT1_2);
    expect(down.y).toBeCloseTo(Math.SQRT1_2 / 2);
  });

  it("undoes the tilt exactly, so a point on the screen lands back on its square", () => {
    const back = invertLinear(ISOMETRIC);
    const p = { x: 123.5, y: -42 };
    const there = applyLinear(back, applyLinear(ISOMETRIC, p));
    expect(there.x).toBeCloseTo(p.x);
    expect(there.y).toBeCloseTo(p.y);
  });

  it("measures the box the tilted plane fills, which the canvas fits", () => {
    expect(boundsUnder(IDENTITY, { width: 300, height: 200 })).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    });
    const tilted = boundsUnder(ISOMETRIC, { width: 300, height: 200 });
    expect(tilted.x).toBeCloseTo(-200 * Math.SQRT1_2);
    expect(tilted.width).toBeCloseTo(500 * Math.SQRT1_2);
    expect(tilted.height).toBeCloseTo((500 * Math.SQRT1_2) / 2);
  });

  it("stands nothing up looking straight down, and turns the tilt back otherwise", () => {
    expect(uprightTransform("top")).toBeUndefined();
    expect(uprightTransform("iso")).toBe(cssMatrix(invertLinear(ISOMETRIC)));
  });

  it("knows which way is up the screen on the plane", () => {
    expect(screenUpOnPlane("top")).toEqual({ x: 0, y: -1 });
    const up = applyLinear(ISOMETRIC, screenUpOnPlane("iso"));
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-1);
  });
});
