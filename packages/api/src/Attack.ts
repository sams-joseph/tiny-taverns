import { type Random, parseDiceExpression, rollFace } from "./Dice.js";
import type { NpcTarget } from "./NpcTurnOptions.js";
import type { RollMode, RollOutcome } from "./Roll.js";
import { signed } from "./Ruleset.js";

/**
 * **An attack roll, resolved**: d20 plus the to-hit against the target's AC,
 * a natural 20 a critical that hits with its damage dice doubled, a natural 1
 * a miss whatever it totals. A target at long range is attacked at
 * disadvantage ({@link attackModeAt}).
 *
 * The one rule: the runner resolves the DM's attacks with it in the browser,
 * and the server resolves a Hob-run monster's with it, so the two cannot
 * disagree about what hits.
 *
 * Pure, and `random` is the one source of every face, the d20s first and then
 * the damage dice in the line's order, so a test can seed the whole attack.
 */

/** One damage notation as a line writes it, with its type when written. */
export interface AttackDamage {
  readonly dice: string;
  readonly type?: string | undefined;
}

/** One damage roll of the line, as rolled. */
export interface DamageRoll {
  /** The dice thrown: `2d8+4`, or `4d8+4` on a critical. */
  readonly notation: string;
  readonly faces: ReadonlyArray<number>;
  readonly modifier: number;
  /** The faces plus the modifier, never below zero. */
  readonly total: number;
  readonly type: string | undefined;
}

/**
 * How the to-hit came out. `no-ac` is a target with no armour class written (a
 * row the DM typed in mid-fight): there is nothing to beat, so the total is the
 * DM's to judge and the damage is rolled for them to apply or not.
 */
export type AttackVerdict = "critical" | "hit" | "natural-1" | "miss" | "no-ac";

export interface AttackRoll {
  /** The d20s thrown: two at advantage or disadvantage. */
  readonly d20s: ReadonlyArray<number>;
  /** The d20 that counts. */
  readonly d20: number;
  readonly mode: RollMode;
  readonly toHit: number;
  readonly total: number;
  readonly ac: number | null;
  readonly verdict: AttackVerdict;
  /** Empty on a miss and a natural 1. */
  readonly damage: ReadonlyArray<DamageRoll>;
  /** Every damage roll together. */
  readonly amount: number;
}

/** Whether the verdict carries damage. */
export const attackLands = (verdict: AttackVerdict): boolean =>
  verdict === "critical" || verdict === "hit" || verdict === "no-ac";

/**
 * The mode an attack is rolled in for where its target stands: disadvantage at
 * long range (SRD, "Ranged Attacks"), normal otherwise. Nothing else that
 * grants either is modelled here; a caller that knows more says so itself.
 */
export const attackModeAt = (band: NpcTarget["band"] | undefined): RollMode =>
  band === "long" ? "disadvantage" : "normal";

/** One damage notation, doubled on a critical. A notation that does not parse rolls nothing. */
const rollDamage = (
  { dice, type }: AttackDamage,
  critical: boolean,
  random: Random,
): DamageRoll | undefined => {
  const parsed = parseDiceExpression(dice);
  if (parsed === undefined) return undefined;
  const count = critical ? parsed.count * 2 : parsed.count;
  const faces = Array.from({ length: count }, () => rollFace(parsed.faces, random));
  const sum = faces.reduce((total, face) => total + face, 0) + parsed.modifier;
  return {
    notation: `${String(count)}d${String(parsed.faces)}${parsed.modifier === 0 ? "" : signed(parsed.modifier)}`,
    faces,
    modifier: parsed.modifier,
    total: Math.max(0, sum),
    type,
  };
};

/** Every damage notation of a line, each rolled, doubled on a critical. */
export const rollDamages = (
  damage: ReadonlyArray<AttackDamage>,
  critical: boolean,
  random: Random,
): ReadonlyArray<DamageRoll> =>
  damage.flatMap((entry) => rollDamage(entry, critical, random) ?? []);

/** The damage rolls together. */
export const damageTotal = (damage: ReadonlyArray<DamageRoll>): number =>
  damage.reduce((total, roll) => total + roll.total, 0);

/**
 * How a to-hit comes out: a natural 20 a critical and a natural 1 a miss
 * whatever they total, else the total against the AC, and nothing to beat with
 * no AC written. The one verdict: the DM's browser, a kept Hob turn and a
 * player's attack the server resolves all read it.
 */
export const attackVerdict = (d20: number, total: number, ac: number | null): AttackVerdict =>
  d20 === 20
    ? "critical"
    : d20 === 1
      ? "natural-1"
      : ac === null
        ? "no-ac"
        : total >= ac
          ? "hit"
          : "miss";

/** A verdict as a roll keeps it; a total with no AC to beat keeps none. */
export const rollOutcomeOf = (verdict: AttackVerdict): RollOutcome | undefined =>
  verdict === "critical"
    ? "crit"
    : verdict === "natural-1"
      ? "fumble"
      : verdict === "no-ac"
        ? undefined
        : verdict;

export const rollAttack = ({
  toHit,
  damage,
  ac,
  mode,
  random,
}: {
  readonly toHit: number;
  readonly damage: ReadonlyArray<AttackDamage>;
  readonly ac: number | null;
  readonly mode: RollMode;
  readonly random: Random;
}): AttackRoll => {
  const d20s =
    mode === "normal" ? [rollFace(20, random)] : [rollFace(20, random), rollFace(20, random)];
  const d20 = mode === "advantage" ? Math.max(...d20s) : Math.min(...d20s);
  const total = d20 + toHit;
  const verdict = attackVerdict(d20, total, ac);
  const rolled = attackLands(verdict) ? rollDamages(damage, verdict === "critical", random) : [];
  return {
    d20s,
    d20,
    mode,
    toHit,
    total,
    ac,
    verdict,
    damage: rolled,
    amount: damageTotal(rolled),
  };
};
