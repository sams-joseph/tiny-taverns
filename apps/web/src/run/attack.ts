import { concentrationDc, type CombatantId } from "@taverns/api";
import {
  parseDiceExpression,
  rollDiceExpression,
  rollFace,
  signed,
  type Random,
} from "../characters/rolls";
import type { ActionLine } from "./actions";
import { throwOf, type DmThrow } from "./dice";

/**
 * An attack from the creature panel's *Actions* (`Encounter Runner.dc.html`):
 * d20 plus the line's to-hit against the target's AC, a natural 20 a critical
 * that hits with its damage dice doubled, a natural 1 a miss whatever it
 * totals. Rolled here, and filed with the DM's other dice as the DM's own
 * rolls (`dice.ts`): the to-hit with who swung, at whom, the AC and the
 * outcome, then the damage. What changes the target is the damage the DM then
 * applies, through the same delta a typed number takes.
 *
 * Pure, and `random` is the one source of every face, d20 first and then the
 * damage dice in the line's order, so a test can seed the whole attack.
 */

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
 * The result card's word. `no-ac` is a target with no armour class written (a
 * row the DM typed in mid-fight): there is nothing to beat, so the total is the
 * DM's to judge and the damage is rolled for them to apply or not.
 */
export type Verdict = "critical" | "hit" | "natural-1" | "miss" | "no-ac";

export interface AttackOutcome {
  /** `Longsword → Goblin Boss`. */
  readonly title: string;
  readonly attacker: string;
  readonly target: string;
  readonly d20: number;
  readonly toHit: number;
  readonly total: number;
  readonly ac: number | null;
  readonly verdict: Verdict;
  /** Empty on a miss and a natural 1. */
  readonly damage: ReadonlyArray<DamageRoll>;
  /** Every damage roll together: what *Apply* sends. */
  readonly amount: number;
  /** The target held Concentrating when it was picked. */
  readonly concentrating: boolean;
}

export const VERDICT: Record<Verdict, string> = {
  critical: "Critical hit",
  hit: "Hit",
  "natural-1": "Natural 1",
  miss: "Miss",
  "no-ac": "No AC to beat",
};

/** Whether the verdict carries damage. */
export const lands = (verdict: Verdict): boolean =>
  verdict === "critical" || verdict === "hit" || verdict === "no-ac";

/** A line the panel offers *Attack* for: one that rolls to hit. */
export const attacks = (line: ActionLine): boolean => line.toHit !== undefined;

/** A line the panel offers *Roll* for: a to-hit, or damage dice this can throw. */
export const rolls = (line: ActionLine): boolean =>
  line.toHit !== undefined ||
  line.damage.some(({ dice }) => parseDiceExpression(dice) !== undefined);

/** One damage notation, doubled on a critical. A notation that does not parse rolls nothing. */
const rollDamage = (
  { dice, type }: ActionLine["damage"][number],
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

const damageOf = (line: ActionLine, critical: boolean, random: Random): ReadonlyArray<DamageRoll> =>
  line.damage.flatMap((entry) => rollDamage(entry, critical, random) ?? []);

const sum = (damage: ReadonlyArray<DamageRoll>): number =>
  damage.reduce((total, roll) => total + roll.total, 0);

export const resolveAttack = ({
  attacker,
  line,
  target,
  random = Math.random,
}: {
  readonly attacker: string;
  readonly line: ActionLine;
  readonly target: {
    readonly name: string;
    readonly ac: number | null;
    readonly conditions: ReadonlyArray<string>;
  };
  readonly random?: Random;
}): AttackOutcome => {
  const d20 = rollFace(20, random);
  const toHit = line.toHit ?? 0;
  const total = d20 + toHit;
  const verdict: Verdict =
    d20 === 20
      ? "critical"
      : d20 === 1
        ? "natural-1"
        : target.ac === null
          ? "no-ac"
          : total >= target.ac
            ? "hit"
            : "miss";
  const damage = lands(verdict) ? damageOf(line, verdict === "critical", random) : [];
  const amount = sum(damage);
  return {
    title: `${line.name} → ${target.name}`,
    attacker,
    target: target.name,
    d20,
    toHit,
    total,
    ac: target.ac,
    verdict,
    damage,
    amount,
    concentrating: target.conditions.includes("Concentrating"),
  };
};

/**
 * The save a concentrating target owes for `amount` taken from `hpBefore`, as
 * the server rules it: none for nothing, and none for a hit that drops it to 0.
 */
export const concentrationSave = (
  outcome: AttackOutcome,
  amount: number,
  hpBefore: number,
): number | undefined =>
  lands(outcome.verdict) && outcome.concentrating && amount > 0 && hpBefore - amount > 0
    ? concentrationDc(amount)
    : undefined;

/** `d20 19 +7 = 26 vs AC 17`. */
export const hitLine = (outcome: AttackOutcome): string =>
  `d20 ${String(outcome.d20)} ${signed(outcome.toHit)} = ${String(outcome.total)} vs ${
    outcome.ac === null ? "no AC" : `AC ${String(outcome.ac)}`
  }`;

/** `2d8+4 [3, 6] = 13 slashing`, each damage roll with its faces. */
export const damageLine = (damage: ReadonlyArray<DamageRoll>): string =>
  damage
    .map(
      (roll) =>
        `${roll.notation} [${roll.faces.join(", ")}] = ${String(roll.total)}${
          roll.type === undefined ? "" : ` ${roll.type}`
        }`,
    )
    .join(" · ");

/** The server's word for a verdict; a total with no AC to beat has none. */
const OUTCOME: Record<Verdict, DmThrow["outcome"]> = {
  critical: "crit",
  hit: "hit",
  "natural-1": "fumble",
  miss: "miss",
  "no-ac": undefined,
};

const naturalOf = (d20: number): DmThrow["critical"] =>
  d20 === 20 ? "hit" : d20 === 1 ? "miss" : null;

/** One damage roll as the throw that files it. */
const damageThrow = (label: string, roll: DamageRoll, about: Partial<DmThrow>): DmThrow => ({
  label,
  notation: roll.notation,
  dice: roll.faces,
  kept: roll.faces,
  modifier: roll.modifier,
  total: roll.total,
  mode: "normal",
  critical: null,
  kind: "damage",
  ...about,
});

/**
 * The attack as the DM's rolls (`dice.ts`), one act: the to-hit, with who
 * swung, at whom, the AC it was against and how it came out, then each damage
 * roll it threw. The log prints them as one line,
 * `Brannoc · Longsword → Goblin Boss`.
 */
export const attackThrows = (
  outcome: AttackOutcome,
  who: { readonly attackerId: CombatantId; readonly targetId: CombatantId },
): ReadonlyArray<DmThrow> => {
  const label = `${outcome.attacker} · ${outcome.title}`;
  const about = { combatantId: who.attackerId, targetCombatantId: who.targetId };
  const verdict = OUTCOME[outcome.verdict];
  return [
    {
      label,
      notation: `1d20${signed(outcome.toHit)}`,
      dice: [outcome.d20],
      kept: [outcome.d20],
      modifier: outcome.toHit,
      total: outcome.total,
      mode: "normal",
      critical: naturalOf(outcome.d20),
      kind: "attack",
      ...about,
      ...(outcome.ac === null ? {} : { targetAc: outcome.ac }),
      ...(verdict === undefined ? {} : { outcome: verdict }),
    },
    ...outcome.damage.map((roll) => damageThrow(label, roll, about)),
  ];
};

/**
 * *Roll* for a creature that is not up: the to-hit and the damage together,
 * with no target, as the DM's rolls of one act — the log prints them as one
 * line, `d20 11 +6 = 17 · 2d8+4 = 14`.
 */
export const rollActionThrows = ({
  attacker,
  attackerId,
  line,
  random = Math.random,
}: {
  readonly attacker: string;
  readonly attackerId: CombatantId;
  readonly line: ActionLine;
  readonly random?: Random;
}): ReadonlyArray<DmThrow> => {
  const label = `${attacker} · ${line.name}`;
  const d20 = line.toHit === undefined ? undefined : rollFace(20, random);
  const damage = damageOf(line, false, random);
  return [
    ...(d20 === undefined || line.toHit === undefined
      ? []
      : [
          {
            label,
            notation: `1d20${signed(line.toHit)}`,
            dice: [d20],
            kept: [d20],
            modifier: line.toHit,
            total: d20 + line.toHit,
            mode: "normal",
            critical: naturalOf(d20),
            kind: "attack",
            combatantId: attackerId,
          } satisfies DmThrow,
        ]),
    ...damage.map((roll) => damageThrow(label, roll, { combatantId: attackerId })),
  ];
};

/**
 * The Con save a concentrating target makes for a hit, as the DM's roll: d20
 * plus the save its stat block or sheet holds. A roll has no DC of its own, so
 * the label carries it: `Goblin Boss · Concentration save, DC 10`.
 */
export const concentrationThrow = ({
  target,
  targetId,
  dc,
  modifier,
  random = Math.random,
}: {
  readonly target: string;
  readonly targetId: CombatantId;
  readonly dc: number;
  readonly modifier: number;
  readonly random?: Random;
}): DmThrow | undefined => {
  const rolled = rollDiceExpression(
    `${target} · Concentration save, DC ${String(dc)}`,
    `1d20${signed(modifier)}`,
    "normal",
    random,
  );
  return rolled === undefined
    ? undefined
    : throwOf(rolled, { kind: "concentration", combatantId: targetId });
};
