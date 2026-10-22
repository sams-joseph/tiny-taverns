import { describe, expect, it } from "vitest";
import type { BoardSquare } from "./Board.js";
import {
  type LayoutLight,
  type LayoutProp,
  type LayoutRegion,
  type LayoutWall,
  type LevelLayout,
  type LevelPoint,
  cover,
  levelSquareIndex,
  lightLevelAt,
  lightLevels,
  lightSources,
  lineOfSight,
  movementCost,
  partyVision,
  pathCost,
  propBehaviour,
  propFootprint,
  sightSegments,
  visibilityPolygon,
  visionSegments,
  withinVisibility,
} from "./LevelGeometry.js";
import { LEVEL_MATERIALS, type LevelPropKind, type LevelRegionKind } from "./LevelKit.js";

const FLAGSTONE = LEVEL_MATERIALS.indexOf("flagstone");
const WATER = LEVEL_MATERIALS.indexOf("water");
const VOID = LEVEL_MATERIALS.indexOf("void");

/** A flagstone level, brightly lit and empty unless the case says otherwise. */
const level = (
  parts: Partial<LevelLayout> & Pick<LevelLayout, "columns" | "rows">,
): LevelLayout => ({
  feetPerCell: 5,
  ambient: "bright",
  floor: Array.from({ length: parts.columns * parts.rows }, () => FLAGSTONE),
  walls: [],
  props: [],
  lights: [],
  regions: [],
  ...parts,
});

const wall = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  parts: Partial<LayoutWall> = {},
): LayoutWall => ({
  id: `wall ${String(x1)},${String(y1)} ${String(x2)},${String(y2)}`,
  x1,
  y1,
  x2,
  y2,
  kind: "wall",
  doorState: null,
  low: false,
  ...parts,
});

const prop = (
  kind: LevelPropKind,
  x: number,
  y: number,
  parts: Partial<LayoutProp> = {},
): LayoutProp => ({
  id: `${kind} ${String(x)},${String(y)}`,
  kind,
  x,
  y,
  rotation: 0,
  blocksMovement: null,
  blocksSight: null,
  cover: null,
  difficult: null,
  dmOnly: false,
  ...parts,
});

const torch = (x: number, y: number, parts: Partial<LayoutLight> = {}): LayoutLight => ({
  id: `torch ${String(x)},${String(y)}`,
  x,
  y,
  bright: 20,
  dim: 20,
  tone: "fire",
  flicker: true,
  lit: true,
  ...parts,
});

const region = (
  kind: LevelRegionKind,
  columns: number,
  squares: ReadonlyArray<BoardSquare>,
): LayoutRegion => ({
  id: `${kind} ${String(squares.length)}`,
  kind,
  squares: squares.map((square) => levelSquareIndex({ columns }, square)),
  secret: false,
});

const at = (column: number, row: number): BoardSquare => ({ column, row });
const centre = (column: number, row: number) => ({ x: column + 0.5, y: row + 0.5 });

/** The walls of a closed room from `(left, top)` to `(right, bottom)`, one square of wall at a time. */
const room = (left: number, top: number, right: number, bottom: number): Array<LayoutWall> => {
  const out: Array<LayoutWall> = [];
  for (let x = left; x < right; x++)
    out.push(wall(x, top, x + 1, top), wall(x, bottom, x + 1, bottom));
  for (let y = top; y < bottom; y++)
    out.push(wall(left, y, left, y + 1), wall(right, y, right, y + 1));
  return out;
};

describe("a placed prop", () => {
  it("turns its footprint on an odd quarter turn", () => {
    expect(propFootprint(prop("table", 3, 4))).toEqual({ column: 3, row: 4, width: 2, height: 1 });
    expect(propFootprint(prop("table", 3, 4, { rotation: 1 }))).toEqual({
      column: 3,
      row: 4,
      width: 1,
      height: 2,
    });
    expect(propFootprint(prop("table", 3, 4, { rotation: 2 })).width).toBe(2);
  });

  it("behaves as its kind unless it says otherwise", () => {
    expect(propBehaviour(prop("crate", 0, 0))).toEqual({
      blocksMovement: true,
      blocksSight: false,
      cover: "half",
      difficult: false,
    });
    expect(
      propBehaviour(prop("crate", 0, 0, { blocksMovement: false, cover: "threeQuarters" })),
    ).toEqual({
      blocksMovement: false,
      blocksSight: false,
      cover: "threeQuarters",
      difficult: false,
    });
  });
});

describe("what blocks sight", () => {
  const doors = (state: "open" | "closed" | "locked", kind: "door" | "secretDoor" = "door") =>
    wall(5, 4, 5, 5, { id: "door", kind, doorState: state });
  /** A wall down column line 5 with a one-square door at rows 4 to 5. */
  const hall = (door: LayoutWall, revealed?: ReadonlySet<string>) =>
    sightSegments(
      level({ columns: 10, rows: 10, walls: [wall(5, 0, 5, 4), door, wall(5, 5, 5, 10)] }),
      revealed === undefined ? {} : { revealed },
    );
  const across = (segments: ReturnType<typeof hall>) =>
    lineOfSight(centre(2, 4), centre(8, 4), segments);

  it("lets sight through an open door and not a closed or locked one", () => {
    expect(across(hall(doors("open")))).toBe(true);
    expect(across(hall(doors("closed")))).toBe(false);
    expect(across(hall(doors("locked")))).toBe(false);
  });

  it("reads a secret door as a wall, open or not, until it is found", () => {
    expect(across(hall(doors("open", "secretDoor")))).toBe(false);
    expect(across(hall(doors("open", "secretDoor"), new Set(["door"])))).toBe(true);
    expect(across(hall(doors("closed", "secretDoor"), new Set(["door"])))).toBe(false);
  });

  it("sees over a low wall", () => {
    const low = level({ columns: 10, rows: 10, walls: [wall(5, 0, 5, 10, { low: true })] });
    expect(lineOfSight(centre(2, 4), centre(8, 4), sightSegments(low))).toBe(true);
  });

  it("is the board's edge and nothing else on an empty level", () => {
    expect(sightSegments(level({ columns: 10, rows: 6 }))).toHaveLength(4);
  });

  it("outlines a sight-blocking prop, round for a pillar, and no prop that does not block", () => {
    const pillar = sightSegments(level({ columns: 10, rows: 10, props: [prop("pillar", 5, 5)] }));
    expect(pillar).toHaveLength(4 + 12);
    expect(
      sightSegments(level({ columns: 10, rows: 10, props: [prop("crate", 5, 5)] })),
    ).toHaveLength(4);
    expect(
      sightSegments(
        level({ columns: 10, rows: 10, props: [prop("crate", 5, 5, { blocksSight: true })] }),
      ),
    ).toHaveLength(8);
  });

  it("stops a line through a pillar's middle, but not one past its round edge that a statue would stop", () => {
    const pillar = sightSegments(level({ columns: 10, rows: 10, props: [prop("pillar", 5, 5)] }));
    const statue = sightSegments(level({ columns: 10, rows: 10, props: [prop("statue", 5, 5)] }));
    expect(lineOfSight({ x: 2.5, y: 5.5 }, { x: 8.5, y: 5.5 }, pillar)).toBe(false);
    expect(lineOfSight({ x: 2.5, y: 5.1 }, { x: 8.5, y: 5.1 }, pillar)).toBe(true);
    expect(lineOfSight({ x: 2.5, y: 5.1 }, { x: 8.5, y: 5.1 }, statue)).toBe(false);
  });

  it("adds every edge of a dark or obscured square for a creature's sight, not for light", () => {
    const fogged = level({
      columns: 10,
      rows: 10,
      regions: [region("heavyObscurement", 10, [at(4, 4), at(5, 4)])],
    });
    expect(sightSegments(fogged)).toHaveLength(4);
    // Two squares side by side share an edge: 7 edges.
    expect(visionSegments(fogged)).toHaveLength(4 + 7);
  });
});

describe("the visibility polygon", () => {
  const empty = sightSegments(level({ columns: 20, rows: 20 }));

  it("is the whole circle with nothing in the way, its rim the arc and not the chords", () => {
    const polygon = visibilityPolygon({ x: 10.5, y: 10.5 }, 5, empty);
    for (let k = 0; k < polygon.vertices.length; k += 2) {
      expect(Math.hypot(polygon.vertices[k]! - 10.5, polygon.vertices[k + 1]! - 10.5)).toBeCloseTo(
        5,
        9,
      );
    }
    // Halfway between two rim rays, just inside the circle: outside the chord, inside the arc.
    const between = -Math.PI + Math.PI / 128;
    const point = { x: 10.5 + Math.cos(between) * 4.9995, y: 10.5 + Math.sin(between) * 4.9995 };
    expect(withinVisibility(polygon, point)).toBe(true);
    expect(withinVisibility(polygon, { x: 10.5 + 3.6, y: 10.5 + 3.6 })).toBe(false);
    expect(withinVisibility(polygon, { x: 10.5, y: 10.5 })).toBe(true);
  });

  it("is shadowed behind a wall and clear beside it", () => {
    const segments = sightSegments(level({ columns: 20, rows: 20, walls: [wall(12, 8, 12, 13)] }));
    const polygon = visibilityPolygon({ x: 10.5, y: 10.5 }, 8, segments);
    expect(withinVisibility(polygon, { x: 14.5, y: 10.5 })).toBe(false);
    expect(withinVisibility(polygon, { x: 11.5, y: 10.5 })).toBe(true);
    expect(withinVisibility(polygon, { x: 13.5, y: 4.5 })).toBe(true);
    expect(withinVisibility(polygon, { x: 10.5, y: 14.5 })).toBe(true);
  });

  it("puts a vertex exactly where a wall crosses the rim", () => {
    const segments = sightSegments(level({ columns: 20, rows: 20, walls: [wall(12, 0, 12, 20)] }));
    const polygon = visibilityPolygon({ x: 10.5, y: 10.5 }, 3, segments);
    const rise = Math.sqrt(9 - 1.5 * 1.5);
    for (const y of [10.5 - rise, 10.5 + rise]) {
      let nearest = Infinity;
      for (let k = 0; k < polygon.vertices.length; k += 2) {
        nearest = Math.min(
          nearest,
          Math.hypot(polygon.vertices[k]! - 12, polygon.vertices[k + 1]! - y),
        );
      }
      expect(nearest).toBeLessThan(1e-9);
    }
  });

  it("never leaks out through the joints of a closed room built a square at a time", () => {
    const segments = sightSegments(level({ columns: 12, rows: 12, walls: room(3, 3, 8, 8) }));
    const origins = [centre(5, 5), centre(3, 3), centre(7, 7), centre(3, 7)];
    for (let i = 0; i < 20; i++) {
      for (let j = 0; j < 20; j++) origins.push({ x: 3.03 + i * 0.2468, y: 3.03 + j * 0.2468 });
    }
    const leaks: Array<LevelPoint> = [];
    for (const origin of origins) {
      const polygon = visibilityPolygon(origin, 20, segments);
      for (let k = 0; k < polygon.vertices.length; k += 2) {
        const x = polygon.vertices[k]!;
        const y = polygon.vertices[k + 1]!;
        if (x < 3 - 0.01 || x > 8 + 0.01 || y < 3 - 0.01 || y > 8 + 0.01) leaks.push(origin);
      }
      for (const outside of [
        { x: 2.5, y: 2.5 },
        { x: 8.5, y: 2.5 },
        { x: 2.5, y: 8.5 },
        { x: 8.5, y: 8.5 },
      ]) {
        if (lineOfSight(origin, outside, segments)) leaks.push(origin);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("never leaks out through the joints of a room walled at odd angles", () => {
    // A heptagon about (10, 10): no joint sits on a round number, so a ray aimed at one
    // meets both walls only to rounding error. Measured: with no hair on the walls and no
    // slack in the hit test, rays and lines slip out through these joints.
    const sides = 7;
    const corners = Array.from({ length: sides }, (_, k) => ({
      x: 10 + Math.cos((k * 2 * Math.PI) / sides + 0.3) * 5,
      y: 10 + Math.sin((k * 2 * Math.PI) / sides + 0.3) * 5,
    }));
    const walls = corners.map((from, k) => {
      const to = corners[(k + 1) % sides]!;
      return wall(from.x, from.y, to.x, to.y);
    });
    const segments = sightSegments(level({ columns: 20, rows: 20, walls }));
    const leaks: Array<LevelPoint> = [];
    for (let i = 0; i < 30; i++) {
      for (let j = 0; j < 30; j++) {
        const origin = { x: 7 + i * 0.201, y: 7 + j * 0.199 };
        const polygon = visibilityPolygon(origin, 30, segments);
        for (let k = 0; k < polygon.vertices.length; k += 2) {
          if (Math.hypot(polygon.vertices[k]! - 10, polygon.vertices[k + 1]! - 10) > 5.01) {
            leaks.push(origin);
          }
        }
        for (const corner of corners) {
          const beyond = {
            x: origin.x + (corner.x - origin.x) * 1.5,
            y: origin.y + (corner.y - origin.y) * 1.5,
          };
          if (lineOfSight(origin, beyond, segments)) leaks.push(origin);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});

describe("cover", () => {
  const board = (walls: ReadonlyArray<LayoutWall>, props: ReadonlyArray<LayoutProp> = []) =>
    sightSegments(level({ columns: 20, rows: 20, walls, props }));
  const attacker = at(2, 5);
  const target = at(8, 5);

  it("is none in the open and total behind a wall", () => {
    expect(cover(attacker, target, board([]), [])).toBe("none");
    expect(cover(attacker, target, board([wall(6, 0, 6, 20)]), [])).toBe("total");
  });

  it("is total from inside a closed room's corner to a square past the joint", () => {
    expect(cover(at(4, 4), at(5, 5), board(room(0, 0, 5, 5)), [])).toBe("total");
  });

  it("is half when a wall cuts the lines to the target's top corners from every corner", () => {
    // From the attacker's bottom-right corner (3, 6) the wall's end at (7.5, 5.5) stops the
    // lines to the target's corners (8, 5) and (9, 5) and leaves (8, 6) and (9, 6).
    expect(cover(attacker, target, board([wall(7.5, 0, 7.5, 5.5)]), [])).toBe("half");
  });

  it("is three-quarters through an arrow slit", () => {
    // A wall down the target's west edge with a slit a tenth of a square wide, in line from
    // the attacker's top-right corner (3, 5) to the target's bottom-right one (9, 6).
    const slit = [wall(8, 0, 8, 5.78), wall(8, 5.88, 8, 20)];
    expect(cover(attacker, target, board(slit), [])).toBe("threeQuarters");
  });

  it("is never less than a crate's or a table's between them", () => {
    expect(cover(attacker, target, board([]), [prop("crate", 5, 5)])).toBe("half");
    expect(
      cover(attacker, target, board([]), [prop("table", 5, 5, { cover: "threeQuarters" })]),
    ).toBe("threeQuarters");
    expect(cover(attacker, target, board([]), [prop("chair", 5, 5)])).toBe("none");
    // Off to the side, no line runs through it.
    expect(cover(attacker, target, board([]), [prop("crate", 5, 8)])).toBe("none");
  });

  it("counts a sight-blocking prop by the lines it blocks, not by its kit cover", () => {
    const statue = [prop("statue", 5, 5)];
    expect(cover(attacker, target, board([], statue), statue)).toBe("half");
  });
});

describe("light", () => {
  const dark = (parts: Partial<LevelLayout> = {}) =>
    level({ columns: 30, rows: 30, ambient: "dark", lights: [torch(10.5, 10.5)], ...parts });

  it("rings a torch bright to 20 ft and dim to 40 ft", () => {
    const lit = dark();
    expect(lightLevelAt(lit, at(10, 10))).toBe("bright");
    expect(lightLevelAt(lit, at(14, 10))).toBe("bright");
    expect(lightLevelAt(lit, at(15, 10))).toBe("dim");
    expect(lightLevelAt(lit, at(18, 10))).toBe("dim");
    expect(lightLevelAt(lit, at(19, 10))).toBe("dark");
  });

  it("starts from the ambient light and stops at a wall", () => {
    expect(lightLevelAt(dark({ ambient: "dim" }), at(19, 10))).toBe("dim");
    expect(lightLevelAt(dark({ walls: [wall(12, 0, 12, 30)] }), at(14, 10))).toBe("dark");
    expect(lightLevelAt(dark({ lights: [torch(10.5, 10.5, { lit: false })] }), at(10, 10))).toBe(
      "dark",
    );
  });

  it("leaves magical darkness dark under a torch", () => {
    const shrouded = dark({ regions: [region("magicalDarkness", 30, [at(11, 10)])] });
    expect(lightLevelAt(shrouded, at(11, 10))).toBe("dark");
    expect(lightLevelAt(shrouded, at(12, 10))).toBe("bright");
  });

  it("shines a brazier's own light from its middle", () => {
    const brazier = level({
      columns: 30,
      rows: 30,
      ambient: "dark",
      props: [prop("brazier", 20, 20)],
    });
    expect(lightSources(brazier)).toEqual([
      { id: "brazier 20,20", x: 20.5, y: 20.5, bright: 10, dim: 10, tone: "fire" },
    ]);
    expect(lightLevelAt(brazier, at(22, 20))).toBe("bright");
    expect(lightLevelAt(brazier, at(24, 20))).toBe("dim");
    expect(lightLevelAt(brazier, at(25, 20))).toBe("dark");
  });

  it("answers every square at once as it answers each", () => {
    const busy = dark({
      columns: 16,
      rows: 12,
      walls: [...room(2, 2, 9, 8), wall(12, 0, 12, 5)],
      lights: [torch(5.5, 5.5), torch(13.2, 3.7, { bright: 10, dim: 15 })],
      props: [prop("brazier", 10, 9), prop("pillar", 4, 4)],
      regions: [region("magicalDarkness", 16, [at(6, 5)])],
    });
    const all = lightLevels(busy);
    for (let row = 0; row < 12; row++) {
      for (let column = 0; column < 16; column++) {
        expect(all[row * 16 + column]).toBe(lightLevelAt(busy, at(column, row)));
      }
    }
  });
});

describe("party vision", () => {
  const index = (column: number, row: number) => row * 20 + column;
  const dark = (parts: Partial<LevelLayout> = {}) =>
    level({ columns: 20, rows: 20, ambient: "dark", ...parts });

  it("sees only its own square in the dark without darkvision", () => {
    expect(partyVision(dark(), [{ square: at(5, 5), darkvision: 0 }])).toEqual([index(5, 5)]);
  });

  it("sees dark squares within darkvision and no farther", () => {
    const seen = partyVision(dark(), [{ square: at(5, 5), darkvision: 60 }]);
    expect(seen).toContain(index(17, 5));
    expect(seen).not.toContain(index(18, 5));
    expect(seen).toContain(index(5, 0));
  });

  it("does not see into magical darkness with darkvision, nor past it", () => {
    const shrouded = dark({ regions: [region("magicalDarkness", 20, [at(5, 8)])] });
    const seen = partyVision(shrouded, [{ square: at(5, 5), darkvision: 60 }]);
    expect(seen).not.toContain(index(5, 8));
    expect(seen).not.toContain(index(5, 10));
    expect(seen).toContain(index(4, 8));
  });

  it("sees lit squares at any distance, but not through a closed door", () => {
    const lit = (state: "open" | "closed") =>
      dark({
        lights: [torch(15.5, 5.5)],
        walls: [
          wall(10, 0, 10, 5),
          wall(10, 5, 10, 6, { kind: "door", doorState: state }),
          wall(10, 6, 10, 20),
        ],
      });
    expect(partyVision(lit("open"), [{ square: at(2, 5), darkvision: 0 }])).toContain(index(15, 5));
    expect(partyVision(lit("closed"), [{ square: at(2, 5), darkvision: 0 }])).toEqual([
      index(2, 5),
    ]);
  });

  it("does not see into or past heavy obscurement, and sees only its own square inside it", () => {
    const fog = level({
      columns: 20,
      rows: 20,
      regions: [region("heavyObscurement", 20, [at(8, 5)])],
    });
    const outside = partyVision(fog, [{ square: at(5, 5), darkvision: 0 }]);
    expect(outside).not.toContain(index(8, 5));
    expect(outside).not.toContain(index(9, 5));
    expect(outside).toContain(index(8, 7));
    expect(partyVision(fog, [{ square: at(8, 5), darkvision: 0 }])).toEqual([index(8, 5)]);
  });

  it("is the sorted union of what each viewer sees", () => {
    const rooms = level({
      columns: 20,
      rows: 20,
      walls: [...room(1, 1, 3, 3), ...room(10, 10, 12, 12)],
    });
    expect(
      partyVision(rooms, [
        { square: at(11, 11), darkvision: 0 },
        { square: at(1, 1), darkvision: 0 },
        { square: at(2, 2), darkvision: 0 },
        { square: at(40, 40), darkvision: 0 },
      ]),
    ).toEqual([
      index(1, 1),
      index(2, 1),
      index(1, 2),
      index(2, 2),
      index(10, 10),
      index(11, 10),
      index(10, 11),
      index(11, 11),
    ]);
  });
});

describe("a step's cost", () => {
  const open = (parts: Partial<LevelLayout> = {}) => level({ columns: 12, rows: 12, ...parts });

  it("is five feet straight or diagonal on open floor", () => {
    expect(movementCost(open(), at(5, 5), at(6, 5))).toBe(5);
    expect(movementCost(open(), at(5, 5), at(4, 4))).toBe(5);
  });

  it("is no step at all off the board, in place, or more than a square away", () => {
    expect(movementCost(open(), at(0, 0), at(-1, 0))).toBeNull();
    expect(movementCost(open(), at(5, 5), at(5, 5))).toBeNull();
    expect(movementCost(open(), at(5, 5), at(7, 5))).toBeNull();
  });

  it("doubles into difficult terrain: water, rubble, a difficult region", () => {
    const floor = open().floor.map((material, square) =>
      square === levelSquareIndex({ columns: 12 }, at(6, 5)) ? WATER : material,
    );
    expect(movementCost(open({ floor }), at(5, 5), at(6, 5))).toBe(10);
    expect(movementCost(open({ props: [prop("rubble", 6, 5)] }), at(5, 5), at(6, 5))).toBe(10);
    expect(
      movementCost(open({ regions: [region("difficult", 12, [at(6, 5)])] }), at(5, 5), at(6, 5)),
    ).toBe(10);
    expect(
      movementCost(open({ regions: [region("trap", 12, [at(6, 5)])] }), at(5, 5), at(6, 5)),
    ).toBe(5);
  });

  it("is refused into a void square or onto a prop that blocks movement", () => {
    const floor = open().floor.map((material, square) =>
      square === levelSquareIndex({ columns: 12 }, at(6, 5)) ? VOID : material,
    );
    expect(movementCost(open({ floor }), at(5, 5), at(6, 5))).toBeNull();
    expect(movementCost(open({ props: [prop("crate", 6, 5)] }), at(5, 5), at(6, 5))).toBeNull();
    expect(movementCost(open({ props: [prop("table", 5, 6)] }), at(5, 5), at(6, 6))).toBeNull();
    expect(movementCost(open({ props: [prop("chair", 6, 5)] }), at(5, 5), at(6, 5))).toBe(5);
  });

  it("is refused through a wall, a low wall, and a door unless it is open", () => {
    const through = (crossing: LayoutWall, revealed?: ReadonlySet<string>) =>
      movementCost(
        open({ walls: [crossing] }),
        at(5, 5),
        at(6, 5),
        revealed === undefined ? {} : { revealed },
      );
    expect(through(wall(6, 0, 6, 12))).toBeNull();
    expect(through(wall(6, 0, 6, 12, { low: true }))).toBeNull();
    expect(through(wall(6, 5, 6, 6, { kind: "door", doorState: "closed" }))).toBeNull();
    expect(through(wall(6, 5, 6, 6, { kind: "door", doorState: "locked" }))).toBeNull();
    expect(through(wall(6, 5, 6, 6, { kind: "door", doorState: "open" }))).toBe(5);
    const secret = wall(6, 5, 6, 6, { id: "secret", kind: "secretDoor", doorState: "open" });
    expect(through(secret)).toBeNull();
    expect(through(secret, new Set(["secret"]))).toBe(5);
    // A wall beside the step, not across it.
    expect(through(wall(6, 6, 6, 12))).toBe(5);
  });

  it("will not squeeze diagonally between two walls at a corner", () => {
    const step = (walls: ReadonlyArray<LayoutWall>) =>
      movementCost(open({ walls }), at(5, 5), at(6, 6));
    // The corner of the square it leaves.
    expect(step([wall(6, 5, 6, 6), wall(5, 6, 6, 6)])).toBeNull();
    // A straight wall through the corner.
    expect(step([wall(6, 4, 6, 8)])).toBeNull();
    // The corner of the square beside the diagonal: the other way round is open.
    expect(step([wall(6, 5, 6, 6), wall(6, 6, 7, 6)])).toBe(5);
    // A wall that only ends at the corner.
    expect(step([wall(6, 2, 6, 6)])).toBe(5);
    // A wall at an angle across the diagonal, clear of the corner.
    expect(step([wall(5.2, 6, 6, 5.2)])).toBeNull();
  });
});

describe("a walk's cost", () => {
  const open = (parts: Partial<LevelLayout> = {}) => level({ columns: 12, rows: 12, ...parts });
  /** A wall down column line 6 with a door in it at row 5. */
  const divided = (doorState: "open" | "closed" | "locked", kind: "door" | "secretDoor" = "door") =>
    open({
      walls: [
        wall(6, 0, 6, 5),
        wall(6, 5, 6, 6, { id: "door", kind, doorState }),
        wall(6, 6, 6, 12),
      ],
    });

  it("is nothing to stay put, and the longer side across open floor", () => {
    expect(pathCost(open(), at(5, 5), at(5, 5))).toBe(0);
    expect(pathCost(open(), at(0, 0), at(3, 7))).toBe(35);
  });

  it("is no walk off the board", () => {
    expect(pathCost(open(), at(0, 0), at(12, 0))).toBeNull();
  });

  it("goes round a wall that does not close the way", () => {
    const walls = [wall(6, 0, 6, 10)];
    // Down past the wall's end at row 10 and back up: not the straight 5 feet.
    expect(pathCost(open({ walls }), at(5, 5), at(6, 5))).toBeGreaterThan(5);
  });

  it("is refused through a closed or locked door and a wall, and walks through an open one", () => {
    expect(pathCost(divided("closed"), at(2, 5), at(9, 5))).toBeNull();
    expect(pathCost(divided("locked"), at(2, 5), at(9, 5))).toBeNull();
    expect(pathCost(divided("open"), at(2, 5), at(9, 5))).toBe(35);
  });

  it("is refused through a secret door until it is found", () => {
    expect(pathCost(divided("open", "secretDoor"), at(2, 5), at(9, 5))).toBeNull();
    expect(
      pathCost(divided("open", "secretDoor"), at(2, 5), at(9, 5), { revealed: new Set(["door"]) }),
    ).toBe(35);
  });

  it("will not end on void or a blocking prop, and pays double through difficult terrain", () => {
    const floor = open().floor.map((material, square) =>
      square === levelSquareIndex({ columns: 12 }, at(4, 4)) ? VOID : material,
    );
    expect(pathCost(open({ floor }), at(0, 0), at(4, 4))).toBeNull();
    expect(pathCost(open({ props: [prop("crate", 4, 4)] }), at(0, 0), at(4, 4))).toBeNull();
    // A row of water across a corridor one square wide must be waded.
    const corridor = level({
      columns: 5,
      rows: 1,
      floor: [FLAGSTONE, FLAGSTONE, WATER, FLAGSTONE, FLAGSTONE],
    });
    expect(pathCost(corridor, at(0, 0), at(4, 0))).toBe(25);
  });

  it("answers across a 200 × 200 dungeon in well under a second", () => {
    const board = dungeon("dark");
    const started = performance.now();
    const feet = pathCost(board, at(1, 1), at(198, 198));
    const took = performance.now() - started;
    expect(feet === null || feet > 0).toBe(true);
    expect(took).toBeLessThan(1000);
  });
});

/**
 * A 200 × 200 dungeon of 14-square rooms, every side a wall with a door in it
 * (alternately open and closed), a short wall, a pillar, a crate and a torch
 * (every other one lit) in each room: about 1,500 wall segments.
 */
const dungeon = (ambient: LevelLayout["ambient"]): LevelLayout => {
  const size = 200;
  const step = 14;
  const walls: Array<LayoutWall> = [];
  const props: Array<LayoutProp> = [];
  const lights: Array<LayoutLight> = [];
  let door = 0;
  for (let line = step; line < size; line += step) {
    for (let from = 0; from < size; from += step) {
      const to = Math.min(size, from + step);
      const state = door++ % 2 === 0 ? "open" : "closed";
      walls.push(
        wall(line, from, line, from + 6),
        wall(line, from + 6, line, from + 7, {
          id: `v door ${String(door)}`,
          kind: "door",
          doorState: state,
        }),
        wall(line, from + 7, line, to),
        wall(from, line, from + 6, line),
        wall(from + 6, line, from + 7, line, {
          id: `h door ${String(door)}`,
          kind: "door",
          doorState: state,
        }),
        wall(from + 7, line, to, line),
      );
    }
  }
  for (let top = 0; top < size; top += step) {
    for (let left = 0; left < size; left += step) {
      walls.push(wall(left + 3, top + 10, left + 5, top + 10));
      props.push(prop("pillar", left + 9, top + 4), prop("crate", left + 2, top + 2));
      lights.push(torch(left + 7.5, top + 7.5, { lit: (left + top) % (2 * step) === 0 }));
    }
  }
  return level({ columns: size, rows: size, ambient, walls, props, lights });
};

describe("party vision on a 200 × 200 dungeon", () => {
  const viewers = [
    { square: at(20, 20), darkvision: 60 },
    { square: at(22, 21), darkvision: 0 },
    { square: at(100, 100), darkvision: 60 },
    { square: at(150, 40), darkvision: 120 },
  ];

  it("has about 1,400 walls", () => {
    expect(dungeon("dark").walls.length).toBeGreaterThan(1400);
  });

  for (const ambient of ["dark", "bright"] as const) {
    it(`answers four viewers in well under a second with ${ambient} ambient light`, () => {
      const board = dungeon(ambient);
      partyVision(board, viewers);
      const runs = 5;
      const started = performance.now();
      for (let run = 0; run < runs; run++) partyVision(board, viewers);
      const each = (performance.now() - started) / runs;
      if (process.env["LEVEL_BENCH"] === "1")
        console.log(`partyVision ${ambient}: ${each.toFixed(1)} ms`);
      expect(each).toBeLessThan(1000);
    });
  }
});
