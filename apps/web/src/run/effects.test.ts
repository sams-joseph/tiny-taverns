import type { CombatantId } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { type EffectToken, effectsBetween, strikesOf } from "./effects";

const id = (name: string) => name as CombatantId;

const token = (overrides: Partial<EffectToken> = {}): EffectToken => ({
  id: id("goblin"),
  square: { column: 2, row: 3 },
  health: 1,
  hp: 7,
  ...overrides,
});

describe("effectsBetween", () => {
  it("plays nothing when nothing changed", () => {
    expect(effectsBetween([token()], [token()])).toEqual([]);
  });

  it("plays nothing for a token that came onto the board or left it", () => {
    expect(effectsBetween([], [token()])).toEqual([]);
    expect(effectsBetween([token()], [])).toEqual([]);
  });

  it("plays a hurt with the hit points it lost, where the token stands now", () => {
    expect(effectsBetween([token()], [token({ hp: 2, health: 2 / 7 })])).toEqual([
      { kind: "hurt", id: id("goblin"), at: { column: 2, row: 3 }, amount: 5 },
    ]);
  });

  it("plays a heal with the hit points it gained", () => {
    expect(effectsBetween([token({ hp: 2 })], [token({ hp: 6 })])).toEqual([
      { kind: "heal", id: id("goblin"), at: { column: 2, row: 3 }, amount: 4 },
    ]);
  });

  it("plays a hurt with no number when this reader knows only the bar", () => {
    const before = token({ hp: undefined, health: 1 });
    const after = token({ hp: undefined, health: 0.5 });
    expect(effectsBetween([before], [after])).toEqual([
      { kind: "hurt", id: id("goblin"), at: { column: 2, row: 3 }, amount: undefined },
    ]);
  });

  it("plays nothing when this reader knows neither", () => {
    const hidden = token({ hp: undefined, health: undefined });
    expect(effectsBetween([hidden], [hidden])).toEqual([]);
  });

  it("plays a move from the square it left to the one it stands on", () => {
    const after = token({ square: { column: 5, row: 3 } });
    expect(effectsBetween([token()], [after])).toEqual([
      { kind: "moved", id: id("goblin"), from: { column: 2, row: 3 }, to: { column: 5, row: 3 } },
    ]);
  });

  it("plays a move and a hurt together, the hurt where it landed", () => {
    const after = token({ square: { column: 4, row: 4 }, hp: 1 });
    expect(effectsBetween([token()], [after]).map((effect) => effect.kind)).toEqual([
      "moved",
      "hurt",
    ]);
    expect(effectsBetween([token()], [after])[1]).toMatchObject({ at: { column: 4, row: 4 } });
  });
});

describe("strikesOf", () => {
  const roll = (over: Partial<Parameters<typeof strikesOf>[0][number]> = {}) => ({
    kind: "attack" as const,
    combatantId: id("goblin"),
    targetCombatantId: id("brannoc"),
    delivery: "ranged-weapon" as const,
    damageType: "piercing" as const,
    outcome: "hit" as const,
    requestId: "act1:0",
    at: 2,
    undone: false,
    ...over,
  });

  it("draws an attack that names both and says how it was delivered, oldest first", () => {
    expect(strikesOf([roll(), roll({ requestId: "act0:0", at: 1, outcome: "miss" })])).toEqual([
      {
        key: "act0:0",
        from: id("goblin"),
        to: id("brannoc"),
        delivery: "ranged-weapon",
        damageType: "piercing",
        outcome: "miss",
      },
      {
        key: "act1:0",
        from: id("goblin"),
        to: id("brannoc"),
        delivery: "ranged-weapon",
        damageType: "piercing",
        outcome: "hit",
      },
    ]);
  });

  it("draws nothing it cannot: no delivery, no target, a damage roll, an undone turn", () => {
    expect(
      strikesOf([
        roll({ delivery: null }),
        roll({ targetCombatantId: null }),
        roll({ kind: "damage" }),
        roll({ undone: true }),
      ]),
    ).toEqual([]);
  });
});
