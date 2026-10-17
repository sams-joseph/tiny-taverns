import type { CombatantId } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { type EffectToken, actsOf, blastsOf, effectsBetween, strikesOf } from "./effects";

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
  const roll = (over: Partial<Parameters<typeof actsOf>[0][number]> = {}) => ({
    kind: "attack" as const,
    area: null,
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
        kind: "strike",
        key: "act0:0",
        from: id("goblin"),
        to: id("brannoc"),
        delivery: "ranged-weapon",
        damageType: "piercing",
        outcome: "miss",
      },
      {
        kind: "strike",
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

describe("blastsOf", () => {
  const cone = {
    shape: "cone",
    feet: 15,
    origin: { column: 2, row: 2 },
    toward: { column: 4, row: 2 },
  } as const;
  const roll = (over: Partial<Parameters<typeof actsOf>[0][number]> = {}) => ({
    kind: "damage" as const,
    combatantId: id("dragon"),
    targetCombatantId: null,
    delivery: null,
    damageType: "fire" as const,
    outcome: null,
    area: cone,
    requestId: "breath:0",
    at: 1,
    undone: false,
    ...over,
  });

  it("draws a damage roll that kept where its area went, from the creature that loosed it", () => {
    expect(blastsOf([roll(), roll({ requestId: "breath:1", area: null })])).toEqual([
      { kind: "blast", key: "breath:0", from: id("dragon"), area: cone, damageType: "fire" },
    ]);
  });

  it("draws an area whose creature the reader may not know, from nowhere", () => {
    expect(blastsOf([roll({ combatantId: null })])[0]?.from).toBeNull();
  });

  it("draws nothing for an undone turn's", () => {
    expect(blastsOf([roll({ undone: true })])).toEqual([]);
  });

  it("puts attacks and areas in the order they happened", () => {
    const acts = actsOf([
      roll({ at: 3 }),
      {
        ...roll({ at: 2, requestId: "swing:0", area: null }),
        kind: "attack",
        targetCombatantId: id("brannoc"),
        delivery: "melee-weapon",
      },
    ]);
    expect(acts.map((act) => act.kind)).toEqual(["strike", "blast"]);
  });
});
