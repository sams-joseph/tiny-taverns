import { Schema } from "effect";
import type { LevelPartId } from "./Ids.js";
import {
  LEVEL_DESCRIPTION_MAX,
  LEVEL_FEET_PER_CELL_DEFAULT,
  LEVEL_LIGHTS_MAX,
  LEVEL_NAME_MAX,
  LEVEL_PROPS_MAX,
  LEVEL_SIZES,
  LEVEL_WALLS_MAX,
  type LevelLight,
  type LevelProp,
  type LevelSave,
  type LevelSize,
  type LevelWall,
} from "./Level.js";
import {
  LEVEL_MATERIALS,
  LIGHT_PRESETS,
  PROP_KINDS,
  type LevelAmbient,
  type LevelMaterial,
  type LevelPropKind,
  type LightPreset,
} from "./LevelKit.js";

/**
 * The level generator: a **label spec** in, a whole level out. What Hob's
 * `proposeLevel` offers is this spec, never a coordinate: the model names the
 * rooms by purpose and rough size, how they connect, how many secret doors and
 * the light, and this lays the walls, doors, furniture and lights.
 *
 * **Pure and seeded.** The same spec, seed included, is the same level on
 * every machine: the server picks the seed when Hob proposes and records it on
 * the proposal, the Hob panel's card draws its preview from the same call, and
 * the keep generates it again and writes it. Nothing here reads a clock, a
 * random source or anything outside the spec.
 *
 * The layout is the approved prototype's: rooms by binary split, L-shaped
 * corridors between the nearest rooms of each split, an opening wherever a
 * corridor crosses from one region into another (a door, an arch, or a secret
 * door), walls on every other boundary merged into runs, and furniture by each
 * room's purpose, kept clear of every opening and every corridor's line so no
 * room is ever cut off.
 */

/** What a room is for: its floor, its furniture and its light. */
export const LEVEL_ROOM_PURPOSES = [
  "shrine",
  "tavern",
  "store",
  "library",
  "barracks",
  "cistern",
  "garden",
] as const;
export const LevelRoomPurpose = Schema.Literals(LEVEL_ROOM_PURPOSES);
export type LevelRoomPurpose = typeof LevelRoomPurpose.Type;

export const LevelRoomSize = Schema.Literals(["small", "medium", "large"]);
export type LevelRoomSize = typeof LevelRoomSize.Type;

/** How the rooms open onto the corridors: mostly doors, a mix, or mostly open arches. */
export const LEVEL_CONNECTIONS = ["doors", "mixed", "open"] as const;
export const LevelConnections = Schema.Literals(LEVEL_CONNECTIONS);
export type LevelConnections = typeof LevelConnections.Type;

/** The light the level is lit by: the ambient light and the tone of every light placed. */
export const LEVEL_MOODS = ["firelit", "dim", "dark", "moonlit", "arcane"] as const;
export const LevelMood = Schema.Literals(LEVEL_MOODS);
export type LevelMood = typeof LevelMood.Type;

/** The most rooms each size of level is laid out with; every one fits, at any seed. */
export const LEVEL_ROOMS_MAX: Readonly<Record<LevelSize, number>> = {
  small: 6,
  medium: 12,
  large: 24,
};
/** The most secret doors a spec may ask for. */
export const LEVEL_SECRETS_MAX = 6;
/** A room's label, which the card draws on the preview; the level itself has no room names. */
export const LEVEL_ROOM_LABEL_MAX = 60;
/** A seed is a 31-bit integer, so it round-trips through every JSON and SQL integer. */
export const LEVEL_SEED_MAX = 2 ** 31 - 1;

export const LevelSpecRoom = Schema.Struct({
  purpose: LevelRoomPurpose,
  size: LevelRoomSize,
  label: Schema.NullOr(Schema.String.check(Schema.isMaxLength(LEVEL_ROOM_LABEL_MAX))),
});
export type LevelSpecRoom = typeof LevelSpecRoom.Type;

/**
 * A level as labels, every choice made: what `proposeLevel` records once the
 * server has filled the defaults and picked the seed, and what
 * {@link generateLevel} lays out.
 */
export const LevelSpec = Schema.Struct({
  name: Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(LEVEL_NAME_MAX)),
  description: Schema.NullOr(Schema.String.check(Schema.isMaxLength(LEVEL_DESCRIPTION_MAX))),
  size: Schema.Literals(["small", "medium", "large"]),
  rooms: Schema.Array(LevelSpecRoom).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(LEVEL_ROOMS_MAX.large),
  ),
  connections: LevelConnections,
  secrets: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: LEVEL_SECRETS_MAX })),
  mood: LevelMood,
  seed: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: LEVEL_SEED_MAX })),
});
export type LevelSpec = typeof LevelSpec.Type;

/** A level the generator laid out: the save's document, without the version a save reads at. */
export type LevelDraft = Omit<LevelSave, "version">;

/** Where a spec's room landed, for a preview's labels and the tests' reachability. */
export interface GeneratedRoom {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly purpose: LevelRoomPurpose;
  readonly label: string | null;
}

export interface GeneratedLevel {
  readonly level: LevelDraft;
  /** In the spec's order. */
  readonly rooms: ReadonlyArray<GeneratedRoom>;
}

/** The prototype's PRNG: 32 bits of state, good enough for a layout, and the same everywhere. */
const mulberry = (seed: number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const PURPOSE_FLOOR: Readonly<Record<LevelRoomPurpose, LevelMaterial>> = {
  shrine: "flagstone",
  tavern: "planks",
  store: "earth",
  library: "planks",
  barracks: "tile",
  cistern: "flagstone",
  garden: "grass",
};

/** A room's width and height by its rough size, before its share of the board bounds it. */
const ROOM_SPAN: Readonly<Record<LevelRoomSize, readonly [number, number]>> = {
  small: [4, 6],
  medium: [6, 10],
  large: [9, 16],
};
const SIZE_RANK: Readonly<Record<LevelRoomSize, number>> = { large: 0, medium: 1, small: 2 };

/** A leaf narrower than this is not split again; a room keeps a square of margin each side. */
const MIN_LEAF = 8;

/** How likely an opening is a door rather than an open arch. */
const DOOR_ODDS: Readonly<Record<LevelConnections, number>> = {
  doors: 0.85,
  mixed: 0.62,
  open: 0.15,
};

const AMBIENT: Readonly<Record<LevelMood, LevelAmbient>> = {
  firelit: "dark",
  dim: "dim",
  dark: "dark",
  moonlit: "dim",
  arcane: "dark",
};

/** Every how many corridor squares a light hangs, by mood; none in the dark. */
const CORRIDOR_LIGHT_EVERY: Readonly<Record<LevelMood, number | null>> = {
  firelit: 9,
  dim: 14,
  dark: null,
  moonlit: 12,
  arcane: 9,
};

/** The light a room's purpose asks for, as the mood lights it. */
const moodPreset = (mood: LevelMood, preset: LightPreset): LightPreset => {
  switch (mood) {
    case "firelit":
    case "dark":
      return preset;
    case "dim":
      return preset === "torch" || preset === "lamp" ? "candle" : preset;
    case "moonlit":
      return preset === "candle" ? "candle" : "moonbeam";
    case "arcane":
      return preset === "candle" ? "candle" : "arcane";
  }
};

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Node extends Rect {
  children: readonly [Node, Node] | null;
  /** The spec room laid out in this leaf, by its index in the spec. */
  room: number | null;
}

type Opening = "door" | "arch" | "secret";

/** A UUID's shape from the seed's own stream, so ids are as reproducible as the layout. */
const idStream = (seed: number) => {
  const rnd = mulberry(seed ^ 0x5bd1e995);
  const hex = (digits: number) =>
    Array.from({ length: digits }, () => Math.floor(rnd() * 16).toString(16)).join("");
  return (): LevelPartId =>
    `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(rnd() * 4)]!}${hex(3)}-${hex(12)}` as LevelPartId;
};

/**
 * Lay a spec out as a level. Always a level the save accepts (`levelIssues`
 * finds nothing, every bound holds), with every room in the spec placed (up
 * to {@link LEVEL_ROOMS_MAX} for its size) and every room reachable from every
 * other once its doors are open.
 */
export const generateLevel = (spec: LevelSpec): GeneratedLevel => {
  const rnd = mulberry(spec.seed);
  const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pick = <T>(list: ReadonlyArray<T>): T => list[Math.floor(rnd() * list.length)]!;
  const nid = idStream(spec.seed);
  const { columns: W, rows: H } = LEVEL_SIZES[spec.size];
  const wanted = spec.rooms.slice(0, LEVEL_ROOMS_MAX[spec.size]);

  // ---- Split the board until there is a leaf per room: the largest leaf
  // that can be split is split near its middle, so the count is reached.
  const root: Node = { x: 0, y: 0, w: W, h: H, children: null, room: null };
  const leaves: Array<Node> = [root];
  const splittable = (node: Node) => node.w >= MIN_LEAF * 2 || node.h >= MIN_LEAF * 2;
  while (leaves.length < wanted.length) {
    let at = -1;
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i]!;
      if (!splittable(leaf)) continue;
      if (at < 0 || leaf.w * leaf.h > leaves[at]!.w * leaves[at]!.h) at = i;
    }
    if (at < 0) break;
    const r = leaves[at]!;
    const canH = r.w >= MIN_LEAF * 2;
    const canV = r.h >= MIN_LEAF * 2;
    const horiz = canH && (!canV || r.w > r.h * 1.1 || (r.w > r.h * 0.9 && rnd() < 0.5));
    const span = horiz ? r.w : r.h;
    const cut = Math.min(
      span - MIN_LEAF,
      Math.max(MIN_LEAF, Math.round(span * (0.4 + rnd() * 0.2))),
    );
    const a: Node = horiz
      ? { x: r.x, y: r.y, w: cut, h: r.h, children: null, room: null }
      : { x: r.x, y: r.y, w: r.w, h: cut, children: null, room: null };
    const b: Node = horiz
      ? { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h, children: null, room: null }
      : { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut, children: null, room: null };
    r.children = [a, b];
    leaves.splice(at, 1, a, b);
  }

  // ---- The largest rooms take the largest leaves; ties keep the spec's order.
  const bySize = wanted
    .map((room, index) => ({ room, index }))
    .sort((p, q) => SIZE_RANK[p.room.size] - SIZE_RANK[q.room.size] || p.index - q.index);
  const byArea = leaves
    .map((leaf, index) => ({ leaf, index }))
    .sort((p, q) => q.leaf.w * q.leaf.h - p.leaf.w * p.leaf.h || p.index - q.index);
  bySize.forEach(({ index }, rank) => {
    const leaf = byArea[rank];
    if (leaf !== undefined) leaf.leaf.room = index;
  });

  const region = new Int32Array(W * H); // 0 nothing, room i + 1, CORRIDOR
  const CORRIDOR = 9999;
  const rects: Array<Rect | undefined> = [];
  for (const leaf of leaves) {
    if (leaf.room === null) continue;
    const [low, high] = ROOM_SPAN[wanted[leaf.room]!.size];
    const across = (span: number) => {
      const inside = span - 2;
      return ri(Math.min(low, inside), Math.min(high, inside));
    };
    const w = across(leaf.w);
    const h = across(leaf.h);
    const rect = { x: leaf.x + ri(1, leaf.w - w - 1), y: leaf.y + ri(1, leaf.h - h - 1), w, h };
    rects[leaf.room] = rect;
    for (let y = rect.y; y < rect.y + h; y++) {
      for (let x = rect.x; x < rect.x + w; x++) region[y * W + x] = leaf.room + 1;
    }
  }

  // ---- Join each split's two halves by their nearest rooms: a spanning tree.
  const links: Array<readonly [Rect, Rect]> = [];
  const join = (node: Node): Array<Rect> => {
    if (node.children === null) {
      const rect = node.room === null ? undefined : rects[node.room];
      return rect === undefined ? [] : [rect];
    }
    const A = join(node.children[0]);
    const B = join(node.children[1]);
    let best: readonly [Rect, Rect] | null = null;
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
  join(root);

  // ---- Corridors: L-shaped, centre to centre. Every square they cross is
  // kept clear of furniture, and every change of region is an opening.
  const openings = new Map<string, Opening>();
  const edgeKey = (x1: number, y1: number, x2: number, y2: number) =>
    y1 === y2
      ? `v,${String(Math.max(x1, x2))},${String(y1)}`
      : `h,${String(x1)},${String(Math.max(y1, y2))}`;
  const corridor: Array<readonly [number, number]> = [];
  const occ = new Uint8Array(W * H); // 0 free, 1 furniture, 2 kept clear, 3 water
  const doorOdds = DOOR_ODDS[spec.connections];
  for (const [p, q] of links) {
    let x = Math.floor(p.x + p.w / 2);
    let y = Math.floor(p.y + p.h / 2);
    const tx = Math.floor(q.x + q.w / 2);
    const ty = Math.floor(q.y + q.h / 2);
    occ[y * W + x] = 2;
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
      occ[i] = 2;
      if (region[i] === 0) {
        region[i] = CORRIDOR;
        corridor.push([sx, sy]);
      }
      if (region[py * W + px] !== region[i]) {
        const k = edgeKey(px, py, sx, sy);
        if (!openings.has(k)) openings.set(k, rnd() < doorOdds ? "door" : "arch");
      }
      px = sx;
      py = sy;
    }
  }
  // The secret doors the spec asked for, among the openings, by the seed.
  const keys = [...openings.keys()];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [keys[i], keys[j]] = [keys[j]!, keys[i]!];
  }
  for (const key of keys.slice(0, spec.secrets)) openings.set(key, "secret");

  // ---- Floors.
  const floor = Array.from({ length: W * H }, () => 0);
  const material = (name: LevelMaterial) => LEVEL_MATERIALS.indexOf(name);
  wanted.forEach((room, index) => {
    const rect = rects[index];
    if (rect === undefined) return;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        floor[y * W + x] = material(PURPOSE_FLOOR[room.purpose]);
      }
    }
  });
  const corridorFloor = material(rnd() < 0.7 ? "flagstone" : "earth");
  for (const [x, y] of corridor) floor[y * W + x] = corridorFloor;

  // ---- Walls: every edge between two regions that is not an opening,
  // merged into runs; then a door on every opening that is not an arch.
  const walls: Array<LevelWall> = [];
  const wall = (x1: number, y1: number, x2: number, y2: number): LevelWall => ({
    id: nid(),
    x1,
    y1,
    x2,
    y2,
    kind: "wall",
    doorState: null,
    low: false,
  });
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
          walls.push(horizontal ? wall(start, o, i, o) : wall(o, start, o, i));
          start = -1;
        }
      }
    }
  };
  runs(true);
  runs(false);
  const opened = (key: string) => {
    const [dir, a, b] = key.split(",");
    return { dir, A: Number(a), B: Number(b) };
  };
  for (const [key, kind] of openings) {
    if (kind === "arch") continue;
    const { dir, A, B } = opened(key);
    const door = dir === "h" ? wall(A, B, A + 1, B) : wall(A, B, A, B + 1);
    walls.push({ ...door, kind: kind === "secret" ? "secretDoor" : "door", doorState: "closed" });
  }

  // ---- Furniture, clear of a square round every opening.
  for (const key of openings.keys()) {
    const { dir, A, B } = opened(key);
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
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && occ[yy * W + xx] === 0) {
            occ[yy * W + xx] = 2;
          }
        }
      }
    }
  }
  const props: Array<LevelProp> = [];
  const place = (r: Rect, kind: LevelPropKind, x: number, y: number, rotation = 0): boolean => {
    const spec = PROP_KINDS[kind];
    const [fw, fh] = rotation % 2 ? [spec.height, spec.width] : [spec.width, spec.height];
    // A flat prop (a rug) lies anywhere in the room; anything that stands
    // keeps off the corridors' line, the openings, the water and the rest.
    const free = (index: number) => spec.flat || occ[index] === 0;
    for (let yy = y; yy < y + fh; yy++) {
      for (let xx = x; xx < x + fw; xx++) {
        if (xx < r.x || yy < r.y || xx >= r.x + r.w || yy >= r.y + r.h) return false;
        if (!free(yy * W + xx)) return false;
      }
    }
    if (!spec.flat) {
      for (let yy = y; yy < y + fh; yy++) {
        for (let xx = x; xx < x + fw; xx++) if (occ[yy * W + xx] === 0) occ[yy * W + xx] = 1;
      }
    }
    props.push({
      id: nid(),
      kind,
      x,
      y,
      rotation: rotation as 0 | 1 | 2 | 3,
      blocksMovement: null,
      blocksSight: null,
      cover: null,
      difficult: null,
      dmOnly: false,
    });
    return true;
  };
  const lights: Array<LevelLight> = [];
  const light = (preset: LightPreset, x: number, y: number) => {
    const reach = LIGHT_PRESETS[moodPreset(spec.mood, preset)];
    lights.push({
      id: nid(),
      x,
      y,
      bright: reach.bright,
      dim: reach.dim,
      tone: reach.tone,
      flicker: reach.tone === "fire",
      // In the dark every light is set and none burns: the DM lights them.
      lit: spec.mood !== "dark",
    });
  };
  const edgeSquares = (r: Rect) => {
    const out: Array<readonly [number, number]> = [];
    for (let x = r.x; x < r.x + r.w; x++) out.push([x, r.y], [x, r.y + r.h - 1]);
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) out.push([r.x, y], [r.x + r.w - 1, y]);
    return out;
  };
  // In the dark a shrine's flames are out: statues stand where the braziers would.
  const flanking: LevelPropKind = spec.mood === "dark" ? "statue" : "brazier";

  wanted.forEach((room, index) => {
    const r = rects[index];
    if (r === undefined) return;
    const cx = r.x + Math.floor(r.w / 2);
    const cy = r.y + Math.floor(r.h / 2);
    switch (room.purpose) {
      case "shrine": {
        // The altar against the far wall, or the near one, or off centre,
        // wherever a corridor's line leaves room for it.
        const spots: ReadonlyArray<readonly [number, number]> = [
          [cx - 1, r.y + 1],
          [cx - 1, r.y + r.h - 2],
          [cx - 3, r.y + 1],
          [cx + 1, r.y + 1],
          [cx - 3, r.y + r.h - 2],
          [cx + 1, r.y + r.h - 2],
        ];
        for (const [ax, ay] of spots) {
          if (place(r, "altar", ax, ay)) {
            place(r, flanking, ax - 1, ay);
            place(r, flanking, ax + 2, ay);
            if (r.h >= 7) place(r, "rug", ax, ay === r.y + 1 ? ay + 2 : ay - 3);
            break;
          }
        }
        if (r.w >= 7) {
          for (let y = r.y + 2; y < r.y + r.h - 1; y += 2) {
            place(r, "pillar", r.x + 1, y);
            place(r, "pillar", r.x + r.w - 2, y);
          }
        }
        if (rnd() < 0.6) place(r, "statue", r.x + r.w - 2, r.y + r.h - 2);
        if (rnd() < 0.5) place(r, "rubble", r.x + 1, r.y + r.h - 2);
        if (spec.mood === "dark") light("candle", cx + 0.5, cy + 0.5);
        break;
      }
      case "tavern": {
        for (const [x, y] of [
          [r.x + r.w - 2, r.y],
          [r.x + r.w - 3, r.y],
          [r.x + r.w - 1, r.y],
          [r.x + r.w - 1, r.y + 1],
        ] as const) {
          place(r, "barrel", x, y);
        }
        let candles = 0;
        for (let y = r.y + 2; y < r.y + r.h - 2; y += 3) {
          for (let x = r.x + 2; x < r.x + r.w - 2; x += 4) {
            if (rnd() < 0.2) continue;
            if (place(r, "table", x, y)) {
              place(r, "chair", x, y - 1);
              place(r, "chair", x + 1, y + 1, 2);
              if (rnd() < 0.5) place(r, "chair", x - 1, y, 3);
              if (candles < 2 && rnd() < 0.6) {
                light("candle", x + 1, y + 0.5);
                candles += 1;
              }
            }
          }
        }
        light("lamp", cx + 0.5, cy + 0.5);
        break;
      }
      case "store": {
        for (const [x, y] of edgeSquares(r)) {
          if (rnd() < 0.42) place(r, pick(["crate", "crate", "barrel", "chest"] as const), x, y);
        }
        if (rnd() < 0.5) place(r, "rubble", cx, cy);
        if (rnd() < 0.7) light("torch", r.x + 0.5, r.y + 0.5);
        break;
      }
      case "library": {
        for (let x = r.x + 1; x < r.x + r.w - 2; x += 2) {
          if (rnd() < 0.85) place(r, "bookshelf", x, r.y);
          if (rnd() < 0.6) place(r, "bookshelf", x, r.y + r.h - 1);
        }
        if (r.h >= 5) place(r, "rug", cx - 1, cy - 1);
        if (place(r, "table", cx - 1, cy)) {
          place(r, "chair", cx - 1, cy - 1);
          light("candle", cx, cy + 0.5);
        }
        break;
      }
      case "barracks": {
        for (let x = r.x + 1; x < r.x + r.w - 1; x += 2) {
          if (place(r, "bed", x, r.y)) place(r, "chest", x, r.y + 2);
        }
        light("torch", cx + 0.5, r.y + r.h - 0.5);
        break;
      }
      case "cistern": {
        for (let y = r.y + 2; y < r.y + r.h - 2; y++) {
          for (let x = r.x + 2; x < r.x + r.w - 2; x++) {
            floor[y * W + x] = material("water");
            if (occ[y * W + x] === 0) occ[y * W + x] = 3;
          }
        }
        for (let i = 0; i < 5; i++) {
          place(r, "rubble", ri(r.x, r.x + r.w - 1), ri(r.y, r.y + r.h - 1));
        }
        light("arcane", cx + 0.5, cy + 0.5);
        break;
      }
      case "garden": {
        for (let i = 0; i < 3; i++) {
          place(r, "tree", ri(r.x, r.x + r.w - 2), ri(r.y, r.y + r.h - 2));
        }
        for (let i = 0; i < 6; i++) {
          place(r, "bush", ri(r.x, r.x + r.w - 1), ri(r.y, r.y + r.h - 1));
        }
        for (let i = 0; i < 3; i++) {
          place(r, "boulder", ri(r.x, r.x + r.w - 1), ri(r.y, r.y + r.h - 1));
        }
        for (let y = r.y; y < r.y + r.h; y++) {
          if (rnd() < 0.8) floor[y * W + cx] = material("earth");
        }
        light("moonbeam", cx + 0.5, cy + 0.5);
        break;
      }
    }
  });
  const every = CORRIDOR_LIGHT_EVERY[spec.mood];
  if (every !== null) {
    corridor.forEach(([x, y], i) => {
      if (i % every === Math.floor(every / 2)) light("torch", x + 0.5, y + 0.5);
    });
  }

  const rooms: Array<GeneratedRoom> = [];
  wanted.forEach((room, index) => {
    const rect = rects[index];
    if (rect === undefined) return;
    rooms.push({
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      purpose: room.purpose,
      label: room.label,
    });
  });

  const description = spec.description?.trim() ?? "";
  return {
    level: {
      name: spec.name.trim(),
      description: description === "" ? null : description,
      columns: W,
      rows: H,
      feetPerCell: LEVEL_FEET_PER_CELL_DEFAULT,
      ambient: AMBIENT[spec.mood],
      floor,
      walls: walls.slice(0, LEVEL_WALLS_MAX),
      props: props.slice(0, LEVEL_PROPS_MAX),
      lights: lights.slice(0, LEVEL_LIGHTS_MAX),
      regions: [],
    },
    rooms,
  };
};
