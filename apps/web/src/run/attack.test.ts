import { describe, expect, it } from "vitest";
import type { ActionLine } from "./actions";
import {
  attackLine,
  attacks,
  concentrationSave,
  damageLine,
  hitLine,
  resolveAttack,
  rollActionLine,
  rolls,
} from "./attack";

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
    expect(attackLine(outcome)).toEqual({
      label: "Brannoc · Longsword → Goblin Boss",
      detail: "d20 19 +7 = 26 vs AC 17",
      total: "Hit",
      tone: "accent",
    });
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
    expect(attackLine(outcome).total).toBe("Miss");
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
    expect(attackLine(outcome)).toMatchObject({ total: "Crit", tone: "success" });
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
    expect(attackLine(outcome)).toMatchObject({ total: "Miss", tone: "danger" });
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
  it("logs the to-hit and the damage together, with no target", () => {
    expect(
      rollActionLine({
        attacker: "Goblin Boss",
        line: {
          ...longsword,
          name: "Javelin",
          toHit: 6,
          damage: [{ dice: "2d8+4", type: "piercing" }],
        },
        random: seeded(0.5, 0.5, 0.5),
      }),
    ).toEqual({
      label: "Goblin Boss · Javelin",
      detail: "d20 11 +6 = 17 · 2d8+4 = 14",
      total: "17",
      tone: "accent",
    });
  });

  it("totals the damage when the line has no to-hit", () => {
    expect(
      rollActionLine({
        attacker: "Goblin Boss",
        line: {
          ...longsword,
          name: "Scimitar",
          toHit: undefined,
          damage: [{ dice: "1d6+2", type: undefined }],
        },
        random: seeded(0.5),
      }),
    ).toMatchObject({ detail: "1d6+2 = 6", total: "6" });
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
