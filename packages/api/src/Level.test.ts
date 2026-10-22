import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  LEVEL_PROPS_MAX,
  LEVEL_WALLS_MAX,
  LevelCreate,
  LevelSave,
  propFootprint,
} from "./Level.js";
import { LEVEL_MATERIALS } from "./LevelKit.js";

const part = (n: number) => `1e7e1000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A 4 × 3 level with one of each part, on the board. */
const board = {
  name: "Ford",
  description: null,
  columns: 4,
  rows: 3,
  feetPerCell: 5,
  ambient: "dim",
  floor: Array(12).fill(1),
  walls: [{ id: part(1), x1: 0, y1: 0, x2: 4, y2: 0, kind: "wall", doorState: null, low: false }],
  props: [
    {
      id: part(2),
      kind: "bed",
      x: 3,
      y: 1,
      rotation: 0,
      blocksMovement: null,
      blocksSight: null,
      cover: null,
      difficult: null,
      dmOnly: false,
    },
  ],
  lights: [{ id: part(3), x: 4, y: 3, bright: 20, dim: 20, tone: "fire", flicker: false, lit: true }],
  regions: [{ id: part(4), kind: "difficult", squares: [0, 11], secret: false }],
  version: 1,
};

const accepts = (value: unknown) => Schema.decodeUnknownExit(LevelSave)(value)._tag === "Success";

describe("a level's save", () => {
  it("accepts a document on its own board", () => {
    expect(accepts(board)).toBe(true);
  });

  it("refuses a floor that is not one material per square, or a material the kit lacks", () => {
    expect(accepts({ ...board, floor: Array(11).fill(1) })).toBe(false);
    expect(accepts({ ...board, floor: Array(12).fill(LEVEL_MATERIALS.length) })).toBe(false);
  });

  it("refuses a wall off the board, off the half-grid, or with no length", () => {
    const wall = board.walls[0]!;
    expect(accepts({ ...board, walls: [{ ...wall, x2: 4.5 }] })).toBe(false);
    expect(accepts({ ...board, walls: [{ ...wall, x2: 1.25 }] })).toBe(false);
    expect(accepts({ ...board, walls: [{ ...wall, x2: 0 }] })).toBe(false);
    expect(accepts({ ...board, walls: [{ ...wall, x2: 2.5 }] })).toBe(true);
  });

  it("gives a door a door state and a wall none", () => {
    const wall = board.walls[0]!;
    expect(accepts({ ...board, walls: [{ ...wall, kind: "door" }] })).toBe(false);
    expect(accepts({ ...board, walls: [{ ...wall, doorState: "open" }] })).toBe(false);
    expect(accepts({ ...board, walls: [{ ...wall, kind: "secretDoor", doorState: "locked" }] })).toBe(
      true,
    );
  });

  it("keeps a prop's turned footprint on the board", () => {
    const bed = board.props[0]!;
    expect(accepts({ ...board, props: [{ ...bed, y: 2 }] })).toBe(false);
    expect(accepts({ ...board, props: [{ ...bed, rotation: 1 }] })).toBe(false);
    expect(accepts({ ...board, props: [{ ...bed, x: 2, y: 2, rotation: 1 }] })).toBe(true);
  });

  it("keeps lights and region squares on the board", () => {
    const light = board.lights[0]!;
    const region = board.regions[0]!;
    expect(accepts({ ...board, lights: [{ ...light, x: 4.1 }] })).toBe(false);
    expect(accepts({ ...board, lights: [{ ...light, bright: 125 }] })).toBe(false);
    expect(accepts({ ...board, regions: [{ ...region, squares: [12] }] })).toBe(false);
    expect(accepts({ ...board, regions: [{ ...region, squares: [] }] })).toBe(false);
  });

  it("refuses a part id twice in one list", () => {
    const wall = board.walls[0]!;
    expect(accepts({ ...board, walls: [wall, { ...wall, y1: 1, y2: 1 }] })).toBe(false);
  });

  it("bounds how many parts a level holds", () => {
    const wall = board.walls[0]!;
    const walls = Array.from({ length: LEVEL_WALLS_MAX + 1 }, (_, n) => ({ ...wall, id: part(n) }));
    expect(accepts({ ...board, walls })).toBe(false);
    const bed = board.props[0]!;
    const props = Array.from({ length: LEVEL_PROPS_MAX + 1 }, (_, n) => ({
      ...bed,
      id: part(n),
      x: 0,
      y: 0,
    }));
    expect(accepts({ ...board, props })).toBe(false);
  });
});

describe("a new level", () => {
  it("carries no provenance: only an accept makes one the assistant's", () => {
    expect(Object.keys(LevelCreate.fields)).not.toContain("origin");
    expect(Object.keys(LevelCreate.fields)).not.toContain("assistantTurnId");
    expect(Object.keys(LevelSave.fields)).not.toContain("origin");
  });
});

describe("propFootprint", () => {
  it("swaps width and height on odd quarter turns", () => {
    expect(propFootprint("rug", 0)).toEqual({ width: 2, height: 3 });
    expect(propFootprint("rug", 1)).toEqual({ width: 3, height: 2 });
    expect(propFootprint("rug", 2)).toEqual({ width: 2, height: 3 });
    expect(propFootprint("rug", 3)).toEqual({ width: 3, height: 2 });
  });
});
