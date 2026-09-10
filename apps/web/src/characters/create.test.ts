import type {
  CampaignMembership,
  CharacterOption,
  KitEquipment,
  OptionKind,
  RaceBody,
} from "@taverns/api";
import { describe, expect, it } from "vitest";
import { abilityDrafts, abilitySummary, assignScores } from "./abilities";
import {
  emptyDraft,
  kitOf,
  kitRowsIn,
  payloadFrom,
  pickKitRow,
  pickKitSide,
  problemsIn,
  raceChoiceNote,
  selectedRaceBonuses,
  seededDraft,
  tablesForNewCharacter,
  withKitDefaults,
  backgroundKitOf,
  backgroundKitRowsIn,
  type CharacterDraft,
  type SeededField,
} from "./create";

const table = (id: string, name: string, relation: "creator" | "player"): CampaignMembership =>
  ({
    campaign: { id, name },
    relation,
    sharedWorld: null,
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

/** The weapon columns of a bundled `equipment` row, as `details.equipment` carries them. */
const weapon = (
  id: string,
  name: string,
  index: string,
  category: "Simple" | "Martial",
  damageDice: string,
  damageType: string,
  properties: ReadonlyArray<string> = [],
): KitEquipment => ({
  id: id as never,
  index,
  name,
  weaponCategory: category,
  weaponRange: "Melee",
  categoryRange: `${category} Melee`,
  armorCategory: null,
  damageDice,
  damageType,
  twoHandedDamageDice: null,
  rangeNormal: 5,
  rangeLong: null,
  throwRangeNormal: null,
  throwRangeLong: null,
  properties,
  weight: null,
  gearCategoryIndex: null,
  toolCategory: null,
});
const LONGSWORD = weapon(
  "2b1f2a1e-0000-4000-8000-0000000e0001",
  "Longsword",
  "longsword",
  "Martial",
  "1d8",
  "Slashing",
  ["Versatile"],
);
const HANDAXE = weapon(
  "2b1f2a1e-0000-4000-8000-0000000e0002",
  "Handaxe",
  "handaxe",
  "Simple",
  "1d6",
  "Slashing",
  ["Light", "Thrown"],
);
const SHIELD: KitEquipment = {
  ...weapon("2b1f2a1e-0000-4000-8000-0000000e0003", "Shield", "shield", "Martial", "", ""),
  weaponCategory: null,
  weaponRange: null,
  categoryRange: null,
  damageDice: null,
  damageType: null,
  rangeNormal: null,
  armorCategory: "Shield",
};

/**
 * A Fighter with a structured kit and a class table — the shape the importer
 * writes and `optionDetailsFor` hydrates, cut down to what the form reads.
 */
const FIGHTER: CharacterOption = {
  ...option("class", "Fighter", {
    hitDie: 10,
    unarmouredAc: ["DEX"],
    proficiencies: ["Martial Weapons", "Simple Weapons", "Saving Throw: STR"],
    savingThrows: ["STR", "CON"],
    startingKit: {
      fixed: [],
      choices: [
        {
          desc: "(a) a martial weapon and a shield or (b) two martial weapons",
          options: [
            {
              label: "Any martial weapon, Shield",
              lines: [
                {
                  name: "Any martial weapon",
                  quantity: 1,
                  category: { index: "martial-weapons", name: "Martial Weapons" },
                },
                { name: "Shield", quantity: 1, equipmentId: SHIELD.id },
              ],
            },
            {
              label: "2 × Any martial weapon",
              lines: [
                {
                  name: "Any martial weapon",
                  quantity: 2,
                  category: { index: "martial-weapons", name: "Martial Weapons" },
                },
              ],
            },
          ],
        },
        {
          desc: "(a) a light crossbow and 20 bolts or (b) two handaxes",
          options: [
            { label: "Crossbow, light, 20 × Crossbow bolt", lines: [] },
            {
              label: "2 × Handaxe",
              lines: [{ name: "Handaxe", quantity: 2, equipmentId: HANDAXE.id }],
            },
          ],
        },
      ],
    },
  }),
  details: {
    subraces: [],
    abilityBonuses: [],
    languages: [],
    proficiencies: [],
    traits: [],
    choices: [],
    levelOneFeatures: [
      {
        id: "2b1f2a1e-0000-4000-8000-0000000f0010" as never,
        index: "second-wind",
        name: "Second Wind",
        desc: ["A well of stamina."],
      },
    ],
    proficiencyBonus: 2,
    equipment: [HANDAXE, LONGSWORD, SHIELD],
    classLevels: [
      {
        level: 1,
        proficiencyBonus: 2,
        features: [
          {
            id: "2b1f2a1e-0000-4000-8000-0000000f0010" as never,
            index: "second-wind",
            name: "Second Wind",
          },
        ],
      },
    ],
  },
} as unknown as CharacterOption;

/** Three gear rows the Acolyte's kit names and offers, as `details.equipment` carries them. */
const CLOTHES: KitEquipment = {
  ...SHIELD,
  id: "2b1f2a1e-0000-4000-8000-0000000e0011" as never,
  index: "clothes-common",
  name: "Clothes, common",
  armorCategory: null,
  weight: 3,
  gearCategoryIndex: "standard-gear",
};
const POUCH: KitEquipment = {
  ...CLOTHES,
  id: "2b1f2a1e-0000-4000-8000-0000000e0012" as never,
  index: "pouch",
  name: "Pouch",
  weight: 1,
};
const AMULET: KitEquipment = {
  ...CLOTHES,
  id: "2b1f2a1e-0000-4000-8000-0000000e0013" as never,
  index: "amulet",
  name: "Amulet",
  weight: 1,
  gearCategoryIndex: "holy-symbols",
};

/**
 * The Acolyte as the importer writes it since 2026-09-08: the prose list kept
 * for the Rules screens, and the kit as structure beside it — two counted
 * lines naming their rows, and the holy-symbol category the player picks
 * from, with the rows on `details.equipment`.
 */
const ACOLYTE: CharacterOption = {
  ...option("background", "Acolyte", {
    proficiencies: ["Insight", "Religion"],
    languages: [],
    equipment: ["1 × Clothes, common", "1 × Pouch", "Choose 1 equipment"],
    gold: "15 gp",
    choices: [],
    startingKit: {
      fixed: [
        { name: "Clothes, common", quantity: 1, equipmentId: CLOTHES.id },
        { name: "Pouch", quantity: 1, equipmentId: POUCH.id },
      ],
      choices: [
        {
          desc: "",
          options: [
            {
              label: "Any holy symbol",
              lines: [
                {
                  name: "Any holy symbol",
                  quantity: 1,
                  category: { index: "holy-symbols", name: "Holy Symbols" },
                },
              ],
            },
          ],
        },
      ],
    },
  }),
  details: {
    subraces: [],
    abilityBonuses: [],
    languages: [],
    proficiencies: [],
    traits: [],
    choices: [],
    equipment: [CLOTHES, POUCH, AMULET],
  },
} as CharacterOption;

const VOCABULARY: ReadonlyArray<CharacterOption> = [
  FIGHTER,
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
  ACOLYTE,
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
      identity: { speed: "30 ft.", hitDice: "1/1 d8", background: "Salt-runner" },
      proficiencies: ["Athletics", "River cant"],
      // The one counter every class has: its hit dice, off the class's die.
      resources: [
        {
          id: "hit-dice",
          name: "Hit dice",
          used: 0,
          max: 1,
          recharge: "long",
          unit: "d8",
          derived: true,
        },
      ],
      inventory: [{ name: "ferryman's token" }],
      currency: { gp: 15 },
    });
  });
});

/**
 * **The starting kit, and what the pick decides.** Both sides of every choice
 * are listed by the source; the form's pick is what lands on the sheet, and
 * the weapon attack on `actions` follows the pick — through the same
 * `sheetGrantsFor` Hob composes, which takes side (a) when nobody picks.
 */
describe("the starting kit", () => {
  const fighter = draftWith({ className: "Fighter", abilities: scored(16, 14, 15, 8, 12, 10) });

  it("resets the picks to side (a) when the class is picked, and lists what a category offers", () => {
    const reset = withKitDefaults(fighter, VOCABULARY);
    expect(reset.kitChoices).toEqual([
      { option: 0, picks: [] },
      { option: 0, picks: [] },
    ]);
    expect(kitOf(reset, VOCABULARY)?.choices).toHaveLength(2);
    expect(kitRowsIn(reset, VOCABULARY, "martial-weapons").map((row) => row.name)).toEqual([
      "Longsword",
    ]);
    // No class, no kit.
    expect(kitOf(draftWith({}), VOCABULARY)).toBeUndefined();
    expect(withKitDefaults(draftWith({ className: "Druid" }), VOCABULARY).kitChoices).toEqual([]);
  });

  it("carries the pick onto the gear and derives the weapon's attack from it", () => {
    const picked = pickKitRow(withKitDefaults(fighter, VOCABULARY), 0, 0, LONGSWORD.id);
    const sheet = payloadFrom(picked, VOCABULARY).sheet;
    expect(sheet?.inventory).toEqual([
      { name: "Longsword", equipmentId: LONGSWORD.id },
      { name: "Shield", equipmentId: SHIELD.id },
    ]);
    expect(
      sheet?.actions?.map((action) => [action.name, action.cost, action.hit, action.dice]),
    ).toEqual([
      ["Longsword", "action", "+5", "1d8+3"],
      ["Second Wind", "bonus", undefined, "1d10+1"],
    ]);
    expect(sheet?.actions?.[0]).toMatchObject({
      source: "weapon",
      equipmentId: LONGSWORD.id,
      derived: true,
    });
    expect(sheet?.resources?.map((resource) => resource.id)).toEqual([
      "hit-dice",
      "res:second-wind",
    ]);
  });

  it("leaves an unpicked category as a line with no attack behind it", () => {
    const sheet = payloadFrom(withKitDefaults(fighter, VOCABULARY), VOCABULARY).sheet;
    expect(sheet?.inventory?.map((item) => item.name)).toEqual(["Any martial weapon", "Shield"]);
    expect(sheet?.inventory?.[0]).toEqual({ name: "Any martial weapon", note: "Your pick" });
    expect(sheet?.actions?.map((action) => action.name)).toEqual(["Second Wind"]);
  });

  it("takes the other side, and clears the picks made against the first", () => {
    const first = pickKitRow(withKitDefaults(fighter, VOCABULARY), 0, 0, LONGSWORD.id);
    const other = pickKitSide(pickKitSide(first, 0, 1), 1, 1);
    expect(other.kitChoices).toEqual([
      { option: 1, picks: [] },
      { option: 1, picks: [] },
    ]);
    const sheet = payloadFrom(other, VOCABULARY).sheet;
    expect(sheet?.inventory).toEqual([
      { name: "Any martial weapon", quantity: 2, note: "Your pick" },
      { name: "Handaxe", quantity: 2, equipmentId: HANDAXE.id },
    ]);
    // Two handaxes are one attack line.
    expect(sheet?.actions?.filter((action) => action.name === "Handaxe")).toHaveLength(1);
    expect(sheet?.actions?.[0]).toMatchObject({ name: "Handaxe", hit: "+5", dice: "1d6+3" });
  });

  it("carries the background's kit as rows too, and takes its pick", () => {
    const acolyte = withKitDefaults(
      withKitDefaults(draftWith({ className: "Fighter", background: "Acolyte" }), VOCABULARY),
      VOCABULARY,
      "backgroundKitChoices",
    );
    expect(acolyte.backgroundKitChoices).toEqual([{ option: 0, picks: [] }]);
    expect(backgroundKitOf(acolyte, VOCABULARY)?.fixed).toHaveLength(2);
    expect(backgroundKitRowsIn(acolyte, VOCABULARY, "holy-symbols").map((row) => row.name)).toEqual(
      ["Amulet"],
    );

    // Unpicked: the category stays a line, after the class kit's lines.
    const unpicked = payloadFrom(acolyte, VOCABULARY).sheet;
    expect(unpicked?.inventory).toEqual([
      { name: "Any martial weapon", note: "Your pick" },
      { name: "Shield", equipmentId: SHIELD.id },
      { name: "Clothes, common", equipmentId: CLOTHES.id },
      { name: "Pouch", equipmentId: POUCH.id },
      { name: "Any holy symbol", note: "Your pick" },
    ]);

    // Picked: the row, linked, in the category's place — and no attack from a
    // background's gear, which is never a weapon.
    const picked = pickKitRow(acolyte, 0, 0, AMULET.id, "backgroundKitChoices");
    const sheet = payloadFrom(picked, VOCABULARY).sheet;
    expect(sheet?.inventory?.slice(-3)).toEqual([
      { name: "Clothes, common", equipmentId: CLOTHES.id },
      { name: "Pouch", equipmentId: POUCH.id },
      { name: "Amulet", equipmentId: AMULET.id },
    ]);
    expect(sheet?.actions?.map((action) => action.name)).toEqual(["Second Wind"]);
    // A background with no kit still lands its prose lines, unlinked.
    const runner = payloadFrom(draftWith({ background: "Salt-runner" }), VOCABULARY).sheet;
    expect(runner?.inventory).toEqual([{ name: "ferryman's token" }]);
  });

  it("closes a cleared pick up rather than leaving a hole", () => {
    const two = pickKitSide(withKitDefaults(fighter, VOCABULARY), 0, 1);
    const both = pickKitRow(pickKitRow(two, 0, 0, LONGSWORD.id), 0, 1, LONGSWORD.id);
    expect(both.kitChoices[0]?.picks).toEqual([LONGSWORD.id, LONGSWORD.id]);
    expect(pickKitRow(both, 0, 0, undefined).kitChoices[0]?.picks).toEqual([LONGSWORD.id]);
  });
});
