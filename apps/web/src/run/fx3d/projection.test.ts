import { describe, expect, it } from "vitest";
import { ISOMETRIC, applyLinear, screenUpOnPlane } from "../view";
import { LIFT, projectionRows, toPlane } from "./projection";

const grid = { planeWidth: 1536, planeHeight: 1024, originX: 10, originY: 20, cell: 64 };

/** The matrix applied to a point, as a renderer would: clip space, then the plane. */
const project = (p: { x: number; y: number; z: number }) => {
  const m = projectionRows(grid);
  const row = (r: number) =>
    m[r * 4]! * p.x + m[r * 4 + 1]! * p.y + m[r * 4 + 2]! * p.z + m[r * 4 + 3]!;
  return {
    x: ((row(0) + 1) / 2) * grid.planeWidth,
    y: ((1 - row(1)) / 2) * grid.planeHeight,
    depth: row(2),
  };
};

describe("the effects' projection", () => {
  it("puts a square's centre on the ground where the board draws that square", () => {
    expect(toPlane(grid, { x: 3.5, y: 0, z: 2.5 })).toEqual({ x: 10 + 3.5 * 64, y: 20 + 2.5 * 64 });
    const at = project({ x: 3.5, y: 0, z: 2.5 });
    expect(at.x).toBeCloseTo(10 + 3.5 * 64);
    expect(at.y).toBeCloseTo(20 + 2.5 * 64);
  });

  it("lifts a point up the screen by its height, its foot staying put", () => {
    const up = project({ x: 3.5, y: 2, z: 2.5 });
    expect(up.x).toBeCloseTo(10 + 3.5 * 64);
    expect(up.y).toBeCloseTo(20 + 2.5 * 64 - 2 * 64 * LIFT);
  });

  it("draws higher in front, then nearer the bottom of the board", () => {
    expect(project({ x: 1, y: 1, z: 3 }).depth).toBeLessThan(project({ x: 1, y: 0, z: 3 }).depth);
    expect(project({ x: 1, y: 0, z: 4 }).depth).toBeLessThan(project({ x: 1, y: 0, z: 3 }).depth);
  });

  it("lifts a height straight up the screen once the plane is tilted", () => {
    const tilted = { ...grid, lift: screenUpOnPlane("iso"), across: 1 };
    const foot = applyLinear(ISOMETRIC, toPlane(tilted, { x: 3.5, y: 0, z: 2.5 }));
    const head = applyLinear(ISOMETRIC, toPlane(tilted, { x: 3.5, y: 2, z: 2.5 }));
    expect(head.x).toBeCloseTo(foot.x);
    expect(head.y).toBeLessThan(foot.y);
  });
});
