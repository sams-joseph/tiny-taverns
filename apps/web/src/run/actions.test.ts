import { CharacterSheet, emptyStatBlock, StatBlock } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { goblin } from "../campaign/campaign.fixtures";
import { actionDetail, actionsOf } from "./actions";

const block = Schema.decodeUnknownSync(StatBlock);
const sheet = Schema.decodeUnknownSync(CharacterSheet);
const lines = (source: Parameters<typeof actionsOf>[0]) =>
  actionsOf(source).map((line) => [line.name, actionDetail(line)]);

const ref = (index: string, name: string) => ({ index, name });

describe("a creature's actions", () => {
  it("reads an imported block's attacks and saves, and leaves the prose to the stat block", () => {
    const imported = block({
      ...emptyStatBlock,
      actions: [
        { name: "Multiattack", desc: "The bugbear makes two attacks." },
        {
          name: "Morningstar",
          desc: "Melee Weapon Attack: +4 to hit.",
          attackBonus: 4,
          damage: [{ damageType: ref("piercing", "Piercing"), damageDice: "2d8+2" }],
        },
        {
          name: "Fire Breath",
          desc: "Each creature in a 15-foot cone.",
          dc: { dcType: ref("dex", "DEX"), dcValue: 13, successType: "half" },
          damage: [
            { damageType: ref("fire", "Fire"), damageDice: "4d6" },
            // Choice-shaped damage has no dice of its own to list.
            { choice: { choose: 1 } },
          ],
        },
      ],
      bonusActions: [
        {
          name: "Javelin",
          desc: "Ranged Weapon Attack.",
          attackBonus: 4,
          damage: [{ damageType: ref("piercing", "Piercing"), damageDice: "2d6+2" }],
        },
      ],
    });

    expect(lines({ statBlock: imported })).toEqual([
      ["Morningstar", "+4 to hit · 2d8+2 piercing"],
      ["Fire Breath", "DC 13 DEX · 4d6 fire"],
      ["Javelin", "+4 to hit · 2d6+2 piercing"],
    ]);
    const [morningstar] = actionsOf({ statBlock: imported });
    expect(morningstar).toMatchObject({
      toHit: 4,
      damage: [{ dice: "2d8+2", type: "piercing" }],
      save: undefined,
    });
  });

  it("reads a typed block's rollable traits, and skips the ones with nothing to roll", () => {
    // The fixture's Goblin Boss: *Nimble Escape* is prose, *Scimitar* rolls.
    expect(lines({ statBlock: block(goblin.statBlock) })).toEqual([["Scimitar", "1d6+2"]]);

    const typed = block({
      ...emptyStatBlock,
      traits: [
        { name: "Claws", text: "Two claws.", hit: "+6", dice: "2d8+4" },
        { name: "Shriek", text: "No roll to hit.", hit: "—" },
        { name: "Spit", text: "A to-hit and no dice.", hit: "-1" },
      ],
    });
    expect(lines({ statBlock: typed })).toEqual([
      ["Claws", "+6 to hit · 2d8+4"],
      ["Spit", "-1 to hit"],
    ]);
  });

  it("lists nothing for a block with nothing written", () => {
    expect(actionsOf({ statBlock: emptyStatBlock })).toEqual([]);
  });
});

describe("a party member's actions", () => {
  it("reads the sheet's lines that roll, with their damage type", () => {
    const paladin = sheet({
      notes: "",
      abilities: [],
      traits: [],
      actions: [
        {
          id: "atk:longsword",
          name: "Longsword",
          cost: "action",
          hit: "+7",
          dice: "1d8+4",
          damageType: "Slashing",
          source: "weapon",
        },
        { id: "spell:bless", name: "Bless", cost: "action", source: "spell" },
        {
          id: "feat:second-wind",
          name: "Second Wind",
          cost: "bonus",
          dice: "1d10+5",
          source: "feature",
        },
      ],
    });
    expect(lines({ sheet: paladin })).toEqual([
      ["Longsword", "+7 to hit · 1d8+4 slashing"],
      ["Second Wind", "1d10+5"],
    ]);
    expect(actionsOf({ sheet: paladin })[0]?.key).toBe("atk:longsword");
  });

  it("lists nothing for a sheet with no actions", () => {
    expect(actionsOf({ sheet: sheet({ notes: "", abilities: [], traits: [] }) })).toEqual([]);
  });
});

describe("a row the DM typed in", () => {
  it("has neither a block nor a sheet, and so no actions", () => {
    expect(actionsOf({})).toEqual([]);
  });
});
