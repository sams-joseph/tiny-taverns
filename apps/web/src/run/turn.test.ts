import { Combatant } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { brannoc, goblinBoss } from "../campaign/campaign.fixtures";
import { attackSpends, feetLeft, isUp } from "./turn";

const decode = Schema.decodeUnknownSync(Combatant);
const up = { phase: "turns", activeCombatantId: decode(brannoc).id } as const;

describe("whose turn it is", () => {
  it("is the marker's creature, only while the fight takes turns", () => {
    expect(isUp(decode(brannoc), up)).toBe(true);
    expect(isUp(decode(goblinBoss), up)).toBe(false);
    expect(isUp(decode(brannoc), { ...up, phase: "initiative" })).toBe(false);
  });
});

describe("the feet left", () => {
  it("is the speed less the feet counted this turn, for whoever is up", () => {
    expect(feetLeft(decode({ ...brannoc, feetMoved: 15 }), 25, up)).toBe(10);
  });

  it("goes below zero past the speed, which a ruler reads as over", () => {
    expect(feetLeft(decode({ ...brannoc, feetMoved: 35 }), 25, up)).toBe(-10);
  });

  it("is the whole speed for anyone not up, whose count is their last turn's", () => {
    expect(feetLeft(decode({ ...goblinBoss, feetMoved: 30 }), 30, up)).toBe(30);
    expect(
      feetLeft(decode({ ...brannoc, feetMoved: 15 }), 25, { ...up, phase: "initiative" }),
    ).toBe(25);
  });

  it("is nothing when the speed is not a number", () => {
    expect(feetLeft(decode({ ...brannoc, feetMoved: 15 }), undefined, up)).toBeUndefined();
  });
});

describe("what an attack spends", () => {
  it("marks the action of whoever is up", () => {
    expect(attackSpends(decode(brannoc), up)).toEqual({ actionUsed: true });
  });

  it("writes nothing when the action is already used, or for anyone not up", () => {
    expect(attackSpends(decode({ ...brannoc, actionUsed: true }), up)).toBeUndefined();
    expect(attackSpends(decode(goblinBoss), up)).toBeUndefined();
  });
});
