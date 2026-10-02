import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { SheetBody } from "./Character.js";
import { ClassOption } from "./CharacterOption.js";
import type { Ability } from "./Creature.js";
import type { CharacterId, FeatId, FeatureId } from "./Ids.js";
import {
  type LevelUpChoice,
  type LevelUpFeatRow,
  type LevelUpFeatureRow,
  levelUpOfferFor,
  LevelUpOffer,
} from "./LevelUp.js";

/**
 * The offer's rules over a small invented class, for what the 2014 corpus
 * cannot show on its own: a prerequisite met by a pick the sheet already
 * holds, a held pick left out of the next offer, and a feat with two ways to
 * qualify. The offer over the real imported classes, through the endpoint, is
 * `apps/server/test/advancement-offer.test.ts`.
 */

const uuidOf = (seed: string): string => {
  const hex = [...seed].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16);
  return `${hex.padStart(8, "0")}-0000-4000-8000-000000000000`;
};
const featureId = (index: string) => uuidOf(`f-${index}`) as FeatureId;

const feature = (
  index: string,
  name: string,
  level: number,
  body: Partial<LevelUpFeatureRow["body"]> = {},
  parent?: string,
): LevelUpFeatureRow => ({
  id: featureId(index),
  index,
  name,
  level,
  subclassId: null,
  parentFeatureId: parent === undefined ? null : featureId(parent),
  body: { desc: [`${name}.`], prerequisites: [], ...body },
});

const FEATURES: ReadonlyArray<LevelUpFeatureRow> = [
  feature("blade-pact", "Blade Pact", 1),
  feature("pact-gifts", "Pact Gifts", 2, {
    featureSpecific: {
      invocations: [
        { index: "gift-of-ease", name: "Gift of Ease" },
        { index: "gift-of-steel", name: "Gift of Steel" },
        { index: "gift-of-years", name: "Gift of Years" },
      ],
    },
  }),
  feature("gift-of-ease", "Gift of Ease", 2, {}, "pact-gifts"),
  feature(
    "gift-of-steel",
    "Gift of Steel",
    2,
    { prerequisites: [{ type: "feature", feature: "/api/2014/features/blade-pact" }] },
    "pact-gifts",
  ),
  feature(
    "gift-of-years",
    "Gift of Years",
    3,
    { prerequisites: [{ type: "level", level: 3 }] },
    "pact-gifts",
  ),
  feature("hexblade-ability-score-improvement-1", "Ability Score Improvement", 3),
];

const ref = (row: LevelUpFeatureRow) => ({ id: row.id, index: row.index, name: row.name });
const at = (index: string) => FEATURES.find((row) => row.index === index)!;

const HEXBLADE: ClassOption = Schema.decodeUnknownSync(ClassOption)({
  id: uuidOf("hexblade"),
  campaignId: null,
  accountId: null,
  derivedFrom: null,
  visibility: "shared",
  origin: "system",
  assistantTurnId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  kind: "class",
  name: "Hexblade",
  body: { hitDie: 8, unarmouredAc: ["DEX"] },
  details: {
    subraces: [],
    abilityBonuses: [],
    languages: [],
    proficiencies: [],
    traits: [],
    choices: [],
    levelOneFeatures: [{ ...ref(at("blade-pact")), desc: ["Blade Pact."] }],
    proficiencyBonus: 2,
    classLevels: [
      { level: 1, proficiencyBonus: 2, features: [ref(at("blade-pact"))] },
      {
        level: 2,
        proficiencyBonus: 2,
        classSpecific: { invocations_known: 2 },
        features: [ref(at("pact-gifts"))],
      },
      {
        level: 3,
        proficiencyBonus: 2,
        classSpecific: { invocations_known: 3 },
        features: [ref(at("hexblade-ability-score-improvement-1"))],
      },
    ],
  },
});

const cells = (scores: Record<string, number>): ReadonlyArray<Ability> =>
  Object.entries(scores).map(([label, score]) => ({
    label,
    score: String(score),
    modifier: String(Math.floor((score - 10) / 2)),
  }));

const ABILITIES = cells({ STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 15 });

const blade = {
  name: "Blade Pact",
  text: "Blade Pact.",
  featureId: featureId("blade-pact"),
  derived: true,
};

const feat = (
  name: string,
  prerequisites: LevelUpFeatRow["prerequisites"] = [],
): LevelUpFeatRow => ({
  id: uuidOf(`feat-${name}`) as FeatId,
  name,
  description: [],
  prerequisites,
});

const FEATS = [
  feat("Strong Arm", [{ groupOrdinal: 0, ability: "STR", minimumScore: 13 }]),
  feat("Quick or Strong", [
    { groupOrdinal: 0, ability: "STR", minimumScore: 15 },
    { groupOrdinal: 1, ability: "DEX", minimumScore: 13 },
  ]),
  feat("Lantern Ward"),
];

const offerAt = (level: number, body: SheetBody) =>
  levelUpOfferFor({
    character: {
      id: uuidOf("character") as CharacterId,
      version: 4,
      level,
      className: "Hexblade",
      subrace: null,
      body,
    },
    classOption: HEXBLADE,
    features: FEATURES,
    subclasses: [],
    subclassSpells: [],
    feats: FEATS,
  });

const invocations = (choices: ReadonlyArray<LevelUpChoice>) => {
  const choice = choices.find((entry) => entry.offeredBy.name === "Pact Gifts");
  return choice?.kind === "feature" ? choice : undefined;
};

describe("levelUpOfferFor", () => {
  it("counts new invocations off the class table and reads each prerequisite off the sheet", () => {
    const offer = offerAt(1, { abilities: ABILITIES, traits: [blade] });
    expect(Schema.decodeUnknownSync(LevelUpOffer)(offer)).toEqual(offer);
    const choice = invocations(offer.choices);
    expect(choice?.choose).toBe(2);
    expect(choice?.options.map((option) => [option.name, option.available])).toEqual([
      ["Gift of Ease", true],
      // The pact the sheet holds meets it.
      ["Gift of Steel", true],
      ["Gift of Years", false],
    ]);
    expect(choice?.options[2]?.prerequisites).toEqual([{ type: "level", level: 3, met: false }]);
  });

  it("leaves out what the sheet holds and offers the ASI with the feats it qualifies for", () => {
    const offer = offerAt(2, {
      abilities: ABILITIES,
      traits: [
        blade,
        {
          name: "Gift of Ease",
          text: "",
          featureId: featureId("gift-of-ease"),
          derived: true,
          pick: { offeredBy: featureId("pact-gifts") },
        },
        // A typed line that shares a feat's name stands for having it.
        { name: "Lantern Ward", text: "" },
      ],
    });
    const choice = invocations(offer.choices);
    expect(choice?.choose).toBe(1);
    expect(choice?.options.map((option) => [option.name, option.available])).toEqual([
      ["Gift of Steel", true],
      ["Gift of Years", true],
    ]);
    expect(offer.abilityScoreImprovement).toMatchObject({
      offeredBy: { name: "Ability Score Improvement" },
      points: 2,
      maximum: 20,
    });
    // STR 10 misses both STR minimums, DEX 14 meets the second group of one.
    expect(offer.abilityScoreImprovement?.feats?.map((entry) => entry.name)).toEqual([
      "Quick or Strong",
    ]);
  });

  it("offers nothing for a class that resolves to nothing", () => {
    const offer = levelUpOfferFor({
      character: {
        id: uuidOf("character") as CharacterId,
        version: 1,
        level: 3,
        className: "Wanderer",
        subrace: null,
        body: { abilities: ABILITIES, traits: [] },
      },
      features: [],
      subclasses: [],
      subclassSpells: [],
      feats: FEATS,
    });
    expect(offer).toEqual({
      characterId: uuidOf("character"),
      version: 1,
      className: "Wanderer",
      fromLevel: 3,
      toLevel: 4,
      automatic: { features: [], resources: [], subclassSpells: [] },
      choices: [],
    });
  });
});
