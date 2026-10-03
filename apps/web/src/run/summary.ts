import type { Combatant, EncounterRun } from "@taverns/api";

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

/**
 * *"4 of 6 enemies are down after 3 rounds. 2 still standing."* — the design's
 * end-of-fight line, counted from the run rather than kept anywhere.
 *
 * An enemy is an NPC row, which is what the runner badges *Hostile*: there is
 * no disposition column, and the combatant form calls the kind "Hostile or
 * neutral". Down is zero hit points, the runner's own struck-through state; a
 * downed combatant stays in the order, so it is counted rather than missing.
 * The round is the run's, the one the header shows. A fight still rolling
 * initiative in round 1 has had no turns, so it says so rather than "after 1
 * round".
 */
export const fightSummary = <Row extends Pick<Combatant, "kind">>(
  fight: {
    readonly run: Pick<EncounterRun, "round" | "phase">;
    readonly combatants: ReadonlyArray<Row>;
  },
  hpOf: (combatant: Row) => number,
): string => {
  const { round, phase } = fight.run;
  const rounds = plural(round, "round", "rounds");
  const unplayed = phase === "initiative" && round === 1;
  const enemies = fight.combatants.filter((row) => row.kind === "npc");
  if (enemies.length === 0) {
    return unplayed
      ? "No enemies are in this fight."
      : `No enemies are in this fight. It went ${rounds}.`;
  }
  const down = enemies.filter((row) => hpOf(row) === 0).length;
  const standing = enemies.length - down;
  return `${String(down)} of ${plural(enemies.length, "enemy is", "enemies are")} down ${
    unplayed ? "before the first round" : `after ${rounds}`
  }. ${standing === 0 ? "None" : String(standing)} still standing.`;
};
