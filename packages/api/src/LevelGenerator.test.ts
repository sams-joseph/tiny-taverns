import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { LEVEL_SIZES, LevelSave, type LevelSize, levelIssues } from "./Level.js";
import {
  type GeneratedLevel,
  generateLevel,
  LEVEL_CONNECTIONS,
  LEVEL_MOODS,
  LEVEL_ROOM_PURPOSES,
  LEVEL_ROOMS_MAX,
  LEVEL_SECRETS_MAX,
  type LevelRoomSize,
  type LevelSpec,
  LevelSpec as LevelSpecSchema,
} from "./LevelGenerator.js";
import { movementCost, propBehaviour, propFootprint } from "./LevelGeometry.js";

const SIZES: ReadonlyArray<LevelSize> = ["small", "medium", "large"];
const ROOM_SIZES: ReadonlyArray<LevelRoomSize> = ["small", "medium", "large"];

/** A spec that varies every label with the seed, so the seeds cover the vocabulary. */
const specFor = (size: LevelSize, seed: number, rooms = LEVEL_ROOMS_MAX[size]): LevelSpec => ({
  name: "The Sunken Shrine",
  description: "A drowned abbey under the marsh.",
  size,
  rooms: Array.from({ length: rooms }, (_, index) => ({
    purpose: LEVEL_ROOM_PURPOSES[(seed + index) % LEVEL_ROOM_PURPOSES.length]!,
    size: ROOM_SIZES[(seed * 7 + index) % ROOM_SIZES.length]!,
    label: index === 0 ? "The Chapel" : null,
  })),
  connections: LEVEL_CONNECTIONS[seed % LEVEL_CONNECTIONS.length]!,
  secrets: seed % (LEVEL_SECRETS_MAX + 1),
  mood: LEVEL_MOODS[seed % LEVEL_MOODS.length]!,
  seed: seed * 7919 + 13,
});

const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);

/**
 * Whether every room can be walked to from the first once its doors are open
 * and its secret doors found: a flood over `movementCost`, the rule a fight
 * moves by, from a free square of the first room.
 */
const unreachableRooms = ({ level, rooms }: GeneratedLevel): ReadonlyArray<number> => {
  const opened = {
    ...level,
    walls: level.walls.map((wall) => (wall.kind === "wall" ? wall : { ...wall, doorState: "open" as const })),
  };
  const revealed = new Set(level.walls.filter((wall) => wall.kind === "secretDoor").map((wall) => wall.id));
  const blocked = new Uint8Array(level.columns * level.rows);
  for (const prop of level.props) {
    if (!propBehaviour(prop).blocksMovement) continue;
    const { column, row, width, height } = propFootprint(prop);
    for (let y = row; y < row + height; y++) {
      for (let x = column; x < column + width; x++) blocked[y * level.columns + x] = 1;
    }
  }
  const freeIn = (room: (typeof rooms)[number]) => {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (blocked[y * level.columns + x] === 0) return { column: x, row: y };
      }
    }
    return undefined;
  };
  const start = freeIn(rooms[0]!);
  if (start === undefined) return rooms.map((_, index) => index);
  const reached = new Uint8Array(level.columns * level.rows);
  reached[start.row * level.columns + start.column] = 1;
  const queue = [start];
  while (queue.length > 0) {
    const from = queue.pop()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const to = { column: from.column + dx, row: from.row + dy };
      const at = to.row * level.columns + to.column;
      if (to.column < 0 || to.row < 0 || to.column >= level.columns || to.row >= level.rows) continue;
      if (reached[at] === 1) continue;
      if (movementCost(opened, from, to, { revealed }) === null) continue;
      reached[at] = 1;
      queue.push(to);
    }
  }
  return rooms.flatMap((room, index) => {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (reached[y * level.columns + x] === 1) return [];
      }
    }
    return [index];
  });
};

describe("generateLevel", () => {
  it("always lays out a level the save accepts, within every bound", () => {
    for (const size of SIZES) {
      for (const seed of SEEDS) {
        const { level } = generateLevel(specFor(size, seed));
        expect(levelIssues(level)).toEqual([]);
        const decoded = Schema.decodeUnknownExit(LevelSave)({ ...level, version: 1 });
        expect(decoded._tag, `${size} at seed ${String(seed)}`).toBe("Success");
        expect([level.columns, level.rows]).toEqual([
          LEVEL_SIZES[size].columns,
          LEVEL_SIZES[size].rows,
        ]);
      }
    }
  });

  it("places every room the spec asks for, up to the size's most", () => {
    for (const size of SIZES) {
      for (const seed of SEEDS) {
        for (const count of [1, Math.ceil(LEVEL_ROOMS_MAX[size] / 2), LEVEL_ROOMS_MAX[size]]) {
          const { rooms, level } = generateLevel(specFor(size, seed, count));
          expect(rooms.length, `${size}, ${String(count)} rooms, seed ${String(seed)}`).toBe(
            count,
          );
          // No two rooms share a square, and each is on its own floor.
          const owner = new Int32Array(level.columns * level.rows).fill(-1);
          const clashes: Array<number> = [];
          rooms.forEach((room, index) => {
            for (let y = room.y; y < room.y + room.height; y++) {
              for (let x = room.x; x < room.x + room.width; x++) {
                const at = y * level.columns + x;
                if (owner[at] !== -1 || level.floor[at] === 0) clashes.push(at);
                owner[at] = index;
              }
            }
          });
          expect(clashes).toEqual([]);
        }
      }
    }
    // More than the size holds is laid out at its most.
    const crowded = { ...specFor("small", 3), rooms: specFor("large", 3).rooms };
    expect(generateLevel(crowded).rooms).toHaveLength(LEVEL_ROOMS_MAX.small);
  });

  it("keeps every room reachable from every other, its doors opened", () => {
    for (const size of SIZES) {
      for (const seed of SEEDS.slice(0, size === "large" ? 12 : 25)) {
        expect(unreachableRooms(generateLevel(specFor(size, seed))), `${size} at ${String(seed)}`)
          .toEqual([]);
      }
    }
  });

  it("keeps the squares either side of every door clear of anything that stands", () => {
    for (const seed of SEEDS) {
      const { level } = generateLevel(specFor("medium", seed));
      const standing = new Set<number>();
      for (const prop of level.props) {
        const { column, row, width, height } = propFootprint(prop);
        if (prop.kind === "rug") continue;
        for (let y = row; y < row + height; y++) {
          for (let x = column; x < column + width; x++) standing.add(y * level.columns + x);
        }
      }
      for (const wall of level.walls) {
        if (wall.kind === "wall") continue;
        const sides =
          wall.y1 === wall.y2
            ? [
                [wall.x1, wall.y1 - 1],
                [wall.x1, wall.y1],
              ]
            : [
                [wall.x1 - 1, wall.y1],
                [wall.x1, wall.y1],
              ];
        for (const [x, y] of sides as Array<[number, number]>) {
          expect(standing.has(y * level.columns + x)).toBe(false);
        }
      }
    }
  });

  it("is the same level for the same spec, and another for another seed", () => {
    for (const size of SIZES) {
      const spec = specFor(size, 5);
      expect(generateLevel(spec)).toEqual(generateLevel(spec));
      expect(generateLevel({ ...spec, seed: spec.seed + 1 }).level.walls).not.toEqual(
        generateLevel(spec).level.walls,
      );
    }
  });

  it("makes as many secret doors as asked, when there are openings enough", () => {
    for (const secrets of [0, 1, 3]) {
      const { level } = generateLevel({ ...specFor("medium", 9), secrets });
      expect(level.walls.filter((wall) => wall.kind === "secretDoor")).toHaveLength(secrets);
    }
  });

  it("lights by mood: fire, moon or arcane, and in the dark nothing burns", () => {
    const tones = (mood: LevelSpec["mood"]) => {
      const { level } = generateLevel({ ...specFor("medium", 4), mood });
      return { ambient: level.ambient, lights: level.lights };
    };
    const firelit = tones("firelit");
    expect(firelit.ambient).toBe("dark");
    expect(firelit.lights.some((light) => light.tone === "fire")).toBe(true);
    expect(tones("moonlit").lights.filter((light) => light.tone === "fire").every((light) => light.bright <= 5)).toBe(true);
    expect(tones("arcane").lights.some((light) => light.tone === "arcane")).toBe(true);
    const dark = tones("dark");
    expect(dark.ambient).toBe("dark");
    expect(dark.lights.every((light) => !light.lit)).toBe(true);
    expect(tones("dim").ambient).toBe("dim");
  });

  it("carries the name and description, and a blank description is none", () => {
    const { level } = generateLevel({ ...specFor("small", 2), name: "  Vault  ", description: " " });
    expect(level.name).toBe("Vault");
    expect(level.description).toBeNull();
  });

  it("is what the spec schema accepts", () => {
    expect(Schema.decodeUnknownExit(LevelSpecSchema)(specFor("large", 1))._tag).toBe("Success");
    expect(
      Schema.decodeUnknownExit(LevelSpecSchema)({ ...specFor("small", 1), rooms: [] })._tag,
    ).toBe("Failure");
  });
});
