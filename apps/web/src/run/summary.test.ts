import type { CombatantKind, EncounterRunPhase } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { fightSummary } from "./summary";

/** The end dialog's summary line, over every edge a fight can be ended at. */

interface Row {
  readonly kind: CombatantKind;
  readonly hp: number;
}

const summary = (
  round: number,
  combatants: ReadonlyArray<Row>,
  phase: EncounterRunPhase = "turns",
): string => fightSummary({ run: { round, phase }, combatants }, (row) => row.hp);

const pc = (hp: number): Row => ({ kind: "pc", hp });
const npc = (hp: number): Row => ({ kind: "npc", hp });

describe("the end of a fight's summary line", () => {
  it("counts the enemies down and standing, and leaves the party out", () => {
    expect(summary(4, [pc(0), npc(0), npc(0), npc(3), pc(12), npc(0), npc(9), npc(0)])).toBe(
      "4 of 6 enemies are down after 4 rounds. 2 still standing.",
    );
  });

  it("says one round and one enemy in the singular", () => {
    expect(summary(1, [npc(5)])).toBe("0 of 1 enemy is down after 1 round. 1 still standing.");
  });

  it("says none are standing when every enemy is down", () => {
    expect(summary(2, [npc(0), npc(0)])).toBe(
      "2 of 2 enemies are down after 2 rounds. None still standing.",
    );
  });

  it("says a fight still rolling for round 1 has not started", () => {
    expect(summary(1, [npc(7), npc(7)], "initiative")).toBe(
      "0 of 2 enemies are down before the first round. 2 still standing.",
    );
    // A reroll later on keeps the round, and the rounds played are still played.
    expect(summary(3, [npc(0), npc(7)], "initiative")).toBe(
      "1 of 2 enemies are down after 3 rounds. 1 still standing.",
    );
  });

  it("has no count to give when there are no enemies", () => {
    expect(summary(3, [pc(10), pc(0)])).toBe("No enemies are in this fight. It went 3 rounds.");
    expect(summary(1, [pc(10)], "initiative")).toBe("No enemies are in this fight.");
    expect(summary(1, [])).toBe("No enemies are in this fight. It went 1 round.");
  });
});
