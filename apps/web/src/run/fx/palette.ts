import type { DamageType } from "@taverns/api";

/**
 * Each damage type's family in the board's effects palette
 * (`local-tokens.css`, prototype): a glow under it, a saturated body, a
 * white-hot core, all drawn over one ink. The weapon's own three share the
 * steel family. Whole class names, so the theme emits every one.
 */
export interface Family {
  readonly glowFill: string;
  readonly bodyFill: string;
  readonly coreFill: string;
  readonly glowStroke: string;
  readonly bodyStroke: string;
  readonly coreStroke: string;
}

const family = (
  glowFill: string,
  bodyFill: string,
  coreFill: string,
  glowStroke: string,
  bodyStroke: string,
  coreStroke: string,
): Family => ({ glowFill, bodyFill, coreFill, glowStroke, bodyStroke, coreStroke });

const FIRE = family(
  "fill-fx-fire-glow",
  "fill-fx-fire",
  "fill-fx-fire-core",
  "stroke-fx-fire-glow",
  "stroke-fx-fire",
  "stroke-fx-fire-core",
);
const COLD = family(
  "fill-fx-cold-glow",
  "fill-fx-cold",
  "fill-fx-cold-core",
  "stroke-fx-cold-glow",
  "stroke-fx-cold",
  "stroke-fx-cold-core",
);
const LIGHTNING = family(
  "fill-fx-lightning-glow",
  "fill-fx-lightning",
  "fill-fx-lightning-core",
  "stroke-fx-lightning-glow",
  "stroke-fx-lightning",
  "stroke-fx-lightning-core",
);
const THUNDER = family(
  "fill-fx-thunder-glow",
  "fill-fx-thunder",
  "fill-fx-thunder-core",
  "stroke-fx-thunder-glow",
  "stroke-fx-thunder",
  "stroke-fx-thunder-core",
);
const ACID = family(
  "fill-fx-acid-glow",
  "fill-fx-acid",
  "fill-fx-acid-core",
  "stroke-fx-acid-glow",
  "stroke-fx-acid",
  "stroke-fx-acid-core",
);
const POISON = family(
  "fill-fx-poison-glow",
  "fill-fx-poison",
  "fill-fx-poison-core",
  "stroke-fx-poison-glow",
  "stroke-fx-poison",
  "stroke-fx-poison-core",
);
const NECROTIC = family(
  "fill-fx-necrotic-glow",
  "fill-fx-necrotic",
  "fill-fx-necrotic-core",
  "stroke-fx-necrotic-glow",
  "stroke-fx-necrotic",
  "stroke-fx-necrotic-core",
);
const RADIANT = family(
  "fill-fx-radiant-glow",
  "fill-fx-radiant",
  "fill-fx-radiant-core",
  "stroke-fx-radiant-glow",
  "stroke-fx-radiant",
  "stroke-fx-radiant-core",
);
const FORCE = family(
  "fill-fx-force-glow",
  "fill-fx-force",
  "fill-fx-force-core",
  "stroke-fx-force-glow",
  "stroke-fx-force",
  "stroke-fx-force-core",
);
const PSYCHIC = family(
  "fill-fx-psychic-glow",
  "fill-fx-psychic",
  "fill-fx-psychic-core",
  "stroke-fx-psychic-glow",
  "stroke-fx-psychic",
  "stroke-fx-psychic-core",
);
const STEEL = family(
  "fill-fx-steel-glow",
  "fill-fx-steel",
  "fill-fx-steel-core",
  "stroke-fx-steel-glow",
  "stroke-fx-steel",
  "stroke-fx-steel-core",
);
export const HEAL = family(
  "fill-fx-heal-glow",
  "fill-fx-heal",
  "fill-fx-heal-core",
  "stroke-fx-heal-glow",
  "stroke-fx-heal",
  "stroke-fx-heal-core",
);

const FAMILY: Readonly<Record<DamageType, Family>> = {
  fire: FIRE,
  cold: COLD,
  lightning: LIGHTNING,
  thunder: THUNDER,
  acid: ACID,
  poison: POISON,
  necrotic: NECROTIC,
  radiant: RADIANT,
  force: FORCE,
  psychic: PSYCHIC,
  piercing: STEEL,
  slashing: STEEL,
  bludgeoning: STEEL,
};

/** A damage type's family; an effect that cannot say draws in `fallback`'s. */
export const familyOf = (type: DamageType | null, fallback: DamageType): Family =>
  FAMILY[type ?? fallback];

/** Whether the damage arcs as a jagged bolt rather than a straight beam or an orb. */
export const crackles = (type: DamageType | null): boolean =>
  type === "lightning" || type === "thunder";
