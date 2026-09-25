import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  emptyStatBlock,
  type EncounterId,
  TavernsApi,
} from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Creatures } from "../src/repo/Creatures.js";
import { aCharacterAt, admittedTo, campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

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
 * The people are minted the shipped way: a player admitted through a real
 * invitation with a seat the creator shared, and a member of the table's
 * Shared World who plays at another table in it.
 */
const database = migratedDatabase("taverns_test_encounter_player");
const services = servicesOver(database);

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(Effect.flatMap(clientFor(token), call).pipe(Effect.orDie));

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

/** A GET as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
      );
      return { status: response.status, body: yield* response.text };
    }).pipe(Effect.orDie),
  );

interface Person {
  readonly token: string;
  readonly actor: Actor;
}

const person = async (name: string): Promise<Person> => {
  const issued = await run(Effect.flatMap(Accounts, (accounts) => accounts.issue(name)));
  return {
    token: issued.token,
    actor: new Actor({ accountId: issued.accountId, scope: { _tag: "account" } }),
  };
};

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

let jo: Person;
let ilse: Person;
let wren: Person;
let stranger: Person;
let table: CampaignId;
let ambush: EncounterId;
let hidden: EncounterId;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  wren = await person("Wren");
  stranger = await person("Bo");
  // In a Shared World of Jo's, so a second table can be made in it.
  const campaign = await as(jo.token, (client) =>
    campaignVia(client, { name: "The Salt Road", visibility: "shared" }),
  );
  table = campaign.id;

  // The seated player, with a seat the creator shared, and the creator's own
  // seat, so the difficulty has a party to be rated for.
  const player = await run(admittedTo(table, ilse.actor, "Ilse"));
  await run(
    aCharacterAt(table, player, { name: "Tamsin", level: 5 }, { seatVisibility: "shared" }),
  );
  await run(
    aCharacterAt(table, jo.actor, { name: "Brannoc", level: 5 }, { seatVisibility: "shared" }),
  );

  // Another table in the same Shared World, with Wren playing at it.
  const otherTable = await run(
    Effect.provideService(
      Effect.flatMap(Campaigns, (campaigns) =>
        campaigns.create(campaign.contextId, { name: "Rook's Rest", visibility: "shared" }),
      ),
      CurrentActor,
      jo.actor,
    ),
  );
  await run(admittedTo(otherTable.id, wren.actor, "Wren"));

  const library = (payload: Parameters<(typeof Creatures)["Service"]["libraryCreate"]>[0]) =>
    run(
      Effect.provideService(
        Effect.flatMap(Creatures, (creatures) => creatures.libraryCreate(payload)),
        CurrentActor,
        jo.actor,
      ),
    );
  const archer = await library({
    name: "Goblin Archer",
    type: "Humanoid",
    cr: "1/4",
    ac: 15,
    hp: 7,
  });
  const hag = await library(HAG);

  // Shared, with the archers' line shared through the roster's own PATCH and
  // the hag's line kept `dm`, the default.
  const made = await as(jo.token, (client) =>
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
  ambush = made.id;
  const lines = await as(jo.token, (client) =>
    client.encounterCreatures.list({ params: { campaignId: table, encounterId: ambush } }),
  );
  const archers = lines.find((line) => line.name === "Goblin Archer")!;
  await as(jo.token, (client) =>
    client.encounterCreatures.update({
      params: { campaignId: table, encounterId: ambush, encounterCreatureId: archers.id },
      payload: { visibility: "shared" },
    }),
  );

  hidden = (
    await as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: { name: "SENTINEL-UNSHARED", creatures: [{ creatureId: archer.id, count: 2 }] },
      }),
    )
  ).id;
}, 60_000);

describe("the creator's reads", () => {
  it("are unchanged: the difficulty and every creature's numbers", async () => {
    const found = await as(jo.token, (client) =>
      client.encounters.findById({ params: { campaignId: table, encounterId: ambush } }),
    );
    // 4 × 50 + 2,913 = 3,113 XP, ×2 for five creatures, one step up for a
    // party of two: ×2.5.
    expect(found.difficulty).toMatchObject({ _tag: "rated", band: "Deadly", xp: 3113 });
    expect(found.creatureCount).toBe(5);

    const roster = await as(jo.token, (client) =>
      client.encounterCreatures.list({ params: { campaignId: table, encounterId: ambush } }),
    );
    expect(
      roster.map(({ name, count, cr, ac, hp, xp }) => ({ name, count, cr, ac, hp, xp })),
    ).toEqual([
      { name: "Goblin Archer", count: 4, cr: "1/4", ac: 15, hp: 7, xp: 50 },
      { name: "SENTINEL-HAG", count: 1, cr: "7", ac: 19, hp: 113, xp: 2913 },
    ]);
  });
});

describe("the wide reads, to anybody but the creator", () => {
  it("are NotFound for a seated player, a Shared World member and a stranger, shared or not", async () => {
    const paths = [
      `/campaigns/${table}/encounters`,
      `/campaigns/${table}/encounters/${ambush}`,
      `/campaigns/${table}/encounters/${ambush}/creatures`,
      `/campaigns/${table}/encounters/${hidden}`,
      `/campaigns/${table}/encounters/${hidden}/creatures`,
    ];
    for (const who of [ilse, wren, stranger]) {
      for (const path of paths) {
        const answer = await wire(who.token, path);
        expect({ path, status: answer.status }).toEqual({ path, status: 404 });
        expect(answer.body).not.toContain("SENTINEL");
      }
    }
  });
});

describe("a seated player's read", () => {
  it("names the shared lines and counts them, and says nothing else of a creature", async () => {
    const found = await wire(ilse.token, `/campaigns/${table}/player-encounters/${ambush}`);
    expect(found.status).toBe(200);
    for (const key of NUMBER_KEYS) expect(found.body).not.toContain(key);
    expect(found.body).not.toContain("SENTINEL");

    const decoded = await as(ilse.token, (client) =>
      client.playerEncounters.find({ params: { campaignId: table, encounterId: ambush } }),
    );
    expect(decoded).toMatchObject({
      name: "Ambush in the reeds",
      kind: "combat",
      tags: ["Marsh"],
      creatures: [{ name: "Goblin Archer", count: 4 }],
      lastPlayed: null,
    });
  });

  it("lists the shared encounters only, in the same shape", async () => {
    const listed = await wire(ilse.token, `/campaigns/${table}/player-encounters`);
    expect(listed.status).toBe(200);
    for (const key of NUMBER_KEYS) expect(listed.body).not.toContain(key);
    expect(listed.body).not.toContain("SENTINEL");

    const decoded = await as(ilse.token, (client) =>
      client.playerEncounters.list({ params: { campaignId: table } }),
    );
    expect(decoded.map((encounter) => encounter.id)).toEqual([ambush]);
  });

  it("is NotFound for an encounter the DM kept", async () => {
    const answer = await wire(ilse.token, `/campaigns/${table}/player-encounters/${hidden}`);
    expect(answer.status).toBe(404);
    expect(answer.body).not.toContain("SENTINEL");
  });

  it("is NotFound for a Shared World member at another table, and for a stranger", async () => {
    for (const who of [wren, stranger]) {
      for (const path of [
        `/campaigns/${table}/player-encounters`,
        `/campaigns/${table}/player-encounters/${ambush}`,
      ]) {
        const answer = await wire(who.token, path);
        expect({ path, status: answer.status }).toEqual({ path, status: 404 });
      }
    }
  });
});
