import { describe, expect, it } from "vitest";
import { sameContent } from "./renderer";

/**
 * `LevelRenderer.setLevel` rebuilds a part only when its content changed
 * (`sameContent`), not whenever a re-read decoded a fresh array: the same
 * dungeon handed from a visit's stage to its fight's draws nothing again.
 */
describe("a level's parts, compared by content", () => {
  const wall = { id: "w1", x1: 3, y1: 1, x2: 3, y2: 2, kind: "door", doorState: "closed" };

  it("calls two decodings of one wall list the same, whatever order their keys came in", () => {
    const reordered = { doorState: "closed", kind: "door", y2: 2, x2: 3, y1: 1, x1: 3, id: "w1" };
    expect(sameContent([wall], [{ ...wall }])).toBe(true);
    expect(sameContent([wall], [reordered])).toBe(true);
  });

  it("calls a door that swung, or a wall more or fewer, a change", () => {
    expect(sameContent([wall], [{ ...wall, doorState: "open" }])).toBe(false);
    expect(sameContent([wall], [wall, { ...wall, id: "w2" }])).toBe(false);
    expect(sameContent([1, 1, 0], [1, 1, 1])).toBe(false);
  });
});
