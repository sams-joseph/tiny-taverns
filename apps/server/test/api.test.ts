import { NodeHttpServer } from "@effect/platform-node";
import { CampaignId, TavernsApi } from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { importSystemCreatures } from "../src/bestiary/import.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The real application — the same `servicesOver`/`applicationOver` that
 * `main.ts` uses — over a throwaway database and an in-process server.
 *
 * Everything here goes through `HttpApiClient.make(TavernsApi)`, the client
 * *derived from the declaration the server implements*. That is the property
 * worth testing: if a payload, a param or a response shape drifts, this file
 * stops compiling rather than failing at runtime in the browser.
 */
const database = migratedDatabase("taverns_test_api");
const services = servicesOver(database);

/**
 * `database` is merged in as well as provided, so this file can load the
 * bundled bestiary the way an operator does — `importSystemCreatures` is
 * deliberately not an endpoint, so there is no way to reach it through the
 * client. `Layer` memoises by identity, so this is still one pool and one
 * migration run.
 */
const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

/** A client that presents the DM's bearer token on every request. */
const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

const anonymous = HttpApiClient.make(TavernsApi);

let token: string;

beforeAll(async () => {
  token = await runtime.runPromise(
    Effect.flatMap(Accounts, (accounts) => accounts.issue("Jo")).pipe(
      Effect.map((issued) => issued.token),
      Effect.orDie,
    ),
  );
  await runtime.runPromise(importSystemCreatures().pipe(Effect.orDie));
}, 60_000);

describe("GET /health", () => {
  it("answers without a token, and decodes as HealthStatus", async () => {
    const status = await runtime.runPromise(
      Effect.flatMap(anonymous, (client) => client.health.check()).pipe(Effect.orDie),
    );

    expect(status.status).toBe("ok");
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });
});

describe("authorization", () => {
  it("rejects a request with no bearer token", async () => {
    // `HttpApiSecurity.bearer` answers no 401 of its own — it hands the
    // middleware an empty credential and runs it anyway. This passes because
    // `Authorization` rejects the empty credential explicitly.
    const result = await runtime.runPromise(
      Effect.flatMap(anonymous, (client) => client.campaigns.list()).pipe(Effect.result),
    );

    expect(result._tag).toBe("Failure");
  });

  it("rejects a well-formed token that resolves to nothing", async () => {
    const result = await runtime.runPromise(
      Effect.flatMap(clientFor("not-a-real-token"), (client) => client.campaigns.list()).pipe(
        Effect.result,
      ),
    );

    expect(result._tag).toBe("Failure");
  });
});

describe("campaign, session, character and note CRUD", () => {
  it("round-trips a campaign and everything hanging off it", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);

        const campaign = yield* client.campaigns.create({
          payload: { name: "The Reed Marches", partyName: "The Ferrymen", playerCount: 4 },
        });
        const campaignId = campaign.id;

        const note = yield* client.notes.create({
          params: { campaignId },
          payload: { title: "The crate", body: "Decide what the crate contains" },
        });
        const session = yield* client.sessions.create({
          params: { campaignId },
          payload: { number: 12, title: "The ford" },
        });
        const character = yield* client.characters.create({
          params: { campaignId },
          payload: {
            name: "Ilse",
            playerName: "Sam",
            descriptor: "Half-orc paladin",
            ac: 17,
            hpMax: 21,
          },
        });

        const readBack = yield* client.notes.findById({ params: { campaignId, noteId: note.id } });
        const listed = yield* client.campaigns.list();

        return { campaign, note, session, character, readBack, listed };
      }).pipe(Effect.orDie),
    );

    expect(seen.campaign.name).toBe("The Reed Marches");
    expect(seen.campaign.playerCount).toBe(4);
    // Nothing asked for a visibility, so the column default decided.
    expect(seen.campaign.visibility).toBe("dm");
    expect(seen.note.visibility).toBe("dm");
    expect(seen.note.kind).toBe("note");
    expect(seen.session.number).toBe(12);
    expect(seen.character.descriptor).toBe("Half-orc paladin");
    expect(seen.readBack.body).toBe("Decide what the crate contains");
    expect(seen.listed.map((campaign) => campaign.id)).toContain(seen.campaign.id);

    // Provenance is inert but present from the first row written.
    expect(seen.note.origin).toBe("authored");
    expect(seen.note.assistantTurnId).toBeNull();
  }, 60_000);

  it("updates and archives", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);

        const campaign = yield* client.campaigns.create({ payload: { name: "The Hag's Bargain" } });
        const campaignId = campaign.id;

        const renamed = yield* client.campaigns.update({
          params: { campaignId },
          payload: { name: "The Hag's Bargain (revised)", playerCount: 5 },
        });
        const archived = yield* client.campaigns.archive({ params: { campaignId } });
        const listed = yield* client.campaigns.list();

        return { renamed, archived, listed };
      }).pipe(Effect.orDie),
    );

    expect(seen.renamed.name).toBe("The Hag's Bargain (revised)");
    expect(seen.renamed.playerCount).toBe(5);
    expect(seen.archived.archivedAt).not.toBeNull();
    // Archived, not deleted: gone from the list, still in the database.
    expect(seen.listed.map((campaign) => campaign.id)).not.toContain(seen.archived.id);
  }, 60_000);

  it("deletes a note", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* client.campaigns.create({ payload: { name: "Deletions" } });
        const campaignId = campaign.id;
        const note = yield* client.notes.create({
          params: { campaignId },
          payload: { title: "temporary" },
        });

        yield* client.notes.remove({ params: { campaignId, noteId: note.id } });
        return yield* Effect.result(
          client.notes.findById({ params: { campaignId, noteId: note.id } }),
        );
      }).pipe(Effect.orDie),
    );

    expect(result._tag).toBe("Failure");
  }, 60_000);
});

describe("the prep surface", () => {
  it("round-trips an encounter, a prep item and an attached read-aloud", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);

        const campaign = yield* client.campaigns.create({ payload: { name: "The Salt Road" } });
        const campaignId = campaign.id;

        const encounter = yield* client.encounters.create({
          params: { campaignId },
          payload: {
            name: "Ambush in the reeds",
            difficulty: "Medium",
            tags: ["Marsh", "Night"],
          },
        });
        const session = yield* client.sessions.create({
          params: { campaignId },
          payload: { number: 12, title: "The ford" },
        });
        const item = yield* client.prep.create({
          params: { campaignId, sessionId: session.id },
          payload: { label: "Decide what the crate contains" },
        });
        const readAloud = yield* client.notes.create({
          params: { campaignId },
          payload: {
            title: "Read aloud at the water",
            body: "The reeds are taller than you are and they are not moving.",
            kind: "read_aloud",
            attachedTo: { kind: "encounter", id: encounter.id },
          },
        });

        const encounters = yield* client.encounters.list({ params: { campaignId } });
        const checklist = yield* client.prep.list({
          params: { campaignId, sessionId: session.id },
        });
        const noteBack = yield* client.notes.findById({
          params: { campaignId, noteId: readAloud.id },
        });
        const ticked = yield* client.prep.update({
          params: { campaignId, sessionId: session.id, prepItemId: item.id },
          payload: { done: true },
        });

        return { encounter, item, readAloud, encounters, checklist, noteBack, ticked };
      }).pipe(Effect.orDie),
    );

    expect(seen.encounter.name).toBe("Ambush in the reeds");
    expect(seen.encounter.difficulty).toBe("Medium");
    // `text[]` survives the round trip as a real array, not a Postgres literal.
    expect(seen.encounter.tags).toEqual(["Marsh", "Night"]);
    // Nothing asked for a visibility, so the column default decided.
    expect(seen.encounter.visibility).toBe("dm");
    expect(seen.encounter.origin).toBe("authored");
    expect(seen.encounter.assistantTurnId).toBeNull();

    expect(seen.item.label).toBe("Decide what the crate contains");
    expect(seen.item.done).toBe(false);
    expect(seen.item.visibility).toBe("dm");
    expect(seen.item.origin).toBe("authored");
    expect(seen.ticked.done).toBe(true);

    expect(seen.noteBack.attachedTo).toEqual({ kind: "encounter", id: seen.encounter.id });
    expect(seen.encounters.map((e) => e.id)).toEqual([seen.encounter.id]);
    expect(seen.checklist.map((i) => i.id)).toEqual([seen.item.id]);
  }, 60_000);

  it("leaves an encounter with no difficulty as null rather than inventing a band", async () => {
    const encounter = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* client.campaigns.create({ payload: { name: "Unrated" } });
        return yield* client.encounters.create({
          params: { campaignId: campaign.id },
          payload: { name: "Whatever is in the crate" },
        });
      }).pipe(Effect.orDie),
    );

    expect(encounter.difficulty).toBeNull();
    expect(encounter.tags).toEqual([]);
  }, 60_000);

  it("refuses a prep item under a session in a different campaign", async () => {
    // The session id is a client claim, not a fact. The read predicate is
    // handed the campaign it must contain the session within, so naming
    // another campaign's session is a 404 and not a cross-table write.
    const error = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const mine = yield* client.campaigns.create({ payload: { name: "Mine" } });
        const theirs = yield* client.campaigns.create({ payload: { name: "Theirs" } });
        const elsewhere = yield* client.sessions.create({
          params: { campaignId: theirs.id },
          payload: { number: 1 },
        });

        return yield* Effect.flip(
          client.prep.create({
            params: { campaignId: mine.id, sessionId: elsewhere.id },
            payload: { label: "smuggled" },
          }),
        );
      }).pipe(Effect.orDie),
    );

    expect(error._tag).toBe("NotFound");
  }, 60_000);

  it("deletes an encounter and detaches its note instead of deleting it", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* client.campaigns.create({ payload: { name: "Deletions" } });
        const campaignId = campaign.id;
        const encounter = yield* client.encounters.create({
          params: { campaignId },
          payload: { name: "temporary" },
        });
        const note = yield* client.notes.create({
          params: { campaignId },
          payload: {
            title: "the prose outlives it",
            attachedTo: { kind: "encounter", id: encounter.id },
          },
        });

        yield* client.encounters.remove({ params: { campaignId, encounterId: encounter.id } });

        const gone = yield* Effect.result(
          client.encounters.findById({ params: { campaignId, encounterId: encounter.id } }),
        );
        const survivor = yield* client.notes.findById({ params: { campaignId, noteId: note.id } });
        return { gone, survivor };
      }).pipe(Effect.orDie),
    );

    expect(seen.gone._tag).toBe("Failure");
    expect(seen.survivor.title).toBe("the prose outlives it");
    expect(seen.survivor.attachedTo).toBeNull();
  }, 60_000);
});

describe("the bestiary", () => {
  it("round-trips an authored creature, document and all", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* client.campaigns.create({ payload: { name: "The Marsh" } });
        const campaignId = campaign.id;

        const creature = yield* client.creatures.create({
          params: { campaignId },
          payload: {
            name: "Bullywug Croaker",
            size: "Medium",
            type: "Humanoid",
            cr: "1/4",
            ac: 15,
            hp: 11,
            environments: ["Marsh"],
            statBlock: {
              meta: "Medium humanoid (bullywug), neutral evil",
              ac: "15 (hide armour, shield)",
              hp: "11 (2d8+2)",
              speed: "20 ft., swim 40 ft.",
              cr: "1/4 (50 XP)",
              abilities: [{ label: "STR", score: "12", modifier: "+1" }],
              traits: [
                {
                  name: "Croak",
                  text: "It croaks. Everything within 30 feet hears it.",
                  dice: "1d4",
                },
              ],
            },
          },
        });
        const readBack = yield* client.creatures.findById({
          params: { campaignId, creatureId: creature.id },
        });

        return { creature, readBack };
      }).pipe(Effect.orDie),
    );

    expect(seen.creature.name).toBe("Bullywug Croaker");
    // The display half survives the round trip whole — the parenthetical is
    // exactly what would be lost by normalising it into the numeric columns.
    expect(seen.readBack.statBlock.ac).toBe("15 (hide armour, shield)");
    expect(seen.readBack.statBlock.traits[0]?.dice).toBe("1d4");
    // `"1/4"` is not a number, and the sort key the server derived says 0.25.
    expect(seen.readBack.cr).toBe("1/4");
    expect(seen.readBack.crSort).toBe(0.25);
    // Nothing asked for a visibility, so the column default decided.
    expect(seen.readBack.visibility).toBe("dm");
    expect(seen.readBack.origin).toBe("authored");
    expect(seen.readBack.derivedFrom).toBeNull();
    expect(seen.readBack.campaignId).toBe(seen.creature.campaignId);
  }, 60_000);

  it("carries the filters as query parameters, arrays included", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* client.campaigns.create({ payload: { name: "Filters" } });
        const campaignId = campaign.id;

        const byName = yield* client.creatures.list({
          params: { campaignId },
          query: { q: "gob", scope: "system" },
        });
        const byTrait = yield* client.creatures.list({
          params: { campaignId },
          query: { q: "nimble escape" },
        });
        // Repeated `?environments=` — the one encoding worth proving end to end.
        const byEnvironment = yield* client.creatures.list({
          params: { campaignId },
          query: { environments: ["River", "Cave"], sort: "name" },
        });

        return { byName, byTrait, byEnvironment };
      }).pipe(Effect.orDie),
    );

    expect(seen.byName.map((creature) => creature.name)).toEqual(["Goblin Boss"]);
    expect(seen.byTrait.map((creature) => creature.name)).toEqual(["Goblin Boss"]);
    expect(seen.byEnvironment.map((creature) => creature.name)).toEqual([
      "Ferryman's Shade",
      "Goblin Boss",
    ]);
  }, 60_000);

  it("derives a campaign copy of a system creature, and refuses to edit the original", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* client.campaigns.create({ payload: { name: "Reskins" } });
        const campaignId = campaign.id;

        const corpus = yield* client.creatures.list({
          params: { campaignId },
          query: { scope: "system", q: "Goblin Boss" },
        });
        const original = corpus[0]!;

        const copy = yield* client.creatures.derive({
          params: { campaignId, creatureId: original.id },
          payload: { name: "Grask, Boss of the Reeds", environments: ["Marsh"] },
        });
        const tampered = yield* Effect.result(
          client.creatures.update({
            params: { campaignId, creatureId: original.id },
            payload: { name: "tampered" },
          }),
        );
        const stillThere = yield* client.creatures.findById({
          params: { campaignId, creatureId: original.id },
        });

        return { original, copy, tampered, stillThere };
      }).pipe(Effect.orDie),
    );

    expect(seen.original.campaignId).toBeNull();
    expect(seen.original.origin).toBe("system");
    expect(seen.copy.derivedFrom).toBe(seen.original.id);
    expect(seen.copy.campaignId).not.toBeNull();
    expect(seen.copy.origin).toBe("authored");
    expect(seen.copy.name).toBe("Grask, Boss of the Reeds");
    // The document came across with it.
    expect(seen.copy.statBlock.traits.map((trait) => trait.name)).toContain("Nimble Escape");
    // The shared corpus is not the DM's to edit — and saying "no such creature"
    // rather than "not yours" is the same refusal the rest of the surface gives.
    expect(seen.tampered._tag).toBe("Failure");
    expect(seen.stillThere.name).toBe("Goblin Boss");
  }, 60_000);

  it("puts creatures on an encounter and makes its creature count true", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* client.campaigns.create({ payload: { name: "The Salt Road" } });
        const campaignId = campaign.id;

        const encounter = yield* client.encounters.create({
          params: { campaignId },
          payload: { name: "Ambush in the reeds", difficulty: "Medium", tags: ["Marsh", "Night"] },
        });
        const encounterId = encounter.id;

        const corpus = yield* client.creatures.list({
          params: { campaignId },
          query: { scope: "system", q: "Goblin Boss" },
        });
        const archer = yield* client.creatures.create({
          params: { campaignId },
          payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
        });

        const boss = yield* client.encounterCreatures.create({
          params: { campaignId, encounterId },
          payload: { creatureId: corpus[0]!.id },
        });
        yield* client.encounterCreatures.create({
          params: { campaignId, encounterId },
          payload: { creatureId: archer.id, count: 5 },
        });

        const listed = yield* client.encounterCreatures.list({
          params: { campaignId, encounterId },
        });
        const counted = yield* client.encounters.findById({ params: { campaignId, encounterId } });
        const repeated = yield* Effect.result(
          client.encounterCreatures.create({
            params: { campaignId, encounterId },
            payload: { creatureId: archer.id },
          }),
        );
        const stillUsed = yield* Effect.flip(
          client.creatures.remove({ params: { campaignId, creatureId: archer.id } }),
        );
        yield* client.encounterCreatures.remove({
          params: { campaignId, encounterId, encounterCreatureId: boss.id },
        });
        const afterRemove = yield* client.encounters.findById({
          params: { campaignId, encounterId },
        });

        return { encounter, listed, counted, repeated, stillUsed, afterRemove };
      }).pipe(Effect.orDie),
    );

    // The card said "6 creatures" (`data.js:10`); now it can.
    expect(seen.encounter.creatureCount).toBe(0);
    expect(seen.listed).toHaveLength(2);
    expect(seen.counted.creatureCount).toBe(6);
    expect(seen.repeated._tag).toBe("Failure");
    expect(seen.stillUsed._tag).toBe("Conflict");
    expect(seen.afterRemove.creatureCount).toBe(5);
  }, 60_000);
});

describe("declared errors reach the client as declared errors", () => {
  it("reports a duplicate session number as Conflict", async () => {
    const error = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        const campaign = yield* client.campaigns.create({ payload: { name: "Numbering" } });
        const campaignId = campaign.id;
        yield* client.sessions.create({ params: { campaignId }, payload: { number: 3 } });
        return yield* Effect.flip(
          client.sessions.create({ params: { campaignId }, payload: { number: 3 } }),
        );
      }).pipe(Effect.orDie),
    );

    expect(error._tag).toBe("Conflict");
  }, 60_000);

  it("reports an unknown campaign as NotFound", async () => {
    const error = await runtime.runPromise(
      Effect.gen(function* () {
        const client = yield* clientFor(token);
        // Branded, so the id has to be decoded rather than written — a plain
        // string is a compile error here, which is the point of the brand.
        const campaignId = Schema.decodeSync(CampaignId)("00000000-0000-4000-8000-000000000000");
        return yield* Effect.flip(client.notes.list({ params: { campaignId } }));
      }).pipe(Effect.orDie),
    );

    expect(error._tag).toBe("NotFound");
  }, 60_000);
});
