import type { CreatureFeature, CreatureSpellcasting, StatBlock } from "./Creature.js";

/**
 * What a monster spends over a fight: recharge abilities used, X/day uses,
 * legendary actions this round, and spell slots or innate-spell uses.
 *
 * **The stat block says how many; the fight's row says how many are spent**
 * (`Combatant.legendarySpent` and friends, `0093_combatant_resources.ts`). So a
 * creature at the top of a fight is all zeros and empty maps — what `start`
 * seeds and what every row from before the columns has — and what is left is
 * always {@link npcLimits} less the row, worked out where both are in hand.
 * The row never snapshots a maximum, and the start of a creature's turn
 * (`freshTurn`) puts its legendary actions back by zeroing a count rather
 * than by reading the creature.
 *
 * **Keys are stable strings a later proposal can name**, built from the stat
 * block's own section and names, never an index: the runner and the server
 * read the same keys off the same block, and a key the block no longer has is
 * simply never offered.
 */
export type FeatureSection =
  | "specialAbilities"
  | "actions"
  | "bonusActions"
  | "reactions"
  | "legendaryActions";

export const FEATURE_SECTIONS: ReadonlyArray<FeatureSection> = [
  "specialAbilities",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
];

/** `actions/Fire Breath`: a feature of the stat block. */
export const featureKey = (section: FeatureSection, name: string): string => `${section}/${name}`;

/** `spell/Innate Spellcasting/Darkness`: one spell of a spellcasting feature, by its own uses. */
export const spellKey = (feature: string, spell: string): string => `spell/${feature}/${spell}`;

/** `slot/Spellcasting/3`: a spellcasting feature's slots of one level. */
export const slotKey = (feature: string, level: number | string): string =>
  `slot/${feature}/${String(level)}`;

/** What a fight's row has spent; see {@link npcLimits} for what there is to spend. */
export interface NpcSpent {
  readonly legendarySpent: number;
  /** The keys of recharge abilities used and not yet recharged. */
  readonly rechargeSpent: ReadonlyArray<string>;
  /** X/day features and spells, and once-per-rest features: key → uses spent. */
  readonly usesSpent: Readonly<Record<string, number>>;
  /** `slotKey` → slots spent. */
  readonly slotsSpent: Readonly<Record<string, number>>;
}

export const nothingSpent: NpcSpent = {
  legendarySpent: 0,
  rechargeSpent: [],
  usesSpent: {},
  slotsSpent: {},
};

/**
 * How many uses a feature's `usage` gives before a rest, or `undefined` for
 * one with no count to spend: `"per day"` is its `times`, `"recharge after
 * rest"` is once. `"recharge on roll"` is not a count — it is spent or not —
 * and `"at will"` is never spent.
 */
export const usesPerRest = (usage: CreatureFeature["usage"]): number | undefined => {
  if (usage === undefined) return undefined;
  if (usage.type === "per day") return usage.times;
  if (usage.type === "recharge after rest") return usage.times ?? 1;
  return undefined;
};

/** `"recharge on roll"`: the lowest d6 face that brings it back (`"Recharge 5–6"`). */
export const rechargeOn = (usage: CreatureFeature["usage"]): number | undefined =>
  usage?.type === "recharge on roll" ? (usage.minValue ?? 6) : undefined;

/** The spellcasting features of a stat block, each with the name its keys use. */
export const spellcastingOf = (
  statBlock: StatBlock,
): ReadonlyArray<{ readonly name: string; readonly spellcasting: CreatureSpellcasting }> =>
  FEATURE_SECTIONS.flatMap((section) =>
    (statBlock[section] ?? []).flatMap((feature) =>
      feature.spellcasting === undefined
        ? []
        : [{ name: feature.name, spellcasting: feature.spellcasting }],
    ),
  );

/** What a stat block gives a creature to spend, under the keys a row spends it by. */
export interface NpcLimits {
  /** Legendary actions a round, or `undefined` for a creature with none. */
  readonly legendaryActions: number | undefined;
  /** Recharge abilities: key → the d6 face that recharges it. */
  readonly recharge: Readonly<Record<string, number>>;
  /** Key → uses before a rest. */
  readonly uses: Readonly<Record<string, number>>;
  /** `slotKey` → slots of that level. */
  readonly slots: Readonly<Record<string, number>>;
}

export const npcLimits = (statBlock: StatBlock | undefined): NpcLimits => {
  const recharge: Record<string, number> = {};
  const uses: Record<string, number> = {};
  const slots: Record<string, number> = {};
  if (statBlock === undefined) return { legendaryActions: undefined, recharge, uses, slots };
  for (const section of FEATURE_SECTIONS) {
    for (const feature of statBlock[section] ?? []) {
      const key = featureKey(section, feature.name);
      const face = rechargeOn(feature.usage);
      if (face !== undefined) recharge[key] = face;
      const count = usesPerRest(feature.usage);
      if (count !== undefined && count > 0) uses[key] = count;
    }
  }
  for (const { name, spellcasting } of spellcastingOf(statBlock)) {
    for (const spell of spellcasting.spells) {
      const count = usesPerRest(spell.usage);
      if (count !== undefined && count > 0) uses[spellKey(name, spell.name)] = count;
    }
    for (const [level, count] of Object.entries(spellcasting.slots ?? {})) {
      if (count > 0) slots[slotKey(name, level)] = count;
    }
  }
  const legendaryActions =
    (statBlock.legendaryActions ?? []).length > 0 ? statBlock.legendaryActionsPerRound : undefined;
  return { legendaryActions, recharge, uses, slots };
};

/** What is left of a count: never below zero, whatever was spent. */
export const leftOf = (limit: number | undefined, spent: number | undefined): number =>
  Math.max(0, (limit ?? 0) - (spent ?? 0));
