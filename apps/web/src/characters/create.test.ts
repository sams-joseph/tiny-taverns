import type { CampaignMembership, CharacterOption, OptionKind, RaceBody } from "@taverns/api";
import { describe, expect, it } from "vitest";
import { abilityDrafts, abilitySummary, assignScores } from "./abilities";
import {
  emptyDraft,
  payloadFrom,
  problemsIn,
  raceChoiceNote,
  selectedRaceBonuses,
  seededDraft,
  tablesForNewCharacter,
  type CharacterDraft,
  type SeededField,
} from "./create";

const table = (id: string, name: string, relation: "creator" | "player"): CampaignMembership =>
  ({
    campaign: { id, name },
    relation,
    joinedAt: "2026-07-02T10:00:00.000Z",
  }) as unknown as CampaignMembership;

const draftWith = (part: Partial<CharacterDraft>): CharacterDraft => ({
  ...emptyDraft,
  name: "Sorrel",
  ...part,
});

const option = (kind: OptionKind, name: string, body: Record<string, unknown>): CharacterOption =>
  ({ id: `option-${name}`, kind, name, body }) as unknown as CharacterOption;

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

const VOCABULARY: ReadonlyArray<CharacterOption> = [
  option("class", "Druid", { hitDie: 8, unarmouredAc: ["DEX"] }),
  option("class", "Barbarian", { hitDie: 12, unarmouredAc: ["DEX", "CON"] }),
  option("class", "Monk", { hitDie: 8, unarmouredAc: ["DEX", "WIS"] }),
  option("class", "Wizard", { hitDie: 6, unarmouredAc: ["DEX"] }),
  option("class", "Bloodsworn", { hitDie: 10, unarmouredAc: ["DEX", "CON"] }),
  option(
    "race",
    "Elf",
    raceBody([{ ability: "DEX", amount: 2 }], {
      subraces: [{ name: "High Elf", abilityBonuses: [{ ability: "INT", amount: 1 }], traits: [] }],
    }),
  ),
  option(
    "race",
    "Dwarf",
    raceBody([{ ability: "CON", amount: 2 }], {
      speed: 25,
      subraces: [
        {
          name: "Hill Dwarf",
          abilityBonuses: [{ ability: "WIS", amount: 1 }],
          hpPerLevel: 1,
          traits: [],
        },
      ],
    }),
  ),
  option("race", "Marshfolk", raceBody([{ ability: "CON", amount: 2 }], { hpPerLevel: 2 })),
  option(
    "race",
    "Half-Elf",
    raceBody([{ ability: "CHA", amount: 2 }], {
      abilityBonusChoice: {
        choose: 2,
        bonuses: [
          { ability: "STR", amount: 1 },
          { ability: "DEX", amount: 1 },
          { ability: "CON", amount: 1 },
          { ability: "INT", amount: 1 },
          { ability: "WIS", amount: 1 },
        ],
      },
    }),
  ),
  option("background", "Soldier", { proficiencies: [], languages: [], equipment: [], choices: [] }),
  option("background", "Salt-runner", {
    proficiencies: ["Athletics"],
    languages: ["River cant"],
    equipment: ["ferryman's token"],
    gold: "15 gp",
    feature: { name: "Riverwise", text: "You know who watches the crossings." },
    choices: [],
  }),
];

const untouched: ReadonlySet<SeededField> = new Set();
const scored = (...scores: ReadonlyArray<number>) => assignScores(abilityDrafts([]), scores);

describe("which tables a character of your own may go into", () => {
  /**
   * **Every table, the run ones included** — the inversion the continuity
   * decision of 2026-09-01 made. The old rule filtered to `player` because a
   * character was campaign-scoped and DM-typed; a character is account-owned
   * now and its creator is a player too, so a table you run is somewhere a
   * character of your own belongs exactly as one you sit at is.
   */
  it("is every table you are at, the ones you run included", () => {
    expect(
      tablesForNewCharacter([
        table("a", "The Salt Road", "player"),
        table("b", "A table I run", "creator"),
        table("c", "The Hag's Bargain", "player"),
      ]).map((row) => row.campaign.name),
    ).toEqual(["The Salt Road", "A table I run", "The Hag's Bargain"]);
  });

  it("offers a creator their own tables, and is empty only with no table at all", () => {
    expect(
      tablesForNewCharacter([table("b", "A table I run", "creator")]).map(
        (row) => row.campaign.name,
      ),
    ).toEqual(["A table I run"]);
    expect(tablesForNewCharacter([])).toEqual([]);
  });
});

describe("what the player is told before anything is sent", () => {
  it("insists on a name and validates numbers and links", () => {
    expect(problemsIn(emptyDraft).name).toBe("Give them a name.");
    expect(problemsIn(draftWith({ level: "0" })).level).toBe("Between 1 and 100.");
    expect(problemsIn(draftWith({ level: "two" })).level).toBe("A level is a whole number.");
    expect(problemsIn(draftWith({ ac: "41" })).ac).toBe("Between 0 and 40.");
    expect(problemsIn(draftWith({ hpMax: "-1" })).hpMax).toBe("Between 0 and 10,000.");
    expect(problemsIn(draftWith({ sheetUrl: "javascript:alert(1)" })).sheetUrl).toBe(
      "A link starting http:// or https://.",
    );
  });
});

describe("the payload", () => {
  it("omits what was left blank rather than sending nulls or empty strings", () => {
    expect(payloadFrom(draftWith({}), VOCABULARY)).toEqual({ name: "Sorrel", level: 1 });
  });

  it("trims and carries every filled durable field", () => {
    expect(
      payloadFrom(
        draftWith({
          name: "  Sorrel Ash  ",
          playerName: " Ilse ",
          level: "3",
          race: " Elf ",
          subrace: " High Elf ",
          className: " Druid ",
          ac: "14",
          hpMax: "22",
          sheetUrl: " https://example.com/sorrel ",
        }),
        VOCABULARY,
      ),
    ).toMatchObject({
      name: "Sorrel Ash",
      playerName: "Ilse",
      level: 3,
      race: "Elf",
      subrace: "High Elf",
      className: "Druid",
      ac: 14,
      hpMax: 22,
      sheetUrl: "https://example.com/sorrel",
    });
  });

  it("writes the seeded ability cells into the sheet", () => {
    const payload = payloadFrom(
      seededDraft(
        draftWith({
          className: "Barbarian",
          race: "Dwarf",
          subrace: "Hill Dwarf",
          abilities: scored(13, 14, 15, 8, 12, 10),
        }),
        untouched,
        VOCABULARY,
      ),
      VOCABULARY,
    );

    expect(payload.hpMax).toBe(16);
    expect(payload.ac).toBe(15);
    expect(payload.sheet?.abilities).toContainEqual({ label: "CON", score: "17", modifier: "+3" });
    expect(payload.sheet?.abilities).toContainEqual({ label: "WIS", score: "13", modifier: "+1" });
  });

  it("has no field for a live column, visibility or account", () => {
    const payload = payloadFrom(draftWith({ ac: "14", hpMax: "9" }), VOCABULARY) as Record<
      string,
      unknown
    >;
    for (const key of ["hpCurrent", "tempHp", "conditions", "visibility", "accountId"]) {
      expect(payload).not.toHaveProperty(key);
    }
  });
});

describe("what a class, race and subrace pick fills in", () => {
  it("starts every character at level 1 before anything is picked", () => {
    expect(emptyDraft.level).toBe("1");
    expect(emptyDraft.race).toBe("");
    expect(emptyDraft.className).toBe("");
  });

  it("fills in hit points and armour class from the picked entries and ability scores", () => {
    const hand = seededDraft(
      draftWith({
        className: "Barbarian",
        race: "Dwarf",
        subrace: "Hill Dwarf",
        abilities: scored(13, 14, 15, 8, 12, 10),
      }),
      untouched,
      VOCABULARY,
    );
    expect(hand.hpMax).toBe("16");
    expect(hand.ac).toBe("15");
  });

  it("still seeds from a bare baseline when nobody typed a score", () => {
    const none = seededDraft(
      draftWith({ className: "Barbarian", race: "Dwarf", subrace: "Hill Dwarf" }),
      untouched,
      VOCABULARY,
    );
    expect(none.hpMax).toBe("13");
    expect(none.ac).toBe("10");
    expect(abilitySummary(emptyDraft.abilities)).toBeUndefined();
  });

  it("never writes over a number the player typed", () => {
    const typed = draftWith({ className: "Druid", race: "Elf", ac: "17", hpMax: "34" });
    const seeded = seededDraft(typed, new Set<SeededField>(["ac", "hpMax"]), VOCABULARY);
    expect(seeded.ac).toBe("17");
    expect(seeded.hpMax).toBe("34");
    expect(seededDraft(typed, new Set<SeededField>(["ac"]), VOCABULARY)).toMatchObject({
      ac: "17",
      hpMax: "8",
    });
  });

  it("keeps unknown labels verbatim and seeds only what it can resolve", () => {
    const unknown = seededDraft(
      draftWith({ className: "Circle of the Moon Druid", race: "Half-orc" }),
      untouched,
      VOCABULARY,
    );
    expect(unknown.hpMax).toBe("");
    expect(unknown.ac).toBe("10");
    expect(payloadFrom(unknown, VOCABULARY).className).toBe("Circle of the Moon Druid");
  });

  it("matches a label case-insensitively and exactly", () => {
    expect(seededDraft(draftWith({ className: "druid" }), untouched, VOCABULARY).hpMax).toBe("8");
    expect(seededDraft(draftWith({ className: "Blood" }), untouched, VOCABULARY).hpMax).toBe("");
  });
});

describe("source-defined race bonus choices", () => {
  it("names the fixed and selected bonuses", () => {
    const draft = draftWith({ race: "Half-Elf", raceBonusChoices: ["DEX", "CON"] });
    expect(selectedRaceBonuses(draft, VOCABULARY)).toBe("+2 CHA, +1 DEX, +1 CON");
    expect(raceChoiceNote(draft, VOCABULARY)).toBe("Half-Elf adds +1 DEX, +1 CON from its choice.");
  });

  it("says how many choices remain", () => {
    expect(
      raceChoiceNote(draftWith({ race: "Half-Elf", raceBonusChoices: ["DEX"] }), VOCABULARY),
    ).toBe("Half-Elf chooses 2 extra +1 bonuses from STR, DEX, CON, INT, WIS. Pick 1 more.");
  });
});

describe("2014 backgrounds on the manual path", () => {
  it("writes the background's sheet facts but does not change creation arithmetic", () => {
    const plain = seededDraft(
      draftWith({ className: "Druid", race: "Elf", abilities: scored(15, 14, 13, 12, 10, 8) }),
      untouched,
      VOCABULARY,
    );
    const withBackground = seededDraft(
      { ...plain, background: "Salt-runner" },
      untouched,
      VOCABULARY,
    );

    const plainSheet = payloadFrom(plain, VOCABULARY).sheet;

    expect(withBackground.hpMax).toBe(plain.hpMax);
    expect(withBackground.ac).toBe(plain.ac);
    expect(payloadFrom(withBackground, VOCABULARY).sheet).toEqual({
      notes: "",
      abilities: plainSheet?.abilities,
      traits: [{ name: "Riverwise", text: "You know who watches the crossings." }],
      identity: { background: "Salt-runner" },
      proficiencies: ["Athletics", "River cant"],
      inventory: [{ name: "ferryman's token" }],
      currency: { gp: 15 },
    });
  });
});
