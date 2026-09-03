import type { ActionCost, ResourceRecharge } from "./Character.js";
import type { AbilityKey } from "./Ruleset.js";

/**
 * What the 2014 source says only in prose about a feature's *use*: its cost in
 * the action economy, how many times it can be used, and when that comes back.
 *
 * ### Why a table, and not a parser
 *
 * The bundled `feature` rows carry a paragraph and nothing else about this.
 * `class_level.body.classSpecific` structures *how many* for the popular
 * counters — Rage, Action Surge, Indomitable, Channel Divinity, Ki, Sorcery
 * Points, Arcane Recovery — but never the recharge and never the economy, and
 * for Second Wind, Lay on Hands and Divine Sense it structures nothing at all.
 * A regex over the prose was tried and files Action Surge as a bonus action
 * (its text mentions one three sentences in), gives Channel Divinity no cost,
 * and gives Divine Smite none either. That would ship silently, so the answer
 * is this file: a small hand-curated table, **keyed by the row's own source
 * index** (`feature.source_key`, or `racial_trait.source_key` for the racial
 * entries), read by `sheetGrantsFor` and by nothing else.
 *
 * It is generated-then-curated data of the same kind as `systemProgression.ts`,
 * for the bundle only: a homebrew feature a DM authors carries none of this,
 * and reaches the sheet as a trait with no counter — the honest degrade, not a
 * guess. `apps/server/test/ruleset-import.test.ts` proves every key here
 * resolves to a real bundled row, so a source rename cannot leave an entry
 * matching nothing.
 *
 * A key names a *resource slug* rather than being one, because several rows
 * are the same counter at different levels (`action-surge-1-use` and
 * `action-surge-2-uses`, the four `bardic-inspiration-dN`) and a sheet holds
 * one row per counter.
 */
export interface OverlayContext {
  readonly level: number;
  readonly proficiencyBonus: number | undefined;
  /** The character's modifier for an ability, `0` when the cell is missing. */
  readonly modifier: (key: AbilityKey) => number;
  /** A `classSpecific` counter at this level, `undefined` when the table has none. */
  readonly counter: (key: string) => number | undefined;
}

export interface OverlayEntry {
  /**
   * The counter this feature spends, as a slug — the sheet's resource id is
   * `res:<slug>`. Absent for a feature with no limited use (Extra Attack).
   */
  readonly resource?: string;
  /** The counter's drawn name, when it is not the feature's own (Font of Magic → Sorcery Points). */
  readonly resourceName?: string;
  /** The `classSpecific` key whose value at this level is the ceiling. */
  readonly counter?: string;
  /** The ceiling for a feature the class table does not count. */
  readonly max?: (context: OverlayContext) => number;
  readonly recharge?: ResourceRecharge;
  /** `"hp"` for a pool, `"ki"` for points; absent for plain uses. */
  readonly unit?: string;
  /** The action economy — D6: drawn on the line, tracked nowhere. */
  readonly cost?: ActionCost;
  /** The roll, when the feature is one: Second Wind's `1d10 + level`. */
  readonly dice?: (context: OverlayContext) => string;
  readonly damageType?: string;
  /** What an action line spends when it is not this feature's own counter (Divine Smite → a slot). */
  readonly spends?: string;
  /** The kind line under an action's name. */
  readonly text?: string;
  /** Attacks per Attack action, for the Extra Attack rows. */
  readonly attacks?: (context: OverlayContext) => number;
}

const atLeastOne = (value: number): number => Math.max(1, value);

/**
 * The cleric's table counts the charges (`channel_divinity_charges`); the
 * paladin's does not, and a paladin has one between rests until level 6 — so
 * the counter is read where it exists and the one is the fallback.
 */
const channelDivinity: OverlayEntry = {
  resource: "channel-divinity",
  resourceName: "Channel Divinity",
  counter: "channel_divinity_charges",
  max: () => 1,
  recharge: "short",
  cost: "action",
  text: "One of your Channel Divinity options",
};

const actionSurge: OverlayEntry = {
  resource: "action-surge",
  resourceName: "Action Surge",
  counter: "action_surges",
  recharge: "short",
  cost: "free",
  text: "One additional action on your turn",
};

const indomitable: OverlayEntry = {
  resource: "indomitable",
  resourceName: "Indomitable",
  counter: "indomitable_uses",
  recharge: "long",
};

/** Fighter-shaped: the class table counts the extra attacks; everybody else gets one. */
const fighterExtraAttack: OverlayEntry = {
  attacks: (context) => 1 + (context.counter("extra_attacks") ?? 1),
};
const extraAttack: OverlayEntry = { attacks: () => 2 };

const bardicInspiration = (die: string, recharge: ResourceRecharge): OverlayEntry => ({
  resource: "bardic-inspiration",
  resourceName: "Bardic Inspiration",
  max: (context) => atLeastOne(context.modifier("CHA")),
  recharge,
  cost: "bonus",
  dice: () => die,
  text: "Give one creature an inspiration die",
});

/** Keyed by `feature.source_key`. */
export const FEATURE_OVERLAY: Readonly<Record<string, OverlayEntry>> = {
  // Fighter
  "second-wind": {
    resource: "second-wind",
    max: () => 1,
    recharge: "short",
    cost: "bonus",
    dice: (context) => `1d10+${String(context.level)}`,
    text: "Regain hit points",
  },
  "action-surge-1-use": actionSurge,
  "action-surge-2-uses": actionSurge,
  "indomitable-1-use": indomitable,
  "indomitable-2-uses": indomitable,
  "indomitable-3-uses": indomitable,
  "extra-attack-1": fighterExtraAttack,
  "extra-attack-2": fighterExtraAttack,
  "extra-attack-3": fighterExtraAttack,
  // Paladin
  "lay-on-hands": {
    resource: "lay-on-hands",
    max: (context) => 5 * context.level,
    recharge: "long",
    unit: "hp",
    cost: "action",
    text: "Restore hit points from the pool, by touch",
  },
  "divine-sense": {
    resource: "divine-sense",
    max: (context) => 1 + context.modifier("CHA"),
    recharge: "long",
    cost: "action",
    text: "Sense celestials, fiends and undead within 60 feet",
  },
  "channel-divinity": channelDivinity,
  "divine-smite": {
    spends: "slot:1",
    dice: () => "2d8",
    damageType: "Radiant",
    text: "When you hit with a melee weapon attack, expend a spell slot",
  },
  "paladin-extra-attack": extraAttack,
  // Cleric
  "channel-divinity-1-rest": channelDivinity,
  "channel-divinity-2-rest": channelDivinity,
  "channel-divinity-3-rest": channelDivinity,
  // Wizard
  "arcane-recovery": {
    resource: "arcane-recovery",
    max: () => 1,
    recharge: "dawn",
    text: "Recover expended slots after a short rest",
  },
  // Barbarian
  rage: {
    resource: "rage",
    counter: "rage_count",
    recharge: "long",
    cost: "bonus",
    text: "Enter a rage",
  },
  "barbarian-extra-attack": extraAttack,
  // Monk
  ki: {
    resource: "ki",
    resourceName: "Ki points",
    counter: "ki_points",
    recharge: "short",
    unit: "ki",
  },
  "monk-extra-attack": extraAttack,
  // Sorcerer
  "font-of-magic": {
    resource: "sorcery-points",
    resourceName: "Sorcery points",
    counter: "sorcery_points",
    recharge: "long",
  },
  // Bard — a long rest until level 5, a short one after.
  "bardic-inspiration-d6": bardicInspiration("1d6", "long"),
  "bardic-inspiration-d8": bardicInspiration("1d8", "short"),
  "bardic-inspiration-d10": bardicInspiration("1d10", "short"),
  "bardic-inspiration-d12": bardicInspiration("1d12", "short"),
  // Ranger
  "ranger-extra-attack": extraAttack,
};

/** Keyed by `racial_trait.source_key`. */
export const RACIAL_TRAIT_OVERLAY: Readonly<Record<string, OverlayEntry>> = {
  "relentless-endurance": {
    resource: "relentless-endurance",
    max: () => 1,
    recharge: "long",
  },
  "breath-weapon": {
    resource: "breath-weapon",
    max: () => 1,
    recharge: "short",
    cost: "action",
    dice: (context) =>
      `${String(context.level >= 16 ? 5 : context.level >= 11 ? 4 : context.level >= 6 ? 3 : 2)}d6`,
    text: "Exhale destructive energy; DC 8 + CON + proficiency",
  },
};
