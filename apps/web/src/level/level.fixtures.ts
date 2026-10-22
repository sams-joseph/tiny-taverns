import {
  LEVEL_MATERIALS,
  LIGHT_PRESETS,
  PROP_KINDS,
  type LayoutLight,
  type LayoutProp,
  type LayoutWall,
  type LevelMaterial,
  type LevelPropKind,
  type LightPreset,
} from "@taverns/api";
import type { LevelDocument } from "./document";

/**
 * Levels for the tests: a small hand-built one, and a port of the prototype's
 * seeded generator for size (the product's generator is the server's, in
 * phase 5; this one exists only so a test can build a 200-square level).
 */

const material = (name: LevelMaterial) => LEVEL_MATERIALS.indexOf(name);

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): LayoutWall => ({
  id,
  kind: "wall",
  x1,
  y1,
  x2,
  y2,
  doorState: null,
  low: false,
});

const prop = (id: string, kind: LevelPropKind, x: number, y: number, rotation = 0): LayoutProp => ({
  id,
  kind,
  x,
  y,
  rotation,
  blocksMovement: null,
  blocksSight: null,
  cover: null,
  difficult: null,
  dmOnly: false,
});

/**
 * A 12×10 level: a flagstone room from (1, 1) to (7, 7) with a door on its
 * east wall at y 3 to 4 and a secret door on its south wall at x 3 to 4, a
 * planked corridor east of it, a pillar, a crate, a brazier, a torch, and a
 * patch of difficult terrain.
 */
export const smallLevel = (): LevelDocument => {
  const columns = 12;
  const rows = 10;
  const floor = Array.from({ length: columns * rows }, () => 0);
  for (let y = 1; y < 7; y++) {
    for (let x = 1; x < 7; x++) floor[y * columns + x] = material("flagstone");
  }
  for (let x = 7; x < 11; x++) floor[3 * columns + x] = material("planks");
  return {
    id: "level-small",
    name: "The Small Room",
    description: null,
    version: 1,
    columns,
    rows,
    feetPerCell: 5,
    ambient: "dark",
    floor,
    walls: [
      wall("w-north", 1, 1, 7, 1),
      wall("w-west", 1, 1, 1, 7),
      wall("w-east-a", 7, 1, 7, 3),
      { ...wall("door-east", 7, 3, 7, 4), kind: "door", doorState: "closed" },
      wall("w-east-b", 7, 4, 7, 7),
      wall("w-south-a", 1, 7, 3, 7),
      { ...wall("secret-south", 3, 7, 4, 7), kind: "secretDoor", doorState: "closed" },
      wall("w-south-b", 4, 7, 7, 7),
    ],
    props: [
      prop("pillar", "pillar", 4, 4),
      prop("crate", "crate", 2, 2),
      prop("brazier", "brazier", 5, 2),
    ],
    lights: [
      {
        id: "torch",
        x: 2.5,
        y: 5.5,
        ...LIGHT_PRESETS.torch,
        flicker: true,
        lit: true,
      },
    ],
    regions: [
      {
        id: "rough",
        kind: "difficult",
        squares: [5 * columns + 5, 5 * columns + 6],
        secret: false,
      },
    ],
  };
};

const mulberry = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Theme = "shrine" | "tavern" | "store" | "library" | "barracks" | "cistern" | "garden";
const THEMES: ReadonlyArray<Theme> = [
  "shrine",
  "tavern",
  "store",
  "library",
  "barracks",
  "cistern",
  "garden",
];
const THEME_FLOOR: Readonly<Record<Theme, LevelMaterial>> = {
  shrine: "flagstone",
  tavern: "planks",
  store: "earth",
  library: "planks",
  barracks: "tile",
  cistern: "flagstone",
  garden: "grass",
};

interface Room {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly id: number;
}

/**
 * The prototype's seeded dungeon: rooms by binary split, corridors between
 * them, doors (some secret) where a corridor enters a room, and furniture and
 * lights by each room's theme. Deterministic for a seed.
 */
export const generatedLevel = (seed: number, columns: number, rows: number): LevelDocument => {
  const rnd = mulberry(seed);
  const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pick = <T>(list: ReadonlyArray<T>): T => list[Math.floor(rnd() * list.length)]!;
  let next = 0;
  const nid = () => `g${String((next += 1))}`;
  const W = columns;
  const H = rows;
  const floor = Array.from({ length: W * H }, () => 0);
  const walls: Array<LayoutWall> = [];
  const props: Array<LayoutProp> = [];
  const lights: Array<LayoutLight> = [];
  const region = new Int32Array(W * H);
  const CORR = 9999;
  const rooms: Array<Room> = [];
  const big = W * H > 20000;
  const minLeaf = big ? 12 : 9;
  const links: Array<readonly [Room, Room]> = [];

  const split = (r: { x: number; y: number; w: number; h: number }, depth: number): Array<Room> => {
    const canH = r.w >= minLeaf * 2;
    const canV = r.h >= minLeaf * 2;
    if (
      depth > (big ? 9 : 5) ||
      (!canH && !canV) ||
      (depth > 2 && r.w < 18 && r.h < 14 && rnd() < 0.3)
    ) {
      const rw = ri(Math.min(5, r.w - 2), Math.min(r.w - 2, big ? 16 : 13));
      const rh = ri(Math.min(5, r.h - 2), Math.min(r.h - 2, big ? 14 : 11));
      const room = {
        x: r.x + ri(1, r.w - rw - 1),
        y: r.y + ri(1, r.h - rh - 1),
        w: rw,
        h: rh,
        id: rooms.length + 1,
      };
      rooms.push(room);
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) region[y * W + x] = room.id;
      }
      return [room];
    }
    const horiz = canH && (!canV || r.w > r.h * 1.1 || (r.w > r.h * 0.9 && rnd() < 0.5));
    let a;
    let b;
    if (horiz) {
      const cut = ri(minLeaf, r.w - minLeaf);
      a = { x: r.x, y: r.y, w: cut, h: r.h };
      b = { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h };
    } else {
      const cut = ri(minLeaf, r.h - minLeaf);
      a = { x: r.x, y: r.y, w: r.w, h: cut };
      b = { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut };
    }
    const A = split(a, depth + 1);
    const B = split(b, depth + 1);
    let best: readonly [Room, Room] | null = null;
    let bd = Infinity;
    for (const p of A) {
      for (const q of B) {
        const d = Math.abs(p.x + p.w / 2 - q.x - q.w / 2) + Math.abs(p.y + p.h / 2 - q.y - q.h / 2);
        if (d < bd) {
          bd = d;
          best = [p, q];
        }
      }
    }
    if (best !== null) links.push(best);
    return [...A, ...B];
  };
  split({ x: 0, y: 0, w: W, h: H }, 0);

  const openings = new Map<string, "door" | "secret" | "arch">();
  const edgeKey = (x1: number, y1: number, x2: number, y2: number) =>
    y1 === y2
      ? `v,${String(Math.max(x1, x2))},${String(y1)}`
      : `h,${String(x1)},${String(Math.max(y1, y2))}`;
  const corridor: Array<readonly [number, number]> = [];
  for (const [p, q] of links) {
    let x = Math.floor(p.x + p.w / 2);
    let y = Math.floor(p.y + p.h / 2);
    const tx = Math.floor(q.x + q.w / 2);
    const ty = Math.floor(q.y + q.h / 2);
    const steps: Array<readonly [number, number]> = [];
    if (rnd() < 0.5) {
      while (x !== tx) steps.push([(x += Math.sign(tx - x)), y]);
      while (y !== ty) steps.push([x, (y += Math.sign(ty - y))]);
    } else {
      while (y !== ty) steps.push([x, (y += Math.sign(ty - y))]);
      while (x !== tx) steps.push([(x += Math.sign(tx - x)), y]);
    }
    let px = Math.floor(p.x + p.w / 2);
    let py = Math.floor(p.y + p.h / 2);
    for (const [sx, sy] of steps) {
      const i = sy * W + sx;
      if (region[i] === 0) {
        region[i] = CORR;
        corridor.push([sx, sy]);
      }
      if (region[py * W + px] !== region[i]) {
        const k = edgeKey(px, py, sx, sy);
        if (!openings.has(k)) {
          const r = rnd();
          openings.set(k, r < 0.62 ? "door" : r < 0.9 ? "arch" : "secret");
        }
      }
      px = sx;
      py = sy;
    }
  }

  const themed = rooms.map((room, i) => ({
    room,
    theme: i === 0 ? ("shrine" as const) : pick(THEMES),
  }));
  for (const { room, theme } of themed) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++)
        floor[y * W + x] = material(THEME_FLOOR[theme]);
    }
  }
  const corridorFloor = material(rnd() < 0.7 ? "flagstone" : "earth");
  for (const [x, y] of corridor) floor[y * W + x] = corridorFloor;

  const reg = (x: number, y: number) =>
    x < 0 || y < 0 || x >= W || y >= H ? 0 : region[y * W + x]!;
  const runs = (horizontal: boolean) => {
    const outer = horizontal ? H + 1 : W + 1;
    const inner = horizontal ? W : H;
    for (let o = 0; o < outer; o++) {
      let start = -1;
      for (let i = 0; i <= inner; i++) {
        let isWall = false;
        if (i < inner) {
          const [a, b] = horizontal ? [reg(i, o - 1), reg(i, o)] : [reg(o - 1, i), reg(o, i)];
          const k = horizontal ? `h,${String(i)},${String(o)}` : `v,${String(o)},${String(i)}`;
          isWall = a !== b && !openings.has(k);
        }
        if (isWall && start < 0) start = i;
        if (!isWall && start >= 0) {
          walls.push(horizontal ? wall(nid(), start, o, i, o) : wall(nid(), o, start, o, i));
          start = -1;
        }
      }
    }
  };
  runs(true);
  runs(false);
  for (const [k, kind] of openings) {
    if (kind === "arch") continue;
    const [dir, a, b] = k.split(",");
    const A = Number(a);
    const B = Number(b);
    const door = dir === "h" ? wall(nid(), A, B, A + 1, B) : wall(nid(), A, B, A, B + 1);
    walls.push({ ...door, kind: kind === "secret" ? "secretDoor" : "door", doorState: "closed" });
  }

  const occ = new Uint8Array(W * H);
  for (const k of openings.keys()) {
    const [dir, a, b] = k.split(",");
    const A = Number(a);
    const B = Number(b);
    const squares =
      dir === "h"
        ? [
            [A, B - 1],
            [A, B],
          ]
        : [
            [A - 1, B],
            [A, B],
          ];
    for (const [x, y] of squares as Array<[number, number]>) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) occ[yy * W + xx] = 2;
        }
      }
    }
  }
  const place = (room: Room, kind: LevelPropKind, x: number, y: number, rotation = 0): boolean => {
    const spec = PROP_KINDS[kind];
    const [fw, fh] = rotation % 2 ? [spec.height, spec.width] : [spec.width, spec.height];
    for (let yy = y; yy < y + fh; yy++) {
      for (let xx = x; xx < x + fw; xx++) {
        if (xx < room.x || yy < room.y || xx >= room.x + room.w || yy >= room.y + room.h)
          return false;
        if (!spec.flat && occ[yy * W + xx]) return false;
      }
    }
    if (!spec.flat) {
      for (let yy = y; yy < y + fh; yy++) for (let xx = x; xx < x + fw; xx++) occ[yy * W + xx] = 1;
    }
    props.push(prop(nid(), kind, x, y, rotation));
    return true;
  };
  const light = (preset: LightPreset, x: number, y: number) =>
    lights.push({
      id: nid(),
      x,
      y,
      ...LIGHT_PRESETS[preset],
      flicker: LIGHT_PRESETS[preset].tone === "fire",
      lit: true,
    });

  for (const { room: r, theme } of themed) {
    const cx = r.x + Math.floor(r.w / 2);
    const cy = r.y + Math.floor(r.h / 2);
    if (theme === "shrine") {
      const ax = cx - 1;
      const ay = r.y + 1;
      place(r, "altar", ax, ay);
      place(r, "brazier", ax - 1, ay);
      place(r, "brazier", ax + 2, ay);
      if (r.h >= 7) place(r, "rug", ax, ay + 2);
      if (r.w >= 7) {
        for (let y = r.y + 2; y < r.y + r.h - 1; y += 2) {
          place(r, "pillar", r.x + 1, y);
          place(r, "pillar", r.x + r.w - 2, y);
        }
      }
      if (rnd() < 0.6) place(r, "statue", r.x + r.w - 2, r.y + r.h - 2);
    } else if (theme === "tavern") {
      for (const [x, y] of [
        [r.x + r.w - 2, r.y],
        [r.x + r.w - 1, r.y],
      ] as const)
        place(r, "barrel", x, y);
      for (let y = r.y + 2; y < r.y + r.h - 2; y += 3) {
        for (let x = r.x + 2; x < r.x + r.w - 2; x += 4) {
          if (place(r, "table", x, y)) {
            place(r, "chair", x, y - 1);
            place(r, "chair", x + 1, y + 1, 2);
          }
        }
      }
      light("lamp", cx + 0.5, cy + 0.5);
    } else if (theme === "store") {
      for (let x = r.x; x < r.x + r.w; x++)
        if (rnd() < 0.42) place(r, pick(["crate", "barrel", "chest"] as const), x, r.y);
      if (rnd() < 0.7) light("torch", r.x + 0.5, r.y + 0.5);
    } else if (theme === "library") {
      for (let x = r.x + 1; x < r.x + r.w - 2; x += 2)
        if (rnd() < 0.85) place(r, "bookshelf", x, r.y);
      if (place(r, "table", cx - 1, cy)) light("candle", cx, cy + 0.5);
    } else if (theme === "barracks") {
      for (let x = r.x + 1; x < r.x + r.w - 1; x += 2)
        if (place(r, "bed", x, r.y)) place(r, "chest", x, r.y + 2);
      light("torch", cx + 0.5, r.y + r.h - 0.5);
    } else if (theme === "cistern") {
      for (let y = r.y + 2; y < r.y + r.h - 2; y++) {
        for (let x = r.x + 2; x < r.x + r.w - 2; x++) floor[y * W + x] = material("water");
      }
      light("arcane", cx + 0.5, cy + 0.5);
    } else {
      for (let i = 0; i < 3; i++) place(r, "tree", ri(r.x, r.x + r.w - 2), ri(r.y, r.y + r.h - 2));
      for (let i = 0; i < 4; i++) place(r, "bush", ri(r.x, r.x + r.w - 1), ri(r.y, r.y + r.h - 1));
      light("moonbeam", cx + 0.5, cy + 0.5);
    }
  }
  corridor.forEach(([x, y], i) => {
    if (i % 9 === 4) light("torch", x + 0.5, y + 0.5);
  });

  return {
    id: `level-generated-${String(seed)}`,
    name: "The Sunken Shrine",
    description: null,
    version: 1,
    columns,
    rows,
    feetPerCell: 5,
    ambient: "dark",
    floor,
    walls,
    props,
    lights,
    regions: [],
  };
};
