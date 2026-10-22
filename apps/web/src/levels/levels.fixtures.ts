import { cryptLevelId, fordLevelId } from "../test/ids";

/**
 * Two levels on the creator's shelf: a crypt with a wall, a door, an altar, a
 * torch and a hidden trap, and a ford that is still an empty board.
 */

export { cryptLevelId, fordLevelId };

const stamp = "2026-10-21T12:00:00.000Z";

const part = (n: number) => `1e7e1000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** The crypt, whole, as `GET /library/levels/:id` encodes it. */
export const crypt = {
  id: cryptLevelId,
  name: "The Crypt",
  description: "Damp stone under the chapel.",
  columns: 6,
  rows: 4,
  feetPerCell: 5,
  ambient: "dark",
  floor: Array.from({ length: 24 }, () => 1),
  walls: [
    { id: part(1), x1: 0, y1: 1, x2: 6, y2: 1, kind: "wall", doorState: null, low: false },
    { id: part(2), x1: 2.5, y1: 1, x2: 3.5, y2: 1, kind: "door", doorState: "closed", low: false },
  ],
  props: [
    {
      id: part(3),
      kind: "altar",
      x: 4,
      y: 2,
      rotation: 0,
      blocksMovement: null,
      blocksSight: null,
      cover: null,
      difficult: null,
      dmOnly: false,
    },
  ],
  lights: [
    { id: part(4), x: 0.5, y: 3.5, bright: 20, dim: 20, tone: "fire", flicker: true, lit: true },
  ],
  regions: [{ id: part(5), kind: "trap", squares: [13, 14], secret: true }],
  version: 4,
  origin: "authored",
  createdAt: stamp,
  updatedAt: stamp,
};

/** The ford, made and not yet built. */
export const ford = {
  id: fordLevelId,
  name: "Ford",
  description: null,
  columns: 48,
  rows: 32,
  feetPerCell: 5,
  ambient: "bright",
  floor: Array.from({ length: 48 * 32 }, () => 0),
  walls: [],
  props: [],
  lights: [],
  regions: [],
  version: 1,
  origin: "authored",
  createdAt: stamp,
  updatedAt: stamp,
};

const summary = (level: typeof crypt | typeof ford) => ({
  id: level.id,
  name: level.name,
  description: level.description,
  columns: level.columns,
  rows: level.rows,
  feetPerCell: level.feetPerCell,
  wallCount: level.walls.length,
  propCount: level.props.length,
  lightCount: level.lights.length,
  regionCount: level.regions.length,
  origin: level.origin,
  createdAt: level.createdAt,
  updatedAt: level.updatedAt,
});

/** The shelf, as `GET /library/levels` encodes it: by name. */
export const levelShelf = [summary(ford), summary(crypt)];

/** Every level read the fixture wire answers. */
export const fullLevels = (): ReadonlyArray<
  readonly [string, { status: number; body: unknown }]
> => [
  ["GET /library/levels", { status: 200, body: levelShelf }],
  [`GET /library/levels/${cryptLevelId}`, { status: 200, body: crypt }],
  [`GET /library/levels/${fordLevelId}`, { status: 200, body: ford }],
];
