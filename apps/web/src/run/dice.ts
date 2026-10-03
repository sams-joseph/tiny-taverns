import { useCallback, useRef, useState } from "react";
import { rollDiceExpression, type LocalRoll } from "../characters/rolls";

/**
 * The DM's own dice: a die, an ability, an attack and its result, rolled here
 * and shown here, and nowhere else.
 *
 * **Local on purpose.** A roll is not durable state — only a number it produced
 * is, and the DM applies that to whatever it changes (an attack's *Apply*, the
 * damage box) — so these never reach the wire and are gone on a reload. A
 * death save is not one of them: its face is sent for the server's rule to
 * read, and the night's line for it is the roll's record.
 * Persisting them through `rolls.create` would not be a small step either: a
 * roll with no character takes the night's visibility, `rolls.list` answers
 * shared rows to every member, and the label carries a monster's name. If this
 * is ever sent, it is sent `dm`, with a test.
 *
 * The fight's *Rolls* dock merges these with the players' tray and the night's
 * log (`rollsLog.ts`); a scene's *Dice* card shows the newest six.
 */

/** The drawing's colours for a total, as the semantic tokens they are. */
export type Tone = "success" | "accent" | "danger" | "muted" | "magic";

/** A total in its tone: green a natural 20 or a heal, red a natural 1 or a hit, violet a save or a condition. */
export const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  accent: "text-accent-ink",
  danger: "text-danger",
  muted: "text-muted-foreground",
  magic: "text-magic-ink",
};

/** The drawing's seven, d4 to d100. */
export const DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"] as const;

/** One line of the dock: what rolled, how, and what it came to. */
export interface DmLine {
  readonly label: string;
  /** The notation and faces, or the hit line: `1d20+4 [10]`, `d20 19 +7 = 26 vs AC 17`. */
  readonly detail: string;
  /** The big number or word at the end: `14`, `Hit`, `DC 10`. Absent for a line with none. */
  readonly total?: string;
  readonly tone: Tone;
}

/** A line, when it was rolled, and a number that tells it apart from the one before it. */
export interface DmEntry extends DmLine {
  readonly id: number;
  /** Epoch milliseconds, to sit among the night's lines. */
  readonly at: number;
}

/** The drawing keeps forty. */
const KEPT = 40;

export interface DmDice {
  /** Newest first. */
  readonly entries: ReadonlyArray<DmEntry>;
  /**
   * Roll a notation under a label, and answer with what it came to — a scene's
   * *Roll for them* types the total into the check it is making. A notation
   * that does not parse rolls nothing.
   */
  readonly roll: (label: string, notation: string) => LocalRoll | undefined;
  /** Keep a line rolled elsewhere: an attack, or an action rolled off its turn. */
  readonly log: (line: DmLine) => void;
}

/** `1d20+4 [10]`: the notation and the faces, which is what a DM checks a total against. */
const faces = (roll: LocalRoll): string => `${roll.notation} [${roll.dice.join(", ")}]`;

export function useDmDice(): DmDice {
  const [entries, setEntries] = useState<ReadonlyArray<DmEntry>>([]);
  const next = useRef(0);
  const log = useCallback((line: DmLine) => {
    const id = ++next.current;
    setEntries((current) => [{ ...line, id, at: Date.now() }, ...current].slice(0, KEPT));
  }, []);
  const roll = useCallback(
    (label: string, notation: string) => {
      const rolled = rollDiceExpression(label, notation);
      if (rolled === undefined) return undefined;
      log({
        label,
        detail: faces(rolled),
        total: String(rolled.total),
        tone: rolled.natural === 20 ? "success" : rolled.natural === 1 ? "danger" : "accent",
      });
      return rolled;
    },
    [log],
  );
  return { entries, roll, log };
}
