import { Result } from "effect";
import { describe, expect, it } from "vitest";
import { type LevelUpPayload, levelUpChosen, levelUpHitPointGain } from "./Advancement.js";
import type { SheetBody } from "./Character.js";
import type { Ability } from "./Creature.js";
import type { CharacterId, FeatId, FeatureId, SpellId, SubclassId } from "./Ids.js";
import type { LevelUpOffer } from "./LevelUp.js";

/**
 * The level-up write's rule over hand-made offers: what it refuses, and what
 * it does to the sheet before the level's recompute. The write over the real
 * imported classes, through the endpoint, is
 * `apps/server/test/character-level-up.test.ts`.
 */

const uuidOf = (seed: string): string => {
  const hex = [...seed].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7).toString(16);
  return `${hex.padStart(8, "0")}-0000-4000-8000-000000000000`;
};
const featureId = (seed: string) => uuidOf(`f-${seed}`) as FeatureId;
const spellId = (seed: string) => uuidOf(`s-${seed}`) as SpellId;

const cells = (scores: Record<string, number>, typed: Record<string, string> = {}) =>
  Object.entries(scores).map(([label, score]): Ability => ({
    label,
    score: String(score),
    modifier:
      typed[label] ??
      (Math.floor((score - 10) / 2) < 0
        ? String(Math.floor((score - 10) / 2))
        : `+${String(Math.floor((score - 10) / 2))}`),
  }));

const STYLE = { featureId: featureId("style"), name: "Fighting Style" };
const ENEMY = { featureId: featureId("enemy"), name: "Favored Enemy (2 types)" };
const EXPERTISE = { featureId: featureId("expertise"), name: "Expertise" };
const ASI = { featureId: featureId("asi"), name: "Ability Score Improvement" };
const GRAPPLER = uuidOf("grappler") as FeatId;

const option = (name: string, available = true) => ({
  featureId: featureId(name),
  name,
  desc: [`${name}.`],
  prerequisites: [],
  available,
});

const spell = (name: string, level: number, list: "class" | "subclass" | "any" = "class") => ({
  spellId: spellId(name),
  name,
  level,
  school: "Evocation",
  list,
});

/** A level 3 → 4 offer that asks for one of everything. */
const OFFER: LevelUpOffer = {
  characterId: uuidOf("character") as CharacterId,
  version: 7,
  className: "Wayfarer",
  fromLevel: 3,
  toLevel: 4,
  hitPoints: { die: 8, bonus: 1, fixed: 6, rolled: { minimum: 2, maximum: 9 } },
  automatic: { features: [], resources: [], subclassSpells: [] },
  subclass: {
    level: 4,
    options: [
      {
        subclassId: uuidOf("road") as SubclassId,
        name: "Road",
        flavor: null,
        desc: [],
        features: [],
        choices: [],
        spells: [],
      },
    ],
  },
  choices: [
    {
      kind: "feature",
      offeredBy: STYLE,
      choose: 1,
      options: [option("Fighting Style: Archery"), option("Fighting Style: Dueling", false)],
    },
    {
      kind: "text",
      offeredBy: ENEMY,
      choose: 1,
      options: ["fiends", "undead"],
    },
    {
      kind: "expertise",
      offeredBy: EXPERTISE,
      choose: 2,
      options: ["Stealth", "Insight", "Thieves' Tools"],
    },
  ],
  abilityScoreImprovement: {
    offeredBy: ASI,
    points: 2,
    maximum: 20,
    feats: [{ featId: GRAPPLER, name: "Grappler", description: ["Hold on."], prerequisites: [] }],
  },
  spells: {
    mode: "known",
    highestSlotLevel: { from: 2, to: 2 },
    cantrips: 1,
    spells: 1,
    replace: true,
    options: [spell("Light", 0), spell("Shatter", 2), spell("Sleep", 1)],
    magicalSecrets: { count: 1, maximumLevel: 2, options: [spell("Cure Wounds", 1, "any")] },
    mysticArcanum: { level: 6, options: [spell("Eyebite", 6)] },
  },
};

const BODY: SheetBody = {
  abilities: cells({ STR: 15, DEX: 16, CON: 13, INT: 10, WIS: 12, CHA: 8 }, { CHA: "+3" }),
  traits: [{ name: "Second Wind", text: "Breathe." }],
  skills: [{ name: "Stealth", ability: "DEX", proficient: true, bonus: "+5" }],
  proficiencies: ["Insight", "Thieves' Tools"],
  spellcasting: {
    ability: "CHA",
    known: [
      { name: "Mage Hand", level: 0, spellId: spellId("Mage Hand") },
      { name: "Thunderwave", level: 1, spellId: spellId("Thunderwave") },
    ],
  },
};

/** Every choice the offer asks for, answered, before a test changes one. */
const COMPLETE: LevelUpPayload = {
  expectedVersion: 7,
  toLevel: 4,
  subclass: { subclassId: uuidOf("road") as SubclassId },
  picks: [
    { offeredBy: STYLE.featureId, featureId: featureId("Fighting Style: Archery") },
    { offeredBy: ENEMY.featureId, value: "Fiends" },
    { offeredBy: EXPERTISE.featureId, value: "stealth" },
    { offeredBy: EXPERTISE.featureId, value: "Insight" },
  ],
  abilityScoreImprovement: {
    increases: [
      { ability: "CON", amount: 1 },
      { ability: "STR", amount: 1 },
    ],
  },
};

const chosen = (payload: LevelUpPayload, offer: LevelUpOffer = OFFER, body = BODY) => {
  const result = levelUpChosen(offer, body, payload);
  if (Result.isFailure(result)) throw new Error(result.failure.join(" "));
  return result.success;
};

const refused = (payload: LevelUpPayload, offer: LevelUpOffer = OFFER) => {
  const result = levelUpChosen(offer, BODY, payload);
  return Result.isFailure(result) ? result.failure : [];
};

describe("levelUpChosen", () => {
  it("refuses a payload the offer does not allow, with every reason at once", () => {
    expect(
      refused({
        expectedVersion: 7,
        toLevel: 5,
        picks: [
          { offeredBy: STYLE.featureId, featureId: featureId("Fighting Style: Dueling") },
          { offeredBy: ENEMY.featureId, value: "dragons" },
          { offeredBy: featureId("nowhere"), value: "anything" },
          { offeredBy: EXPERTISE.featureId, value: "Stealth" },
          { offeredBy: EXPERTISE.featureId, value: "STEALTH" },
        ],
        abilityScoreImprovement: {
          increases: [
            { ability: "DEX", amount: 2 },
            { ability: "WIS", amount: 1 },
          ],
        },
        spells: {
          cantrips: [spellId("Light"), spellId("Shatter")],
          learned: [spellId("Fireball")],
          replace: { from: spellId("Mage Hand"), to: spellId("Sleep") },
        },
      }),
    ).toEqual([
      "This character is level 3, so a level-up reaches 4, not 5.",
      "Choose a subclass: it is taken at level 4.",
      '"anything" answers a choice this level does not offer.',
      "Fighting Style: Dueling is not available yet: its prerequisites are not met.",
      'Favored Enemy (2 types) does not offer "dragons".',
      '"Stealth" is chosen twice.',
      "An Ability Score Improvement is 2 points; 3 were given.",
      "This level lets the character learn 1 cantrips; 2 were chosen.",
      "A chosen spell is not one this level offers as cantrips.",
      "A chosen spell is not one this level offers as spells.",
      "The spell to give up is not a class spell this character knows.",
    ]);
  });

  it("holds every choice to its count, and every score to the maximum", () => {
    expect(
      refused({
        ...COMPLETE,
        picks: COMPLETE.picks!.filter((pick) => pick.offeredBy !== EXPERTISE.featureId),
        abilityScoreImprovement: { increases: [{ ability: "DEX", amount: 2 }] },
      }),
    ).toEqual(["Expertise asks for 2 choices; 0 were made."]);
    const strong = { ...BODY, abilities: cells({ STR: 19 }) };
    const result = levelUpChosen(OFFER, strong, {
      ...COMPLETE,
      abilityScoreImprovement: { increases: [{ ability: "STR", amount: 2 }] },
    });
    expect(Result.isFailure(result) && result.failure).toEqual([
      "STR would be 21; no score goes above 20.",
    ]);
    expect(
      refused({ ...COMPLETE, abilityScoreImprovement: { featId: uuidOf("other") as FeatId } }),
    ).toEqual([
      "That feat is not offered: its prerequisites are not met, or this character's rules do not have it.",
    ]);
  });

  it("refuses what a level without it does not offer", () => {
    const bare: LevelUpOffer = {
      ...OFFER,
      choices: [],
      subclass: undefined,
      abilityScoreImprovement: undefined,
      spells: undefined,
    } as LevelUpOffer;
    expect(refused({ ...COMPLETE, picks: [] }, bare)).toEqual([
      "No subclass is taken at this level.",
      "This level has no Ability Score Improvement.",
    ]);
    expect(
      refused({ expectedVersion: 7, toLevel: 4, spells: { learned: [spellId("Sleep")] } }, bare),
    ).toEqual(["This level brings no spells to learn."]);
  });

  it("writes each pick as a line marked with what offered it, and expertise on its skill", () => {
    const { body, choices, applied } = chosen(COMPLETE);
    expect(body.identity?.subclass).toBe("Road");
    expect(body.traits).toEqual([
      { name: "Second Wind", text: "Breathe." },
      {
        name: "Fighting Style: Archery",
        text: "Fighting Style: Archery.",
        featureId: featureId("Fighting Style: Archery"),
        derived: true,
        pick: { offeredBy: STYLE.featureId },
      },
      // The source's own word, under the feature's name without its count.
      {
        name: "Favored Enemy: fiends",
        text: "",
        derived: true,
        pick: { offeredBy: ENEMY.featureId },
      },
    ]);
    // Stealth's row is marked; Insight, a proficiency with no row, gets one.
    expect(body.skills).toEqual([
      { name: "Stealth", ability: "DEX", proficient: true, bonus: "+5", expertise: true },
      { name: "Insight", ability: "WIS", proficient: true, expertise: true },
    ]);
    expect(choices.picks.map((pick) => [pick.kind, pick.name])).toEqual([
      ["feature", "Fighting Style: Archery"],
      ["text", "fiends"],
      ["expertise", "Stealth"],
      ["expertise", "Insight"],
    ]);
    expect(applied).toMatchObject({
      subclass: { to: "Road" },
      traits: ["Fighting Style: Archery", "Favored Enemy: fiends"],
      expertise: [
        { skill: "Stealth", added: false },
        { skill: "Insight", added: true },
      ],
    });
  });

  it("puts expertise in a tool on the sheet as a line, there being no row for it", () => {
    const { body } = chosen({
      ...COMPLETE,
      picks: [
        ...COMPLETE.picks!.filter((pick) => pick.offeredBy !== EXPERTISE.featureId),
        { offeredBy: EXPERTISE.featureId, value: "Thieves' Tools" },
        { offeredBy: EXPERTISE.featureId, value: "Stealth" },
      ],
    });
    expect(body.traits).toContainEqual({
      name: "Expertise: Thieves' Tools",
      text: "",
      derived: true,
      pick: { offeredBy: EXPERTISE.featureId },
    });
  });

  it("raises scores, moving a modifier only while it still states its score", () => {
    const { body, choices, constitution, applied } = chosen({
      ...COMPLETE,
      abilityScoreImprovement: {
        increases: [
          { ability: "CON", amount: 1 },
          { ability: "CHA", amount: 1 },
        ],
      },
    });
    expect(body.abilities.find((cell) => cell.label === "CON")).toEqual({
      label: "CON",
      score: "14",
      modifier: "+2",
    });
    // CHA 8 says +3: somebody typed it, so it stays typed.
    expect(body.abilities.find((cell) => cell.label === "CHA")).toEqual({
      label: "CHA",
      score: "9",
      modifier: "+3",
    });
    expect(choices.abilityScores).toEqual([
      { ability: "CON", from: 13, to: 14 },
      { ability: "CHA", from: 8, to: 9 },
    ]);
    expect(constitution).toEqual({ from: 1, to: 2 });
    expect(applied.abilities).toEqual([
      { label: "CON", score: { from: "13", to: "14" }, modifier: { from: "+1", to: "+2" } },
      { label: "CHA", score: { from: "8", to: "9" }, modifier: { from: "+3", to: "+3" } },
    ]);
  });

  it("takes a feat in place of the points, as a line the ASI offered", () => {
    const { body, choices } = chosen({
      ...COMPLETE,
      abilityScoreImprovement: { featId: GRAPPLER },
    });
    expect(choices.feat).toEqual({ featId: GRAPPLER, name: "Grappler" });
    expect(body.traits).toContainEqual({
      name: "Grappler",
      text: "Hold on.",
      featId: GRAPPLER,
      derived: true,
      pick: { offeredBy: ASI.featureId },
    });
    expect(body.abilities).toEqual(BODY.abilities);
  });

  it("learns spells, marking what reached past the list, and swaps one known", () => {
    const { body, choices, applied } = chosen({
      ...COMPLETE,
      spells: {
        cantrips: [spellId("Light")],
        learned: [spellId("Shatter")],
        replace: { from: spellId("Thunderwave"), to: spellId("Sleep") },
        magicalSecrets: [spellId("Cure Wounds")],
        mysticArcanum: spellId("Eyebite"),
      },
    });
    expect(body.spellcasting?.known).toEqual([
      { name: "Mage Hand", level: 0, spellId: spellId("Mage Hand") },
      { name: "Light", level: 0, spellId: spellId("Light") },
      { name: "Shatter", level: 2, spellId: spellId("Shatter") },
      {
        name: "Cure Wounds",
        level: 1,
        spellId: spellId("Cure Wounds"),
        learnedBy: "magicalSecrets",
      },
      { name: "Eyebite", level: 6, spellId: spellId("Eyebite"), learnedBy: "mysticArcanum" },
      { name: "Sleep", level: 1, spellId: spellId("Sleep") },
    ]);
    expect(choices.spells.map((entry) => [entry.kind, entry.name])).toEqual([
      ["cantrip", "Light"],
      ["learned", "Shatter"],
      ["magicalSecrets", "Cure Wounds"],
      ["mysticArcanum", "Eyebite"],
    ]);
    expect(choices.replaced).toEqual({
      from: { spellId: spellId("Thunderwave"), name: "Thunderwave", level: 1 },
      to: { spellId: spellId("Sleep"), name: "Sleep", level: 1 },
    });
    expect(applied.knownRemoved).toEqual([
      { name: "Thunderwave", spellId: spellId("Thunderwave") },
    ]);
    expect(applied.knownAdded).toHaveLength(5);
  });

  it("keeps a subclass label typed before, and takes a new one typed now as a label", () => {
    const labelled: LevelUpOffer = {
      ...OFFER,
      subclass: { ...OFFER.subclass!, current: "Way of Rain" },
    };
    const { subclass: _subclass, ...rest } = COMPLETE;
    const rain = { ...BODY, identity: { subclass: "Way of Rain" } };
    expect(chosen(rest, labelled, rain).body.identity?.subclass).toBe("Way of Rain");
    expect(chosen(rest, labelled, rain).choices.subclass).toBeUndefined();
    const typed = chosen({ ...COMPLETE, subclass: { name: " Way of Ash " } });
    expect(typed.body.identity?.subclass).toBe("Way of Ash");
    expect(typed.choices.subclass).toEqual({ name: "Way of Ash" });
    // A typed name that is one of the offer's is that subclass.
    expect(chosen({ ...COMPLETE, subclass: { name: "road" } }).choices.subclass).toEqual({
      name: "Road",
      subclassId: uuidOf("road"),
    });
  });
});

describe("levelUpHitPointGain", () => {
  it("adds the die's part and the bonus, and carries a CON change back over every level", () => {
    const hitPoints = OFFER.hitPoints!;
    expect(levelUpHitPointGain(hitPoints, 5, { from: 1, to: 1 }, 4)).toBe(6);
    // CON +1 → +2 at level 4: one more for each of the four levels.
    expect(levelUpHitPointGain(hitPoints, 5, { from: 1, to: 2 }, 4)).toBe(10);
  });
});
