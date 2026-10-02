import { describe, expect } from "@effect/vitest";
import {
  type Ability,
  asBackgroundOption,
  asClassOption,
  asRaceOption,
  type CampaignCharacterId,
  type CampaignId,
  type Character,
  type CharacterOption,
  type LevelUpChoice,
  type LevelUpOffer,
  type LevelUpPayload,
  optionNamed,
  type PartySeat,
  startingSheetBody,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
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
 * **A character's level-ups, at the table**: the party read carries each
 * seat's log (`PartySeat.levelUps`), over the real application and the
 * imported 2014 corpus, through the client derived from the contract.
 *
 * The log is exactly as readable as the seat, because it is read through the
 * seat's own predicate: the creator reads every seat's, a player reads their
 * own and every shared seat's, and a hidden seat's log is absent from another
 * player's answer, which a level-up on it leaves byte for byte as it was. What
 * the table reads is the narrow `SeatLevelUp`: no hit point roll, no applied
 * deltas, no ids and no provenance. Every level-up here is a real one, taken
 * by the character's owner from the offer they read.
 */

const database = migratedDatabase("taverns_test_party_level_ups");
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
const attempt = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
    ),
  ).pipe(Effect.orDie);

/** A GET's exact body, for the byte-for-byte comparison a decoded value would blur. */
const rawGet = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

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
  readonly subclass?: string;
  readonly level: number;
  readonly scores: readonly [number, number, number, number, number, number];
}

/** A Human of the core rules, composed at its level the way the create form composes one. */
const aCoreCharacter = (
  person: Person,
  options: ReadonlyArray<CharacterOption>,
  recipe: Recipe,
) => {
  const composed = startingSheetBody({
    classOption: asClassOption(optionNamed(options, "class", recipe.className)),
    raceOption: asRaceOption(optionNamed(options, "race", "Human")),
    backgroundOption: asBackgroundOption(optionNamed(options, "background", "Acolyte")),
    background: "Acolyte",
    subclass: recipe.subclass,
    abilities: cells(recipe.scores),
    level: recipe.level,
  });
  return as(person.token, (client) =>
    client.me.createCoreCharacter({
      payload: {
        name: recipe.name,
        race: "Human",
        className: recipe.className,
        level: recipe.level,
        ac: composed.seed.ac,
        ...(composed.seed.hpMax === undefined ? {} : { hpMax: composed.seed.hpMax }),
        sheet: { notes: "", ...composed.body },
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

/** The owner seats their own character at the table. */
const seatAt = (person: Person, campaignId: CampaignId, character: Character) =>
  as(person.token, (client) =>
    client.party.join({ params: { campaignId }, payload: { characterId: character.id } }),
  );

const partyOf = (person: Person, campaignId: CampaignId) =>
  as(person.token, (client) => client.party.list({ params: { campaignId } }));

const seatIn = (party: ReadonlyArray<PartySeat>, id: CampaignCharacterId) =>
  party.find((one) => one.seat.id === id);

/** The keys one entry of the table's log carries on the wire, and nothing else. */
const NARROW_KEYS = ["className", "createdAt", "feat", "level", "note", "picks", "subclass"];

const makeFixture = Effect.gen(function* () {
  yield* importSystemEquipment().pipe(Effect.orDie);
  yield* importSystemOptions().pipe(Effect.orDie);
  yield* importSystemFeats().pipe(Effect.orDie);
  yield* importSystemSpells().pipe(Effect.orDie);
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const marta = yield* aPerson("Marta");
  const stranger = yield* aPerson("Bo");
  const options = yield* as(ilse.token, (client) => client.library.coreOptions({ query: {} }));
  const table = (yield* as(jo.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  )).id;
  yield* admittedTo(table, ilse.actor, "Ilse");
  yield* admittedTo(table, marta.actor, "Marta");

  /** Ilse's fighter, seated and shared with the table, then taken to 3 as a Champion. */
  const tamsin = yield* aCoreCharacter(ilse, options, {
    name: "Tamsin",
    className: "Fighter",
    level: 2,
    scores: [15, 14, 14, 10, 12, 8],
  });
  const tamsinSeat = (yield* seatAt(ilse, table, tamsin)).seat.id;
  yield* as(jo.token, (client) =>
    client.party.update({
      params: { campaignId: table, campaignCharacterId: tamsinSeat },
      payload: { visibility: "shared" },
    }),
  );
  const offer = yield* offerOf(ilse, tamsin);
  const champion = offer.subclass!.options.find((option) => option.name === "Champion")!;
  yield* levelUp(
    ilse,
    tamsin,
    answering(offer, { subclass: { subclassId: champion.subclassId }, note: "NOTE-TAMSIN" }),
  );

  /** Marta's sorcerer, seated and left hidden (`dm`), not yet levelled. */
  const odo = yield* aCoreCharacter(marta, options, {
    name: "Odo",
    className: "Sorcerer",
    subclass: "Draconic",
    level: 2,
    scores: [8, 14, 13, 10, 12, 15],
  });
  const odoSeat = (yield* seatAt(marta, table, odo)).seat.id;
  return { jo, ilse, marta, stranger, options, table, tamsinSeat, odo, odoSeat };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "party-level-ups.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer(
  "party-level-ups",
  shared,
  (it) => {
    describe("the creator", () => {
      it.effect("reads a seat's log, narrow: what was taken by name, and the note", () =>
        Effect.gen(function* () {
          const { jo, table, tamsinSeat } = yield* Fixture;
          const tamsin = seatIn(yield* partyOf(jo, table), tamsinSeat)!;
          expect(tamsin.levelUps).toEqual([
            {
              level: 3,
              className: "Fighter",
              subclass: "Champion",
              feat: null,
              picks: [],
              note: "NOTE-TAMSIN",
              createdAt: expect.anything(),
            },
          ]);

          // On the wire the entry is the narrow shape and nothing else: no hit
          // point roll, no applied deltas, no ids and no provenance.
          const raw = yield* rawGet(jo.token, `/campaigns/${table}/party`);
          const wire = (JSON.parse(raw.body) as ReadonlyArray<Record<string, unknown>>).find(
            (one) => (one.seat as { readonly id: string }).id === tamsinSeat,
          )!;
          const entries = wire.levelUps as ReadonlyArray<Record<string, unknown>>;
          expect(entries.map((entry) => Object.keys(entry).sort())).toEqual([NARROW_KEYS]);
        }),
      );
    });

    describe("a hidden seat", () => {
      it.effect(
        "keeps its log from another player, byte for byte, and gives it to its owner and the creator",
        () =>
          Effect.gen(function* () {
            const { jo, ilse, marta, stranger, table, odo, odoSeat } = yield* Fixture;
            const path = `/campaigns/${table}/party`;
            const before = yield* rawGet(ilse.token, path);
            expect(before.status).toBe(200);

            const offer = yield* offerOf(marta, odo);
            const metamagic = choiceBy(offer, "Metamagic");
            const scorching = offer.spells!.options.find(
              (option) => option.name === "Scorching Ray",
            )!;
            yield* levelUp(
              marta,
              odo,
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
                spells: { learned: [scorching.spellId] },
                note: "NOTE-ODO",
              }),
            );

            const after = yield* rawGet(ilse.token, path);
            expect(after).toEqual(before);
            expect(after.body).not.toContain("NOTE-ODO");
            expect(seatIn(yield* partyOf(ilse, table), odoSeat)).toBeUndefined();

            for (const reader of [marta, jo]) {
              const log = seatIn(yield* partyOf(reader, table), odoSeat)!.levelUps;
              expect(log).toHaveLength(1);
              expect(log[0]).toMatchObject({
                level: 3,
                className: "Sorcerer",
                subclass: null,
                feat: null,
                note: "NOTE-ODO",
              });
              expect([...log[0]!.picks].sort()).toEqual([
                "Metamagic: Careful Spell",
                "Metamagic: Quickened Spell",
              ]);
            }

            expect(
              yield* attempt(stranger.token, (client) =>
                client.party.list({ params: { campaignId: table } }),
              ),
            ).toBe("NotFound");
          }),
      );

      it.effect("shows its log to the table once shared, on the PATCH's answer too", () =>
        Effect.gen(function* () {
          const { jo, ilse, marta, options, table } = yield* Fixture;
          const pell = yield* aCoreCharacter(marta, options, {
            name: "Pell",
            className: "Fighter",
            level: 1,
            scores: [15, 14, 14, 10, 12, 8],
          });
          const pellSeat = (yield* seatAt(marta, table, pell)).seat.id;
          yield* levelUp(
            marta,
            pell,
            answering(yield* offerOf(marta, pell), { note: "NOTE-PELL" }),
          );
          expect(seatIn(yield* partyOf(ilse, table), pellSeat)).toBeUndefined();

          const shared = yield* as(jo.token, (client) =>
            client.party.update({
              params: { campaignId: table, campaignCharacterId: pellSeat },
              payload: { visibility: "shared" },
            }),
          );
          expect(shared.levelUps.map((entry) => [entry.level, entry.note])).toEqual([
            [2, "NOTE-PELL"],
          ]);
          expect(
            seatIn(yield* partyOf(ilse, table), pellSeat)!.levelUps.map((entry) => entry.note),
          ).toEqual(["NOTE-PELL"]);
        }),
      );
    });

    describe("the log", () => {
      it.effect(
        "comes with the join, latest first, and loses a level the Level box took back",
        () =>
          Effect.gen(function* () {
            const { jo, ilse, options, table } = yield* Fixture;
            const wren = yield* aCoreCharacter(ilse, options, {
              name: "Wren",
              className: "Fighter",
              level: 1,
              scores: [15, 14, 14, 10, 12, 8],
            });
            const second = yield* levelUp(ilse, wren, answering(yield* offerOf(ilse, wren)));
            const offer = yield* offerOf(ilse, second.character);
            const champion = offer.subclass!.options.find((option) => option.name === "Champion")!;
            const third = yield* levelUp(
              ilse,
              second.character,
              answering(offer, { subclass: { subclassId: champion.subclassId } }),
            );

            const joined = yield* seatAt(ilse, table, wren);
            expect(joined.levelUps.map((entry) => entry.level)).toEqual([3, 2]);

            const lowered = yield* as(ilse.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: wren.id },
                payload: { expectedVersion: third.character.version, level: 2 },
              }),
            );
            const read = seatIn(yield* partyOf(jo, table), joined.seat.id)!;
            expect(read.levelUps.map((entry) => entry.level)).toEqual([2]);

            const sql = yield* SqlClient.SqlClient;
            const levelsRecorded = sql<{ readonly level: number }>`
              select level from character_advancement where character_id = ${wren.id}
              order by level
            `.pipe(Effect.orDie);
            expect((yield* levelsRecorded).map((row) => row.level)).toEqual([2]);

            // Regaining the level by the Level box brings no record back.
            const raised = yield* as(ilse.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: wren.id },
                payload: { expectedVersion: lowered.version, level: 3 },
              }),
            );
            const regained = seatIn(yield* partyOf(jo, table), joined.seat.id)!;
            expect(regained.levelUps.map((entry) => entry.level)).toEqual([2]);
            expect((yield* levelsRecorded).map((row) => row.level)).toEqual([2]);

            // A cleared box takes every record, and setting it again brings none back.
            const cleared = yield* as(ilse.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: wren.id },
                payload: { expectedVersion: raised.version, level: null },
              }),
            );
            expect((yield* levelsRecorded).map((row) => row.level)).toEqual([]);
            yield* as(ilse.token, (client) =>
              client.me.updateCharacter({
                params: { characterId: wren.id },
                payload: { expectedVersion: cleared.version, level: 3 },
              }),
            );
            const reset = seatIn(yield* partyOf(jo, table), joined.seat.id)!;
            expect(reset.levelUps).toEqual([]);
            expect((yield* levelsRecorded).map((row) => row.level)).toEqual([]);
          }),
      );
    });
  },
  { timeout: "120 seconds" },
);
