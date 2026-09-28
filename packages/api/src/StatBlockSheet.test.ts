import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { emptyStatBlock, type StatBlock } from "./Creature.js";
import { NpcSheetPut } from "./Npc.js";
import { sheetFromStatBlock } from "./StatBlockSheet.js";

/**
 * *Start from a bestiary NPC*: a stat block moved onto an NPC's
 * character-style sheet. The worked examples are the SRD's own blocks as
 * `bestiary/import.ts` stores them; every humanoid in the pinned snapshot is
 * run through the same function against the wire schema in
 * `apps/server/test/monster-corpus.test.ts`.
 */

const cells = (scores: ReadonlyArray<number>) =>
  ["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((label, index) => {
    const score = scores[index] ?? 10;
    const modifier = Math.floor((score - 10) / 2);
    return {
      label,
      score: String(score),
      modifier: modifier < 0 ? String(modifier) : `+${String(modifier)}`,
    };
  });

const ref = (index: string, name: string) => ({ index, name });

/** The SRD Veteran, as the import writes its document. */
const veteranBlock: StatBlock = {
  meta: "Medium humanoid (any race), any alignment",
  ac: "17 (splint armor)",
  hp: "58 (9d8+18)",
  speed: "30 ft.",
  cr: "3 (700 XP)",
  abilities: cells([16, 13, 14, 10, 11, 10]),
  traits: [],
  proficiencies: [
    { value: 5, proficiency: ref("skill-athletics", "Skill: Athletics") },
    { value: 2, proficiency: ref("skill-perception", "Skill: Perception") },
  ],
  damageVulnerabilities: [],
  damageResistances: [],
  damageImmunities: [],
  conditionImmunities: [],
  senses: { passive_perception: 12 },
  languages: "any one language (usually Common)",
  proficiencyBonus: 2,
  xp: 700,
  specialAbilities: [],
  actions: [
    {
      name: "Multiattack",
      desc: "The veteran makes two longsword attacks. If it has a shortsword drawn, it can also make a shortsword attack.",
      multiattackType: "actions",
      actions: [
        { actionName: "Longsword", count: 2, type: "melee" },
        { actionName: "Shortsword", count: 2, type: "melee" },
      ],
    },
    {
      name: "Longsword",
      desc: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage, or 8 (1d10 + 3) slashing damage if used with two hands.",
      attackBonus: 5,
      damage: [
        {
          choice: {
            choose: 1,
            type: "damage",
            from: {
              option_set_type: "options_array",
              options: [
                {
                  option_type: "damage",
                  notes: "One handed",
                  damage_type: ref("slashing", "Slashing"),
                  damage_dice: "1d8+3",
                },
                {
                  option_type: "damage",
                  notes: "Two handed",
                  damage_type: ref("slashing", "Slashing"),
                  damage_dice: "1d10+3",
                },
              ],
            },
          },
        },
      ],
    },
    {
      name: "Shortsword",
      desc: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) piercing damage.",
      attackBonus: 5,
      damage: [{ damageType: ref("piercing", "Piercing"), damageDice: "1d6+3" }],
    },
    {
      name: "Heavy Crossbow",
      desc: "Ranged Weapon Attack: +3 to hit, range 100/400 ft., one target. Hit: 6 (1d10 + 1) piercing damage.",
      attackBonus: 3,
      damage: [{ damageType: ref("piercing", "Piercing"), damageDice: "1d10+1" }],
    },
  ],
  reactions: [],
  legendaryActions: [],
};

describe("sheetFromStatBlock", () => {
  it("moves the Veteran onto a sheet: the numbers, the cells, the skills and the attacks", () => {
    const started = sheetFromStatBlock({ ac: 17, hp: 58, cr: "3", statBlock: veteranBlock });

    expect(started.ac).toBe(17);
    expect(started.hpMax).toBe(58);
    expect(started.cr).toBe("3");
    // The six cells verbatim: the Veteran prints no saving-throw proficiency.
    expect(started.sheet.abilities).toEqual(veteranBlock.abilities);
    expect(started.sheet.identity).toEqual({ speed: "30 ft.", proficiency: "+2" });
    expect(started.sheet.skills).toEqual([
      { name: "Athletics", ability: "STR", bonus: "+5", proficient: true },
      { name: "Perception", ability: "WIS", bonus: "+2", proficient: true },
    ]);
    // Passive Perception is derived from the Perception row, not a badge.
    expect(started.sheet.proficiencies).toEqual(["any one language (usually Common)"]);
    expect(started.sheet.traits).toEqual([]);

    const actions = started.sheet.actions ?? [];
    expect(actions.map((action) => action.id)).toEqual([
      "act:multiattack",
      "atk:longsword",
      "atk:shortsword",
      "atk:heavy-crossbow",
    ]);
    expect(actions[1]).toEqual({
      id: "atk:longsword",
      name: "Longsword",
      cost: "action",
      hit: "+5",
      dice: "1d8+3",
      text: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage, or 8 (1d10 + 3) slashing damage if used with two hands.",
      source: "weapon",
    });
    expect(actions[0]).toMatchObject({ name: "Multiattack", cost: "action", source: "other" });
    expect(actions[0]?.hit).toBeUndefined();
    expect(actions[3]).toMatchObject({ hit: "+3", dice: "1d10+1", source: "weapon" });
    // Nothing is `derived`: a level-up recompute must leave these lines alone.
    expect(actions.every((action) => action.derived === undefined)).toBe(true);
  });

  it("is a PUT the wire accepts, with no class, level or race in it", () => {
    const started = sheetFromStatBlock({ ac: 17, hp: 58, cr: "3", statBlock: veteranBlock });
    const decoded = Schema.decodeUnknownSync(NpcSheetPut)(started);
    expect(decoded.sheet).toEqual(started.sheet);
    expect(Object.keys(started).sort()).toEqual(["ac", "cr", "hpMax", "sheet"]);
  });

  it("writes saving-throw proficiencies onto their cells, and reactions and uses with their cost and limit", () => {
    const captain: StatBlock = {
      ...emptyStatBlock,
      speed: "30 ft.",
      abilities: cells([15, 16, 14, 14, 11, 14]),
      proficiencies: [
        { value: 4, proficiency: ref("saving-throw-str", "Saving Throw: STR") },
        { value: 5, proficiency: ref("saving-throw-dex", "Saving Throw: DEX") },
        { value: 2, proficiency: ref("saving-throw-wis", "Saving Throw: WIS") },
        { value: 4, proficiency: ref("skill-athletics", "Skill: Athletics") },
      ],
      senses: { darkvision: "60 ft.", passive_perception: 10 },
      languages: "Common, Goblin",
      damageResistances: ["poison"],
      conditionImmunities: [ref("frightened", "Frightened")],
      specialAbilities: [
        {
          name: "Innate Spellcasting",
          desc: "The drow can innately cast faerie fire once per day.",
          usage: { type: "per day", times: 1 },
        },
      ],
      actions: [
        {
          name: "Fire Breath",
          desc: "The veteran exhales fire in a 15-foot cone.",
          usage: { type: "recharge on roll", dice: "1d6", minValue: 5 },
          damage: [{ damageType: ref("fire", "Fire"), damageDice: "7d6" }],
        },
      ],
      reactions: [
        {
          name: "Parry",
          desc: "The captain adds 2 to its AC against one melee attack that would hit it.",
        },
      ],
    };
    const started = sheetFromStatBlock({ ac: 15, hp: 65, cr: "2", statBlock: captain });

    const byLabel = new Map(started.sheet.abilities.map((cell) => [cell.label, cell]));
    expect(byLabel.get("STR")).toMatchObject({ save: "+4", proficient: true });
    expect(byLabel.get("DEX")).toMatchObject({ save: "+5", proficient: true });
    expect(byLabel.get("WIS")).toMatchObject({ save: "+2", proficient: true });
    expect(byLabel.get("CON")?.save).toBeUndefined();
    expect(byLabel.get("CON")?.proficient).toBeUndefined();

    expect(started.sheet.proficiencies).toEqual([
      "Darkvision 60 ft.",
      "Common",
      "Goblin",
      "Resists poison",
      "Immune to Frightened",
    ]);
    expect(started.sheet.traits).toEqual([
      {
        name: "Innate Spellcasting",
        text: "The drow can innately cast faerie fire once per day.",
        note: "1/day",
      },
    ]);
    expect(started.sheet.actions).toEqual([
      {
        id: "act:fire-breath",
        name: "Fire Breath",
        cost: "action",
        dice: "7d6",
        text: "Recharge 5–6. The veteran exhales fire in a 15-foot cone.",
        source: "other",
      },
      {
        id: "act:parry",
        name: "Parry",
        cost: "reaction",
        text: "The captain adds 2 to its AC against one melee attack that would hit it.",
        source: "other",
      },
    ]);
  });

  it("reads a prose stat block: an attack becomes an action line, the rest stay features", () => {
    const boss: StatBlock = {
      ...emptyStatBlock,
      speed: "30 ft.",
      abilities: cells([10, 14, 10, 10, 8, 10]),
      traits: [
        { name: "Nimble Escape", text: "The boss takes the Disengage or Hide action." },
        {
          name: "Scimitar",
          text: "Melee weapon attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) slashing damage.",
          dice: "1d6+2",
        },
      ],
    };
    const started = sheetFromStatBlock({ ac: 17, hp: 21, cr: "1", statBlock: boss });

    expect(started.sheet.traits).toEqual([boss.traits[0]]);
    expect(started.sheet.actions).toEqual([
      {
        id: "atk:scimitar",
        name: "Scimitar",
        cost: "action",
        hit: "+4",
        dice: "1d6+2",
        text: "Melee weapon attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6+2) slashing damage.",
        source: "weapon",
      },
    ]);
    // No proficiency bonus printed, so none is written.
    expect(started.sheet.identity).toEqual({ speed: "30 ft." });
  });

  it("leaves out what the block does not say, and a rating the XP table does not know", () => {
    const started = sheetFromStatBlock({ ac: 12, hp: 9, cr: "—", statBlock: emptyStatBlock });
    expect(started).toEqual({ ac: 12, hpMax: 9, cr: null, sheet: { abilities: [], traits: [] } });
  });

  it("keeps two lines of one name apart", () => {
    const block: StatBlock = {
      ...emptyStatBlock,
      actions: [
        { name: "Bite", desc: "Melee Weapon Attack: +4 to hit.", attackBonus: 4 },
        { name: "Bite", desc: "Melee Weapon Attack: +6 to hit.", attackBonus: 6 },
      ],
    };
    const ids = (
      sheetFromStatBlock({ ac: 10, hp: 1, cr: "1", statBlock: block }).sheet.actions ?? []
    ).map((action) => action.id);
    expect(ids).toEqual(["atk:bite", "atk:bite-2"]);
  });
});
