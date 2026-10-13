import {
  type AttackRoll,
  type AttackVerdict,
  type CombatantId,
  type DamageRoll,
  type Random,
  type RollMode,
  attackLands,
  concentrationDc,
  parseDiceExpression,
  rollAttack,
  rollDamages,
  rollDiceExpression,
  signed,
} from "@taverns/api";
import type { ActionLine } from "./actions";
import { throwOf, type DmThrow } from "./dice";

/**
 * An attack from the creature panel's *Actions* (`Encounter Runner.dc.html`),
 * resolved by the shared rule (`rollAttack`, `packages/api`): d20 plus the
 * line's to-hit against the target's AC, a natural 20 a critical that hits
 * with its damage dice doubled, a natural 1 a miss whatever it totals, and a
 * target at long range attacked at disadvantage. Rolled here, and filed with
 * the DM's other dice as the DM's own rolls (`dice.ts`): the to-hit with who
 * swung, at whom, the AC and the outcome, then the damage. What changes the
 * target is the damage the DM then applies, through the same delta a typed
 * number takes.
 *
 * `random` is the one source of every face, the d20s first and then the
 * damage dice in the line's order, so a test can seed the whole attack.
 */

export interface AttackOutcome extends AttackRoll {
  /** `Longsword → Goblin Boss`. */
  readonly title: string;
  readonly attacker: string;
  readonly target: string;
  /** The target held Concentrating when it was picked. */
  readonly concentrating: boolean;
}

export const VERDICT: Record<AttackVerdict, string> = {
  critical: "Critical hit",
  hit: "Hit",
  "natural-1": "Natural 1",
  miss: "Miss",
  "no-ac": "No AC to beat",
};

/** A line the panel offers *Attack* for: one that rolls to hit. */
export const attacks = (line: ActionLine): boolean => line.toHit !== undefined;

/** A line the panel offers *Roll* for: a to-hit, or damage dice this can throw. */
export const rolls = (line: ActionLine): boolean =>
  line.toHit !== undefined ||
  line.damage.some(({ dice }) => parseDiceExpression(dice) !== undefined);

export const resolveAttack = ({
  attacker,
  line,
  target,
  mode = "normal",
  random = Math.random,
}: {
  readonly attacker: string;
  readonly line: ActionLine;
  readonly target: {
    readonly name: string;
    readonly ac: number | null;
    readonly conditions: ReadonlyArray<string>;
  };
  /** Disadvantage when the target stands at long range (`attackModeAt`). */
  readonly mode?: RollMode;
  readonly random?: Random;
}): AttackOutcome => ({
  ...rollAttack({ toHit: line.toHit ?? 0, damage: line.damage, ac: target.ac, mode, random }),
  title: `${line.name} → ${target.name}`,
  attacker,
  target: target.name,
  concentrating: target.conditions.includes("Concentrating"),
});

/**
 * The save a concentrating target owes for `amount` taken from `hpBefore`, as
 * the server rules it: none for nothing, and none for a hit that drops it to 0.
 */
export const concentrationSave = (
  outcome: AttackOutcome,
  amount: number,
  hpBefore: number,
): number | undefined =>
  attackLands(outcome.verdict) && outcome.concentrating && amount > 0 && hpBefore - amount > 0
    ? concentrationDc(amount)
    : undefined;

/** `d20 19 +7 = 26 vs AC 17`; `d20 4, 19 (disadvantage) +7 = 11 vs AC 17`. */
export const hitLine = (outcome: AttackOutcome): string =>
  `d20 ${
    outcome.d20s.length === 1 ? String(outcome.d20) : `${outcome.d20s.join(", ")} (${outcome.mode})`
  } ${signed(outcome.toHit)} = ${String(outcome.total)} vs ${
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
const OUTCOME: Record<AttackVerdict, DmThrow["outcome"]> = {
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
      dice: outcome.d20s,
      kept: [outcome.d20],
      modifier: outcome.toHit,
      total: outcome.total,
      mode: outcome.mode,
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
 *
 * A seated player rolls their own lines the same way from their Table
 * (`play/PlayerCard.tsx`), with no `attackerId` — a player's roll names no
 * combatant — and with advantage or disadvantage on the to-hit when they say.
 */
export const rollActionThrows = ({
  attacker,
  attackerId,
  line,
  mode = "normal",
  random = Math.random,
}: {
  readonly attacker: string;
  readonly attackerId?: CombatantId;
  readonly line: ActionLine;
  readonly mode?: RollMode;
  readonly random?: Random;
}): ReadonlyArray<DmThrow> => {
  const label = `${attacker} · ${line.name}`;
  const about = attackerId === undefined ? {} : { combatantId: attackerId };
  const toHit =
    line.toHit === undefined
      ? undefined
      : rollDiceExpression(label, `1d20${signed(line.toHit)}`, mode, random);
  const damage = rollDamages(line.damage, false, random);
  return [
    ...(toHit === undefined
      ? []
      : [{ ...throwOf(toHit), kind: "attack", ...about } satisfies DmThrow]),
    ...damage.map((roll) => damageThrow(label, roll, about)),
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
