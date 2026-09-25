import { useCallback, useRef, useState } from "react";
import { rollDiceExpression, type LocalRoll } from "../characters/rolls";

/**
 * The DM's own dice: a die, an ability or an attack on the selected card, rolled
 * here and shown here, and nowhere else.
 *
 * **Local on purpose.** A roll is not durable state — only a number it produced
 * is, and the DM types that into whatever it changes — so these never reach
 * the wire and are gone on a reload. Persisting them through `rolls.create`
 * would not be a small step either: a roll with no character takes the night's
 * visibility, `rolls.list` answers shared rows to every member, and the label
 * carries a monster's name. If this is ever sent, it is sent `dm`, with a test.
 *
 * The drawing keeps the newest six, newest first, the latest at full strength.
 */

const KEPT = 6;

/** A roll, and a number that tells it apart from the one before it. */
export interface DmRoll extends LocalRoll {
  readonly id: number;
}

export interface DmDice {
  readonly rolls: ReadonlyArray<DmRoll>;
  /** Roll a notation under a label; a notation that does not parse rolls nothing. */
  readonly roll: (label: string, notation: string) => void;
}

export function useDmDice(): DmDice {
  const [rolls, setRolls] = useState<ReadonlyArray<DmRoll>>([]);
  const next = useRef(0);
  const roll = useCallback((label: string, notation: string) => {
    const rolled = rollDiceExpression(label, notation);
    if (rolled === undefined) return;
    const id = ++next.current;
    setRolls((current) => [{ ...rolled, id }, ...current].slice(0, KEPT));
  }, []);
  return { rolls, roll };
}
