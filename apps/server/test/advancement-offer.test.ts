import { describe, expect } from "@effect/vitest";
import {
  type Ability,
  asBackgroundOption,
  asClassOption,
  asRaceOption,
  type Character,
  type CharacterOption,
  type LevelUpChoice,
  type LevelUpOffer,
  optionNamed,
  type SheetBody,
  startingSheetBody,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { importSystemFeats, importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { admittedTo, aPerson, campaignVia, type Person } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **What the next level offers** — `GET /me/characters/:id/level-up`, over the
 * real application and the imported 2014 corpus, through the client derived
 * from the contract.
 *
 * Each character is composed the way the create form composes one
 * (`startingSheetBody` over the core options) at the level it starts from, and
 * created through `POST /me/characters`. The offer is read for the owner; a
 * stranger is refused with the ordinary `NotFound`. Unseated, a character's
 * offer is the core rules'; seated, it is its table's, so a feat shared to the
 * table's Shared World is offered.
 */

const database = migratedDatabase("taverns_test_advancement_offer");
const services = servicesOver(database);

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(services),
  Layer.provideMerge(database),
);

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });
type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(Effect.orDie);

/** The same call, answering the failure's tag rather than dying on it. */
const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
    ),
  ).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment().pipe(Effect.orDie);
  yield* importSystemOptions().pipe(Effect.orDie);
  yield* importSystemFeats().pipe(Effect.orDie);
  yield* importSystemSpells().pipe(Effect.orDie);
  const owner = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const options = yield* as(owner.token, (client) => client.library.coreOptions({ query: {} }));
  return { owner, stranger, options };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "advancement-offer.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

/** Six scores laid in the order the cells are drawn: STR, DEX, CON, INT, WIS, CHA. */
const cells = (scores: readonly [number, number, number, number, number, number]) =>
  (["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).map((label, index): Ability => {
    const score = scores[index]!;
    const modifier = Math.floor((score - 10) / 2);
    return {
      label,
      score: String(score),
      modifier: modifier < 0 ? String(modifier) : `+${String(modifier)}`,
    };
  });

interface Recipe {
  readonly name: string;
  readonly className: string;
  readonly race: string;
  readonly subrace?: string;
  readonly subclass?: string;
  readonly level: number;
  readonly scores: readonly [number, number, number, number, number, number];
  /** What the player did to the composed sheet after creation: skills, picks, known spells. */
  readonly then?: (body: SheetBody) => SheetBody;
}

/** A character of the core rules, composed at its level the way the create form composes one. */
const aCoreCharacter = (
  person: Person,
  options: ReadonlyArray<CharacterOption>,
  recipe: Recipe,
) => {
  const composed = startingSheetBody({
    classOption: asClassOption(optionNamed(options, "class", recipe.className)),
    raceOption: asRaceOption(optionNamed(options, "race", recipe.race)),
    subrace: recipe.subrace,
    backgroundOption: asBackgroundOption(optionNamed(options, "background", "Acolyte")),
    background: "Acolyte",
    subclass: recipe.subclass,
    abilities: cells(recipe.scores),
    level: recipe.level,
  });
  const body = recipe.then === undefined ? composed.body : recipe.then(composed.body);
  return as(person.token, (client) =>
    client.me.createCoreCharacter({
      payload: {
        name: recipe.name,
        race: recipe.race,
        ...(recipe.subrace === undefined ? {} : { subrace: recipe.subrace }),
        className: recipe.className,
        level: recipe.level,
        ac: composed.seed.ac,
        ...(composed.seed.hpMax === undefined ? {} : { hpMax: composed.seed.hpMax }),
        sheet: { notes: "", ...body },
      },
    }),
  );
};

const offerOf = (person: Person, character: Character) =>
  as(person.token, (client) => client.me.levelUpOffer({ params: { characterId: character.id } }));

/** The one choice a feature of this name offers. */
const choiceBy = (offer: LevelUpOffer, name: string): LevelUpChoice => {
  const found = offer.choices.filter((choice) => choice.offeredBy.name === name);
  expect(found, `one choice offered by ${name}`).toHaveLength(1);
  return found[0]!;
};

const FIGHTER = [15, 14, 13, 10, 12, 8] as const;

describeLayer(
  "advancement-offer",
  shared,
  (it) => {
    describe("the fighter", () => {
      it.effect("at 1 → 2 offers Action Surge and its hit points, and nothing to choose", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Brannoc",
            className: "Fighter",
            race: "Dwarf",
            subrace: "Hill Dwarf",
            level: 1,
            scores: FIGHTER,
          });
          const offer = yield* offerOf(owner, fighter);

          expect(offer).toMatchObject({
            characterId: fighter.id,
            version: fighter.version,
            className: "Fighter",
            fromLevel: 1,
            toLevel: 2,
          });
          // CON 13 + the dwarf's 2 is +2, and a Hill Dwarf adds 1 a level: a d10's 6 + 3.
          expect(offer.hitPoints).toEqual({
            die: 10,
            bonus: 3,
            fixed: 9,
            rolled: { minimum: 4, maximum: 13 },
          });
          expect(offer.automatic.features.map((feature) => feature.name)).toEqual([
            "Action Surge (1 use)",
          ]);
          expect(offer.automatic.features[0]!.desc.length).toBeGreaterThan(0);
          expect(offer.automatic.resources).toContainEqual(
            expect.objectContaining({ id: "res:action-surge", to: 1 }),
          );
          expect(offer.automatic.resources).toContainEqual(
            expect.objectContaining({ id: "hit-dice", from: 1, to: 2, unit: "d10" }),
          );
          expect(offer.automatic.proficiencyBonus).toBeUndefined();
          expect(offer.choices).toEqual([]);
          expect(offer.subclass).toBeUndefined();
          expect(offer.abilityScoreImprovement).toBeUndefined();
          expect(offer.spells).toBeUndefined();
        }),
      );

      it.effect("at 2 → 3 offers the subclass, with what it brings now", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Corra",
            className: "Fighter",
            race: "Human",
            level: 2,
            scores: FIGHTER,
          });
          const offer = yield* offerOf(owner, fighter);

          expect(offer.automatic.features.map((feature) => feature.name)).toEqual([
            "Martial Archetype",
          ]);
          expect(offer.subclass?.level).toBe(3);
          expect(offer.subclass?.current).toBeUndefined();
          expect(offer.subclass?.options.map((option) => option.name)).toEqual(["Champion"]);
          const champion = offer.subclass!.options[0]!;
          expect(champion.features.map((feature) => feature.name)).toEqual(["Improved Critical"]);
          expect(champion.choices).toEqual([]);
          expect(offer.choices).toEqual([]);
          expect(offer.abilityScoreImprovement).toBeUndefined();
        }),
      );

      it.effect("at 3 → 4 offers the ASI, and Grappler only to a fighter strong enough", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const strong = yield* aCoreCharacter(owner, options, {
            name: "Dagny",
            className: "Fighter",
            race: "Human",
            subclass: "Champion",
            level: 3,
            scores: FIGHTER,
          });
          const offer = yield* offerOf(owner, strong);
          expect(offer.subclass).toBeUndefined();
          expect(offer.choices).toEqual([]);
          expect(offer.abilityScoreImprovement).toMatchObject({
            offeredBy: { name: "Ability Score Improvement" },
            points: 2,
            maximum: 20,
          });
          expect(offer.abilityScoreImprovement?.feats?.map((feat) => feat.name)).toEqual([
            "Grappler",
          ]);
          expect(offer.abilityScoreImprovement?.feats?.[0]?.prerequisites).toEqual([
            { ability: "STR", minimum: 13 },
          ]);

          // STR 8 (the human's +1 makes 9): Grappler's STR 13 is not met, and
          // the core rules have no other feat, so the ASI stands alone.
          const weak = yield* aCoreCharacter(owner, options, {
            name: "Edda",
            className: "Fighter",
            race: "Human",
            subclass: "Champion",
            level: 3,
            scores: [8, 15, 14, 10, 12, 13],
          });
          const weaker = yield* offerOf(owner, weak);
          expect(weaker.abilityScoreImprovement).toBeDefined();
          expect(weaker.abilityScoreImprovement?.feats).toBeUndefined();
        }),
      );
    });

    it.effect("the sorcerer at 2 → 3 offers two of the eight metamagic options", () =>
      Effect.gen(function* () {
        const { owner, options } = yield* Fixture;
        const sorcerer = yield* aCoreCharacter(owner, options, {
          name: "Fenna",
          className: "Sorcerer",
          race: "Human",
          subclass: "Draconic",
          level: 2,
          scores: [8, 14, 13, 10, 12, 15],
        });
        const offer = yield* offerOf(owner, sorcerer);
        const metamagic = choiceBy(offer, "Metamagic");
        expect(metamagic.kind).toBe("feature");
        expect(metamagic.choose).toBe(2);
        if (metamagic.kind !== "feature") return;
        // Seven of the eight: the 2014 source gives *Twinned Spell* no parent,
        // so level 3 grants it outright and it is not a choice.
        expect(metamagic.options).toHaveLength(7);
        expect(metamagic.options.every((option) => option.available)).toBe(true);
        expect(metamagic.options.map((option) => option.name)).toContain(
          "Metamagic: Quickened Spell",
        );
        expect(metamagic.options.map((option) => option.name)).not.toContain(
          "Metamagic: Twinned Spell",
        );
        expect(offer.automatic.features.map((feature) => feature.name)).toContain(
          "Metamagic: Twinned Spell",
        );

        expect(offer.spells).toMatchObject({
          mode: "known",
          highestSlotLevel: { from: 1, to: 2 },
          spells: 1,
          replace: true,
        });
        expect(offer.spells?.options.some((option) => option.level === 2)).toBe(true);
      }),
    );

    it.effect(
      "the warlock at 1 → 2 offers two invocations, Thirsting Blade disabled with its reasons",
      () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const warlock = yield* aCoreCharacter(owner, options, {
            name: "Gisla",
            className: "Warlock",
            race: "Tiefling",
            subclass: "Fiend",
            level: 1,
            scores: [8, 14, 13, 10, 12, 15],
            then: (body) => ({
              ...body,
              spellcasting: {
                ...body.spellcasting,
                known: [{ name: "Eldritch Blast", level: 0 }],
              },
            }),
          });
          const offer = yield* offerOf(owner, warlock);
          const invocations = choiceBy(offer, "Eldritch Invocations");
          expect(invocations.choose).toBe(2);
          if (invocations.kind !== "feature") return;
          expect(invocations.options.length).toBeGreaterThan(8);

          const thirsting = invocations.options.find(
            (option) => option.name === "Eldritch Invocation: Thirsting Blade",
          );
          expect(thirsting).toMatchObject({
            available: false,
            prerequisites: [
              { type: "level", level: 5, met: false },
              {
                type: "feature",
                index: "pact-of-the-blade",
                name: "Pact of the Blade",
                met: false,
              },
            ],
          });
          // A spell prerequisite reads the known list.
          const agonizing = invocations.options.find(
            (option) => option.name === "Eldritch Invocation: Agonizing Blast",
          );
          expect(agonizing).toMatchObject({
            available: true,
            prerequisites: [{ type: "spell", index: "eldritch-blast", met: true }],
          });
          const beastSpeech = invocations.options.find(
            (option) => option.name === "Eldritch Invocation: Beast Speech",
          );
          expect(beastSpeech).toMatchObject({ available: true, prerequisites: [] });
        }),
    );

    it.effect("the rogue at 5 → 6 offers expertise in what it is proficient in", () =>
      Effect.gen(function* () {
        const { owner, options } = yield* Fixture;
        const rogue = yield* aCoreCharacter(owner, options, {
          name: "Hild",
          className: "Rogue",
          race: "Human",
          subclass: "Thief",
          level: 5,
          scores: [8, 15, 14, 12, 13, 10],
          then: (body) => ({
            ...body,
            skills: [
              { name: "Stealth", ability: "DEX", proficient: true, expertise: true },
              { name: "Acrobatics", ability: "DEX", proficient: true },
              { name: "Perception", ability: "WIS", proficient: true },
              { name: "Arcana", ability: "INT" },
            ],
          }),
        });
        const offer = yield* offerOf(owner, rogue);
        const expertise = choiceBy(offer, "Expertise");
        expect(expertise.kind).toBe("expertise");
        expect(expertise.choose).toBe(2);
        // Not Arcana (not proficient) and not Stealth (already expert). The
        // proficiency list counts where no skill row says otherwise: the
        // Acolyte's Insight and Religion, and the rogue's thieves' tools.
        expect([...expertise.options].sort()).toEqual(
          ["Acrobatics", "Insight", "Perception", "Religion", "Thieves' Tools"].sort(),
        );
      }),
    );

    it.effect("the ranger at 5 → 6 offers a favored enemy and a favored terrain", () =>
      Effect.gen(function* () {
        const { owner, options } = yield* Fixture;
        const ranger = yield* aCoreCharacter(owner, options, {
          name: "Ivar",
          className: "Ranger",
          race: "Human",
          subclass: "Hunter",
          level: 5,
          scores: [10, 15, 13, 8, 14, 12],
        });
        const offer = yield* offerOf(owner, ranger);
        const enemy = choiceBy(offer, "Favored Enemy (2 types)");
        expect(enemy).toMatchObject({ kind: "text", choose: 1, desc: "one enemy type" });
        expect(enemy.options).toHaveLength(14);
        expect(enemy.options).toContain("fiends");
        const terrain = choiceBy(offer, "Natural Explorer (2 terrain types)");
        expect(terrain).toMatchObject({ kind: "text", choose: 1 });
        expect(terrain.options).toEqual([
          "arctic",
          "coast",
          "desert",
          "forest",
          "grassland",
          "mountain",
          "swamp",
        ]);
      }),
    );

    it.effect("the bard at 9 → 10 offers Magical Secrets from any list, and expertise", () =>
      Effect.gen(function* () {
        const { owner, options } = yield* Fixture;
        const bard = yield* aCoreCharacter(owner, options, {
          name: "Jorun",
          className: "Bard",
          race: "Human",
          subclass: "Lore",
          level: 9,
          scores: [8, 14, 13, 10, 12, 15],
          then: (body) => ({
            ...body,
            skills: [{ name: "Performance", ability: "CHA", proficient: true }],
          }),
        });
        const offer = yield* offerOf(owner, bard);
        const secrets = offer.spells?.magicalSecrets;
        expect(secrets).toMatchObject({ count: 2, maximumLevel: 5 });
        // The column's 12 → 14 is the two Magical Secrets, not two more.
        expect(offer.spells?.spells).toBe(0);
        const fireball = secrets?.options.find((option) => option.name === "Fireball");
        expect(fireball).toMatchObject({ level: 3, list: "any" });
        expect(secrets?.options.every((option) => option.level <= 5)).toBe(true);
        // Performance from the skill row; Insight and Religion from the Acolyte.
        const expertise = choiceBy(offer, "Expertise");
        expect(expertise).toMatchObject({ kind: "expertise", choose: 2 });
        expect([...expertise.options].sort()).toEqual(["Insight", "Performance", "Religion"]);
      }),
    );

    describe("the subclass", () => {
      it.effect("is offered with the choices its features ask for: the Land druid's terrain", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const druid = yield* aCoreCharacter(owner, options, {
            name: "Liv",
            className: "Druid",
            race: "Human",
            level: 1,
            scores: [8, 14, 13, 12, 15, 10],
          });
          const offer = yield* offerOf(owner, druid);
          expect(offer.subclass?.level).toBe(2);
          const land = offer.subclass?.options.find((option) => option.name === "Land");
          expect(land?.features.map((feature) => feature.name).sort()).toEqual(
            ["Bonus Cantrip", "Circle of the Land", "Natural Recovery"].sort(),
          );
          const terrain = land?.choices.find(
            (choice) => choice.offeredBy.name === "Circle of the Land",
          );
          expect(terrain).toMatchObject({ kind: "feature", choose: 1 });
          expect(terrain?.options).toHaveLength(7);
          // Its circle spells start at druid 3, each behind its terrain.
          expect(land?.spells).toEqual([]);
        }),
      );

      it.effect("brings the spells it grants at the level it is taken: the Oath of Devotion", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const paladin = yield* aCoreCharacter(owner, options, {
            name: "Maren",
            className: "Paladin",
            race: "Human",
            level: 2,
            scores: [15, 10, 13, 8, 12, 14],
          });
          const offer = yield* offerOf(owner, paladin);
          const devotion = offer.subclass?.options.find((option) => option.name === "Devotion");
          expect(devotion?.spells.map((spell) => spell.name).sort()).toEqual(
            ["Protection from Evil and Good", "Sanctuary"].sort(),
          );
          expect(offer.spells).toMatchObject({ mode: "prepared", spells: 0, replace: false });
        }),
      );

      it.effect(
        "once named, brings its spells and features automatically: the Life cleric at 3",
        () =>
          Effect.gen(function* () {
            const { owner, options } = yield* Fixture;
            const cleric = yield* aCoreCharacter(owner, options, {
              name: "Nanna",
              className: "Cleric",
              race: "Human",
              subclass: "Life",
              level: 2,
              scores: [13, 8, 14, 10, 15, 12],
            });
            const offer = yield* offerOf(owner, cleric);
            expect(offer.subclass).toBeUndefined();
            expect(offer.automatic.subclassSpells.map((spell) => spell.name).sort()).toEqual(
              ["Lesser Restoration", "Spiritual Weapon"].sort(),
            );
            expect(offer.spells?.highestSlotLevel).toEqual({ from: 1, to: 2 });
            // Cleric level + WIS (15, and the human's 1: +3).
            expect(offer.spells?.prepared).toEqual({ from: 5, to: 6 });
          }),
      );
    });

    describe("whose vocabulary", () => {
      it.effect("is another account's character to nobody but its owner", () =>
        Effect.gen(function* () {
          const { owner, stranger, options } = yield* Fixture;
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Kari",
            className: "Fighter",
            race: "Human",
            level: 1,
            scores: FIGHTER,
          });
          expect(
            yield* refusal(stranger.token, (client) =>
              client.me.levelUpOffer({ params: { characterId: fighter.id } }),
            ),
          ).toBe("NotFound");
        }),
      );

      it.effect(
        "is the core rules unseated, and its table's once seated: a shared Library feat is offered",
        () =>
          Effect.gen(function* () {
            const { owner, options } = yield* Fixture;
            const dm = yield* aPerson("Wen");
            const campaign = yield* as(dm.token, (client) =>
              campaignVia(client, { name: "The Fen Lights", visibility: "shared" }),
            );
            yield* admittedTo(campaign.id, owner.actor, "Ilse");
            const stride = yield* as(dm.token, (client) =>
              client.library.createFeat({
                payload: {
                  name: "Marsh Stride",
                  description: ["You cross bog as if it were road."],
                },
              }),
            );
            yield* as(dm.token, (client) =>
              client.sharedWorldLibrary.share({
                params: { worldId: campaign.contextId },
                payload: { kind: "feat", resourceId: stride.id },
              }),
            );
            // The DM's own Library feat, never shared, stays theirs.
            yield* as(dm.token, (client) =>
              client.library.createFeat({ payload: { name: "Lantern Ward" } }),
            );

            const fighter = yield* aCoreCharacter(owner, options, {
              name: "Lene",
              className: "Fighter",
              race: "Human",
              subclass: "Champion",
              level: 3,
              scores: FIGHTER,
            });
            const featNames = (offer: LevelUpOffer) =>
              (offer.abilityScoreImprovement?.feats ?? []).map((feat) => feat.name);
            expect(featNames(yield* offerOf(owner, fighter))).toEqual(["Grappler"]);

            yield* as(owner.token, (client) =>
              client.party.join({
                params: { campaignId: campaign.id },
                payload: { characterId: fighter.id },
              }),
            );
            expect(featNames(yield* offerOf(owner, fighter))).toEqual(["Grappler", "Marsh Stride"]);
          }),
      );

      it.effect("offers a homebrew class with no progression rows its hit points and no more", () =>
        Effect.gen(function* () {
          const { owner } = yield* Fixture;
          const dm = yield* aPerson("Ottar");
          const campaign = yield* as(dm.token, (client) =>
            campaignVia(client, { name: "The Reed Halls", visibility: "shared" }),
          );
          yield* admittedTo(campaign.id, owner.actor, "Ilse");
          yield* as(owner.token, (client) =>
            client.library.createOption({
              payload: {
                kind: "class",
                name: "Spellsword",
                body: { hitDie: 8, unarmouredAc: ["DEX"] },
              },
            }),
          );
          const made = yield* as(owner.token, (client) =>
            client.me.createCoreCharacter({
              payload: {
                name: "Runa",
                className: "Spellsword",
                level: 2,
                sheet: { notes: "", abilities: cells([10, 14, 12, 13, 10, 8]), traits: [] },
              },
            }),
          );

          // Unseated, the core rules do not have the owner's own class: nothing resolves.
          const unseated = yield* offerOf(owner, made);
          expect(unseated).toEqual({
            characterId: made.id,
            version: made.version,
            className: "Spellsword",
            fromLevel: 2,
            toLevel: 3,
            automatic: { features: [], resources: [], subclassSpells: [] },
            choices: [],
          });

          // Seated, the owner's Library is in the table's vocabulary: the class
          // resolves, and with no table of its own it offers only the die.
          yield* as(owner.token, (client) =>
            client.party.join({
              params: { campaignId: campaign.id },
              payload: { characterId: made.id },
            }),
          );
          const seated = yield* offerOf(owner, made);
          expect(seated.hitPoints).toEqual({
            die: 8,
            bonus: 1,
            fixed: 6,
            rolled: { minimum: 2, maximum: 9 },
          });
          expect(seated.automatic).toEqual({
            features: [],
            resources: [{ id: "hit-dice", name: "Hit dice", from: 2, to: 3, unit: "d8" }],
            subclassSpells: [],
          });
          expect(seated.choices).toEqual([]);
          expect(seated.subclass).toBeUndefined();
          expect(seated.abilityScoreImprovement).toBeUndefined();
          expect(seated.spells).toBeUndefined();
        }),
      );

      it.effect("has no level past the highest a sheet holds", () =>
        Effect.gen(function* () {
          const { owner } = yield* Fixture;
          const made = yield* as(owner.token, (client) =>
            client.me.createCoreCharacter({
              payload: {
                name: "Sigrid",
                className: "Wanderer",
                level: 100,
                sheet: { notes: "", abilities: [], traits: [] },
              },
            }),
          );
          expect(
            yield* refusal(owner.token, (client) =>
              client.me.levelUpOffer({ params: { characterId: made.id } }),
            ),
          ).toBe("Conflict");
        }),
      );
    });
  },
  { timeout: "120 seconds" },
);
