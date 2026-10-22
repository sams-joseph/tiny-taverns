import {
  LEVEL_MATERIALS,
  type LevelLayout,
  type LevelLightTone,
  type LevelMaterial,
  propFootprint,
} from "@taverns/api";
import { drawProp, PROP_PX } from "./kitArt";
import { css, type LevelColour, type Palette, type Rgb } from "./palette";

/**
 * A level drawn flat on a 2D canvas, top down, at a few pixels a square: the
 * Hob card's preview of a level it proposed. Not the renderer — no WebGL, no
 * shadows, no fog — so a card can draw one cheaply wherever it is; the props
 * are the kit's own art (`kitArt.ts`), scaled down, and every colour is the
 * palette's.
 *
 * Draws the DM's view: a secret door is marked, every prop shown.
 */

type Floored = Exclude<LevelMaterial, "void">;

/**
 * Each material's two tones, a square's own tone mixed between them by a
 * hash of where it is, so a floor reads as worn stone or boards rather than a
 * checkerboard; and how far apart a square may stray (`spread`).
 */
const FLOOR: Readonly<
  Record<Floored, { readonly tones: readonly [LevelColour, LevelColour]; readonly spread: number }>
> = {
  flagstone: { tones: ["flagstone-dark", "flagstone-light"], spread: 0.8 },
  planks: { tones: ["planks-dark", "planks-light"], spread: 0.6 },
  grass: { tones: ["grass-dark", "grass-light"], spread: 0.7 },
  earth: { tones: ["earth-dark", "earth-light"], spread: 0.7 },
  water: { tones: ["water-deep", "water-shallow"], spread: 0.35 },
  tile: { tones: ["tile-dark", "tile-light"], spread: 0.35 },
};

/**
 * What lies over a square's tone, in the material's own colour: the joints
 * between flagstones and tiles, the seams between planks, and the fleck a
 * patch of grass, earth or water has. Each mark is `[x, y, w, h]` in parts of
 * a square, so it scales with the still.
 */
const MARK: Readonly<Record<Floored, LevelColour>> = {
  flagstone: "flagstone-mortar",
  planks: "planks-seam",
  grass: "grass-blade",
  earth: "earth-pebble",
  water: "water-caustic",
  tile: "tile-grout",
};

/** A square's own number in `[0, 1)`, the same every draw. */
const hash = (x: number, y: number, salt = 0): number => {
  let h =
    Math.imul(x + 1, 374_761_393) ^
    Math.imul(y + 1, 668_265_263) ^
    Math.imul(salt + 1, 2_246_822_519);
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

type Mark = readonly [number, number, number, number];

/** The marks on square `(x, y)` of `material`, by its neighbours where a joint runs between. */
const marksOf = (
  material: Floored,
  x: number,
  y: number,
  same: (dx: number, dy: number) => boolean,
): ReadonlyArray<Mark> => {
  const joint = material === "tile" ? 0.08 : 0.1;
  switch (material) {
    case "flagstone":
    case "tile": {
      // A joint on the square's top and left edge, against the same floor:
      // every square a stone, its neighbour's joint closing it off.
      const out: Array<Mark> = [];
      if (same(0, -1)) out.push([0, 0, 1, joint]);
      if (same(-1, 0)) out.push([0, 0, joint, 1]);
      // A flagstone is sometimes split across, as a laid floor is.
      if (material === "flagstone" && hash(x, y, 3) < 0.3) {
        out.push(hash(x, y, 4) < 0.5 ? [0, 0.5, 1, joint] : [0.5, 0, joint, 1]);
      }
      return out;
    }
    case "planks": {
      // Boards run across: a seam along the top of each row, and a butt joint
      // somewhere along every few squares.
      const out: Array<Mark> = [];
      if (same(0, -1)) out.push([0, 0, 1, joint]);
      if (hash(x, y, 5) < 0.35) out.push([hash(x, y, 6) * 0.8 + 0.1, 0, joint, 1]);
      return out;
    }
    case "grass":
    case "earth":
      return hash(x, y, 7) < 0.6
        ? [[hash(x, y, 8) * 0.7 + 0.1, hash(x, y, 9) * 0.7 + 0.1, 0.18, 0.18]]
        : [];
    case "water":
      return hash(x, y, 10) < 0.5
        ? [[hash(x, y, 11) * 0.5 + 0.1, hash(x, y, 12) * 0.8 + 0.1, 0.4, 0.08]]
        : [];
  }
};

const LIGHT: Readonly<Record<LevelLightTone, LevelColour>> = {
  fire: "light-fire",
  arcane: "light-arcane",
  moon: "light-moon",
  radiant: "light-radiant",
};

/** How far the ambient light darkens the floor before the lights are added. */
const SHADE = { bright: 0, dim: 0.35, dark: 0.6 } as const;

/**
 * Draw `level` onto `canvas` at `px` pixels a square, sizing the canvas to
 * fit. `false` where there is no 2D canvas (the test environment), and the
 * canvas is left as it was.
 */
export const drawLevelThumbnail = (
  canvas: HTMLCanvasElement,
  level: LevelLayout,
  palette: Palette,
  px: number,
): boolean => {
  let c: CanvasRenderingContext2D | null = null;
  try {
    c = canvas.getContext("2d");
  } catch {
    c = null;
  }
  if (c === null) return false;
  const { columns, rows } = level;
  canvas.width = columns * px;
  canvas.height = rows * px;
  const k = (name: LevelColour, alpha = 1) => css(palette.level[name], alpha);

  c.fillStyle = k("void");
  c.fillRect(0, 0, canvas.width, canvas.height);
  const materialAt = (x: number, y: number): LevelMaterial =>
    x < 0 || y < 0 || x >= columns || y >= rows
      ? "void"
      : (LEVEL_MATERIALS[level.floor[y * columns + x] ?? 0] ?? "void");
  // Each square its own tone between the material's two, then its joints.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const material = materialAt(x, y);
      if (material === "void") continue;
      const { tones, spread } = FLOOR[material];
      const t = 0.5 + (hash(x, y) - 0.5) * spread;
      c.fillStyle = css(mix(palette.level[tones[0]], palette.level[tones[1]], t));
      c.fillRect(x * px, y * px, px, px);
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const material = materialAt(x, y);
      if (material === "void") continue;
      const marks = marksOf(material, x, y, (dx, dy) => materialAt(x + dx, y + dy) === material);
      if (marks.length === 0) continue;
      c.fillStyle = k(MARK[material], material === "water" ? 0.6 : 0.85);
      for (const [mx, my, mw, mh] of marks) {
        // At least a pixel, so a joint never vanishes on a small still.
        c.fillRect((x + mx) * px, (y + my) * px, Math.max(1, mw * px), Math.max(1, mh * px));
      }
    }
  }

  // The props, flat ones first, each the kit's own drawing scaled to its footprint.
  const art = new Map<string, HTMLCanvasElement | null>();
  const ordered = [...level.props].sort(
    (a, b) => Number(b.kind === "rug") - Number(a.kind === "rug"),
  );
  for (const prop of ordered) {
    if (!art.has(prop.kind)) art.set(prop.kind, drawProp(prop.kind, palette));
    const drawn = art.get(prop.kind);
    if (drawn === null || drawn === undefined) continue;
    const { column, row, width, height } = propFootprint(prop);
    c.save();
    c.translate((column + width / 2) * px, (row + height / 2) * px);
    c.rotate((prop.rotation * Math.PI) / 2);
    const w = (drawn.width / PROP_PX) * px;
    const h = (drawn.height / PROP_PX) * px;
    c.drawImage(drawn, -w / 2, -h / 2, w, h);
    c.restore();
  }

  // The ambient light, then every lit light added back over it.
  const shade = SHADE[level.ambient];
  if (shade > 0) {
    c.fillStyle = k("ambient-dark", shade);
    c.fillRect(0, 0, canvas.width, canvas.height);
  }
  c.save();
  c.globalCompositeOperation = "lighter";
  for (const light of level.lights) {
    if (!light.lit) continue;
    const reach = ((light.bright + light.dim) / level.feetPerCell) * px;
    if (reach <= 0) continue;
    const glow = c.createRadialGradient(
      light.x * px,
      light.y * px,
      0,
      light.x * px,
      light.y * px,
      reach,
    );
    glow.addColorStop(0, k(LIGHT[light.tone], 0.4));
    glow.addColorStop(light.bright / (light.bright + light.dim), k(LIGHT[light.tone], 0.18));
    glow.addColorStop(1, k(LIGHT[light.tone], 0));
    c.fillStyle = glow;
    c.fillRect(light.x * px - reach, light.y * px - reach, reach * 2, reach * 2);
  }
  c.restore();

  // Walls over everything, doors in wood and secret doors in iron.
  c.lineCap = "square";
  for (const wall of level.walls) {
    c.beginPath();
    c.moveTo(wall.x1 * px, wall.y1 * px);
    c.lineTo(wall.x2 * px, wall.y2 * px);
    c.strokeStyle =
      wall.kind === "door"
        ? k("door-wood")
        : wall.kind === "secretDoor"
          ? k("door-iron")
          : k("wall-top");
    c.lineWidth = Math.max(1, px * (wall.kind === "wall" ? 0.4 : 0.3));
    c.stroke();
  }
  return true;
};
