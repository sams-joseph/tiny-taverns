import type { RollMode } from "./Roll.js";

/**
 * **Dice, as both sides throw them.** The browser rolls the DM's and the
 * players' own dice with these, and the server rolls a Hob-run monster's turn
 * with them, so a notation means the same thing wherever it is thrown.
 *
 * Pure: `random` is the one source of every face, a number in `[0, 1)` per
 * die, so a caller can seed a whole roll.
 */

/** A source of faces: a number in `[0, 1)` each time it is asked. */
export type Random = () => number;

export interface ParsedDiceExpression {
  readonly count: number;
  readonly faces: number;
  readonly modifier: number;
  readonly notation: string;
}

/** A roll as thrown: every die, the ones that count, and the total. */
export interface DiceRoll {
  readonly label: string;
  readonly notation: string;
  readonly dice: ReadonlyArray<number>;
  readonly kept: ReadonlyArray<number>;
  readonly modifier: number;
  readonly mode: RollMode;
  readonly total: number;
  readonly natural?: 1 | 20 | undefined;
}

/** `2d6+3`, `1d20-1`: one kind of die, 1–40 of them, d2–d100, and a flat modifier. */
export const parseDiceExpression = (expression: string): ParsedDiceExpression | undefined => {
  const compact = expression.replace(/\s+/g, "");
  const match = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(compact);
  if (match === null) return undefined;
  const count = Number(match[1]);
  const faces = Number(match[2]);
  const modifier = match[3] === undefined ? 0 : Number(match[3]);
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(faces)) return undefined;
  if (count < 1 || count > 40 || faces < 2 || faces > 100) return undefined;
  return { count, faces, modifier, notation: compact.toLowerCase() };
};

/** One die: a face from 1 to `faces`. */
export const rollFace = (faces: number, random: Random): number =>
  Math.floor(Math.max(0, Math.min(0.999_999_999, random())) * faces) + 1;

/**
 * A notation thrown. A single d20 takes advantage or disadvantage (two dice,
 * the higher or the lower kept); anything else ignores the mode and says
 * `normal`.
 */
export const rollDiceExpression = (
  label: string,
  expression: string,
  mode: RollMode,
  random: Random,
): DiceRoll | undefined => {
  const parsed = parseDiceExpression(expression);
  if (parsed === undefined) return undefined;

  const isD20Check = parsed.count === 1 && parsed.faces === 20;
  const dice =
    isD20Check && mode !== "normal"
      ? [rollFace(20, random), rollFace(20, random)]
      : Array.from({ length: parsed.count }, () => rollFace(parsed.faces, random));
  const kept =
    isD20Check && mode === "advantage"
      ? [Math.max(...dice)]
      : isD20Check && mode === "disadvantage"
        ? [Math.min(...dice)]
        : dice;
  const total = kept.reduce((sum, face) => sum + face, 0) + parsed.modifier;
  const natural = isD20Check && kept[0] === 20 ? 20 : isD20Check && kept[0] === 1 ? 1 : undefined;

  return {
    label,
    notation: parsed.notation,
    dice,
    kept,
    modifier: parsed.modifier,
    mode: isD20Check ? mode : "normal",
    total,
    ...(natural === undefined ? {} : { natural }),
  };
};
