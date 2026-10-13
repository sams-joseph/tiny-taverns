import {
  type DiceRoll,
  type Random,
  type RollMode,
  rollDiceExpression,
  signed,
} from "@taverns/api";

export const notationForD20 = (modifier: string): string | undefined => {
  const parsed = Number(modifier.trim());
  if (!Number.isSafeInteger(parsed)) return undefined;
  return `1d20${signed(parsed)}`;
};

export const rollAbilityCheck = (
  label: string,
  modifier: string,
  mode: RollMode = "normal",
  random: Random = Math.random,
): DiceRoll | undefined => {
  const notation = notationForD20(modifier);
  return notation === undefined ? undefined : rollDiceExpression(label, notation, mode, random);
};

export const rollDetail = (roll: DiceRoll): string => {
  const dice = `dice ${roll.dice.join(", ")}`;
  const kept = roll.kept.length === roll.dice.length ? undefined : `kept ${roll.kept.join(", ")}`;
  const parts = [roll.notation, dice, kept, signed(roll.modifier), roll.mode].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  return parts.join(" · ");
};
