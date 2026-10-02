import { describe, expect } from "@effect/vitest";
import {
  type Ability,
  asBackgroundOption,
  asClassOption,
  asRaceOption,
  type Character,
  type CharacterOption,
  type CharacterSheet,
  type LevelUpChoice,
  type LevelUpOffer,
  type LevelUpPayload,
  optionNamed,
  type SheetBody,
  startingSheetBody,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer, Random } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { importSystemFeats, importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { admittedTo, aPerson, campaignVia, type Person } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Levelling a character up** — `POST /me/characters/:id/level-up`, over the
 * real application and the imported 2014 corpus, through the client derived
 * from the contract.
 *
 * Each character is composed the way the create form composes one, created
 * through `POST /me/characters`, and levelled with picks taken from the offer
 * its owner reads (`GET …/level-up`), as the wizard will. Every refusal is
 * driven by a real account: the owner with a payload the offer does not
 * allow, a stale version, a character in a live fight, and a stranger.
 *
 * The hit point roll is the server's. The services here are given a `Random`
 * that always lands at 0.75, so a rolled d10 is an 8 every time.
 */

const database = migratedDatabase("taverns_test_character_level_up");

/** Every die the server rolls lands three quarters of the way up: a d10 is an 8. */
const scriptedDice: Random.Random = {
  nextDoubleUnsafe: () => 0.75,
  nextIntUnsafe: () => 0,
};
const services = servicesOver(database).pipe(
  Layer.provide(Layer.succeed(Random.Random, scriptedDice)),
);

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

/** The same call, answering the failure's tag and message rather than dying on it. */
const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({
        onFailure: (error) => ({
          tag: error._tag,
          message: "message" in error && typeof error.message === "string" ? error.message : "",
        }),
        onSuccess: () => ({ tag: "succeeded", message: "" }),
      }),
    ),
  ).pipe(Effect.orDie);

/** A POST the derived client would refuse to encode, sent as it stands. */
const rawPost = (token: string, path: string, body: unknown) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.post(path).pipe(
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.bodyJsonUnsafe(body),
      ),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

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
  "character-level-up.test/Fixture",
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

/** The payload a wizard would send for this offer: its version and level, then these choices. */
const answering = (
  offer: LevelUpOffer,
  choices: Omit<LevelUpPayload, "expectedVersion" | "toLevel"> = {},
): LevelUpPayload => ({ expectedVersion: offer.version, toLevel: offer.toLevel, ...choices });

const levelUp = (person: Person, character: Character, payload: LevelUpPayload) =>
  as(person.token, (client) =>
    client.me.levelUp({ params: { characterId: character.id }, payload }),
  );

const refusedLevelUp = (person: Person, character: Character, payload: LevelUpPayload) =>
  refusal(person.token, (client) =>
    client.me.levelUp({ params: { characterId: character.id }, payload }),
  );

/** The one choice a feature of this name offers. */
const choiceBy = (offer: LevelUpOffer, name: string): LevelUpChoice => {
  const found = offer.choices.filter((choice) => choice.offeredBy.name === name);
  expect(found, `one choice offered by ${name}`).toHaveLength(1);
  return found[0]!;
};

/** The id of a feature option a choice lists, by its name. */
const optionId = (choice: LevelUpChoice, name: string) => {
  if (choice.kind !== "feature") throw new Error(`${choice.offeredBy.name} lists no features`);
  const option = choice.options.find((entry) => entry.name === name);
  expect(option, `${choice.offeredBy.name} lists ${name}`).toBeDefined();
  return option!.featureId;
};

const ability = (sheet: CharacterSheet, label: string) =>
  sheet.abilities.find((cell) => cell.label === label);

/** How many level-up records a character has, read straight off the table. */
const recordsOf = (character: Character) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql<{
      readonly level: number;
      readonly origin: string;
      readonly applied: unknown;
    }>`
      select level, origin, applied from character_advancement
      where character_id = ${character.id}
      order by level
    `;
  }).pipe(Effect.orDie);

/** STR 15, DEX 14, CON 14, INT 10, WIS 12, CHA 8 before the race. */
const FIGHTER = [15, 14, 14, 10, 12, 8] as const;

describeLayer(
  "character-level-up",
  shared,
  (it) => {
    describe("the hit points", () => {
      it.effect(
        "are fixed by default: a d10's 6 and the CON modifier, and nothing else moves",
        () =>
          Effect.gen(function* () {
            const { owner, options } = yield* Fixture;
            // A human's +1 makes CON 15: +2.
            const fighter = yield* aCoreCharacter(owner, options, {
              name: "Brannoc",
              className: "Fighter",
              race: "Human",
              level: 1,
              scores: FIGHTER,
            });
            expect(fighter.hpMax).toBe(12);
            const offer = yield* offerOf(owner, fighter);
            const { character, advancement } = yield* levelUp(
              owner,
              fighter,
              answering(offer, { note: "After the bridge." }),
            );

            expect(character).toMatchObject({
              level: 2,
              hpMax: 20,
              hpCurrent: null,
              version: fighter.version + 1,
            });
            expect(advancement).toMatchObject({
              characterId: fighter.id,
              level: 2,
              className: "Fighter",
              hitPoints: { method: "fixed", die: 6, gain: 8 },
              choices: { picks: [], spells: [] },
              note: "After the bridge.",
              origin: "authored",
              assistantTurnId: null,
            });
            // The level's own recompute: Action Surge and its counter, and the
            // hit dice at two.
            expect(character.sheet.traits.map((trait) => trait.name)).toContain(
              "Action Surge (1 use)",
            );
            expect(character.sheet.resources).toContainEqual(
              expect.objectContaining({ id: "res:action-surge", max: 1 }),
            );
            expect(character.sheet.identity?.hitDice).toBe("2/2 d10");
            // The next offer starts where this one left off.
            expect((yield* offerOf(owner, character)).fromLevel).toBe(2);
          }),
      );

      it.effect("are the server's roll when asked, recorded with the die it landed on", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Corra",
            className: "Fighter",
            race: "Human",
            level: 1,
            scores: FIGHTER,
          });
          const offer = yield* offerOf(owner, fighter);
          const { character, advancement } = yield* levelUp(
            owner,
            fighter,
            answering(offer, { hitPoints: "rolled" }),
          );
          // The scripted dice: 0.75 of a d10 is an 8, within what the offer said
          // a roll could add.
          expect(advancement.hitPoints).toEqual({ method: "rolled", die: 8, gain: 10 });
          expect(advancement.hitPoints.gain).toBeGreaterThanOrEqual(
            offer.hitPoints!.rolled.minimum,
          );
          expect(advancement.hitPoints.gain).toBeLessThanOrEqual(offer.hitPoints!.rolled.maximum);
          expect(character.hpMax).toBe(12 + 10);
        }),
      );

      it.effect("carry a CON increase back over every level, as the 2014 rule says", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          // CON 14 and the human's 1: 15, +2. STR 15 and 1: 16.
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Dagny",
            className: "Fighter",
            race: "Human",
            subclass: "Champion",
            level: 3,
            scores: FIGHTER,
          });
          const offer = yield* offerOf(owner, fighter);
          const { character, advancement } = yield* levelUp(
            owner,
            fighter,
            answering(offer, {
              abilityScoreImprovement: {
                increases: [
                  { ability: "CON", amount: 1 },
                  { ability: "STR", amount: 1 },
                ],
              },
            }),
          );
          // 16 is +3: the level's 6 and the old +2, then 1 more for each of
          // the four levels the character now has.
          expect(advancement.hitPoints).toEqual({ method: "fixed", die: 6, gain: 6 + 2 + 4 });
          expect(character.hpMax).toBe(fighter.hpMax! + 12);
          expect(advancement.choices.abilityScores).toEqual([
            { ability: "CON", from: 15, to: 16 },
            { ability: "STR", from: 16, to: 17 },
          ]);
          expect(ability(character.sheet, "CON")).toMatchObject({ score: "16", modifier: "+3" });
          // The fighter's CON save was +4 (+2 and the bonus of 2): now +5.
          expect(ability(fighter.sheet, "CON")?.save).toBe("+4");
          expect(ability(character.sheet, "CON")?.save).toBe("+5");
        }),
      );
    });

    describe("the choices", () => {
      it.effect("take the subclass the offer lists, and grant its features", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Edda",
            className: "Fighter",
            race: "Human",
            level: 2,
            scores: FIGHTER,
          });
          const offer = yield* offerOf(owner, fighter);
          const champion = offer.subclass!.options.find((option) => option.name === "Champion")!;
          const { character, advancement } = yield* levelUp(
            owner,
            fighter,
            answering(offer, { subclass: { subclassId: champion.subclassId } }),
          );
          expect(advancement.choices.subclass).toEqual({
            name: "Champion",
            subclassId: champion.subclassId,
          });
          expect(character.sheet.identity?.subclass).toBe("Champion");
          expect(character.sheet.traits.map((trait) => trait.name)).toEqual(
            expect.arrayContaining(["Martial Archetype", "Improved Critical"]),
          );
        }),
      );

      it.effect("raise a score with an ASI, and move the numbers it feeds", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Fenna",
            className: "Fighter",
            race: "Human",
            subclass: "Champion",
            level: 3,
            scores: FIGHTER,
          });
          expect(ability(fighter.sheet, "STR")).toMatchObject({ score: "16", save: "+5" });
          const offer = yield* offerOf(owner, fighter);
          const { character, advancement } = yield* levelUp(
            owner,
            fighter,
            answering(offer, {
              abilityScoreImprovement: { increases: [{ ability: "STR", amount: 2 }] },
            }),
          );
          expect(advancement.choices.abilityScores).toEqual([{ ability: "STR", from: 16, to: 18 }]);
          expect(ability(character.sheet, "STR")).toMatchObject({
            score: "18",
            modifier: "+4",
            save: "+6",
          });
          const [record] = yield* recordsOf(character);
          expect(record?.applied).toMatchObject({
            abilities: [
              { label: "STR", score: { from: "16", to: "18" }, modifier: { from: "+3", to: "+4" } },
            ],
            hpMax: { from: fighter.hpMax, to: character.hpMax },
          });
        }),
      );

      it.effect("take a feat in place of the ASI, as a feature line marked as the pick", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Gisla",
            className: "Fighter",
            race: "Human",
            subclass: "Champion",
            level: 3,
            scores: FIGHTER,
          });
          const offer = yield* offerOf(owner, fighter);
          const grappler = offer.abilityScoreImprovement!.feats!.find(
            (feat) => feat.name === "Grappler",
          )!;
          const { character, advancement } = yield* levelUp(
            owner,
            fighter,
            answering(offer, { abilityScoreImprovement: { featId: grappler.featId } }),
          );
          expect(advancement.choices.feat).toEqual({ featId: grappler.featId, name: "Grappler" });
          expect(character.sheet.traits).toContainEqual(
            expect.objectContaining({
              name: "Grappler",
              featId: grappler.featId,
              derived: true,
              pick: { offeredBy: offer.abilityScoreImprovement!.offeredBy.featureId },
            }),
          );
          expect(ability(character.sheet, "STR")?.score).toBe("16");
        }),
      );

      it.effect("pick metamagic and learn a spell, whose line a known caster keeps", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const sorcerer = yield* aCoreCharacter(owner, options, {
            name: "Hild",
            className: "Sorcerer",
            race: "Human",
            subclass: "Draconic",
            level: 2,
            scores: [8, 14, 13, 10, 12, 15],
          });
          const offer = yield* offerOf(owner, sorcerer);
          const metamagic = choiceBy(offer, "Metamagic");
          const second = offer.spells!.options.find((option) => option.name === "Scorching Ray")!;
          const { character, advancement } = yield* levelUp(
            owner,
            sorcerer,
            answering(offer, {
              picks: [
                {
                  offeredBy: metamagic.offeredBy.featureId,
                  featureId: optionId(metamagic, "Metamagic: Careful Spell"),
                },
                {
                  offeredBy: metamagic.offeredBy.featureId,
                  featureId: optionId(metamagic, "Metamagic: Quickened Spell"),
                },
              ],
              spells: { learned: [second.spellId] },
            }),
          );
          expect(advancement.choices.picks.map((pick) => pick.name).sort()).toEqual([
            "Metamagic: Careful Spell",
            "Metamagic: Quickened Spell",
          ]);
          expect(advancement.choices.spells).toEqual([
            { spellId: second.spellId, name: "Scorching Ray", level: 2, kind: "learned" },
          ]);
          const careful = character.sheet.traits.filter(
            (trait) => trait.name === "Metamagic: Careful Spell",
          );
          expect(careful).toHaveLength(1);
          expect(careful[0]).toMatchObject({
            derived: true,
            pick: { offeredBy: metamagic.offeredBy.featureId },
          });
          expect(character.sheet.spellcasting?.known).toContainEqual(
            expect.objectContaining({ spellId: second.spellId, name: "Scorching Ray" }),
          );
          // A sorcerer knows its spells rather than preparing them, so the
          // recompute draws the new one's line as the picker would.
          expect(character.sheet.actions).toContainEqual(
            expect.objectContaining({ spellId: second.spellId, source: "spell", derived: true }),
          );
        }),
      );

      it.effect("pick invocations whose prerequisites the sheet meets", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const warlock = yield* aCoreCharacter(owner, options, {
            name: "Ivar",
            className: "Warlock",
            race: "Tiefling",
            subclass: "Fiend",
            level: 1,
            scores: [8, 14, 13, 10, 12, 15],
            then: (body) => ({
              ...body,
              spellcasting: { ...body.spellcasting, known: [{ name: "Eldritch Blast", level: 0 }] },
            }),
          });
          const offer = yield* offerOf(owner, warlock);
          const invocations = choiceBy(offer, "Eldritch Invocations");
          const by = invocations.offeredBy.featureId;
          const pick = (name: string) => ({
            offeredBy: by,
            featureId: optionId(invocations, name),
          });

          const thirsting = yield* refusedLevelUp(
            owner,
            warlock,
            answering(offer, {
              picks: [
                pick("Eldritch Invocation: Agonizing Blast"),
                pick("Eldritch Invocation: Thirsting Blade"),
              ],
            }),
          );
          expect(thirsting.tag).toBe("Conflict");
          expect(thirsting.message).toContain(
            "Eldritch Invocation: Thirsting Blade is not available yet: its prerequisites are not met.",
          );

          const { character } = yield* levelUp(
            owner,
            warlock,
            answering(offer, {
              picks: [
                pick("Eldritch Invocation: Agonizing Blast"),
                pick("Eldritch Invocation: Beast Speech"),
              ],
            }),
          );
          expect(character.sheet.traits).toContainEqual(
            expect.objectContaining({
              name: "Eldritch Invocation: Agonizing Blast",
              pick: { offeredBy: by },
            }),
          );
        }),
      );

      it.effect("mark expertise on a skill, moving its bonus, and on a tool as a line", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          // DEX 15 and the human's 1: 16, +3; proficient at 5 (+3) is +6.
          const rogue = yield* aCoreCharacter(owner, options, {
            name: "Jorun",
            className: "Rogue",
            race: "Human",
            subclass: "Thief",
            level: 5,
            scores: [8, 15, 14, 12, 13, 10],
            then: (body) => ({
              ...body,
              skills: [{ name: "Acrobatics", ability: "DEX", proficient: true, bonus: "+6" }],
            }),
          });
          const offer = yield* offerOf(owner, rogue);
          const expertise = choiceBy(offer, "Expertise");
          const by = expertise.offeredBy.featureId;
          const { character, advancement } = yield* levelUp(
            owner,
            rogue,
            answering(offer, {
              picks: [
                { offeredBy: by, value: "Acrobatics" },
                { offeredBy: by, value: "Thieves' Tools" },
              ],
            }),
          );
          expect(advancement.choices.picks).toEqual([
            expect.objectContaining({ kind: "expertise", name: "Acrobatics" }),
            expect.objectContaining({ kind: "expertise", name: "Thieves' Tools" }),
          ]);
          expect(character.sheet.skills).toContainEqual({
            name: "Acrobatics",
            ability: "DEX",
            proficient: true,
            expertise: true,
            bonus: "+9",
          });
          expect(character.sheet.traits).toContainEqual(
            expect.objectContaining({ name: "Expertise: Thieves' Tools", pick: { offeredBy: by } }),
          );
        }),
      );

      it.effect("record a favored enemy and a terrain in the source's own words", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const ranger = yield* aCoreCharacter(owner, options, {
            name: "Kari",
            className: "Ranger",
            race: "Human",
            subclass: "Hunter",
            level: 5,
            scores: [10, 15, 13, 8, 14, 12],
          });
          const offer = yield* offerOf(owner, ranger);
          const enemy = choiceBy(offer, "Favored Enemy (2 types)");
          const terrain = choiceBy(offer, "Natural Explorer (2 terrain types)");
          const { character } = yield* levelUp(
            owner,
            ranger,
            answering(offer, {
              picks: [
                { offeredBy: enemy.offeredBy.featureId, value: "Fiends" },
                { offeredBy: terrain.offeredBy.featureId, value: "forest" },
              ],
            }),
          );
          expect(character.sheet.traits.map((trait) => trait.name)).toEqual(
            expect.arrayContaining(["Favored Enemy: fiends", "Natural Explorer: forest"]),
          );
        }),
      );

      it.effect(
        "learn Magical Secrets off the class list, and keep them through the level's recompute",
        () =>
          Effect.gen(function* () {
            const { owner, options } = yield* Fixture;
            const bard = yield* aCoreCharacter(owner, options, {
              name: "Lene",
              className: "Bard",
              race: "Human",
              level: 9,
              scores: [8, 14, 13, 10, 12, 15],
              then: (body) => ({
                ...body,
                skills: [{ name: "Performance", ability: "CHA", proficient: true }],
              }),
            });
            const offer = yield* offerOf(owner, bard);
            const expertise = choiceBy(offer, "Expertise");
            const fireball = offer.spells!.magicalSecrets!.options.find(
              (option) => option.name === "Fireball",
            )!;
            const { character, advancement } = yield* levelUp(
              owner,
              bard,
              answering(offer, {
                // A college the vocabulary does not have: a label, granting nothing.
                subclass: { name: "College of Whispers" },
                picks: [
                  { offeredBy: expertise.offeredBy.featureId, value: "Performance" },
                  { offeredBy: expertise.offeredBy.featureId, value: "Insight" },
                ],
                spells: { magicalSecrets: [fireball.spellId] },
              }),
            );
            expect(advancement.choices.subclass).toEqual({ name: "College of Whispers" });
            expect(character.sheet.identity?.subclass).toBe("College of Whispers");
            expect(character.sheet.spellcasting?.known).toContainEqual(
              expect.objectContaining({ name: "Fireball", learnedBy: "magicalSecrets" }),
            );
            expect(character.sheet.actions).toContainEqual(
              expect.objectContaining({ spellId: fireball.spellId, source: "spell" }),
            );
            // Insight came off the Acolyte's proficiency list: a skill row now.
            expect(character.sheet.skills).toContainEqual({
              name: "Insight",
              ability: "WIS",
              proficient: true,
              expertise: true,
            });
          }),
      );
    });

    describe("what is refused", () => {
      it.effect(
        "refuses a choice the offer does not allow, every reason at once, and writes nothing",
        () =>
          Effect.gen(function* () {
            const { owner, options } = yield* Fixture;
            const sorcerer = yield* aCoreCharacter(owner, options, {
              name: "Maren",
              className: "Sorcerer",
              race: "Human",
              subclass: "Draconic",
              level: 2,
              scores: [8, 14, 13, 10, 12, 15],
            });
            const offer = yield* offerOf(owner, sorcerer);
            const metamagic = choiceBy(offer, "Metamagic");
            const wrongCount = yield* refusedLevelUp(
              owner,
              sorcerer,
              answering(offer, {
                picks: [
                  {
                    offeredBy: metamagic.offeredBy.featureId,
                    featureId: optionId(metamagic, "Metamagic: Careful Spell"),
                  },
                ],
              }),
            );
            expect(wrongCount).toEqual({
              tag: "Conflict",
              message: "Metamagic asks for 2 choices; 1 was made.",
            });

            // A fighter's 1 → 2 asks for nothing, so any pick is one it does not offer.
            const fighter = yield* aCoreCharacter(owner, options, {
              name: "Nanna",
              className: "Fighter",
              race: "Human",
              level: 1,
              scores: FIGHTER,
            });
            const plain = yield* offerOf(owner, fighter);
            const notOffered = yield* refusedLevelUp(
              owner,
              fighter,
              answering(plain, {
                picks: [
                  {
                    offeredBy: metamagic.offeredBy.featureId,
                    featureId: optionId(metamagic, "Metamagic: Careful Spell"),
                  },
                ],
                abilityScoreImprovement: { increases: [{ ability: "STR", amount: 2 }] },
              }),
            );
            expect(notOffered.tag).toBe("Conflict");
            expect(notOffered.message).toContain(
              "A pick answers a choice this level does not offer.",
            );
            expect(notOffered.message).toContain("This level has no Ability Score Improvement.");

            const wrongLevel = yield* refusedLevelUp(owner, fighter, {
              ...answering(plain),
              toLevel: 3,
            });
            expect(wrongLevel.message).toBe(
              "This character is level 1, so a level-up reaches 2, not 3.",
            );

            expect(yield* recordsOf(sorcerer)).toEqual([]);
            expect(yield* recordsOf(fighter)).toEqual([]);
            const after = yield* offerOf(owner, fighter);
            expect(after).toMatchObject({ version: plain.version, fromLevel: 1 });
          }),
      );

      it.effect("refuses a bard's Magical Secrets learned twice, as secrets and as spells", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const bard = yield* aCoreCharacter(owner, options, {
            name: "Ragna",
            className: "Bard",
            race: "Human",
            subclass: "Lore",
            level: 9,
            scores: [8, 14, 13, 10, 12, 15],
          });
          const offer = yield* offerOf(owner, bard);
          const learned = offer
            .spells!.options.filter((option) => option.level > 0)
            .slice(0, 2)
            .map((option) => option.spellId);
          const secrets = offer
            .spells!.magicalSecrets!.options.filter((option) => !learned.includes(option.spellId))
            .slice(0, 2)
            .map((option) => option.spellId);
          expect(learned).toHaveLength(2);
          expect(secrets).toHaveLength(2);
          const refused = yield* refusedLevelUp(
            owner,
            bard,
            answering(offer, { spells: { learned, magicalSecrets: secrets } }),
          );
          expect(refused.tag).toBe("Conflict");
          expect(refused.message).toContain(
            "This level lets the character learn 0 spells; 2 were chosen.",
          );
          expect(yield* recordsOf(bard)).toEqual([]);
        }),
      );

      it.effect("refuses a score past 20, and a feat whose prerequisite is not met", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          // STR 18 and the human's 1: 19.
          const strong = yield* aCoreCharacter(owner, options, {
            name: "Ottar",
            className: "Fighter",
            race: "Human",
            subclass: "Champion",
            level: 3,
            scores: [18, 14, 14, 10, 12, 8],
          });
          const offer = yield* offerOf(owner, strong);
          const past = yield* refusedLevelUp(
            owner,
            strong,
            answering(offer, {
              abilityScoreImprovement: { increases: [{ ability: "STR", amount: 2 }] },
            }),
          );
          expect(past).toEqual({
            tag: "Conflict",
            message: "STR would be 21; no score goes above 20.",
          });
          const grappler = offer.abilityScoreImprovement!.feats!.find(
            (feat) => feat.name === "Grappler",
          )!;

          // STR 8 and the human's 1: 9, short of Grappler's 13.
          const weak = yield* aCoreCharacter(owner, options, {
            name: "Runa",
            className: "Fighter",
            race: "Human",
            subclass: "Champion",
            level: 3,
            scores: [8, 15, 14, 10, 12, 13],
          });
          const weaker = yield* offerOf(owner, weak);
          const feat = yield* refusedLevelUp(
            owner,
            weak,
            answering(weaker, { abilityScoreImprovement: { featId: grappler.featId } }),
          );
          expect(feat).toEqual({
            tag: "Conflict",
            message:
              "That feat is not offered: its prerequisites are not met, or this character's rules do not have it.",
          });
          const missing = yield* refusedLevelUp(owner, weak, answering(weaker));
          expect(missing.message).toBe("Choose where the Ability Score Improvement's points go.");
        }),
      );

      it.effect("refuses a stale version, and another account's character as not found", () =>
        Effect.gen(function* () {
          const { owner, stranger, options } = yield* Fixture;
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Sigrid",
            className: "Fighter",
            race: "Human",
            level: 1,
            scores: FIGHTER,
          });
          const offer = yield* offerOf(owner, fighter);
          // The sheet moves on in another tab.
          yield* as(owner.token, (client) =>
            client.me.updateCharacter({
              params: { characterId: fighter.id },
              payload: { expectedVersion: offer.version, name: "Sigrid the Bold" },
            }),
          );
          const stale = yield* refusedLevelUp(owner, fighter, answering(offer));
          expect(stale.tag).toBe("Conflict");
          expect(stale.message).toContain("the sheet moved on since the level-up was offered");

          const theirs = yield* refusedLevelUp(stranger, fighter, {
            ...answering(offer),
            expectedVersion: offer.version + 1,
          });
          expect(theirs.tag).toBe("NotFound");
          expect(yield* recordsOf(fighter)).toEqual([]);
        }),
      );

      it.effect("takes no origin from the payload: a confirmed level-up is authored", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Tove",
            className: "Fighter",
            race: "Human",
            level: 1,
            scores: FIGHTER,
          });
          const offer = yield* offerOf(owner, fighter);
          const claimed = yield* rawPost(owner.token, `/me/characters/${fighter.id}/level-up`, {
            ...answering(offer),
            origin: "assistant",
            assistantTurnId: "00000000-0000-4000-8000-000000000001",
          });
          expect(claimed.status).toBe(200);
          expect(JSON.parse(claimed.body).advancement).toMatchObject({
            origin: "authored",
            assistantTurnId: null,
          });
          expect((yield* recordsOf(fighter)).map((row) => row.origin)).toEqual(["authored"]);
        }),
      );
    });

    describe("at a table", () => {
      it.effect("rings the open night, and is refused while the character is in a live fight", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const sql = yield* SqlClient.SqlClient;
          const dm = yield* aPerson("Wen");
          const campaign = yield* as(dm.token, (client) =>
            campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
          );
          yield* admittedTo(campaign.id, owner.actor, "Ilse");
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Ulla",
            className: "Fighter",
            race: "Human",
            level: 1,
            scores: FIGHTER,
          });
          yield* as(owner.token, (client) =>
            client.party.join({
              params: { campaignId: campaign.id },
              payload: { characterId: fighter.id },
            }),
          );
          const session = yield* as(dm.token, (client) =>
            client.sessions.create({
              params: { campaignId: campaign.id },
              payload: { number: 1, title: "At the ford", visibility: "shared" },
            }),
          );
          yield* as(dm.token, (client) =>
            client.campaigns.update({
              params: { campaignId: campaign.id },
              payload: { currentSessionId: session.id },
            }),
          );
          const rung = () =>
            sql<{ readonly count: number }>`
                select count(*)::int as count from session_event
                where session_id = ${session.id} and kind = 'character-updated'
              `.pipe(
              Effect.map((rows) => rows[0]!.count),
              Effect.orDie,
            );
          const before = yield* rung();

          const first = yield* offerOf(owner, fighter);
          const { character } = yield* levelUp(owner, fighter, answering(first));
          expect(yield* rung()).toBe(before + 1);

          const encounter = yield* as(dm.token, (client) =>
            client.encounters.create({
              params: { campaignId: campaign.id },
              payload: { name: "Brawl at the ford" },
            }),
          );
          yield* as(dm.token, (client) =>
            client.runs.start({
              params: { campaignId: campaign.id, sessionId: session.id },
              payload: { encounterId: encounter.id, includeParty: true, visibility: "shared" },
            }),
          );
          const second = yield* offerOf(owner, character);
          const fighting = yield* refusedLevelUp(owner, character, answering(second));
          expect(fighting).toEqual({
            tag: "Conflict",
            message:
              "Level up after the fight at The Salt Road; this character is on the table there.",
          });
          expect((yield* recordsOf(character)).map((row) => row.level)).toEqual([2]);
        }),
      );
    });

    describe("the record", () => {
      it.effect("is replaced when the Level box took its level back and it is gained again", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Vigdis",
            className: "Fighter",
            race: "Human",
            level: 1,
            scores: FIGHTER,
          });
          const first = yield* levelUp(owner, fighter, answering(yield* offerOf(owner, fighter)));
          const lowered = yield* as(owner.token, (client) =>
            client.me.updateCharacter({
              params: { characterId: fighter.id },
              payload: { expectedVersion: first.character.version, level: 1 },
            }),
          );
          const again = yield* levelUp(
            owner,
            lowered,
            answering(yield* offerOf(owner, lowered), { note: "Again." }),
          );
          expect(again.advancement.id).not.toBe(first.advancement.id);
          expect(yield* recordsOf(fighter)).toEqual([
            expect.objectContaining({ level: 2, origin: "authored" }),
          ]);
        }),
      );

      it.effect("goes with its character when the character is deleted", () =>
        Effect.gen(function* () {
          const { owner, options } = yield* Fixture;
          const fighter = yield* aCoreCharacter(owner, options, {
            name: "Yrsa",
            className: "Fighter",
            race: "Human",
            level: 1,
            scores: FIGHTER,
          });
          yield* levelUp(owner, fighter, answering(yield* offerOf(owner, fighter)));
          expect(yield* recordsOf(fighter)).toHaveLength(1);
          yield* as(owner.token, (client) =>
            client.me.deleteCharacter({ params: { characterId: fighter.id } }),
          );
          expect(yield* recordsOf(fighter)).toEqual([]);
        }),
      );
    });
  },
  { timeout: "120 seconds" },
);
