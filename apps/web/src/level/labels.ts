import type {
  LevelCover,
  LevelDoorState,
  LevelLightTone,
  LevelMaterial,
  LevelPropKind,
  LevelRegionKind,
  LightPreset,
} from "@taverns/api";

/** What the editor calls each thing in the kit. */

export const MATERIAL_LABEL: Readonly<Record<LevelMaterial, string>> = {
  void: "Void",
  flagstone: "Flagstone",
  planks: "Planks",
  grass: "Grass",
  earth: "Earth",
  water: "Water",
  tile: "Tile",
};

export const PROP_LABEL: Readonly<Record<LevelPropKind, string>> = {
  crate: "Crate",
  barrel: "Barrel",
  table: "Table",
  chair: "Chair",
  pillar: "Pillar",
  statue: "Statue",
  brazier: "Brazier",
  rubble: "Rubble",
  chest: "Chest",
  bookshelf: "Bookshelf",
  bed: "Bed",
  altar: "Altar",
  tree: "Tree",
  boulder: "Boulder",
  bush: "Bush",
  rug: "Rug",
};

export const PRESET_LABEL: Readonly<Record<LightPreset, string>> = {
  candle: "Candle",
  torch: "Torch",
  lamp: "Lamp",
  brazier: "Brazier",
  arcane: "Arcane glow",
  moonbeam: "Moonbeam",
};

export const TONE_LABEL: Readonly<Record<LevelLightTone, string>> = {
  fire: "Fire",
  arcane: "Arcane",
  moon: "Moon",
  radiant: "Radiant",
};

export const REGION_LABEL: Readonly<Record<LevelRegionKind, string>> = {
  difficult: "Difficult terrain",
  magicalDarkness: "Magical darkness",
  heavyObscurement: "Heavily obscured",
  hazard: "Hazard",
  trap: "Trap",
  entry: "Way in",
};

export const COVER_LABEL: Readonly<Record<LevelCover, string>> = {
  none: "None",
  half: "Half (+2 AC)",
  threeQuarters: "Three-quarters (+5 AC)",
  total: "Total",
};

export const DOOR_STATE_LABEL: Readonly<Record<LevelDoorState, string>> = {
  closed: "Shut",
  open: "Open",
  locked: "Locked",
};
