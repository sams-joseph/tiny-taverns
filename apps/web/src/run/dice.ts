import type { CampaignId, Roll, RollCreate, SessionId } from "@taverns/api";
import { toast } from "@taverns/ui";
import { DateTime, Result } from "effect";
import { useCallback, useEffect, useMemo, useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { rollDiceExpression, type LocalRoll } from "../characters/rolls";
import { DOCK_KEPT } from "./rollsLog";
import { newRequestId } from "./state";

/**
 * The DM's own dice: a die, an ability, an attack and its damage, an action
 * rolled off its turn and a concentration save, rolled here in the browser and
 * kept by the server as the DM's (`rolls.create` with `visibility: "dm"`, the
 * creator's alone because a label carries a monster's name). A reload, and a
 * second tab, read the same log back off `rolls.list`.
 *
 * **A roll shows the moment it is thrown.** It waits here, under the
 * `requestId` it was sent with, until the night's list carries a roll with that
 * id, and then the server's copy is the one drawn. One the server refuses is
 * taken back off, and a toast says what it came to, so the number the DM just
 * saw is not lost.
 *
 * A death save is not one of them: its face goes to the server's death-save
 * rule, and the night's `death-save` line is the roll's one record.
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

/** What the runner files for one throw: everything but who it is for, which is always the DM. */
export type DmThrow = Omit<RollCreate, "characterId" | "visibility" | "requestId">;

/**
 * One of the DM's rolls as the log draws it, the server's or one still on its
 * way: the fields a line reads, and when it was rolled.
 */
export interface DmRoll extends Pick<
  Roll,
  | "label"
  | "notation"
  | "dice"
  | "kept"
  | "modifier"
  | "total"
  | "mode"
  | "critical"
  | "kind"
  | "targetCombatantId"
  | "targetAc"
  | "outcome"
> {
  /** What it was sent under: the pending copy and the saved one share it. */
  readonly requestId: string | null;
  /** Epoch milliseconds, to sit among the night's lines. */
  readonly at: number;
}

/** A roll with no character is the DM's; the server keeps it to them (`Roll`). */
export const isDmRoll = (roll: Roll): boolean => roll.characterId === null;

const fromServer = (roll: Roll): DmRoll => ({
  label: roll.label,
  notation: roll.notation,
  dice: roll.dice,
  kept: roll.kept,
  modifier: roll.modifier,
  total: roll.total,
  mode: roll.mode,
  critical: roll.critical,
  kind: roll.kind,
  targetCombatantId: roll.targetCombatantId,
  targetAc: roll.targetAc,
  outcome: roll.outcome,
  requestId: roll.requestId,
  at: DateTime.toEpochMillis(roll.createdAt),
});

interface Pending {
  readonly payload: RollCreate & { readonly requestId: string };
  readonly at: number;
}

const fromPending = ({ payload, at }: Pending): DmRoll => ({
  label: payload.label,
  notation: payload.notation,
  dice: payload.dice,
  kept: payload.kept,
  modifier: payload.modifier,
  total: payload.total,
  mode: payload.mode,
  critical: payload.critical ?? null,
  kind: payload.kind ?? "plain",
  targetCombatantId: payload.targetCombatantId ?? null,
  targetAc: payload.targetAc ?? null,
  outcome: payload.outcome ?? null,
  requestId: payload.requestId,
  at,
});

/** A d20 kept at 20 or 1, as the server reads a roll's `critical`. */
export const criticalOf = (roll: LocalRoll): DmThrow["critical"] =>
  roll.natural === 20 ? "hit" : roll.natural === 1 ? "miss" : null;

/** A rolled expression as the throw that files it. */
export const throwOf = (roll: LocalRoll, about: Partial<DmThrow> = {}): DmThrow => ({
  label: roll.label,
  notation: roll.notation,
  dice: roll.dice,
  kept: roll.kept,
  modifier: roll.modifier,
  total: roll.total,
  mode: roll.mode,
  critical: criticalOf(roll),
  ...about,
});

export interface DmDice {
  /** The DM's rolls, newest first: the server's, and this tab's still on their way. */
  readonly rolls: ReadonlyArray<DmRoll>;
  /**
   * Roll a notation under a label, file it, and answer with what it came to —
   * a scene's *Roll for them* types the total into the check it is making. A
   * notation that does not parse rolls nothing.
   */
  readonly roll: (label: string, notation: string) => LocalRoll | undefined;
  /** File the throws of one act rolled elsewhere — an attack, an action off its turn, a save — as one line. */
  readonly file: (throws: ReadonlyArray<DmThrow>) => void;
}

/**
 * The DM's dice over the night's rolls (`rollsAtom`, which `reads.rolls`
 * names and the doorbell re-reads): `saved` is that list, players' rolls and
 * all; only the DM's are this hook's.
 */
export function useDmDice(
  path: { readonly campaignId: CampaignId; readonly sessionId: SessionId },
  saved: ReadonlyArray<Roll>,
): DmDice {
  const { campaignId, sessionId } = path;
  const [pending, setPending] = useState<ReadonlyArray<Pending>>([]);
  const { submit } = useMutation();

  const ours = useMemo(() => saved.filter(isDmRoll), [saved]);
  // A pending roll the list now carries is the server's from here on.
  useEffect(() => {
    const landed = new Set(ours.map((roll) => roll.requestId));
    setPending((current) => {
      const waiting = current.filter(({ payload }) => !landed.has(payload.requestId));
      return waiting.length === current.length ? current : waiting;
    });
  }, [ours]);

  const rolls = useMemo(() => {
    const landed = new Set(ours.map((roll) => roll.requestId));
    return [
      ...ours.map(fromServer),
      ...pending.filter(({ payload }) => !landed.has(payload.requestId)).map(fromPending),
    ].sort((a, b) => b.at - a.at);
  }, [ours, pending]);

  const file = useCallback(
    (throws: ReadonlyArray<DmThrow>) => {
      if (throws.length === 0) return;
      // The throws of one act share a request stem, `<stem>:0`, `<stem>:1`,
      // so the log prints them as one line in any tab (`rollsLog.ts`' `stemOf`).
      const stem = newRequestId();
      const at = Date.now();
      const sent = throws.map((part, index): Pending => ({
        payload: {
          ...part,
          visibility: "dm",
          requestId: throws.length === 1 ? stem : `${stem}:${String(index)}`,
        },
        at,
      }));
      setPending((current) => [...sent, ...current].slice(0, DOCK_KEPT));
      for (const { payload } of sent) {
        void submit(
          (client) => client.rolls.create({ params: { campaignId }, payload }),
          [reads.rolls(sessionId)],
        ).then((result) => {
          if (Result.isSuccess(result)) return;
          setPending((current) =>
            current.filter((entry) => entry.payload.requestId !== payload.requestId),
          );
          toast.add({
            type: "destructive",
            title: `${payload.label} was not saved`,
            description: `It came to ${String(payload.total)} (${payload.notation}), but the server did not keep it, so it is not in the log.`,
          });
        });
      }
    },
    [campaignId, sessionId, submit],
  );

  const roll = useCallback(
    (label: string, notation: string) => {
      const rolled = rollDiceExpression(label, notation);
      if (rolled === undefined) return undefined;
      file([throwOf(rolled)]);
      return rolled;
    },
    [file],
  );

  return { rolls, roll, file };
}
