import { describe, expect } from "@effect/vitest";
import { CurrentActor, emptyStatBlock, type EncounterId, TavernsApi } from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { applicationOver, servicesOver } from "../src/app.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Creatures } from "../src/repo/Creatures.js";
import { aCharacterAt, admittedTo, aPerson, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **What a player is told about an encounter: its creatures' names and counts,
 * and no number.** The captain's decision of 2026-09-25 — no challenge rating,
 * armour class, hit points or XP on a roster line, and no difficulty at all.
 *
 * Over the real application and Postgres. The creator's reads (`Encounter`
 * with its difficulty, the roster with each creature's numbers) are refused to
 * everybody else; a player reads `playerEncounters`. The wire is read raw
 * wherever a leak is the question, because the derived client decodes into the
 * narrow class and would drop a field the server should never have sent.
 *
 * The player's list follows the DM's planned order and carries no slot, so
 * an encounter kept from them leaves no gap to count.
 *
 * The people are minted the shipped way: a player admitted through a real
 * invitation with a seat the creator shared, and a member of the table's
 * Shared World who plays at another table in it.
 */
const database = migratedDatabase("taverns_test_encounter_player");
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

/** A GET as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

/** The DM's secret: a creature whose name and numbers are planted to be found. */
const HAG = {
  name: "SENTINEL-HAG",
  type: "Fey",
  cr: "7",
  ac: 19,
  hp: 113,
  statBlock: { ...emptyStatBlock, xp: 2913 },
} as const;

/**
 * Every JSON key a creature's numbers or a difficulty is spelled with. Keys,
 * not values: a value like `19` turns up in ids and timestamps.
 */
const NUMBER_KEYS = [
  '"difficulty"',
  '"band"',
  '"thresholds"',
  '"adjustedXp"',
  '"multiplier"',
  '"xp"',
  '"cr"',
  '"ac"',
  '"hp"',
  '"creatureId"',
  '"creatureCount"',
  '"visibility"',
];

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const wren = yield* aPerson("Wren");
  const stranger = yield* aPerson("Bo");
  // In a Shared World of Jo's, so a second table can be made in it.
  const campaign = yield* as(jo.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  );
  const table = campaign.id;

  // The seated player, with a seat the creator shared, and the creator's own
  // seat, so the difficulty has a party to be rated for.
  const player = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, player, { name: "Tamsin", level: 5 }, { seatVisibility: "shared" });
  yield* aCharacterAt(table, jo.actor, { name: "Brannoc", level: 5 }, { seatVisibility: "shared" });

  // Another table in the same Shared World, with Wren playing at it.
  const campaigns = yield* Campaigns;
  const otherTable = yield* Effect.provideService(
    campaigns.create(campaign.contextId, { name: "Rook's Rest", visibility: "shared" }),
    CurrentActor,
    jo.actor,
  ).pipe(Effect.orDie);
  yield* admittedTo(otherTable.id, wren.actor, "Wren");

  const creatures = yield* Creatures;
  const library = (payload: Parameters<(typeof Creatures)["Service"]["libraryCreate"]>[0]) =>
    Effect.provideService(creatures.libraryCreate(payload), CurrentActor, jo.actor).pipe(
      Effect.orDie,
    );
  const archer = yield* library({
    name: "Goblin Archer",
    type: "Humanoid",
    cr: "1/4",
    ac: 15,
    hp: 7,
  });
  const hag = yield* library(HAG);

  // Shared, with the archers' line shared through the roster's own PATCH and
  // the hag's line kept `dm`, the default.
  const made = yield* as(jo.token, (client) =>
    client.encounters.create({
      params: { campaignId: table },
      payload: {
        name: "Ambush in the reeds",
        visibility: "shared",
        ready: true,
        tags: ["Marsh"],
        creatures: [
          { creatureId: archer.id, count: 4 },
          { creatureId: hag.id, count: 1 },
        ],
      },
    }),
  );
  const ambush = made.id;
  const lines = yield* as(jo.token, (client) =>
    client.encounterCreatures.list({ params: { campaignId: table, encounterId: ambush } }),
  );
  const archers = lines.find((line) => line.name === "Goblin Archer")!;
  yield* as(jo.token, (client) =>
    client.encounterCreatures.update({
      params: { campaignId: table, encounterId: ambush, encounterCreatureId: archers.id },
      payload: { visibility: "shared" },
    }),
  );

  const hidden = (yield* as(jo.token, (client) =>
    client.encounters.create({
      params: { campaignId: table },
      payload: { name: "SENTINEL-UNSHARED", creatures: [{ creatureId: archer.id, count: 2 }] },
    }),
  )).id;

  return { jo, ilse, wren, stranger, table, ambush, hidden };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "encounter-player.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer("encounter-player", shared, (it) => {
  describe("the creator's reads", () => {
    it.effect("are unchanged: the difficulty and every creature's numbers", () =>
      Effect.gen(function* () {
        const { jo, table, ambush } = yield* Fixture;
        const found = yield* as(jo.token, (client) =>
          client.encounters.findById({ params: { campaignId: table, encounterId: ambush } }),
        );
        // 4 × 50 + 2,913 = 3,113 XP, ×2 for five creatures, one step up for a
        // party of two: ×2.5.
        expect(found.difficulty).toMatchObject({ _tag: "rated", band: "Deadly", xp: 3113 });
        expect(found.creatureCount).toBe(5);

        const roster = yield* as(jo.token, (client) =>
          client.encounterCreatures.list({ params: { campaignId: table, encounterId: ambush } }),
        );
        expect(
          roster.map(({ name, count, cr, ac, hp, xp }) => ({ name, count, cr, ac, hp, xp })),
        ).toEqual([
          { name: "Goblin Archer", count: 4, cr: "1/4", ac: 15, hp: 7, xp: 50 },
          { name: "SENTINEL-HAG", count: 1, cr: "7", ac: 19, hp: 113, xp: 2913 },
        ]);
      }),
    );
  });

  describe("the wide reads, to anybody but the creator", () => {
    it.effect(
      "are NotFound for a seated player, a Shared World member and a stranger, shared or not",
      () =>
        Effect.gen(function* () {
          const { ilse, wren, stranger, table, ambush, hidden } = yield* Fixture;
          const paths = [
            `/campaigns/${table}/encounters`,
            `/campaigns/${table}/encounters/${ambush}`,
            `/campaigns/${table}/encounters/${ambush}/creatures`,
            `/campaigns/${table}/encounters/${hidden}`,
            `/campaigns/${table}/encounters/${hidden}/creatures`,
          ];
          for (const who of [ilse, wren, stranger]) {
            for (const path of paths) {
              const answer = yield* wire(who.token, path);
              expect({ path, status: answer.status }).toEqual({ path, status: 404 });
              expect(answer.body).not.toContain("SENTINEL");
            }
          }
        }),
    );
  });

  describe("a seated player's read", () => {
    it.effect("names the shared lines and counts them, and says nothing else of a creature", () =>
      Effect.gen(function* () {
        const { ilse, table, ambush } = yield* Fixture;
        const found = yield* wire(ilse.token, `/campaigns/${table}/player-encounters/${ambush}`);
        expect(found.status).toBe(200);
        for (const key of NUMBER_KEYS) expect(found.body).not.toContain(key);
        expect(found.body).not.toContain("SENTINEL");

        const decoded = yield* as(ilse.token, (client) =>
          client.playerEncounters.find({ params: { campaignId: table, encounterId: ambush } }),
        );
        expect(decoded).toMatchObject({
          name: "Ambush in the reeds",
          kind: "combat",
          tags: ["Marsh"],
          creatures: [{ name: "Goblin Archer", count: 4 }],
          lastPlayed: null,
        });
      }),
    );

    it.effect("lists the shared encounters only, in the same shape", () =>
      Effect.gen(function* () {
        const { ilse, table, ambush } = yield* Fixture;
        const listed = yield* wire(ilse.token, `/campaigns/${table}/player-encounters`);
        expect(listed.status).toBe(200);
        for (const key of NUMBER_KEYS) expect(listed.body).not.toContain(key);
        expect(listed.body).not.toContain("SENTINEL");

        const decoded = yield* as(ilse.token, (client) =>
          client.playerEncounters.list({ params: { campaignId: table } }),
        );
        expect(decoded.map((encounter) => encounter.id)).toEqual([ambush]);
      }),
    );

    it.effect("follows the DM's planned order, told as array order and never as a number", () =>
      Effect.gen(function* () {
        const { jo, ilse, table, ambush, hidden } = yield* Fixture;
        // Two more the table may read, made after the ambush and the kept draft.
        const made = (name: string) =>
          as(jo.token, (client) =>
            client.encounters.create({
              params: { campaignId: table },
              payload: { name, visibility: "shared", ready: true },
            }),
          ).pipe(Effect.map((encounter) => encounter.id));
        const toll = yield* made("Toll at the bridge");
        const chapel = yield* made("The drowned chapel");
        const moveTo = (encounterId: EncounterId, before: EncounterId) =>
          as(jo.token, (client) =>
            client.encounters.move({
              params: { campaignId: table, encounterId },
              payload: { before },
            }),
          );
        const playerOrder = as(ilse.token, (client) =>
          client.playerEncounters.list({ params: { campaignId: table } }),
        ).pipe(Effect.map((listed) => listed.map((encounter) => encounter.id)));

        expect(yield* playerOrder).toEqual([ambush, toll, chapel]);
        // The chapel to the top, and the kept draft between it and the toll: the
        // player's list moves with the DM's, and the draft leaves no trace.
        yield* moveTo(chapel, ambush);
        yield* moveTo(hidden, toll);
        expect(yield* playerOrder).toEqual([chapel, ambush, toll]);
        const dm = yield* as(jo.token, (client) =>
          client.encounters.list({ params: { campaignId: table }, query: {} }),
        );
        expect(dm.items.map((encounter) => encounter.id)).toEqual([chapel, ambush, hidden, toll]);

        // No slot on either wire: not the player's, and not the creator's either,
        // whose array order is the whole answer too.
        const player = yield* wire(ilse.token, `/campaigns/${table}/player-encounters`);
        const creator = yield* wire(jo.token, `/campaigns/${table}/encounters`);
        for (const body of [player.body, creator.body]) {
          expect(body).not.toContain('"position"');
          expect(body).not.toContain("planned_position");
        }
        const one = yield* wire(ilse.token, `/campaigns/${table}/player-encounters/${chapel}`);
        expect(one.body).not.toContain('"position"');
      }),
    );

    it.effect("is NotFound for an encounter the DM kept", () =>
      Effect.gen(function* () {
        const { ilse, table, hidden } = yield* Fixture;
        const answer = yield* wire(ilse.token, `/campaigns/${table}/player-encounters/${hidden}`);
        expect(answer.status).toBe(404);
        expect(answer.body).not.toContain("SENTINEL");
      }),
    );

    it.effect("is NotFound for a Shared World member at another table, and for a stranger", () =>
      Effect.gen(function* () {
        const { wren, stranger, table, ambush } = yield* Fixture;
        for (const who of [wren, stranger]) {
          for (const path of [
            `/campaigns/${table}/player-encounters`,
            `/campaigns/${table}/player-encounters/${ambush}`,
          ]) {
            const answer = yield* wire(who.token, path);
            expect({ path, status: answer.status }).toEqual({ path, status: 404 });
          }
        }
      }),
    );
  });
});
