import {
  LIGHT_PRESETS,
  lightPresetOf,
  PROP_KINDS,
  propFootprint,
  type LayoutLight,
  type LayoutProp,
  type LayoutRegion,
  type LayoutWall,
  type LevelAmbient,
  type LevelPropKind,
  type LevelRegionKind,
  type LightPreset,
} from "@taverns/api";
import {
  newPartId,
  onBoard,
  squareAt,
  type LevelDocument,
  type Point,
  type Segment,
} from "./document";

/**
 * Every change the editor makes to a level, as pure functions from one
 * document to the next. Each returns the document it was given when nothing
 * changed, so the history can tell a no-op from an edit by identity, and
 * leaves every part it did not touch as the same array.
 */

// ---------------------------------------------------------------------------
// Floor

/** The squares a square brush of `size` (1 is one square, 2 a 3×3, …) covers at `at`, on the board. */
export const brushSquares = (doc: LevelDocument, at: Point, size: number): Array<number> => {
  const reach = Math.max(0, size - 1);
  const column = Math.floor(at.x);
  const row = Math.floor(at.y);
  const out: Array<number> = [];
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (onBoard(doc, column + dx, row + dy)) out.push(squareAt(doc, column + dx, row + dy));
    }
  }
  return out;
};

/** The squares of the rectangle between the squares under `a` and `b`, both included, on the board. */
export const rectSquares = (doc: LevelDocument, a: Point, b: Point): Array<number> => {
  const c0 = Math.max(0, Math.floor(Math.min(a.x, b.x)));
  const c1 = Math.min(doc.columns - 1, Math.floor(Math.max(a.x, b.x)));
  const r0 = Math.max(0, Math.floor(Math.min(a.y, b.y)));
  const r1 = Math.min(doc.rows - 1, Math.floor(Math.max(a.y, b.y)));
  const out: Array<number> = [];
  for (let row = r0; row <= r1; row++) {
    for (let column = c0; column <= c1; column++) out.push(squareAt(doc, column, row));
  }
  return out;
};

/** Paint `squares` in `material` (a `LEVEL_MATERIALS` index; 0 clears to void). */
export const paintFloor = (
  doc: LevelDocument,
  squares: ReadonlyArray<number>,
  material: number,
): LevelDocument => {
  if (!squares.some((square) => doc.floor[square] !== material)) return doc;
  const floor = [...doc.floor];
  for (const square of squares) if (square >= 0 && square < floor.length) floor[square] = material;
  return { ...doc, floor };
};

// ---------------------------------------------------------------------------
// Walls and doors

/** A plain wall from `a` to `b`; nothing when the two are the same point. */
export const addWall = (doc: LevelDocument, a: Point, b: Point): LevelDocument => {
  if (a.x === b.x && a.y === b.y) return doc;
  const wall: LayoutWall = {
    id: newPartId(),
    kind: "wall",
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    doorState: null,
    low: false,
  };
  return { ...doc, walls: [...doc.walls, wall] };
};

/**
 * A room between two grid vertices: its squares floored in `material`, and a
 * wall along each side. Nothing for a rectangle less than a square across.
 */
export const addRoom = (
  doc: LevelDocument,
  a: Point,
  b: Point,
  material: number,
): LevelDocument => {
  const x1 = Math.max(0, Math.min(a.x, b.x));
  const y1 = Math.max(0, Math.min(a.y, b.y));
  const x2 = Math.min(doc.columns, Math.max(a.x, b.x));
  const y2 = Math.min(doc.rows, Math.max(a.y, b.y));
  if (x2 - x1 < 1 || y2 - y1 < 1) return doc;
  const squares = rectSquares(doc, { x: x1, y: y1 }, { x: x2 - 0.5, y: y2 - 0.5 });
  const floored = paintFloor(doc, squares, material);
  const wall = (s: Segment): LayoutWall => ({
    id: newPartId(),
    kind: "wall",
    ...s,
    doorState: null,
    low: false,
  });
  return {
    ...floored,
    walls: [
      ...floored.walls,
      wall({ x1, y1, x2, y2: y1 }),
      wall({ x1: x2, y1, x2, y2 }),
      wall({ x1: x2, y1: y2, x2: x1, y2 }),
      wall({ x1, y1: y2, x2: x1, y2: y1 }),
    ],
  };
};

/**
 * Put a door on a unit grid `edge`, cutting every straight wall that runs
 * through it into the pieces either side (each keeps its kind and `low`, under
 * a new id), and replacing any door already there.
 */
export const cutDoor = (
  doc: LevelDocument,
  edge: Segment,
  kind: "door" | "secretDoor",
): LevelDocument => {
  const horizontal = edge.y1 === edge.y2;
  const lo = horizontal ? Math.min(edge.x1, edge.x2) : Math.min(edge.y1, edge.y2);
  const hi = horizontal ? Math.max(edge.x1, edge.x2) : Math.max(edge.y1, edge.y2);
  const line = horizontal ? edge.y1 : edge.x1;
  const walls: Array<LayoutWall> = [];
  for (const wall of doc.walls) {
    const along = horizontal
      ? wall.y1 === wall.y2 && wall.y1 === line
      : wall.x1 === wall.x2 && wall.x1 === line;
    if (!along) {
      walls.push(wall);
      continue;
    }
    const a = horizontal ? Math.min(wall.x1, wall.x2) : Math.min(wall.y1, wall.y2);
    const b = horizontal ? Math.max(wall.x1, wall.x2) : Math.max(wall.y1, wall.y2);
    if (!(a < hi && b > lo)) {
      walls.push(wall);
      continue;
    }
    if (wall.kind !== "wall") continue;
    const piece = (from: number, to: number): LayoutWall =>
      horizontal
        ? { ...wall, id: newPartId(), x1: from, x2: to }
        : { ...wall, id: newPartId(), y1: from, y2: to };
    if (a < lo) walls.push(piece(a, lo));
    if (b > hi) walls.push(piece(hi, b));
  }
  const door: LayoutWall = {
    id: newPartId(),
    kind,
    x1: horizontal ? lo : line,
    y1: horizontal ? line : lo,
    x2: horizontal ? hi : line,
    y2: horizontal ? line : hi,
    doorState: "closed",
    low: false,
  };
  return { ...doc, walls: [...walls, door] };
};

const replaceWall = (
  doc: LevelDocument,
  id: string,
  change: (wall: LayoutWall) => LayoutWall,
): LevelDocument => {
  let changed = false;
  const walls = doc.walls.map((wall) => {
    if (wall.id !== id) return wall;
    const next = change(wall);
    if (next !== wall) changed = true;
    return next;
  });
  return changed ? { ...doc, walls } : doc;
};

/** Open a shut (or locked) door, or shut an open one. A plain wall does not change. */
export const toggleDoor = (doc: LevelDocument, id: string): LevelDocument =>
  replaceWall(doc, id, (wall) =>
    wall.kind === "wall"
      ? wall
      : { ...wall, doorState: wall.doorState === "open" ? "closed" : "open" },
  );

/** Make a door secret, or a secret door plain. */
export const toggleSecret = (doc: LevelDocument, id: string): LevelDocument =>
  replaceWall(doc, id, (wall) =>
    wall.kind === "wall" ? wall : { ...wall, kind: wall.kind === "door" ? "secretDoor" : "door" },
  );

/**
 * Change a wall's flags. A wall that becomes a door starts closed; a door that
 * becomes a wall drops its state, as the wire's `doorState` is `null` unless a
 * door.
 */
export const updateWall = (
  doc: LevelDocument,
  id: string,
  patch: Partial<Pick<LayoutWall, "kind" | "doorState" | "low">>,
): LevelDocument =>
  replaceWall(doc, id, (wall) => {
    const kind = patch.kind ?? wall.kind;
    const doorState = kind === "wall" ? null : (patch.doorState ?? wall.doorState ?? "closed");
    const low = patch.low ?? wall.low;
    if (kind === wall.kind && doorState === wall.doorState && low === wall.low) return wall;
    return { ...wall, kind, doorState, low };
  });

// ---------------------------------------------------------------------------
// Props

/** Where a prop of `kind` turned `rotation` lands with its footprint centred on `at`, kept on the board. */
export const propPlacement = (
  doc: LevelDocument,
  kind: LevelPropKind,
  rotation: number,
  at: Point,
): { readonly x: number; readonly y: number } => {
  const { width, height } = propFootprint({ kind, rotation, x: 0, y: 0 });
  return {
    x: Math.max(0, Math.min(doc.columns - width, Math.round(at.x - width / 2))),
    y: Math.max(0, Math.min(doc.rows - height, Math.round(at.y - height / 2))),
  };
};

/** A new prop with every flag the kit's default (`null`). */
export const newProp = (
  kind: LevelPropKind,
  x: number,
  y: number,
  rotation: number,
): LayoutProp => ({
  id: newPartId(),
  kind,
  x,
  y,
  rotation: ((rotation % 4) + 4) % 4,
  blocksMovement: null,
  blocksSight: null,
  cover: null,
  difficult: null,
  dmOnly: false,
});

export const addProp = (doc: LevelDocument, prop: LayoutProp): LevelDocument => ({
  ...doc,
  props: [...doc.props, prop],
});

const replaceProp = (
  doc: LevelDocument,
  id: string,
  change: (prop: LayoutProp) => LayoutProp,
): LevelDocument => {
  let changed = false;
  const props = doc.props.map((prop) => {
    if (prop.id !== id) return prop;
    const next = change(prop);
    if (next !== prop) changed = true;
    return next;
  });
  return changed ? { ...doc, props } : doc;
};

/** Move a prop's top-left square to `(x, y)`, kept on the board. */
export const moveProp = (doc: LevelDocument, id: string, x: number, y: number): LevelDocument =>
  replaceProp(doc, id, (prop) => {
    const { width, height } = propFootprint(prop);
    const nx = Math.max(0, Math.min(doc.columns - width, Math.round(x)));
    const ny = Math.max(0, Math.min(doc.rows - height, Math.round(y)));
    return nx === prop.x && ny === prop.y ? prop : { ...prop, x: nx, y: ny };
  });

/** Turn a prop a quarter clockwise about its footprint's top-left, kept on the board. */
export const rotateProp = (doc: LevelDocument, id: string): LevelDocument =>
  replaceProp(doc, id, (prop) => {
    const turned = { ...prop, rotation: (prop.rotation + 1) % 4 };
    const { width, height } = propFootprint(turned);
    return {
      ...turned,
      x: Math.max(0, Math.min(doc.columns - width, turned.x)),
      y: Math.max(0, Math.min(doc.rows - height, turned.y)),
    };
  });

/** The prop flags a person can override; `null` hands one back to the kit's default. */
export type PropFlags = Pick<
  LayoutProp,
  "blocksMovement" | "blocksSight" | "cover" | "difficult" | "dmOnly"
>;

/**
 * Set prop flags. A value equal to the kit's default is stored as `null`, so
 * an override exists only where it differs from the kit, and a later change to
 * the kit reaches every prop that never departed from it.
 */
export const updateProp = (
  doc: LevelDocument,
  id: string,
  patch: Partial<PropFlags>,
): LevelDocument =>
  replaceProp(doc, id, (prop) => {
    const kit = PROP_KINDS[prop.kind];
    const override = <T>(value: T | null | undefined, current: T | null, fallback: T): T | null =>
      value === undefined ? current : value === null || value === fallback ? null : value;
    const next: LayoutProp = {
      ...prop,
      blocksMovement: override(patch.blocksMovement, prop.blocksMovement, kit.blocksMovement),
      blocksSight: override(patch.blocksSight, prop.blocksSight, kit.blocksSight),
      cover: override(patch.cover, prop.cover, kit.cover),
      difficult: override(patch.difficult, prop.difficult, kit.difficult),
      dmOnly: patch.dmOnly ?? prop.dmOnly,
    };
    return next.blocksMovement === prop.blocksMovement &&
      next.blocksSight === prop.blocksSight &&
      next.cover === prop.cover &&
      next.difficult === prop.difficult &&
      next.dmOnly === prop.dmOnly
      ? prop
      : next;
  });

// ---------------------------------------------------------------------------
// Lights

/** A light from a preset at `at`; fire flickers. */
export const newLight = (preset: LightPreset, at: Point): LayoutLight => {
  const { bright, dim, tone } = LIGHT_PRESETS[preset];
  return {
    id: newPartId(),
    x: at.x,
    y: at.y,
    bright,
    dim,
    tone,
    flicker: tone === "fire",
    lit: true,
  };
};

export const addLight = (doc: LevelDocument, light: LayoutLight): LevelDocument => ({
  ...doc,
  lights: [...doc.lights, light],
});

/** The centre of the square under `at`, or `at` itself when placing freely. */
export const lightSpot = (at: Point, free: boolean): Point =>
  free ? at : { x: Math.floor(at.x) + 0.5, y: Math.floor(at.y) + 0.5 };

export const updateLight = (
  doc: LevelDocument,
  id: string,
  patch: Partial<Omit<LayoutLight, "id">>,
): LevelDocument => {
  let changed = false;
  const lights = doc.lights.map((light) => {
    if (light.id !== id) return light;
    const next = { ...light, ...patch };
    if ((Object.keys(patch) as Array<keyof typeof patch>).some((key) => next[key] !== light[key])) {
      changed = true;
      return next;
    }
    return light;
  });
  return changed ? { ...doc, lights } : doc;
};

/** The preset a light matches exactly, if any (`lightPresetOf`). */
export const presetOf = lightPresetOf;

// ---------------------------------------------------------------------------
// Regions

/** A way in is never secret: the table is never shown one (`LevelRegionKind`). */
const secretFor = (kind: LevelRegionKind, secret: boolean) => kind !== "entry" && secret;

/** A new, empty region; it exists in the document once it has a square. */
export const newRegion = (kind: LevelRegionKind, secret: boolean): LayoutRegion => ({
  id: newPartId(),
  kind,
  squares: [],
  secret: secretFor(kind, secret),
});

/**
 * Add `squares` to `region` (by id), adding the region to the document when it
 * is not there yet. Squares stay sorted and distinct.
 */
export const paintRegion = (
  doc: LevelDocument,
  region: LayoutRegion,
  squares: ReadonlyArray<number>,
): LevelDocument => {
  const existing = doc.regions.find((r) => r.id === region.id);
  const base = existing ?? region;
  const set = new Set(base.squares);
  const before = set.size;
  for (const square of squares) {
    if (square >= 0 && square < doc.columns * doc.rows) set.add(square);
  }
  if (set.size === before && existing !== undefined) return doc;
  if (set.size === 0) return doc;
  const next: LayoutRegion = { ...base, squares: [...set].sort((a, b) => a - b) };
  return {
    ...doc,
    regions:
      existing === undefined
        ? [...doc.regions, next]
        : doc.regions.map((r) => (r.id === region.id ? next : r)),
  };
};

/** Take `squares` out of every region of `kind` (every region, given none); a region left empty is deleted. */
export const unpaintRegions = (
  doc: LevelDocument,
  squares: ReadonlyArray<number>,
  kind: LevelRegionKind | null,
): LevelDocument => {
  const drop = new Set(squares);
  let changed = false;
  const regions: Array<LayoutRegion> = [];
  for (const region of doc.regions) {
    if (kind !== null && region.kind !== kind) {
      regions.push(region);
      continue;
    }
    const kept = region.squares.filter((square) => !drop.has(square));
    if (kept.length === region.squares.length) {
      regions.push(region);
      continue;
    }
    changed = true;
    if (kept.length > 0) regions.push({ ...region, squares: kept });
  }
  return changed ? { ...doc, regions } : doc;
};

export const updateRegion = (
  doc: LevelDocument,
  id: string,
  patch: Partial<Pick<LayoutRegion, "kind" | "secret">>,
): LevelDocument => {
  let changed = false;
  const regions = doc.regions.map((region) => {
    if (region.id !== id) return region;
    const merged = { ...region, ...patch };
    const next = { ...merged, secret: secretFor(merged.kind, merged.secret) };
    if (next.kind === region.kind && next.secret === region.secret) return region;
    changed = true;
    return next;
  });
  return changed ? { ...doc, regions } : doc;
};

// ---------------------------------------------------------------------------
// Whole parts, and the level itself

/** A part of the level by what it is and its id. */
export interface PartRef {
  readonly type: "wall" | "prop" | "light" | "region";
  readonly id: string;
}

/** Delete one part. */
export const removePart = (doc: LevelDocument, part: PartRef): LevelDocument => {
  const without = <T extends { readonly id: string }>(list: ReadonlyArray<T>) => {
    const next = list.filter((item) => item.id !== part.id);
    return next.length === list.length ? null : next;
  };
  switch (part.type) {
    case "wall": {
      const walls = without(doc.walls);
      return walls === null ? doc : { ...doc, walls };
    }
    case "prop": {
      const props = without(doc.props);
      return props === null ? doc : { ...doc, props };
    }
    case "light": {
      const lights = without(doc.lights);
      return lights === null ? doc : { ...doc, lights };
    }
    case "region": {
      const regions = without(doc.regions);
      return regions === null ? doc : { ...doc, regions };
    }
  }
};

export const setAmbient = (doc: LevelDocument, ambient: LevelAmbient): LevelDocument =>
  doc.ambient === ambient ? doc : { ...doc, ambient };

export const setName = (doc: LevelDocument, name: string): LevelDocument =>
  doc.name === name ? doc : { ...doc, name };
