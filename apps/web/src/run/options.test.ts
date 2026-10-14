import type { Combatant, CombatantId, CreatureId, StatBlock } from "@taverns/api";
import { describe, expect, it } from "vitest";
import fixture from "../../../../packages/api/src/fixtures/srd-turn.json";
import {
  multiattacksOf,
  optionIdOf,
  outOfRangeFor,
  rangeOptionsFor,
  runOptionsFor,
} from "./options";

/** The real SRD dragon, as the import writes it (`packages/api/src/fixtures/srd-turn.json`). */
const dragon = (fixture as unknown as { readonly statBlocks: Record<string, StatBlock> })
  .statBlocks["Adult Red Dragon"]!;

const creatureId = "00000000-0000-4000-8000-0000000000cc" as CreatureId;
const row = (id: string, over: Partial<Combatant>): Combatant =>
  ({
    id: id as CombatantId,
    creatureId: null,
    npcId: null,
    displayName: id,
    kind: "pc",
    side: "party",
    hpCurrent: 20,
    conditions: [],
    position: null,
    actionUsed: false,
    bonusUsed: false,
    reactionUsed: false,
    feetMoved: 0,
    legendarySpent: 0,
    rechargeSpent: [],
    usesSpent: {},
    slotsSpent: {},
    ...over,
  }) as unknown as Combatant;

const wyrm = row("wyrm", {
  kind: "npc",
  side: "foes",
  creatureId,
  position: { column: 5, row: 5 },
});
const near = row("near", { position: { column: 7, row: 5 } });
const far = row("far", { position: { column: 15, row: 5 } });
const source = (combatants: ReadonlyArray<Combatant>) => ({
  run: { phase: "turns" as const, activeCombatantId: wyrm.id, endedAt: null },
  combatants,
  board: { columns: 20, rows: 20, feetPerCell: 5 },
  diagonals: "five" as const,
  statBlocks: new Map([[creatureId, dragon]]),
});

describe("the runner's turn options", () => {
  it("runs a multiattack's attack rolls in order, and names the strike that rolls none", () => {
    const [run] = multiattacksOf(runOptionsFor(source([wyrm, near]), wyrm));
    expect(run?.summary).toBe("Frightful Presence, then Bite, then Claw ×2");
    expect(run?.strikes.map((line) => [line.key, line.toHit])).toEqual([
      ["action:Bite", 14],
      ["action:Claw", 14],
      ["action:Claw", 14],
    ]);
  });

  it("marks who a line's reach leaves out, by the line's own key", () => {
    const options = rangeOptionsFor(source([wyrm, near, far]), wyrm);
    // 10 feet: in the bite's 10-foot reach, out of the claw's 5.
    expect([...outOfRangeFor(options, { key: "action:Bite" })]).toEqual([far.id]);
    expect([...outOfRangeFor(options, { key: "action:Claw" })].sort()).toEqual(
      [far.id, near.id].sort(),
    );
  });

  it("measures range with the action spent, so a multiattack's later strikes are still marked", () => {
    const spent = { ...wyrm, actionUsed: true } as Combatant;
    expect(
      runOptionsFor(source([spent, near]), spent)?.options.some((o) => o.id === "actions/Bite"),
    ).toBe(false);
    expect([
      ...outOfRangeFor(rangeOptionsFor(source([spent, near]), spent), { key: "action:Claw" }),
    ]).toEqual([near.id]);
  });

  it("offers a party member no options: its turn is its player's", () => {
    expect(runOptionsFor(source([wyrm, near]), near)).toBeUndefined();
  });

  it("names the option a line of the panel is", () => {
    expect(optionIdOf({ key: "action:Fire Breath" })).toBe("actions/Fire Breath");
    expect(optionIdOf({ key: "trait:Scimitar" })).toBe("traits/Scimitar");
    expect(optionIdOf({ key: "atk:longsword" })).toBeUndefined();
  });
});
