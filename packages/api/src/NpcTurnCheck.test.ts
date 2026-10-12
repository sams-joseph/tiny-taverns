import { describe, expect, it } from "vitest";
import type { CombatantId } from "./Ids.js";
import { npcTurnCheck, type NpcTurnCheck } from "./NpcTurnCheck.js";
import { fightOf } from "./testing/npcFight.js";

const goblinFight = () =>
  fightOf([
    { name: "Goblin", creature: "Goblin", at: [5, 5] },
    { name: "Ilse", at: [6, 5] },
    { name: "Tamsin", at: [11, 5] },
  ]);

const dragonFight = (over: { up?: string; spent?: ReadonlyArray<string> } = {}) =>
  fightOf(
    [
      {
        name: "Dragon",
        creature: "Adult Red Dragon",
        at: [5, 5],
        over: { rechargeSpent: [...(over.spent ?? [])] },
      },
      { name: "Ilse", at: [6, 5] },
      { name: "Tamsin", at: [8, 5] },
    ],
    over.up === undefined ? {} : { up: over.up },
  );

const refusal = (check: NpcTurnCheck) => {
  if (check.ok) throw new Error("expected a refusal");
  return check;
};
const named = (id: CombatantId) => `#${id.slice(-2)}`;

describe("npcTurnCheck", () => {
  it("checks each step on the fight the steps before it leave", () => {
    const { fight, byName } = goblinFight();
    const goblin = byName("Goblin").id;
    const tamsin = byName("Tamsin").id;
    // Out of reach where it stands…
    expect(
      refusal(
        npcTurnCheck(
          fight,
          goblin,
          "turn",
          [{ option: "actions/Scimitar", targets: [tamsin] }],
          named,
        ),
      ).reason,
    ).toMatch(/out of Scimitar's reach/);
    // …and in reach once it has walked there.
    const check = npcTurnCheck(
      fight,
      goblin,
      "turn",
      [
        { option: "move", square: { column: 10, row: 5 } },
        { option: "actions/Scimitar", targets: [tamsin] },
      ],
      named,
    );
    expect(check).toEqual({
      ok: true,
      steps: [
        { kind: "move", to: { column: 10, row: 5 }, feet: 25 },
        {
          kind: "option",
          optionId: "actions/Scimitar",
          name: "Scimitar",
          slot: "action",
          targets: [tamsin],
        },
      ],
    });
  });

  it("refuses a second action, a move past its speed, and grants a Dash's", () => {
    const { fight, byName } = goblinFight();
    const goblin = byName("Goblin").id;
    const ilse = byName("Ilse").id;
    const twice = refusal(
      npcTurnCheck(
        fight,
        goblin,
        "turn",
        [
          { option: "actions/Scimitar", targets: [ilse] },
          { option: "actions/Shortbow", targets: [ilse] },
        ],
        named,
      ),
    );
    expect(twice.step).toBe(1);
    expect(twice.reason).toMatch(/needs an action, already spent/);

    const far = { column: 15, row: 5 };
    expect(
      refusal(npcTurnCheck(fight, goblin, "turn", [{ option: "move", square: far }], named)).reason,
    ).toMatch(/not a square it can move to with 30 ft left/);
    expect(
      npcTurnCheck(
        fight,
        goblin,
        "turn",
        [{ option: "standard/Dash" }, { option: "move", square: far }],
        named,
      ).ok,
    ).toBe(true);
  });

  it("names the options offered when it is handed one that does not exist", () => {
    const { fight, byName } = goblinFight();
    const check = refusal(
      npcTurnCheck(fight, byName("Goblin").id, "turn", [{ option: "actions/Fireball" }], named),
    );
    expect(check.reason).toMatch(/there is no option "actions\/Fireball"/);
    expect(check.reason).toMatch(/actions\/Scimitar/);
  });

  it("refuses a recharge that is not ready", () => {
    const { fight, byName } = dragonFight({ spent: ["actions/Fire Breath"] });
    expect(
      refusal(
        npcTurnCheck(
          fight,
          byName("Dragon").id,
          "turn",
          [{ option: "actions/Fire Breath", square: { column: 6, row: 5 } }],
          named,
        ),
      ).reason,
    ).toMatch(/not available now: recharging/);
  });

  it("places an area at one of its placements and takes whoever it catches", () => {
    const { fight, byName } = dragonFight();
    const check = npcTurnCheck(
      fight,
      byName("Dragon").id,
      "turn",
      [{ option: "actions/Fire Breath", square: { column: 6, row: 5 } }],
      named,
    );
    if (!check.ok) throw new Error(check.reason);
    const [step] = check.steps;
    expect(step).toMatchObject({ kind: "option", optionId: "actions/Fire Breath" });
    expect(step?.kind === "option" ? [...step.targets].sort() : []).toEqual(
      [byName("Ilse").id, byName("Tamsin").id].sort(),
    );
    expect(
      refusal(
        npcTurnCheck(
          fight,
          byName("Dragon").id,
          "turn",
          [{ option: "actions/Fire Breath", targets: [byName("Ilse").id] }],
          named,
        ),
      ).reason,
    ).toMatch(/is an area/);
  });

  it("takes a multiattack's strikes at one target or one each", () => {
    const { fight, byName } = dragonFight();
    const dragon = byName("Dragon").id;
    const ilse = byName("Ilse").id;
    const one = npcTurnCheck(
      fight,
      dragon,
      "turn",
      [{ option: "actions/Multiattack", targets: [ilse] }],
      named,
    );
    if (!one.ok) throw new Error(one.reason);
    const strikes = one.steps[0]?.kind === "option" ? one.steps[0].strikes : undefined;
    expect(strikes?.every((strike) => strike.target === ilse)).toBe(true);
    expect(
      refusal(
        npcTurnCheck(
          fight,
          dragon,
          "turn",
          [{ option: "actions/Multiattack", targets: [ilse, ilse] }],
          named,
        ),
      ).reason,
    ).toMatch(/give one target for them all/);
  });

  it("holds each step to its moment", () => {
    const up = dragonFight();
    const dragon = up.byName("Dragon").id;
    const ilse = up.byName("Ilse").id;
    expect(
      refusal(
        npcTurnCheck(up.fight, dragon, "legendary", [{ option: "legendaryActions/Detect" }], named),
      ),
    ).toMatchObject({ step: undefined });
    expect(
      refusal(
        npcTurnCheck(
          up.fight,
          dragon,
          "turn",
          [{ option: "opportunity/actions/Bite", targets: [ilse] }],
          named,
        ),
      ).reason,
    ).toMatch(/is a reaction, which is not taken as its own turn/);

    const off = dragonFight({ up: "Ilse" });
    const offDragon = off.byName("Dragon").id;
    expect(
      refusal(npcTurnCheck(off.fight, offDragon, "turn", [{ option: "standard/Dodge" }], named))
        .reason,
    ).toBe("it is not its turn");
    expect(
      npcTurnCheck(
        off.fight,
        offDragon,
        "legendary",
        [{ option: "legendaryActions/Tail Attack>Tail", targets: [off.byName("Tamsin").id] }],
        named,
      ).ok,
    ).toBe(true);
    const two = refusal(
      npcTurnCheck(
        off.fight,
        offDragon,
        "legendary",
        [{ option: "legendaryActions/Detect" }, { option: "legendaryActions/Detect" }],
        named,
      ),
    );
    expect(two).toMatchObject({ step: 1 });
    expect(
      refusal(
        npcTurnCheck(
          off.fight,
          offDragon,
          "reaction",
          [{ option: "move", square: { column: 4, row: 5 } }],
          named,
        ),
      ).reason,
    ).toMatch(/cannot move as a reaction/);
  });
});
