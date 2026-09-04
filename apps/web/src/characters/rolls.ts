export type RollMode = "normal" | "advantage" | "disadvantage";

export interface ParsedDiceExpression {
  readonly count: number;
  readonly faces: number;
  readonly modifier: number;
  readonly notation: string;
}

export interface LocalRoll {
  readonly label: string;
  readonly notation: string;
  readonly dice: ReadonlyArray<number>;
  readonly kept: ReadonlyArray<number>;
  readonly modifier: number;
  readonly mode: RollMode;
  readonly total: number;
  readonly natural?: 1 | 20 | undefined;
}

export type Random = () => number;

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

export const signed = (modifier: number): string =>
  modifier === 0 ? "+0" : modifier > 0 ? `+${String(modifier)}` : String(modifier);

export const notationForD20 = (modifier: string): string | undefined => {
  const parsed = Number(modifier.trim());
  if (!Number.isSafeInteger(parsed)) return undefined;
  return `1d20${signed(parsed)}`;
};

const rollFace = (faces: number, random: Random): number =>
  Math.floor(Math.max(0, Math.min(0.999_999_999, random())) * faces) + 1;

export const rollDiceExpression = (
  label: string,
  expression: string,
  mode: RollMode = "normal",
  random: Random = Math.random,
): LocalRoll | undefined => {
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

export const rollAbilityCheck = (
  label: string,
  modifier: string,
  mode: RollMode = "normal",
  random: Random = Math.random,
): LocalRoll | undefined => {
  const notation = notationForD20(modifier);
  return notation === undefined ? undefined : rollDiceExpression(label, notation, mode, random);
};

export const rollDetail = (roll: LocalRoll): string => {
  const dice = `dice ${roll.dice.join(", ")}`;
  const kept = roll.kept.length === roll.dice.length ? undefined : `kept ${roll.kept.join(", ")}`;
  const parts = [roll.notation, dice, kept, signed(roll.modifier), roll.mode].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  return parts.join(" · ");
};
