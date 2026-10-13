import type { CreatureFeature, StatBlock } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { transformedMonster } from "../src/bestiary/import.js";
import { MONSTER_RAW } from "../src/bestiary/systemMonsters.js";
import { savesFromProse } from "../src/migrations/0096_save_success_from_prose.js";

/**
 * A save-for-damage's `successType`, which a kept Hob turn halves by: the
 * import (and `0096`, over copies) takes the prose's "half as much damage"
 * over a source row that says `none`, and leaves every other word alone.
 */
const block = (name: string): StatBlock => {
  const row = (MONSTER_RAW as ReadonlyArray<Record<string, unknown>>).find(
    (monster) => monster.name === name,
  );
  if (row === undefined) throw new Error(`no SRD ${name}`);
  return transformedMonster(row).statBlock as StatBlock;
};
const action = (name: string, feature: string): CreatureFeature =>
  block(name).actions!.find((entry) => entry.name === feature)!;

describe("a save's success word", () => {
  it("is half where the source says none and the prose says half", () => {
    expect(action("Adult Red Dragon", "Fire Breath").dc?.successType).toBe("half");
    expect(action("Winter Wolf", "Cold Breath").dc?.successType).toBe("half");
  });

  it("stays none where the prose says nothing of half", () => {
    expect(action("Adult Red Dragon", "Frightful Presence").dc?.successType).toBe("none");
  });

  it("reads a dragon's breaths each against its own clause", () => {
    const breaths = action("Adult Brass Dragon", "Breath Weapons").choices!;
    expect(breaths.map((choice) => [choice.name, choice.dc?.successType])).toEqual([
      ["Fire Breath", "half"],
      ["Sleep Breath", "none"],
    ]);
  });

  it("is corrected the same way on a copy the import never reaches", () => {
    const dragon = block("Adult Red Dragon");
    // The copy as it was written before the correction.
    const before = {
      ...dragon,
      actions: dragon.actions!.map((feature) =>
        feature.name === "Fire Breath"
          ? { ...feature, dc: { ...feature.dc!, successType: "none" } }
          : feature,
      ),
    };
    expect(savesFromProse(before)).toEqual(dragon);
    expect(savesFromProse(dragon)).toEqual(dragon);
  });
});
