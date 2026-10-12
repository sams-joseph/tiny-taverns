import type { CreatureFeature, StatBlock } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { geometryOf } from "../src/bestiary/geometry.js";
import { transformedMonster } from "../src/bestiary/import.js";
import { MONSTER_RAW } from "../src/bestiary/systemMonsters.js";
import { upgradedStatBlock } from "../src/migrations/0092_action_geometry.js";

/**
 * The SRD's reach, range and area as the import writes them, read off the real
 * 2014 source rather than invented stat blocks: every monster goes through the
 * import's own transform, and what is found and what is not is pinned here.
 */
const monsters = (MONSTER_RAW as ReadonlyArray<Record<string, unknown>>).map((row) => {
  const { name, statBlock } = transformedMonster(row);
  if (statBlock === undefined) throw new Error(`the import wrote ${name} no stat block`);
  return { name, statBlock };
});

const block = (name: string): StatBlock => {
  const found = monsters.find((monster) => monster.name === name);
  if (found === undefined) throw new Error(`no SRD monster named ${name}`);
  return found.statBlock;
};

const feature = (
  name: string,
  section: "actions" | "reactions" | "legendaryActions" | "specialAbilities",
  featureName: string,
): CreatureFeature => {
  const found = block(name)[section]?.find((entry) => entry.name === featureName);
  if (found === undefined) throw new Error(`${name} has no ${section} ${featureName}`);
  return found;
};

const sections = ["actions", "reactions", "legendaryActions"] as const;

describe("the SRD's reach and range", () => {
  it("reads a melee attack's reach and a ranged attack's two ranges", () => {
    expect(feature("Goblin", "actions", "Scimitar").reach).toBe(5);
    expect(feature("Goblin", "actions", "Shortbow").range).toEqual({ normal: 80, long: 320 });
    expect(feature("Adult Red Dragon", "actions", "Tail").reach).toBe(15);
  });

  it("reads both for a weapon that is melee or thrown", () => {
    const dagger = feature("Bandit Captain", "actions", "Dagger");
    expect(dagger.reach).toBe(5);
    expect(dagger.range).toEqual({ normal: 20, long: 60 });
  });

  it("keeps a swarm's reach of zero, the creature in its own space", () => {
    expect(feature("Swarm of Rats", "actions", "Bites").reach).toBe(0);
  });

  it("reads a single target chosen within a distance as a range", () => {
    expect(feature("Aboleth", "actions", "Enslave").range).toEqual({ normal: 30 });
    expect(feature("Lich", "legendaryActions", "Frightening Gaze (Costs 2 Actions)").range).toEqual(
      { normal: 10 },
    );
    expect(feature("Quasit", "actions", "Scare").range).toEqual({ normal: 20 });
  });

  it("gives every attack that rolls to hit a reach or a range", () => {
    const missing = monsters.flatMap((monster) =>
      sections.flatMap((section) =>
        (monster.statBlock[section] ?? [])
          .filter((entry) => (entry.attackBonus ?? 0) !== 0 && entry.performs === undefined)
          .filter((entry) => entry.reach === undefined && entry.range === undefined)
          .map((entry) => `${monster.name}: ${entry.name}`),
      ),
    );
    expect(missing).toEqual([]);
  });
});

describe("the SRD's areas", () => {
  it("reads a breath weapon's cone and a line's width", () => {
    expect(feature("Adult Red Dragon", "actions", "Fire Breath").area).toEqual({
      shape: "cone",
      feet: 60,
      origin: "self",
    });
    expect(feature("Ancient Blue Dragon", "actions", "Lightning Breath").area).toEqual({
      shape: "line",
      feet: 120,
      width: 10,
      origin: "self",
    });
    expect(feature("Behir", "actions", "Lightning Breath").area).toEqual({
      shape: "line",
      feet: 20,
      origin: "self",
    });
  });

  it("reads a burst about the creature, and one about a point it picks within range", () => {
    expect(
      feature("Adult Red Dragon", "legendaryActions", "Wing Attack (Costs 2 Actions)").area,
    ).toEqual({ shape: "sphere", feet: 10, origin: "self" });
    const strike = feature("Storm Giant", "actions", "Lightning Strike");
    expect(strike.area).toEqual({ shape: "sphere", feet: 10, origin: "point" });
    expect(strike.range).toEqual({ normal: 500 });
  });

  it("gives each of a metallic dragon's breaths its own area, and the action none", () => {
    const breaths = feature("Adult Brass Dragon", "actions", "Breath Weapons");
    expect(breaths.area).toBeUndefined();
    expect(breaths.choices?.map(({ name, area, dc }) => ({ name, area, dc: dc?.dcValue }))).toEqual(
      [
        { name: "Fire Breath", area: { shape: "line", feet: 60, origin: "self" }, dc: 18 },
        { name: "Sleep Breath", area: { shape: "cone", feet: 60, origin: "self" }, dc: 18 },
      ],
    );
  });

  it("reads no area from an aura that fires when a creature starts its turn near it", () => {
    expect(geometryOf(feature("Basilisk", "specialAbilities", "Petrifying Gaze").desc)).toEqual({});
    expect(geometryOf(feature("Ghast", "specialAbilities", "Stench").desc)).toEqual({});
    expect(feature("Rust Monster", "actions", "Antennae").area).toBeUndefined();
  });

  /**
   * What the prose of a save-based action gives no distance for, and so what
   * has no target downstream: each grabs a creature it already holds, fills its
   * own space, or is touched. Absent rather than guessed — a new entry here is
   * a spelling `geometry.ts` does not know.
   */
  it("leaves out only the save actions whose prose names no distance", () => {
    const missing = monsters.flatMap((monster) =>
      sections.flatMap((section) =>
        (monster.statBlock[section] ?? [])
          .filter((entry) => entry.dc !== undefined && (entry.attackBonus ?? 0) === 0)
          .filter((entry) => entry.choices === undefined && entry.performs === undefined)
          .filter((entry) => entry.reach === undefined && entry.range === undefined)
          .filter((entry) => entry.area === undefined)
          .map((entry) => `${monster.name}: ${entry.name}`),
      ),
    );
    expect(missing).toEqual([
      "Chain Devil: Unnerving Mask",
      "Chuul: Tentacles",
      "Gelatinous Cube: Engulf",
      "Otyugh: Tentacle Slam",
      "Sprite: Heart Sight",
      "Water Elemental: Whelm",
    ]);
  });
});

describe("the SRD's legendary actions and multiattacks", () => {
  it("gives every legendary creature the SRD's three a round, and nobody else any", () => {
    expect(block("Adult Red Dragon").legendaryActionsPerRound).toBe(3);
    expect(block("Goblin").legendaryActionsPerRound).toBeUndefined();
    for (const monster of monsters) {
      const legendary = (monster.statBlock.legendaryActions ?? []).length > 0;
      expect(monster.statBlock.legendaryActionsPerRound).toBe(legendary ? 3 : undefined);
    }
  });

  it("reads a legendary action's cost off its name", () => {
    expect(
      feature("Lich", "legendaryActions", "Disrupt Life (Costs 3 Actions)").legendaryCost,
    ).toBe(3);
    expect(feature("Lich", "legendaryActions", "Cantrip").legendaryCost).toBeUndefined();
  });

  it("points a legendary action that only names another at the actions it performs", () => {
    expect(feature("Adult Red Dragon", "legendaryActions", "Tail Attack").performs).toEqual([
      "Tail",
    ]);
    expect(feature("Kraken", "legendaryActions", "Tentacle Attack or Fling").performs).toEqual([
      "Tentacle",
      "Fling",
    ]);
    expect(feature("Mummy Lord", "legendaryActions", "Attack").performs).toEqual([
      "Rotting Fist",
      "Dreadful Glare",
    ]);
    expect(
      feature("Lich", "legendaryActions", "Paralyzing Touch (Costs 2 Actions)").performs,
    ).toEqual(["Paralyzing Touch"]);
    // A form without the action has no pointer to it.
    expect(
      feature("Vampire, Mist Form", "legendaryActions", "Bite (Costs 2 Actions)").performs,
    ).toBeUndefined();
  });

  it("lists a multiattack's alternatives as the strikes each makes", () => {
    const multiattack = feature("Bandit Captain", "actions", "Multiattack");
    expect(multiattack.multiattackOptions).toEqual([
      [
        { actionName: "Scimitar", count: 2, type: "melee" },
        { actionName: "Dagger", count: 1, type: "melee" },
      ],
      [{ actionName: "Dagger", count: 2, type: "ranged" }],
    ]);
    expect(
      feature("Adult Red Dragon", "actions", "Multiattack").multiattackOptions,
    ).toBeUndefined();
  });
});

/** The keys `0092_action_geometry.ts` fills in, taken back out of a stat block. */
const NEW_FEATURE_KEYS = [
  "reach",
  "range",
  "area",
  "choices",
  "multiattackOptions",
  "legendaryCost",
  "performs",
] as const;

const withoutNewKeys = (statBlock: StatBlock): Record<string, unknown> => {
  const { legendaryActionsPerRound: _count, ...rest } = statBlock;
  const strip = (features: ReadonlyArray<CreatureFeature> | undefined) =>
    features?.map((entry) =>
      Object.fromEntries(
        Object.entries(entry).filter(
          ([key]) => !(NEW_FEATURE_KEYS as ReadonlyArray<string>).includes(key),
        ),
      ),
    );
  return {
    ...rest,
    ...(rest.specialAbilities === undefined
      ? {}
      : { specialAbilities: strip(rest.specialAbilities) }),
    ...(rest.actions === undefined ? {} : { actions: strip(rest.actions) }),
    ...(rest.reactions === undefined ? {} : { reactions: strip(rest.reactions) }),
    ...(rest.legendaryActions === undefined
      ? {}
      : { legendaryActions: strip(rest.legendaryActions) }),
  };
};

describe("the stat blocks the import cannot reach", () => {
  /**
   * The migration carries a frozen copy of the extraction, so it is checked
   * against the import once, here, over every SRD monster: a Library copy taken
   * before the keys existed comes out of the migration as the import now writes
   * the bundle row it was copied from.
   */
  it("comes out of the migration as the import writes the bundle row", () => {
    for (const monster of monsters) {
      expect(upgradedStatBlock(withoutNewKeys(monster.statBlock)), monster.name).toEqual(
        monster.statBlock,
      );
    }
  });

  it("writes nothing over a key that is already there, so running twice changes nothing", () => {
    const dragon = block("Adult Red Dragon");
    const edited = {
      ...dragon,
      legendaryActionsPerRound: 2,
      actions: dragon.actions?.map((entry) =>
        entry.name === "Tail" ? { ...entry, reach: 20 } : entry,
      ),
    };
    expect(upgradedStatBlock(edited)).toEqual(edited);
    expect(upgradedStatBlock(upgradedStatBlock(withoutNewKeys(dragon)))).toEqual(dragon);
  });

  it("reads a typed trait's own prose, and gives a trait that says no distance none", () => {
    expect(
      upgradedStatBlock({
        traits: [
          { name: "Scimitar", text: "Melee weapon attack: +4 to hit, reach 5 ft., one target." },
          { name: "Nimble Escape", text: "The boss takes the Disengage or Hide action." },
        ],
      }),
    ).toEqual({
      traits: [
        {
          name: "Scimitar",
          text: "Melee weapon attack: +4 to hit, reach 5 ft., one target.",
          reach: 5,
        },
        { name: "Nimble Escape", text: "The boss takes the Disengage or Hide action." },
      ],
    });
  });
});
