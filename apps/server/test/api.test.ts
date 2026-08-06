import { NodeHttpServer } from "@effect/platform-node";
import { CampaignId, TavernsApi } from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
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
const services = servicesOver(migratedDatabase("taverns_test_api"));

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
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
    // No handler code produces this: the declared `HttpApiSecurity.bearer`
    // scheme answers 401 on its own.
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
