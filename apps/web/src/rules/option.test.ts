import type { CharacterOption, RaceBody } from "@taverns/api";
import { AccountId, CampaignId } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { isLibraryOriginal, numbersOf, ownerOf, unarmouredLine } from "./option";

const aCampaign = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
const anAccount = Schema.decodeSync(AccountId)("2b1f2a1e-0000-4000-8000-0000000000a1");

const option = (
  part: Partial<CharacterOption> & { kind: "class" | "race" | "background" },
): CharacterOption =>
  ({
    id: "option",
    campaignId: null,
    accountId: null,
    derivedFrom: null,
    name: "Something",
    visibility: "shared",
    origin: "system",
    assistantTurnId: null,
    ...part,
  }) as unknown as CharacterOption;

const raceBody = (
  bonuses: RaceBody["abilityBonuses"],
  extra: Partial<RaceBody> = {},
): RaceBody => ({
  speed: 30,
  size: "Medium",
  abilityBonuses: bonuses,
  hpPerLevel: 0,
  traits: [],
  subraces: [],
  ...extra,
});

describe("the unarmoured formula", () => {
  it("names every modifier the class adds, in the order it was given", () => {
    expect(unarmouredLine(["DEX"])).toBe("10 + DEX");
    expect(unarmouredLine(["DEX", "CON"])).toBe("10 + DEX + CON");
    expect(unarmouredLine(["DEX", "WIS"])).toBe("10 + DEX + WIS");
  });

  it("is a bare 10 when a class adds nothing at all", () => {
    expect(unarmouredLine([])).toBe("10");
  });
});

describe("what a row's numbers say", () => {
  it("reads a class's die and its formula", () => {
    expect(
      numbersOf(option({ kind: "class", body: { hitDie: 10, unarmouredAc: ["DEX", "CON"] } })),
    ).toBe("d10 · unarmoured 10 + DEX + CON");
  });

  it("reads a race's fixed bonuses, movement, size, choices and contained subraces", () => {
    expect(
      numbersOf(
        option({
          kind: "race",
          body: raceBody([{ ability: "CHA", amount: 2 }], {
            abilityBonusChoice: {
              choose: 2,
              bonuses: [
                { ability: "STR", amount: 1 },
                { ability: "DEX", amount: 1 },
              ],
            },
            subraces: [
              { name: "High Elf", abilityBonuses: [{ ability: "INT", amount: 1 }], traits: [] },
            ],
          }),
        }),
      ),
    ).toBe("+2 CHA · 30 ft · Medium · choose 2 from STR, DEX · 1 subrace");
  });

  it("says when a race has no fixed bonus", () => {
    expect(numbersOf(option({ kind: "race", body: raceBody([]) }))).toBe(
      "no fixed bonuses · 30 ft · Medium",
    );
    expect(numbersOf(option({ kind: "race", body: raceBody([], { hpPerLevel: 1 }) }))).toContain(
      "+1 hit point per level",
    );
  });

  it("reads a 2014 background's proficiencies and languages", () => {
    expect(
      numbersOf(
        option({
          kind: "background",
          body: {
            proficiencies: ["Insight", "Religion"],
            languages: ["Two of your choice"],
            equipment: [],
            choices: [],
          },
        }),
      ),
    ).toBe("Insight, Religion · Two of your choice");
  });

  it("says when no fixed background proficiency is written down", () => {
    expect(
      numbersOf(
        option({
          kind: "background",
          body: { proficiencies: [], languages: [], equipment: [], choices: [] },
        }),
      ),
    ).toBe("no fixed proficiencies");
  });
});

describe("which rows this table may edit", () => {
  it("is ownership, and never provenance", () => {
    const bundled = option({
      kind: "class",
      origin: "system",
      body: { hitDie: 8, unarmouredAc: [] },
    });
    const copy = option({
      kind: "class",
      campaignId: aCampaign,
      origin: "imported",
      body: { hitDie: 8, unarmouredAc: [] },
    });

    expect(ownerOf(bundled)).toBe("bundle");
    expect(ownerOf(copy)).toBe("campaign");
  });

  it("says no to a Library original", () => {
    const original = option({
      kind: "race",
      accountId: anAccount,
      origin: "authored",
      body: raceBody([{ ability: "CON", amount: 1 }]),
    });
    expect(ownerOf(original)).toBe("library");
  });
});

describe("which rows the library may edit", () => {
  it("is the same ownership question, asked from the other side", () => {
    const bundled = option({ kind: "class", body: { hitDie: 8, unarmouredAc: [] } });
    const mine = option({
      kind: "class",
      accountId: anAccount,
      origin: "imported",
      body: { hitDie: 8, unarmouredAc: [] },
    });

    expect(isLibraryOriginal(bundled)).toBe(false);
    expect(isLibraryOriginal(mine)).toBe(true);
  });

  it("never says yes to a campaign's copy", () => {
    const copy = option({
      kind: "race",
      campaignId: aCampaign,
      origin: "authored",
      body: raceBody([{ ability: "CON", amount: 1 }]),
    });
    expect(isLibraryOriginal(copy)).toBe(false);
  });

  it("puts every row in exactly one of the three positions", () => {
    const bundled = option({ kind: "class", body: { hitDie: 8, unarmouredAc: [] } });
    const mine = option({
      kind: "class",
      accountId: anAccount,
      body: { hitDie: 8, unarmouredAc: [] },
    });
    const copy = option({
      kind: "class",
      campaignId: aCampaign,
      body: { hitDie: 8, unarmouredAc: [] },
    });

    expect([bundled, mine, copy].map(ownerOf)).toEqual(["bundle", "library", "campaign"]);
    for (const row of [bundled, mine, copy]) {
      expect(ownerOf(row) === "campaign" && isLibraryOriginal(row)).toBe(false);
    }
  });
});
