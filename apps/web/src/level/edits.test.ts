import { describe, expect, it } from "vitest";
import {
  addRoom,
  addWall,
  brushSquares,
  cutDoor,
  moveProp,
  newProp,
  newRegion,
  paintFloor,
  paintRegion,
  presetOf,
  rectSquares,
  removePart,
  rotateProp,
  toggleDoor,
  toggleSecret,
  unpaintRegions,
  updateProp,
  updateWall,
  addProp,
} from "./edits";
import { smallLevel } from "./level.fixtures";

const blank = () => {
  const level = smallLevel();
  return {
    ...level,
    floor: level.floor.map(() => 0),
    walls: [],
    props: [],
    lights: [],
    regions: [],
  };
};

describe("floor edits", () => {
  it("paints a brush of squares, clipped to the board", () => {
    const doc = blank();
    expect(brushSquares(doc, { x: 0.5, y: 0.5 }, 2).sort((a, b) => a - b)).toEqual([0, 1, 12, 13]);
    expect(brushSquares(doc, { x: 5.2, y: 5.7 }, 1)).toEqual([5 * 12 + 5]);
  });

  it("fills a rectangle between two squares either way round", () => {
    const doc = blank();
    expect(rectSquares(doc, { x: 2.9, y: 1.1 }, { x: 1.2, y: 2.5 })).toEqual([13, 14, 25, 26]);
  });

  it("returns the same document when the paint changes nothing", () => {
    const doc = blank();
    const once = paintFloor(doc, [0, 1], 3);
    expect(once).not.toBe(doc);
    expect(once.walls).toBe(doc.walls);
    expect(paintFloor(once, [0, 1], 3)).toBe(once);
  });
});

describe("walls and rooms", () => {
  it("draws no wall from a point to itself", () => {
    const doc = blank();
    expect(addWall(doc, { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(doc);
    expect(addWall(doc, { x: 1, y: 1 }, { x: 4, y: 1 }).walls).toHaveLength(1);
  });

  it("floors a room and walls it on four sides", () => {
    const doc = addRoom(blank(), { x: 6, y: 5 }, { x: 2, y: 2 }, 2);
    expect(doc.walls.map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2])).toEqual([
      [2, 2, 6, 2],
      [6, 2, 6, 5],
      [6, 5, 2, 5],
      [2, 5, 2, 2],
    ]);
    const floored = doc.floor.flatMap((m, at) => (m === 2 ? [at] : []));
    expect(floored).toHaveLength(4 * 3);
    expect(floored[0]).toBe(2 * 12 + 2);
  });

  it("makes no room under a square across", () => {
    const doc = blank();
    expect(addRoom(doc, { x: 2, y: 2 }, { x: 2, y: 5 }, 1)).toBe(doc);
  });
});

describe("doors", () => {
  it("cuts a door into a wall, keeping the pieces either side", () => {
    const doc = addWall(blank(), { x: 1, y: 3 }, { x: 8, y: 3 });
    const cut = cutDoor(doc, { x1: 4, y1: 3, x2: 5, y2: 3 }, "door");
    const plain = cut.walls.filter((w) => w.kind === "wall");
    expect(plain.map(({ x1, x2 }) => [x1, x2])).toEqual([
      [1, 4],
      [5, 8],
    ]);
    const door = cut.walls.find((w) => w.kind === "door")!;
    expect(door).toMatchObject({ x1: 4, y1: 3, x2: 5, y2: 3, doorState: "closed", low: false });
  });

  it("cuts a vertical wall drawn bottom to top", () => {
    const doc = addWall(blank(), { x: 2, y: 6 }, { x: 2, y: 1 });
    const cut = cutDoor(doc, { x1: 2, y1: 1, x2: 2, y2: 2 }, "secretDoor");
    expect(cut.walls.filter((w) => w.kind === "wall").map(({ y1, y2 }) => [y1, y2])).toEqual([
      [2, 6],
    ]);
    expect(cut.walls.find((w) => w.kind === "secretDoor")).toMatchObject({
      x1: 2,
      y1: 1,
      x2: 2,
      y2: 2,
    });
  });

  it("replaces a door already on the edge, and leaves walls elsewhere alone", () => {
    const doc = addWall(blank(), { x: 0, y: 5 }, { x: 3, y: 5 });
    const once = cutDoor(doc, { x1: 7, y1: 2, x2: 7, y2: 3 }, "door");
    const twice = cutDoor(once, { x1: 7, y1: 2, x2: 7, y2: 3 }, "secretDoor");
    expect(twice.walls.filter((w) => w.kind !== "wall")).toHaveLength(1);
    expect(twice.walls.filter((w) => w.kind !== "wall")[0]!.kind).toBe("secretDoor");
    expect(twice.walls.find((w) => w.kind === "wall")).toBe(doc.walls[0]);
  });

  it("opens and shuts a door, and makes it secret and back", () => {
    const doc = smallLevel();
    const opened = toggleDoor(doc, "door-east");
    expect(opened.walls.find((w) => w.id === "door-east")!.doorState).toBe("open");
    expect(toggleDoor(opened, "door-east").walls.find((w) => w.id === "door-east")!.doorState).toBe(
      "closed",
    );
    expect(toggleDoor(doc, "w-north")).toBe(doc);
    expect(toggleSecret(doc, "door-east").walls.find((w) => w.id === "door-east")!.kind).toBe(
      "secretDoor",
    );
  });

  it("drops a door's state when it becomes a wall, and shuts a wall made a door", () => {
    const doc = smallLevel();
    const walled = updateWall(doc, "door-east", { kind: "wall" });
    expect(walled.walls.find((w) => w.id === "door-east")).toMatchObject({
      kind: "wall",
      doorState: null,
    });
    const doored = updateWall(walled, "door-east", { kind: "door" });
    expect(doored.walls.find((w) => w.id === "door-east")).toMatchObject({
      kind: "door",
      doorState: "closed",
    });
  });
});

describe("props", () => {
  it("stores a flag as an override only where it differs from the kit", () => {
    const doc = addProp(blank(), { ...newProp("crate", 1, 1, 0), id: "p" });
    // A crate blocks movement by default: setting it so stays the kit's.
    const same = updateProp(doc, "p", { blocksMovement: true });
    expect(same).toBe(doc);
    const off = updateProp(doc, "p", { blocksMovement: false, cover: "threeQuarters" });
    expect(off.props[0]).toMatchObject({ blocksMovement: false, cover: "threeQuarters" });
    // Setting it back to the kit's value clears the override, as does null.
    const back = updateProp(off, "p", { blocksMovement: true, cover: null });
    expect(back.props[0]).toMatchObject({ blocksMovement: null, cover: null });
  });

  it("moves and turns a prop inside the board", () => {
    const doc = addProp(blank(), { ...newProp("table", 0, 0, 0), id: "t" });
    expect(moveProp(doc, "t", 20, 20).props[0]).toMatchObject({ x: 10, y: 9 });
    const turned = rotateProp(moveProp(doc, "t", 10, 9), "t");
    // A table turned a quarter is one across and two down: kept on the board.
    expect(turned.props[0]).toMatchObject({ rotation: 1, x: 10, y: 8 });
  });

  it("deletes a part by id", () => {
    const doc = smallLevel();
    expect(removePart(doc, { type: "prop", id: "crate" }).props.map((p) => p.id)).not.toContain(
      "crate",
    );
    expect(removePart(doc, { type: "prop", id: "nothing" })).toBe(doc);
  });
});

describe("regions", () => {
  it("adds a region with its first squares and grows it after", () => {
    const doc = blank();
    const region = newRegion("trap", true);
    const once = paintRegion(doc, region, [5, 3]);
    expect(once.regions).toEqual([{ ...region, squares: [3, 5] }]);
    const twice = paintRegion(once, region, [5, 4]);
    expect(twice.regions[0]!.squares).toEqual([3, 4, 5]);
    expect(paintRegion(twice, region, [4])).toBe(twice);
  });

  it("takes squares out of a kind's regions, deleting one left empty", () => {
    const doc = smallLevel();
    const rough = doc.regions[0]!;
    expect(unpaintRegions(doc, rough.squares, "trap")).toBe(doc);
    expect(unpaintRegions(doc, [rough.squares[0]!], "difficult").regions[0]!.squares).toEqual([
      rough.squares[1],
    ]);
    expect(unpaintRegions(doc, rough.squares, null).regions).toEqual([]);
  });
});

describe("lights", () => {
  it("names the preset a light matches", () => {
    expect(presetOf({ bright: 20, dim: 20, tone: "fire" })).toBe("torch");
    expect(presetOf({ bright: 25, dim: 20, tone: "fire" })).toBeNull();
  });
});
