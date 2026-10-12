import {
  type Combatant,
  type CombatantId,
  type CreatureId,
  type EncounterRunId,
  featureKey,
  npcTurnOptions,
  type StatBlock,
} from "@taverns/api";
import { describe, expect, it } from "vitest";
import { transformedMonster } from "../src/bestiary/import.js";
import { MONSTER_RAW } from "../src/bestiary/systemMonsters.js";
import { transformedSpell } from "../src/spells/import.js";
import { SPELL_RAW } from "../src/spells/systemSpells.js";

/**
 * `npcTurnOptions` over every SRD monster the import writes, with every spell
 * the import writes: none throws, and nothing in a creature's actions is
 * dropped without a word — each is an option or an omission with a reason.
 */
const monsters = (MONSTER_RAW as ReadonlyArray<Record<string, unknown>>).map((row) => {
  const { name, statBlock } = transformedMonster(row);
  return { name, statBlock: statBlock as StatBlock };
});
const spells = new Map(
  (SPELL_RAW as ReadonlyArray<Record<string, unknown>>).map((row) => {
    const spell = transformedSpell(row);
    return [
      spell.name.toLowerCase(),
      {
        name: spell.name,
        level: spell.level,
        range: spell.range,
        castingTime: spell.castingTime,
        spell: spell.body,
      },
    ] as const;
  }),
);

const row = (id: string, over: Partial<Combatant>): Combatant =>
  ({
    id: id as CombatantId,
    encounterRunId: "00000000-0000-4000-8000-0000000000aa" as EncounterRunId,
    characterId: null,
    creatureId: null,
    displayName: id,
    hpCurrent: 20,
    hpMax: 20,
    kind: "pc",
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

const fightFor = (statBlock: StatBlock, up: "monster" | "hero") => {
  const creatureId = "00000000-0000-4000-8000-0000000000cc" as CreatureId;
  const monster = row("monster", { kind: "npc", creatureId, position: { column: 5, row: 5 } });
  const hero = row("hero", { position: { column: 6, row: 5 } });
  return {
    run: {
      phase: "turns" as const,
      activeCombatantId: (up === "monster" ? monster : hero).id,
      endedAt: null,
    },
    combatants: [monster, hero],
    board: { columns: 20, rows: 20, feetPerCell: 5 },
    diagonals: "five" as const,
    statBlocks: new Map([[creatureId, statBlock]]),
    spells,
  };
};

describe("the NPC turn options over the whole SRD", () => {
  it("answers every monster, and accounts for every one of its actions", () => {
    const unaccounted: Array<string> = [];
    for (const { name, statBlock } of monsters) {
      const turn = npcTurnOptions(fightFor(statBlock, "monster"), "monster" as CombatantId);
      const seen = new Set([
        ...turn.options.map((option) => option.id.replace(/[#>].*$/, "")),
        ...turn.options.flatMap(
          (option) => option.strikes?.map(({ option: strike }) => strike.id) ?? [],
        ),
        ...turn.omitted.map((entry) => entry.id.replace(/[#>].*$/, "")),
      ]);
      for (const action of statBlock.actions ?? []) {
        const key = featureKey("actions", action.name);
        if (action.spellcasting === undefined && !seen.has(key))
          unaccounted.push(`${name}: ${action.name}`);
      }
      expect(() =>
        npcTurnOptions(fightFor(statBlock, "hero"), "monster" as CombatantId),
      ).not.toThrow();
    }
    expect(unaccounted).toEqual([]);
  });
});
