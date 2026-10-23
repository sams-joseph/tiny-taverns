import { Schema } from "effect";

/**
 * The vocabulary a level is built from: floor materials, the prop kit, wall
 * kinds, light tones and presets, and the ambient light. One file because the
 * wire (`Level.ts`), the geometry (`LevelGeometry.ts`), the server's generator
 * and the web's renderer must all name the same things.
 *
 * Coordinates on a level are squares: `x` across from the left edge, `y` down
 * from the top edge. Walls sit on grid vertices (halves allowed); props sit on
 * whole squares; lights sit anywhere.
 *
 * The kit's art is drawn in code by the web client (`apps/web/src/level/`).
 * This file holds only what a rule reads: a prop's footprint and its 5e
 * behaviour, which a placed prop may override.
 */

/**
 * A square's floor. Stored as a `smallint` per square, so the order is the
 * storage: append, never reorder. `void` is no floor (rock, the outside).
 */
export const LEVEL_MATERIALS = [
  "void",
  "flagstone",
  "planks",
  "grass",
  "earth",
  "water",
  "tile",
] as const;
export const LevelMaterial = Schema.Literals(LEVEL_MATERIALS);
export type LevelMaterial = typeof LevelMaterial.Type;

/** Materials that cost double to move through (PHB, difficult terrain). */
export const DIFFICULT_MATERIALS: ReadonlySet<LevelMaterial> = new Set(["water"]);

/** What a wall segment is. A secret door is a wall to players until it is revealed. */
export const LevelWallKind = Schema.Literals(["wall", "door", "secretDoor"]);
export type LevelWallKind = typeof LevelWallKind.Type;

export const LevelDoorState = Schema.Literals(["open", "closed", "locked"]);
export type LevelDoorState = typeof LevelDoorState.Type;

/**
 * A painted area with a rule of its own. A `trap` and a `hazard` are the DM's
 * until revealed; magical darkness and heavy obscurement block sight without a
 * wall (PHB, vision and light).
 *
 * `entry` is where the party comes in: the squares a level visit stands the
 * party on when it is opened (`LevelVisit.ts`). It is the DM's overlay and
 * has no rule: it changes no move and no sight, a fight ignores it, it is
 * never secret, and a seated player's table is never sent it
 * (`TABLE_REGION_KINDS`).
 */
export const LEVEL_REGION_KINDS = [
  "difficult",
  "magicalDarkness",
  "heavyObscurement",
  "hazard",
  "trap",
  "entry",
] as const;
export const LevelRegionKind = Schema.Literals(LEVEL_REGION_KINDS);
export type LevelRegionKind = typeof LevelRegionKind.Type;

/** The region kinds a seated player's table can be sent: every kind but the DM's `entry`. */
export const TABLE_REGION_KINDS = LEVEL_REGION_KINDS.filter(
  (kind): kind is Exclude<LevelRegionKind, "entry"> => kind !== "entry",
);
export const TableRegionKind = Schema.Literals(TABLE_REGION_KINDS);
export type TableRegionKind = typeof TableRegionKind.Type;

/** The DMG's degrees of cover. */
export const LevelCover = Schema.Literals(["none", "half", "threeQuarters", "total"]);
export type LevelCover = typeof LevelCover.Type;

export const LEVEL_PROP_KINDS = [
  "crate",
  "barrel",
  "table",
  "chair",
  "pillar",
  "statue",
  "brazier",
  "rubble",
  "chest",
  "bookshelf",
  "bed",
  "altar",
  "tree",
  "boulder",
  "bush",
  "rug",
] as const;
export const LevelPropKind = Schema.Literals(LEVEL_PROP_KINDS);
export type LevelPropKind = typeof LevelPropKind.Type;

export const LevelLightTone = Schema.Literals(["fire", "arcane", "moon", "radiant"]);
export type LevelLightTone = typeof LevelLightTone.Type;

/** The light that falls everywhere before any light source. */
export const LevelAmbient = Schema.Literals(["bright", "dim", "dark"]);
export type LevelAmbient = typeof LevelAmbient.Type;

/** A light's reach in feet: `bright` of bright light, then `dim` more of dim light (PHB). */
export interface LightReach {
  readonly bright: number;
  readonly dim: number;
  readonly tone: LevelLightTone;
}

/** A prop kind's footprint in squares (unrotated) and its 5e behaviour by default. */
export interface PropKindSpec {
  readonly width: number;
  readonly height: number;
  readonly blocksMovement: boolean;
  readonly blocksSight: boolean;
  readonly cover: LevelCover;
  readonly difficult: boolean;
  /** Lies flat on the floor: drawn under everything, casts no shadow. */
  readonly flat: boolean;
  /** Its sight-blocking outline is round (a pillar, a tree), not its footprint. */
  readonly round: boolean;
  /** A light the prop carries, centred on it. */
  readonly light: LightReach | null;
}

const prop = (
  spec: Partial<PropKindSpec> & Pick<PropKindSpec, "width" | "height">,
): PropKindSpec => ({
  blocksMovement: true,
  blocksSight: false,
  cover: "half",
  difficult: false,
  flat: false,
  round: false,
  light: null,
  ...spec,
});

export const PROP_KINDS: Readonly<Record<LevelPropKind, PropKindSpec>> = {
  crate: prop({ width: 1, height: 1 }),
  barrel: prop({ width: 1, height: 1 }),
  table: prop({ width: 2, height: 1 }),
  chair: prop({ width: 1, height: 1, blocksMovement: false, cover: "none" }),
  pillar: prop({ width: 1, height: 1, blocksSight: true, cover: "total", round: true }),
  statue: prop({ width: 1, height: 1, blocksSight: true, cover: "threeQuarters" }),
  brazier: prop({ width: 1, height: 1, light: { bright: 10, dim: 10, tone: "fire" } }),
  rubble: prop({ width: 1, height: 1, blocksMovement: false, difficult: true }),
  chest: prop({ width: 1, height: 1 }),
  bookshelf: prop({ width: 2, height: 1, blocksSight: true, cover: "total" }),
  bed: prop({ width: 1, height: 2 }),
  altar: prop({ width: 2, height: 1 }),
  tree: prop({ width: 2, height: 2, cover: "threeQuarters", round: true }),
  boulder: prop({ width: 1, height: 1 }),
  bush: prop({ width: 1, height: 1, blocksMovement: false, difficult: true }),
  rug: prop({ width: 2, height: 3, blocksMovement: false, cover: "none", flat: true }),
};

/** The light presets the editor offers, in PHB feet. */
export const LIGHT_PRESETS = {
  candle: { bright: 5, dim: 5, tone: "fire" },
  torch: { bright: 20, dim: 20, tone: "fire" },
  lamp: { bright: 15, dim: 30, tone: "fire" },
  brazier: { bright: 10, dim: 10, tone: "fire" },
  arcane: { bright: 10, dim: 10, tone: "arcane" },
  moonbeam: { bright: 10, dim: 20, tone: "moon" },
} as const satisfies Record<string, LightReach>;
export type LightPreset = keyof typeof LIGHT_PRESETS;

/** The preset a light matches exactly, if any: what the editor shows it as and the log names it. */
export const lightPresetOf = (
  light: Pick<LightReach, "bright" | "dim" | "tone">,
): LightPreset | null => {
  for (const [name, preset] of Object.entries(LIGHT_PRESETS) as Array<
    [LightPreset, (typeof LIGHT_PRESETS)[LightPreset]]
  >) {
    if (preset.bright === light.bright && preset.dim === light.dim && preset.tone === light.tone) {
      return name;
    }
  }
  return null;
};

/** The most squares a level runs across or down, the bound of every fight's board. */
export const LEVEL_SQUARES_MAX = 200;
/** The farthest a light reaches, bright or dim, in feet. */
export const LEVEL_LIGHT_FEET_MAX = 120;
