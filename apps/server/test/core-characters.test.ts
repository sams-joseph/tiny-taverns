import { describe, expect } from "@effect/vitest";
import {
  asBackgroundOption,
  asClassOption,
  asRaceOption,
  type Character,
  emptyCharacterSheet,
  type EquipmentLibraryCreate,
  gearLineFor,
  kitEquipmentOf,
  optionNamed,
  type RaceBody,
  sheetWithGear,
  type SpellLibraryCreate,
  startingSheetBody,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemEquipment } from "../src/equipment/import.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls } from "../src/images/ImageUrls.js";
import { ImageRecords } from "../src/repo/Images.js";
import { importSystemOptions } from "../src/ruleset/import.js";
import { importSystemSpells } from "../src/spells/import.js";
import { ObjectStorage } from "../src/storage/ObjectStorage.js";
import { admittedTo, aPerson, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedImages } from "./support/imageModel.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A character with no campaign at all** — `POST /me/characters` against the
 * core rules (`GET /library/options/core`), for an account that sits at no
 * table and may never.
 *
 * Over the real application, so the portrait trigger is the handler's own; only
 * the image endpoint is scripted.
 */

const images = scriptedImages({ apiUrl: "https://api.openai.com/v1", model: "core-portraits" });
const database = migratedDatabase("taverns_test_core_characters");
const services = servicesOver(
  database,
  undefined,
  undefined,
  undefined,
  ObjectStorage.memory,
  ImageUrls.layer(Redacted.make("core-characters-secret")),
  HobImages.layer({
    generation: Option.some({ limits: { perAccountPerDay: 10, perDay: 100 }, concurrency: 2 }),
    storageOn: true,
  }).pipe(Layer.provide(images.layer)),
);

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(ImageRecords.layer),
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

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

const settled = Effect.flatMap(HobImages, (drawing) => drawing.idle);

/** A homebrew race in the fresh account's own Library, with a subrace of its own. */
const MARSHBORN: RaceBody = {
  speed: 30,
  size: "Medium",
  abilityBonuses: [{ ability: "CON", amount: 2 }],
  hpPerLevel: 0,
  traits: [],
  subraces: [{ name: "Reed Marshborn", abilityBonuses: [], traits: [] }],
};

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment().pipe(Effect.orDie);
  yield* importSystemOptions().pipe(Effect.orDie);
  yield* importSystemSpells().pipe(Effect.orDie);
  // Signed up and invited nowhere: the account the captain could not make a
  // character with.
  const fresh = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  expect(yield* as(fresh.token, (client) => client.me.campaigns())).toEqual([]);
  yield* as(fresh.token, (client) =>
    client.library.createOption({
      payload: { kind: "race", name: "Marshborn", body: MARSHBORN },
    }),
  );
  return { fresh, stranger };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "core-characters.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

/** A homebrew first-level Wizard spell, for somebody's Library. */
const wizardSpell = (name: string): SpellLibraryCreate => ({
  name,
  level: 1,
  school: { index: "evocation", name: "Evocation" },
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  classes: [{ index: "wizard", name: "Wizard" }],
});

/** A first-level Wizard with one derived slot spent, and nothing picked yet. */
const coreWizard = (token: string, name: string) =>
  as(token, (client) =>
    client.me.createCoreCharacter({
      payload: {
        name,
        race: "Elf",
        subrace: "High Elf",
        className: "Wizard",
        level: 1,
        sheet: {
          ...emptyCharacterSheet,
          abilities: [{ label: "INT", score: "16", modifier: "+3" }],
          spellcasting: {
            ability: "INT",
            save: "13",
            attack: "+5",
            slots: [{ level: 1, used: 1, total: 2 }],
            known: [],
          },
          resources: [
            {
              id: "slot:1",
              name: "1st-level slots",
              used: 1,
              max: 2,
              recharge: "long",
              derived: true,
            },
          ],
        },
      },
    }),
  );

/** The standard array, laid a Fighter's way: STR 15, DEX 14, CON 13, WIS 12, INT 10, CHA 8. */
const FIGHTER_ARRAY = (
  [
    ["STR", 15],
    ["DEX", 14],
    ["CON", 13],
    ["INT", 10],
    ["WIS", 12],
    ["CHA", 8],
  ] as const
).map(([label, score]) => {
  const modifier = Math.floor((score - 10) / 2);
  return {
    label,
    score: String(score),
    modifier: modifier < 0 ? String(modifier) : `+${modifier}`,
  };
});

/**
 * A Hill Dwarf Fighter composed by the core rules at `level`, the way the
 * create form composes one — and, at 1, created through `POST /me/characters`.
 */
const fighterSources = (token: string) =>
  Effect.map(
    as(token, (client) => client.library.coreOptions({ query: {} })),
    (options) => (level: number) =>
      startingSheetBody({
        classOption: asClassOption(optionNamed(options, "class", "Fighter")),
        raceOption: asRaceOption(optionNamed(options, "race", "Dwarf")),
        subrace: "Hill Dwarf",
        backgroundOption: asBackgroundOption(optionNamed(options, "background", "Acolyte")),
        background: "Acolyte",
        subclass: "Champion",
        abilities: FIGHTER_ARRAY,
        level,
      }),
  );

const coreFighter = (token: string, name: string) =>
  Effect.gen(function* () {
    const composed = yield* fighterSources(token);
    const one = composed(1);
    return yield* as(token, (client) =>
      client.me.createCoreCharacter({
        payload: {
          name,
          race: "Dwarf",
          subrace: "Hill Dwarf",
          className: "Fighter",
          level: 1,
          ac: one.seed.ac,
          ...(one.seed.hpMax === undefined ? {} : { hpMax: one.seed.hpMax }),
          sheet: { notes: "", ...one.body },
        },
      }),
    );
  });

/** A martial melee weapon for somebody's Library, as the Gear picker offers it. */
const libraryGlaive: EquipmentLibraryCreate = {
  name: "Bog Glaive",
  equipmentCategory: { index: "weapon", name: "Weapon" },
  cost: { quantity: 20, unit: "gp" },
  weaponCategory: "Martial",
  weaponRange: "Melee",
  categoryRange: "Martial Melee",
  damage: { damageDice: "1d10", damageType: { index: "slashing", name: "Slashing" } },
};

/** The character carrying a Library-original glaive, picked in Gear: its derived attack line with it. */
const withLibraryGlaive = (token: string, character: Character) =>
  Effect.gen(function* () {
    const glaive = yield* as(token, (client) =>
      client.library.createEquipment({ payload: libraryGlaive }),
    );
    const sheet = sheetWithGear(
      character.sheet,
      [...(character.sheet.inventory ?? []), gearLineFor(glaive)],
      [kitEquipmentOf(glaive)],
    );
    const carrying = yield* as(token, (client) =>
      client.me.updateCharacter({
        params: { characterId: character.id },
        payload: { expectedVersion: character.version, sheet },
      }),
    );
    const line = (of: Character) =>
      of.sheet.actions?.find((action) => action.equipmentId === glaive.id);
    return { carrying, line };
  });

const spellbookOf = (token: string, character: Character) =>
  as(token, (client) => client.me.characterSpells({ params: { characterId: character.id } }));

const spellNames = (book: {
  readonly spells: ReadonlyArray<{ readonly spell: { readonly name: string } }>;
}) => book.spells.map((row) => row.spell.name);

/** The sheet with one picked, prepared spell and the action a pick writes. */
const picking = (
  token: string,
  character: Character,
  spell: { readonly id: string; readonly name: string; readonly level: number },
) =>
  as(token, (client) =>
    client.me.updateCharacter({
      params: { characterId: character.id },
      payload: {
        expectedVersion: character.version,
        sheet: {
          ...character.sheet,
          spellcasting: {
            ...character.sheet.spellcasting,
            known: [
              ...(character.sheet.spellcasting?.known ?? []),
              { name: spell.name, level: spell.level, spellId: spell.id as never, prepared: true },
            ],
          },
          actions: [
            ...(character.sheet.actions ?? []),
            {
              id: `spell:${spell.id}`,
              name: spell.name,
              source: "spell",
              spellId: spell.id as never,
              resource: "slot:1",
              derived: true,
            },
          ],
        },
      },
    }),
  );

describeLayer(
  "core-characters",
  shared,
  (it) => {
    describe("the core rules", () => {
      it.effect("are the shared bundle and nothing anybody authored", () =>
        Effect.gen(function* () {
          const { fresh, stranger } = yield* Fixture;
          const core = yield* as(fresh.token, (client) =>
            client.library.coreOptions({ query: {} }),
          );
          const kinds = new Set(core.map((option) => option.kind));
          expect(kinds).toEqual(new Set(["class", "race", "background"]));
          expect(core.map((option) => option.name)).toContain("Fighter");
          expect(core.map((option) => option.name)).toContain("Elf");
          // The account's own Library original is in its Library and not in the core.
          expect(core.map((option) => option.name)).not.toContain("Marshborn");
          const library = yield* as(fresh.token, (client) => client.library.options({ query: {} }));
          expect(library.map((option) => option.name)).toContain("Marshborn");

          const bundled = yield* sql(
            (sql) => sql<{ readonly count: string }>`
              select count(*) from character_option
              where campaign_id is null and account_id is null and visibility = 'shared'
            `,
          );
          expect(core).toHaveLength(Number(bundled[0]!.count));
          // The same answer for every account, because nothing in it is anybody's.
          const theirs = yield* as(stranger.token, (client) =>
            client.library.coreOptions({ query: {} }),
          );
          expect(theirs.map((option) => option.id)).toEqual(core.map((option) => option.id));
        }),
      );

      it.effect("narrow by kind", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const races = yield* as(fresh.token, (client) =>
            client.library.coreOptions({ query: { kind: "race" } }),
          );
          expect(races.length).toBeGreaterThan(0);
          expect(races.every((option) => option.kind === "race")).toBe(true);
        }),
      );
    });

    describe("creating a character with no campaign", () => {
      it.effect(
        "writes an ordinary account-owned row with no seat, and draws its portrait and banner once",
        () =>
          Effect.gen(function* () {
            const { fresh } = yield* Fixture;
            const before = images.requests().length;
            const character = yield* as(fresh.token, (client) =>
              client.me.createCoreCharacter({
                payload: {
                  name: "Sorrel Ash",
                  race: "Elf",
                  subrace: "High Elf",
                  className: "Wizard",
                  level: 1,
                  sheet: {
                    notes: "",
                    abilities: [],
                    traits: [],
                    story: { appearance: "Thirties, wiry, mud to the knees." },
                  },
                },
              }),
            );
            expect(character.name).toBe("Sorrel Ash");
            expect(character.subrace).toBe("High Elf");
            expect(character.portraitPending).toBe(true);
            yield* settled;
            expect(images.requests().length - before).toBe(2);

            const rows = yield* sql(
              (sql) => sql<{
                readonly account_id: string;
                readonly origin: string;
                readonly seats: number;
                readonly portraits: number;
              }>`
          select character.account_id, character.origin,
                 (select count(*) from campaign_character
                  where campaign_character.character_id = character.id)::int as seats,
                 (select count(*) from character_portrait
                  where character_portrait.character_id = character.id)::int as portraits
          from character where character.id = ${character.id}
        `,
            );
            expect(rows).toEqual([
              { account_id: fresh.actor.accountId, origin: "authored", seats: 0, portraits: 1 },
            ]);

            const mine = yield* as(fresh.token, (client) => client.me.characters());
            const owned = mine.find((entry) => entry.character.id === character.id);
            expect(owned?.seats).toEqual([]);
            expect(owned?.character.portrait).not.toBeNull();
            expect(owned?.character.banner).not.toBeNull();

            // Editing it changes nothing about the drawing: drawn once.
            yield* as(fresh.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: character.id },
                payload: { level: 2 },
              }),
            );
            yield* settled;
            expect(images.requests().length - before).toBe(2);
          }),
      );

      it.effect("validates a subrace against the core rules, not the account's Library", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          // Elf does not contain Hill Dwarf.
          expect(
            yield* refusal(fresh.token, (client) =>
              client.me.createCoreCharacter({
                payload: { name: "Wrong Root", race: "Elf", subrace: "Hill Dwarf" },
              }),
            ),
          ).toBe("Conflict");
          // A subrace with no race at all.
          expect(
            yield* refusal(fresh.token, (client) =>
              client.me.createCoreCharacter({ payload: { name: "No Root", subrace: "High Elf" } }),
            ),
          ).toBe("Conflict");
          // The account's own homebrew race is not core rules, so its subrace does
          // not resolve here — the same answer the pickers give.
          expect(
            yield* refusal(fresh.token, (client) =>
              client.me.createCoreCharacter({
                payload: { name: "Reedling", race: "Marshborn", subrace: "Reed Marshborn" },
              }),
            ),
          ).toBe("Conflict");
          // A race the core rules do not know is a free label, as it is everywhere.
          const labelled = yield* as(fresh.token, (client) =>
            client.me.createCoreCharacter({ payload: { name: "Pim", race: "Marshborn" } }),
          );
          expect(labelled.race).toBe("Marshborn");
        }),
      );

      it.effect("is invisible and unwritable to every other account", () =>
        Effect.gen(function* () {
          const { fresh, stranger } = yield* Fixture;
          const character = yield* as(fresh.token, (client) =>
            client.me.createCoreCharacter({ payload: { name: "Kept Close", className: "Rogue" } }),
          );
          const theirs = yield* as(stranger.token, (client) => client.me.characters());
          expect(theirs.map((entry) => entry.character.id)).not.toContain(character.id);
          expect(
            yield* refusal(stranger.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: character.id },
                payload: { name: "Taken" },
              }),
            ),
          ).toBe("NotFound");
          expect(
            yield* refusal(stranger.token, (client) =>
              client.me.deleteCharacter({ params: { characterId: character.id } }),
            ),
          ).toBe("NotFound");
          expect(
            yield* refusal(stranger.token, (client) =>
              client.me.characterSpells({ params: { characterId: character.id } }),
            ),
          ).toBe("NotFound");
        }),
      );

      it.effect("can be added to a campaign later, by the ordinary seat", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const character = yield* as(fresh.token, (client) =>
            client.me.createCoreCharacter({
              payload: { name: "Late Arrival", className: "Cleric" },
            }),
          );
          const dm = yield* aPerson("Jo");
          const campaign = yield* as(dm.token, (client) =>
            campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
          );
          yield* admittedTo(campaign.id, fresh.actor, "Ilse");

          yield* as(fresh.token, (client) =>
            client.party.join({
              params: { campaignId: campaign.id },
              payload: { characterId: character.id },
            }),
          );

          const mine = yield* as(fresh.token, (client) => client.me.characters());
          const owned = mine.find((entry) => entry.character.id === character.id);
          expect(owned?.seats.map((seat) => seat.campaignId)).toEqual([campaign.id]);
          const party = yield* as(dm.token, (client) =>
            client.party.list({ params: { campaignId: campaign.id } }),
          );
          expect(JSON.stringify(party)).toContain("Late Arrival");
        }),
      );
    });

    describe("the sheet of a character at no table", () => {
      it.effect("offers the core spell list, and nothing anybody authored", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          yield* as(fresh.token, (client) =>
            client.library.createSpell({ payload: wizardSpell("Bog Light") }),
          );
          const wizard = yield* coreWizard(fresh.token, "Tamsin Reed");

          const book = yield* spellbookOf(fresh.token, wizard);
          expect(book).toMatchObject({
            className: "Wizard",
            mode: "spellbook",
            highestSlotLevel: 1,
          });
          expect(book.limits).toMatchObject({ cantripsKnown: 3, spellsKnown: 6, prepared: 4 });
          expect(spellNames(book)).toContain("Magic Missile");
          expect(spellNames(book)).toContain("Fire Bolt");
          expect(spellNames(book)).not.toContain("Fireball");
          // The account's own Library spell is not the core rules, exactly as its
          // own Library race is not in the create form's pickers.
          expect(spellNames(book)).not.toContain("Bog Light");
          expect(book.spells.every((row) => row.spell.accountId === null)).toBe(true);
        }),
      );

      it.effect("recomputes a level-up against the core rules", () =>
        Effect.gen(function* () {
          const { fresh, stranger } = yield* Fixture;
          const wizard = yield* coreWizard(fresh.token, "Hollis Fen");
          const book = yield* spellbookOf(fresh.token, wizard);
          const missile = book.spells.find((row) => row.spell.name === "Magic Missile")!.spell;
          const picked = yield* picking(fresh.token, wizard, missile);

          const leveled = yield* as(fresh.token, (client) =>
            client.me.updateCharacter({
              params: { characterId: wizard.id },
              payload: { expectedVersion: picked.version, level: 5 },
            }),
          );
          expect(leveled.level).toBe(5);
          expect(leveled.sheet.spellcasting?.known?.map((spell) => spell.name)).toEqual([
            "Magic Missile",
          ]);
          expect(
            leveled.sheet.resources?.find((resource) => resource.id === "slot:1"),
          ).toMatchObject({
            max: 4,
            used: 1,
            derived: true,
          });
          expect(
            leveled.sheet.resources?.find((resource) => resource.id === "slot:3"),
          ).toMatchObject({
            max: 2,
            derived: true,
          });
          expect(leveled.sheet.actions?.find((row) => row.spellId === missile.id)).toMatchObject({
            name: "Magic Missile",
            derived: true,
          });
          // And the picker follows the level.
          const higher = yield* spellbookOf(fresh.token, leveled);
          expect(higher.highestSlotLevel).toBe(3);
          expect(spellNames(higher)).toContain("Fireball");

          // Nobody else reaches either half.
          expect(
            yield* refusal(stranger.token, (client) =>
              client.me.characterSpells({ params: { characterId: wizard.id } }),
            ),
          ).toBe("NotFound");
          expect(
            yield* refusal(stranger.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: wizard.id },
                payload: { level: 6 },
              }),
            ),
          ).toBe("NotFound");
        }),
      );

      it.effect("keeps a warlock's Pact Magic slots on a short rest through a level-up", () =>
        Effect.gen(function* () {
          const { fresh, stranger } = yield* Fixture;
          const warlock = yield* as(fresh.token, (client) =>
            client.me.createCoreCharacter({
              payload: {
                name: "Wren Ashby",
                race: "Tiefling",
                className: "Warlock",
                level: 1,
                sheet: { ...emptyCharacterSheet, identity: { hitDice: "d8" } },
              },
            }),
          );
          const leveled = yield* as(fresh.token, (client) =>
            client.me.updateCharacter({
              params: { characterId: warlock.id },
              payload: { expectedVersion: warlock.version, level: 5 },
            }),
          );
          expect(
            leveled.sheet.resources?.find((resource) => resource.id === "slot:3"),
          ).toMatchObject({ max: 2, used: 0, recharge: "short", derived: true });

          yield* as(fresh.token, (client) =>
            client.me.spendCharacterResource({
              params: { characterId: warlock.id },
              payload: { resourceId: "slot:3", amount: 2 },
            }),
          );
          const rested = yield* as(fresh.token, (client) =>
            client.me.restCharacter({
              params: { characterId: warlock.id },
              payload: { kind: "short" },
            }),
          );
          expect(rested.sheet.resources?.find((resource) => resource.id === "slot:3")?.used).toBe(
            0,
          );

          expect(
            yield* refusal(stranger.token, (client) =>
              client.me.restCharacter({
                params: { characterId: warlock.id },
                payload: { kind: "short" },
              }),
            ),
          ).toBe("NotFound");
        }),
      );

      it.effect(
        "moves everything derived when the Level box moves, and leaves the hit points alone",
        () =>
          Effect.gen(function* () {
            const { fresh, stranger } = yield* Fixture;
            const composed = yield* fighterSources(fresh.token);
            const fighter = yield* coreFighter(fresh.token, "Hedda Stonebrook");
            expect(fighter.sheet.identity).toMatchObject({ proficiency: "+2", hitDice: "1/1 d10" });

            const leveled = yield* as(fresh.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: fighter.id },
                payload: { expectedVersion: fighter.version, level: 5 },
              }),
            );
            expect(leveled.level).toBe(5);
            // Hit points are the wizard's to add, never the recompute's.
            expect(leveled.hpMax).toBe(fighter.hpMax);
            expect(leveled.sheet.identity).toMatchObject({ proficiency: "+3", hitDice: "5/5 d10" });
            const save = (label: string) =>
              leveled.sheet.abilities.find((cell) => cell.label === label)?.save;
            // STR 15 and CON 13 + 2 (Dwarf): +2 each, and the bonus now +3.
            expect(save("STR")).toBe("+5");
            expect(save("CON")).toBe("+5");
            expect(
              leveled.sheet.resources?.find((row) => row.id === "res:action-surge"),
            ).toMatchObject({ used: 0, max: 1, derived: true });
            expect(leveled.sheet.actions?.find((row) => row.id === "feat:second-wind")?.dice).toBe(
              "1d10+5",
            );
            expect(
              leveled.sheet.actions?.find((row) => row.source === "weapon" && row.derived === true),
            ).toMatchObject({ text: expect.stringContaining("Attack ×2") });
            expect(leveled.sheet.traits.map((trait) => trait.name)).toEqual(
              expect.arrayContaining(["Action Surge (1 use)", "Extra Attack", "Improved Critical"]),
            );
            // The whole rules half is what the composer writes at 5.
            const { notes: _notes, ...rules } = leveled.sheet;
            expect(rules).toEqual(composed(5).body);

            // Somebody else's character is not there to level.
            expect(
              yield* refusal(stranger.token, (client) =>
                client.me.updateCharacter({
                  params: { characterId: fighter.id },
                  payload: { level: 6 },
                }),
              ),
            ).toBe("NotFound");
          }),
      );

      it.effect("keeps what a person typed through a level change, both ways", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const fighter = yield* coreFighter(fresh.token, "Brisk Tallow");
          const typed = yield* as(fresh.token, (client) =>
            client.me.updateCharacter({
              params: { characterId: fighter.id },
              payload: {
                expectedVersion: fighter.version,
                sheet: {
                  ...fighter.sheet,
                  abilities: fighter.sheet.abilities.map((cell) =>
                    cell.label === "STR" ? { ...cell, save: "+9" } : cell,
                  ),
                  traits: [...fighter.sheet.traits, { name: "Lucky Coin", text: "Flip it." }],
                  resources: [
                    ...(fighter.sheet.resources ?? []).map((row) =>
                      row.id === "hit-dice" ? { ...row, used: 1 } : row,
                    ),
                    { id: "custom:luck", name: "Luck", used: 1, max: 3, recharge: "long" },
                  ],
                },
              },
            }),
          );
          const five = yield* as(fresh.token, (client) =>
            client.me.updateCharacter({
              params: { characterId: fighter.id },
              payload: { expectedVersion: typed.version, level: 5 },
            }),
          );
          const strSave = (character: Character) =>
            character.sheet.abilities.find((cell) => cell.label === "STR")?.save;
          expect(strSave(five)).toBe("+9");
          expect(five.sheet.traits).toContainEqual({ name: "Lucky Coin", text: "Flip it." });
          expect(five.sheet.resources?.find((row) => row.id === "custom:luck")?.used).toBe(1);
          expect(five.sheet.resources?.find((row) => row.id === "hit-dice")).toMatchObject({
            used: 1,
            max: 5,
          });

          // And back down: the features above 1 go, the typed lines stay.
          const one = yield* as(fresh.token, (client) =>
            client.me.updateCharacter({
              params: { characterId: fighter.id },
              payload: { expectedVersion: five.version, level: 1 },
            }),
          );
          expect(one.sheet.traits.map((trait) => trait.name)).not.toContain("Extra Attack");
          expect(one.sheet.traits).toContainEqual({ name: "Lucky Coin", text: "Flip it." });
          expect(strSave(one)).toBe("+9");
          expect(one.sheet.identity?.proficiency).toBe("+2");
          expect(one.sheet.resources?.find((row) => row.id === "hit-dice")).toMatchObject({
            used: 1,
            max: 1,
          });
        }),
      );

      it.effect("recomputes nothing on a save that resends the same level and class", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const fighter = yield* coreFighter(fresh.token, "Ott Varn");
          // A sheet the recompute would rewrite if it ran: a stale bonus.
          const stale = yield* as(fresh.token, (client) =>
            client.me.updateCharacter({
              params: { characterId: fighter.id },
              payload: {
                expectedVersion: fighter.version,
                level: 5,
                sheet: fighter.sheet,
              },
            }),
          );
          expect(stale.sheet.identity?.proficiency).toBe("+2");
          // The Identity dialog's save: every column resent, only the name changed.
          const renamed = yield* as(fresh.token, (client) =>
            client.me.updateCharacter({
              params: { characterId: fighter.id },
              payload: {
                expectedVersion: stale.version,
                name: "Ott Varn the Younger",
                level: 5,
                race: "Dwarf",
                subrace: "Hill Dwarf",
                className: "fighter",
                ac: stale.ac,
                hpMax: stale.hpMax,
              },
            }),
          );
          expect(renamed.version).toBe(stale.version + 1);
          expect(renamed.sheet).toEqual(stale.sheet);
        }),
      );

      it.effect("moves a weapon line whose row is the owner's Library original", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const fighter = yield* coreFighter(fresh.token, "Wren Marsh");
          const { carrying, line } = yield* withLibraryGlaive(fresh.token, fighter);
          // STR 15: +2, and proficient through Martial Weapons at +2.
          expect(line(carrying)).toMatchObject({ hit: "+4", derived: true });
          expect(line(carrying)?.text ?? "").not.toContain("Attack ×2");

          const five = yield* as(fresh.token, (client) =>
            client.me.updateCharacter({
              params: { characterId: fighter.id },
              payload: { expectedVersion: carrying.version, level: 5 },
            }),
          );
          expect(line(five)).toMatchObject({
            hit: "+5",
            text: expect.stringContaining("Attack ×2"),
          });
        }),
      );

      it.effect(
        "moves the class's saves and proficiencies on a class change, keeping hand marks",
        () =>
          Effect.gen(function* () {
            const { fresh } = yield* Fixture;
            const options = yield* as(fresh.token, (client) =>
              client.library.coreOptions({ query: {} }),
            );
            const three = startingSheetBody({
              classOption: asClassOption(optionNamed(options, "class", "Wizard")),
              raceOption: asRaceOption(optionNamed(options, "race", "Dwarf")),
              subrace: "Hill Dwarf",
              abilities: FIGHTER_ARRAY,
              level: 3,
            });
            const created = yield* as(fresh.token, (client) =>
              client.me.createCoreCharacter({
                payload: {
                  name: "Tamsin Reed",
                  race: "Dwarf",
                  subrace: "Hill Dwarf",
                  className: "Wizard",
                  level: 3,
                  sheet: {
                    notes: "",
                    ...three.body,
                    // A save the player marked by hand.
                    abilities: three.body.abilities.map((cell) =>
                      cell.label === "DEX" ? { ...cell, proficient: true, save: "+4" } : cell,
                    ),
                  },
                },
              }),
            );
            const cell = (character: Character, label: string) =>
              character.sheet.abilities.find((ability) => ability.label === label);
            expect(cell(created, "INT")).toMatchObject({ proficient: true, save: "+2" });
            const { carrying, line } = yield* withLibraryGlaive(fresh.token, created);
            // A Wizard has no martial weapons: STR +2 alone.
            expect(line(carrying)?.hit).toBe("+2");

            const fighter = yield* as(fresh.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: created.id },
                payload: { expectedVersion: carrying.version, className: "Fighter" },
              }),
            );
            // STR 15 and CON 13 + 2: +2 each, with the bonus +2 at level 3.
            expect(cell(fighter, "STR")).toMatchObject({ proficient: true, save: "+4" });
            expect(cell(fighter, "CON")).toMatchObject({ proficient: true, save: "+4" });
            for (const label of ["INT", "WIS"]) {
              expect(cell(fighter, label)).not.toHaveProperty("proficient");
              expect(cell(fighter, label)).not.toHaveProperty("save");
            }
            expect(cell(fighter, "DEX")).toMatchObject({ proficient: true, save: "+4" });
            expect(fighter.sheet.proficiencies).toEqual(
              expect.arrayContaining(["Martial Weapons", "All armor"]),
            );
            expect(fighter.sheet.proficiencies).not.toContain("Quarterstaffs");
            expect(line(fighter)?.hit).toBe("+4");
          }),
      );

      it.effect("checks a subrace edit against the core rules", () =>
        Effect.gen(function* () {
          const { fresh } = yield* Fixture;
          const wizard = yield* coreWizard(fresh.token, "Ivo Marsh");
          expect(
            yield* refusal(fresh.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: wizard.id },
                payload: { subrace: "Hill Dwarf" },
              }),
            ),
          ).toBe("Conflict");
          // The account's own Library race is not the core rules either.
          expect(
            yield* refusal(fresh.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: wizard.id },
                payload: { race: "Marshborn", subrace: "Reed Marshborn" },
              }),
            ),
          ).toBe("Conflict");
        }),
      );

      it.effect(
        "reads its campaign's vocabulary once seated, homebrew included, and back again when it leaves",
        () =>
          Effect.gen(function* () {
            const { fresh } = yield* Fixture;
            const dm = yield* aPerson("Wen");
            const campaign = yield* as(dm.token, (client) =>
              campaignVia(client, { name: "The Fen Lights", visibility: "shared" }),
            );
            yield* admittedTo(campaign.id, fresh.actor, "Ilse");
            const ward = yield* as(dm.token, (client) =>
              client.library.createSpell({ payload: wizardSpell("Salt Ward") }),
            );
            yield* as(dm.token, (client) =>
              client.sharedWorldLibrary.share({
                params: { worldId: campaign.contextId },
                payload: { kind: "spell", resourceId: ward.id },
              }),
            );

            const wizard = yield* coreWizard(fresh.token, "Nell Rook");
            const missile = (yield* spellbookOf(fresh.token, wizard)).spells.find(
              (row) => row.spell.name === "Magic Missile",
            )!.spell;
            const picked = yield* picking(fresh.token, wizard, missile);
            expect(spellNames(yield* spellbookOf(fresh.token, picked))).not.toContain("Salt Ward");

            const seat = yield* as(fresh.token, (client) =>
              client.party.join({
                params: { campaignId: campaign.id },
                payload: { characterId: wizard.id },
              }),
            );

            // Seating rewrites nothing on the sheet.
            const seated = (yield* as(fresh.token, (client) => client.me.characters())).find(
              (entry) => entry.character.id === wizard.id,
            )!.character;
            expect(seated.version).toBe(picked.version);
            expect(seated.sheet).toEqual(picked.sheet);

            // The campaign's vocabulary: the core rules, the table's shared homebrew,
            // and the owner's own Library, which every campaign's pickers offer them.
            const book = yield* spellbookOf(fresh.token, seated);
            expect(spellNames(book)).toContain("Magic Missile");
            expect(spellNames(book)).toContain("Salt Ward");
            expect(spellNames(book)).toContain("Bog Light");

            // A level-up now recomputes against the table, and the core pick survives
            // it because the core rules are inside every campaign's vocabulary.
            const wardPicked = yield* picking(
              fresh.token,
              seated,
              book.spells.find((row) => row.spell.name === "Salt Ward")!.spell,
            );
            const leveled = yield* as(fresh.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: wizard.id },
                payload: { expectedVersion: wardPicked.version, level: 2 },
              }),
            );
            expect(leveled.sheet.spellcasting?.known?.map((spell) => spell.name)).toEqual([
              "Magic Missile",
              "Salt Ward",
            ]);

            // Leaving the last table hands the sheet back to the core rules.
            yield* as(fresh.token, (client) =>
              client.party.leave({
                params: { campaignId: campaign.id, campaignCharacterId: seat.seat.id },
              }),
            );
            const after = yield* spellbookOf(fresh.token, leveled);
            expect(spellNames(after)).toContain("Magic Missile");
            expect(spellNames(after)).not.toContain("Salt Ward");
            // A save that resends the level it already has is no level change,
            // so it prunes nothing the core rules lack.
            const renamed = yield* as(fresh.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: wizard.id },
                payload: { expectedVersion: leveled.version, name: "Nell Rook", level: 2 },
              }),
            );
            expect(renamed.sheet.spellcasting?.known?.map((spell) => spell.name)).toEqual([
              "Magic Missile",
              "Salt Ward",
            ]);
          }),
      );
    });
  },
  { timeout: "120 seconds" },
);
