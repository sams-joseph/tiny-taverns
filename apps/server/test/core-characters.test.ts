import { describe, expect } from "@effect/vitest";
import {
  type Character,
  emptyCharacterSheet,
  type RaceBody,
  type SpellLibraryCreate,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
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
          }),
      );
    });
  },
  { timeout: "120 seconds" },
);
