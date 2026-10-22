import {
  LEVEL_MATERIALS,
  type LevelLayout,
  type LevelLightTone,
  type LevelMaterial,
  propFootprint,
} from "@taverns/api";
import { drawProp, PROP_PX } from "./kitArt";
import { css, type LevelColour, type Palette } from "./palette";

/**
 * A level drawn flat on a 2D canvas, top down, at a few pixels a square: the
 * Hob card's preview of a level it proposed. Not the renderer — no WebGL, no
 * shadows, no fog — so a card can draw one cheaply wherever it is; the props
 * are the kit's own art (`kitArt.ts`), scaled down, and every colour is the
 * palette's.
 *
 * Draws the DM's view: a secret door is marked, every prop shown.
 */

/** Each material's two tones, checkered so a floor reads as squares. */
const FLOOR: Readonly<Record<Exclude<LevelMaterial, "void">, readonly [LevelColour, LevelColour]>> =
  {
    flagstone: ["flagstone-dark", "flagstone-light"],
    planks: ["planks-dark", "planks-light"],
    grass: ["grass-dark", "grass-light"],
    earth: ["earth-dark", "earth-light"],
    water: ["water-deep", "water-shallow"],
    tile: ["tile-dark", "tile-light"],
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
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const material = LEVEL_MATERIALS[level.floor[y * columns + x] ?? 0] ?? "void";
      if (material === "void") continue;
      const [dark, light] = FLOOR[material];
      c.fillStyle = k((x + y) % 2 === 0 ? dark : light);
      c.fillRect(x * px, y * px, px, px);
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
    const glow = c.createRadialGradient(light.x * px, light.y * px, 0, light.x * px, light.y * px, reach);
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
      wall.kind === "door" ? k("door-wood") : wall.kind === "secretDoor" ? k("door-iron") : k("wall-top");
    c.lineWidth = Math.max(1, px * (wall.kind === "wall" ? 0.4 : 0.3));
    c.stroke();
  }
  return true;
};
