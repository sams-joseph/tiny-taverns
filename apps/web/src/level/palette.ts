/**
 * The level's art palette, read from the theme at draw time. Every colour the
 * renderer and the prop kit paint with is a `--level-*` token
 * (`packages/ui/src/local-tokens.css`), the ink is the board effects' own
 * `--fx-ink`, and the editor's marks use the design system's semantic colours,
 * so nothing here restates a value.
 *
 * Colours are kept as raw channel values (0 to 1, the hex over 255) because the
 * renderer draws in the art's own space, as the prototype did, with no sRGB
 * conversion either way.
 */

/** Every `--level-*` colour, by the name after the prefix. */
export const LEVEL_COLOURS = [
  "void",
  "hatch",
  "hatch-line",
  "ambient-bright",
  "ambient-dim",
  "ambient-dark",
  "light-fire",
  "light-arcane",
  "light-moon",
  "light-radiant",
  "darkvision",
  "memory",
  "flagstone-mortar",
  "flagstone-dark",
  "flagstone-light",
  "flagstone-chip",
  "planks-seam",
  "planks-dark",
  "planks-light",
  "planks-edge",
  "planks-nail",
  "grass-dark",
  "grass-light",
  "grass-blade",
  "grass-shade",
  "grass-flower",
  "grass-bloom",
  "earth-dark",
  "earth-light",
  "earth-pebble",
  "water-deep",
  "water-shallow",
  "water-caustic",
  "water-glint",
  "tile-dark",
  "tile-light",
  "tile-grout",
  "wall-dark",
  "wall-light",
  "wall-mortar",
  "wall-top",
  "door-wood",
  "door-iron",
  "rim",
  "rim-stone",
  "crate",
  "crate-slat",
  "crate-brace",
  "barrel",
  "barrel-lid",
  "barrel-hoop",
  "grain",
  "table",
  "table-seam",
  "brass",
  "wood-dark",
  "plate",
  "chair",
  "chair-back",
  "pillar-base",
  "pillar",
  "statue-base",
  "statue",
  "statue-head",
  "statue-staff",
  "brazier",
  "brazier-leg",
  "flame-core",
  "flame",
  "flame-deep",
  "ember",
  "coal",
  "rubble",
  "rubble-dark",
  "grit",
  "chest",
  "gold-dull",
  "gold-bright",
  "gold",
  "shelf",
  "shelf-lip",
  "cloth-red",
  "book-blue",
  "book-green",
  "book-violet",
  "book-tan",
  "book-teal",
  "linen",
  "linen-light",
  "blanket-sheen",
  "altar",
  "wax",
  "candle-flame",
  "leaf-dark",
  "leaf",
  "leaf-mid",
  "leaf-sheen",
  "boulder",
  "bush",
  "bush-light",
  "bush-sheen",
  "berry",
  "rug",
  "rug-blue",
] as const;
export type LevelColour = (typeof LEVEL_COLOURS)[number];

/** The design system's colours the editor's marks and the viewers' tokens use. */
export const THEME_COLOURS = {
  ink: "--fx-ink",
  accent: "--accent",
  danger: "--danger",
  success: "--success",
  magic: "--magic",
  info: "--info",
  muted: "--text-muted",
  heading: "--text-heading",
  onAccent: "--text-on-accent",
  card: "--surface-card",
  raised: "--surface-raised",
} as const;
export type ThemeColour = keyof typeof THEME_COLOURS;

/** A colour as three channels, 0 to 1. */
export type Rgb = readonly [number, number, number];

export interface Palette {
  readonly level: Readonly<Record<LevelColour, Rgb>>;
  readonly theme: Readonly<Record<ThemeColour, Rgb>>;
}

/** A CSS colour (`#rgb`, `#rrggbb`, `rgb(…)`) as channels; black when it cannot be read. */
export const parseColour = (value: string): Rgb => {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text)?.[1];
  if (hex !== undefined) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    const channel = (at: number) => Number.parseInt(full.slice(at, at + 2), 16) / 255;
    return [channel(0), channel(2), channel(4)];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (rgb !== null) {
    return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  }
  return [0, 0, 0];
};

/** Channels as a CSS colour, with an alpha, for the prop kit's 2D canvas. */
export const css = (rgb: Rgb, alpha = 1): string =>
  `rgba(${rgb.map((c) => String(Math.round(c * 255))).join(",")},${String(alpha)})`;

/** Read the palette off an element under the theme. */
export const readPalette = (element: Element): Palette => {
  const style = getComputedStyle(element);
  const read = (name: string) => parseColour(style.getPropertyValue(name));
  const level = Object.fromEntries(
    LEVEL_COLOURS.map((name) => [name, read(`--level-${name}`)]),
  ) as Record<LevelColour, Rgb>;
  const theme = Object.fromEntries(
    Object.entries(THEME_COLOURS).map(([name, variable]) => [name, read(variable)]),
  ) as Record<ThemeColour, Rgb>;
  return { level, theme };
};
