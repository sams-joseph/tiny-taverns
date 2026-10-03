import type { Combatant, CombatantTurn, EncounterRun } from "@taverns/api";
import { toast } from "@taverns/ui";
import { Result } from "effect";
import { useCallback } from "react";
import { useMutation } from "../api/mutation";
import type { RunPath } from "./load";
import { newRequestId, type RunController } from "./state";

/**
 * A turn's spending, the runner's *This turn* block (`Encounter Runner.dc.html`):
 * the action, the bonus action and the reaction, and the feet walked. The
 * server holds all four on the fight's row (`Combatant.actionUsed`), counts the
 * feet itself when the creature that is up moves, and clears the row of
 * whoever the marker lands on; the DM's ticks are `CombatantTurn`.
 */

/** The DM's ticks: each an absolute value, as `CombatantTurn` takes them. */
export type TurnTicks = Omit<CombatantTurn, "requestId">;

/** Whether it is this creature's turn: the fight is taking turns and the marker is on it. */
export const isUp = (
  combatant: Combatant,
  run: Pick<EncounterRun, "phase" | "activeCombatantId">,
): boolean => run.phase === "turns" && run.activeCombatantId === combatant.id;

/**
 * How far a creature can still walk: its speed less the feet the server has
 * counted this turn while it is up, and its whole speed otherwise, because a
 * creature that is not up starts its next turn fresh and the count it holds is
 * its last turn's. Below zero once it has gone past its speed, which a ruler
 * reads as how far over. `undefined` when its speed is not a number.
 */
export const feetLeft = (
  combatant: Combatant,
  speed: number | undefined,
  run: Pick<EncounterRun, "phase" | "activeCombatantId">,
): number | undefined =>
  speed === undefined ? undefined : isUp(combatant, run) ? speed - combatant.feetMoved : speed;

/**
 * What an attack spends: the action of the creature whose turn it is, unless
 * it is already ticked. Nothing for anyone else, since an attack off its own
 * turn is a reaction, and which one is the DM's call.
 */
export const attackSpends = (
  attacker: Combatant,
  run: Pick<EncounterRun, "phase" | "activeCombatantId">,
): TurnTicks | undefined =>
  isUp(attacker, run) && !attacker.actionUsed ? { actionUsed: true } : undefined;

/**
 * The turn write, and the one function the attack flow calls.
 *
 * Not optimistic, like the condition chips: the toggles wait for the answer and
 * take the row it carries. Nothing outside the fight reads a turn's spending,
 * so it names no reads.
 */
export function useTurnTicks(path: RunPath, controller: RunController) {
  const mutation = useMutation();
  const { submit } = mutation;
  const { applyCombatant } = controller;
  const run = controller.state?.run;

  const tick = useCallback(
    async (combatant: Combatant, ticks: TurnTicks) => {
      const written = await submit(
        (client) =>
          client.combatants.turn({
            params: { ...path, combatantId: combatant.id },
            payload: { ...ticks, requestId: newRequestId() },
          }),
        [],
      );
      if (Result.isSuccess(written)) {
        applyCombatant(written.success);
        return;
      }
      toast.add({
        type: "destructive",
        title: `${combatant.displayName}'s turn is unchanged`,
        description: "That did not reach the server. The toggles show what it holds.",
      });
    },
    [submit, path, applyCombatant],
  );

  /** Call once an attack by `attacker` resolves: it marks the Action of whoever is up. */
  const spendAction = useCallback(
    (attacker: Combatant) => {
      const ticks = run === undefined ? undefined : attackSpends(attacker, run);
      if (ticks !== undefined) void tick(attacker, ticks);
    },
    [run, tick],
  );

  return { busy: mutation.busy, tick, spendAction };
}
