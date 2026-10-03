import { CombatantId } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { ActionLine } from "./actions";
import {
  attacks,
  attackThrows,
  concentrationSave,
  concentrationThrow,
  damageLine,
  hitLine,
  resolveAttack,
  rollActionThrows,
  rolls,
} from "./attack";
import type { DmRoll, DmThrow } from "./dice";
import { dmLines } from "./rollsLog";

/** Faces in order: `rollFace` is `floor(r × faces) + 1`. */
const seeded = (...values: ReadonlyArray<number>) => {
  const queue = [...values];
  return () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("rolled more dice than were seeded");
    return next;
  };
};

const longsword: ActionLine = {
  key: "atk:longsword",
  name: "Longsword",
  toHit: 7,
  damage: [{ dice: "1d8+4", type: "slashing" }],
  save: undefined,
};
const goblinBoss = { name: "Goblin Boss", ac: 17, conditions: [] };
const brannocId = Schema.decodeSync(CombatantId)("2b1f2a1e-0000-4000-8000-000000000d01");
const goblinBossId = Schema.decodeSync(CombatantId)("2b1f2a1e-0000-4000-8000-000000000d02");
const who = { attackerId: brannocId, targetId: goblinBossId };

/** One act's throws as the log prints them, filed under one stem the way `dice.ts` files them. */
const printed = (throws: ReadonlyArray<DmThrow>) =>
  dmLines(
    throws.map((part, index): DmRoll => ({
      ...part,
      critical: part.critical ?? null,
      kind: part.kind ?? "plain",
      targetCombatantId: part.targetCombatantId ?? null,
      targetAc: part.targetAc ?? null,
      outcome: part.outcome ?? null,
      requestId: `act:${String(index)}`,
      at: 0,
    })),
  ).map(({ label, detail, total, tone }) => ({ label, detail, total, tone }));

describe("an attack", () => {
  it("hits when d20 plus the to-hit reaches the AC, and rolls the damage", () => {
    // d20 19, then the d8 a 5.
    const outcome = resolveAttack({
      attacker: "Brannoc",
      line: longsword,
      target: goblinBoss,
      random: seeded(0.9, 0.5),
    });
    expect(outcome.verdict).toBe("hit");
    expect(outcome.title).toBe("Longsword → Goblin Boss");
    expect(hitLine(outcome)).toBe("d20 19 +7 = 26 vs AC 17");
    expect(damageLine(outcome.damage)).toBe("1d8+4 [5] = 9 slashing");
    expect(outcome.amount).toBe(9);
    expect(outcome.concentrating).toBe(false);
    expect(concentrationSave(outcome, outcome.amount, 21)).toBeUndefined();
    // Filed as the DM's: the to-hit with who, at whom, the AC and the
    // outcome, then the damage, at the same two.
    const throws = attackThrows(outcome, who);
    expect(throws).toEqual([
      {
        label: "Brannoc · Longsword → Goblin Boss",
        notation: "1d20+7",
        dice: [19],
        kept: [19],
        modifier: 7,
        total: 26,
        mode: "normal",
        critical: null,
        kind: "attack",
        combatantId: brannocId,
        targetCombatantId: goblinBossId,
        targetAc: 17,
        outcome: "hit",
      },
      {
        label: "Brannoc · Longsword → Goblin Boss",
        notation: "1d8+4",
        dice: [5],
        kept: [5],
        modifier: 4,
        total: 9,
        mode: "normal",
        critical: null,
        kind: "damage",
        combatantId: brannocId,
        targetCombatantId: goblinBossId,
      },
    ]);
    expect(printed(throws)).toEqual([
      {
        label: "Brannoc · Longsword → Goblin Boss",
        detail: "d20 19 +7 = 26 vs AC 17 · 1d8+4 = 9",
        total: "Hit",
        tone: "accent",
      },
    ]);
  });

  it("misses under the AC and rolls no damage", () => {
    // d20 9: 16 against 17.
    const outcome = resolveAttack({
      attacker: "Brannoc",
      line: longsword,
      target: goblinBoss,
      random: seeded(0.4),
    });
    expect(outcome.verdict).toBe("miss");
    expect(outcome.damage).toEqual([]);
    expect(outcome.amount).toBe(0);
    const throws = attackThrows(outcome, who);
    expect(throws.map((part) => [part.kind, part.outcome])).toEqual([["attack", "miss"]]);
    expect(printed(throws)).toMatchObject([{ total: "Miss", tone: "muted" }]);
  });

  it("crits on a natural 20 whatever the AC, with the damage dice doubled", () => {
    const outcome = resolveAttack({
      attacker: "Brannoc",
      line: longsword,
      target: { ...goblinBoss, ac: 30 },
      random: seeded(0.99, 0.5, 0.25),
    });
    expect(outcome.verdict).toBe("critical");
    expect(damageLine(outcome.damage)).toBe("2d8+4 [5, 3] = 12 slashing");
    const throws = attackThrows(outcome, who);
    expect(throws[0]).toMatchObject({ outcome: "crit", critical: "hit", targetAc: 30 });
    expect(throws[1]).toMatchObject({ notation: "2d8+4", dice: [5, 3], total: 12 });
    expect(printed(throws)).toMatchObject([{ total: "Crit", tone: "success" }]);
  });

  it("misses on a natural 1 whatever it totals", () => {
    const outcome = resolveAttack({
      attacker: "Brannoc",
      line: { ...longsword, toHit: 30 },
      target: goblinBoss,
      random: seeded(0),
    });
    expect(outcome.verdict).toBe("natural-1");
    expect(outcome.total).toBe(31);
    expect(outcome.amount).toBe(0);
    const throws = attackThrows(outcome, who);
    expect(throws).toHaveLength(1);
    expect(throws[0]).toMatchObject({ outcome: "fumble", critical: "miss" });
    expect(printed(throws)).toMatchObject([{ total: "Miss", tone: "danger" }]);
  });

  it("names the save a concentrating target owes for the whole hit", () => {
    // 4d6: 6 + 6 + 6 + 6 = 24, so DC 12.
    const outcome = resolveAttack({
      attacker: "Wren",
      line: { ...longsword, damage: [{ dice: "4d6", type: "fire" }] },
      target: { name: "Marsh Hag", ac: 10, conditions: ["Concentrating"] },
      random: seeded(0.9, 0.99, 0.99, 0.99, 0.99),
    });
    expect(outcome.amount).toBe(24);
    expect(concentrationSave(outcome, outcome.amount, 40)).toBe(12);
    // Half of it, 12, is DC 10; a hit that drops it to 0 owes no save.
    expect(concentrationSave(outcome, 12, 40)).toBe(10);
    expect(concentrationSave(outcome, outcome.amount, 24)).toBeUndefined();
  });

  it("leaves a target with no AC to the DM's judgement, damage rolled", () => {
    const outcome = resolveAttack({
      attacker: "Brannoc",
      line: longsword,
      target: { name: "Guard", ac: null, conditions: [] },
      random: seeded(0.5, 0.5),
    });
    expect(outcome.verdict).toBe("no-ac");
    expect(hitLine(outcome)).toBe("d20 11 +7 = 18 vs no AC");
    expect(outcome.amount).toBe(9);
    // No AC and no outcome to file; the log says the total.
    const throws = attackThrows(outcome, who);
    expect(throws[0]).not.toHaveProperty("targetAc");
    expect(throws[0]).not.toHaveProperty("outcome");
    expect(printed(throws)).toEqual([
      {
        label: "Brannoc · Longsword → Guard",
        detail: "d20 11 +7 = 18 vs no AC · 1d8+4 = 9",
        total: "18",
        tone: "accent",
      },
    ]);
  });

  it("rolls each damage of a line, and floors each at zero", () => {
    const outcome = resolveAttack({
      attacker: "Brannoc",
      line: {
        ...longsword,
        damage: [
          { dice: "1d4-5", type: undefined },
          { dice: "1d6", type: "fire" },
          { dice: "a lot", type: "psychic" },
        ],
      },
      target: goblinBoss,
      random: seeded(0.9, 0, 0.5),
    });
    expect(damageLine(outcome.damage)).toBe("1d4-5 [1] = 0 · 1d6 [4] = 4 fire");
    expect(outcome.amount).toBe(4);
  });
});

describe("a line rolled off its turn", () => {
  it("files the to-hit and the damage as one act, with no target", () => {
    const throws = rollActionThrows({
      attacker: "Goblin Boss",
      attackerId: goblinBossId,
      line: {
        ...longsword,
        name: "Javelin",
        toHit: 6,
        damage: [{ dice: "2d8+4", type: "piercing" }],
      },
      random: seeded(0.5, 0.5, 0.5),
    });
    expect(throws.map((part) => [part.kind, part.combatantId, part.targetCombatantId])).toEqual([
      ["attack", goblinBossId, undefined],
      ["damage", goblinBossId, undefined],
    ]);
    expect(printed(throws)).toEqual([
      {
        label: "Goblin Boss · Javelin",
        detail: "d20 11 +6 = 17 · 2d8+4 = 14",
        total: "17",
        tone: "accent",
      },
    ]);
  });

  it("totals the damage when the line has no to-hit", () => {
    const throws = rollActionThrows({
      attacker: "Goblin Boss",
      attackerId: goblinBossId,
      line: {
        ...longsword,
        name: "Scimitar",
        toHit: undefined,
        damage: [{ dice: "1d6+2", type: undefined }],
      },
      random: seeded(0.5),
    });
    expect(throws.map((part) => part.kind)).toEqual(["damage"]);
    expect(printed(throws)).toMatchObject([{ detail: "1d6+2 = 6", total: "6" }]);
  });
});

describe("a concentration save", () => {
  it("rolls d20 plus the save, names the DC, and files it as the target's", () => {
    const save = concentrationThrow({
      target: "Goblin Boss",
      targetId: goblinBossId,
      dc: 10,
      modifier: 1,
      random: seeded(0.6),
    });
    expect(save).toMatchObject({
      label: "Goblin Boss · Concentration save, DC 10",
      notation: "1d20+1",
      dice: [13],
      total: 14,
      kind: "concentration",
      combatantId: goblinBossId,
    });
    expect(printed(save === undefined ? [] : [save])).toEqual([
      {
        label: "Goblin Boss · Concentration save, DC 10",
        detail: "1d20+1 [13]",
        total: "14",
        tone: "magic",
      },
    ]);
  });
});

describe("which lines offer which button", () => {
  it("attacks with a to-hit, rolls anything with dice, and offers nothing for a save alone", () => {
    expect(attacks(longsword)).toBe(true);
    const scimitar = { ...longsword, toHit: undefined };
    expect([attacks(scimitar), rolls(scimitar)]).toEqual([false, true]);
    const breath = { ...longsword, toHit: undefined, damage: [], save: "DC 13 Dexterity" };
    expect([attacks(breath), rolls(breath)]).toEqual([false, false]);
  });
});
