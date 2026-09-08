import { NodeHttpServer } from "@effect/platform-node";
import { type CampaignId, type NpcId, TavernsApi } from "@taverns/api";
import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { NPC_PROMPT_TEMPLATE_VERSION } from "../src/assistant/npcPrompt.js";
import { campaignVia } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The cast over HTTP — the real application, the client derived from the
 * declaration, and no model configured, which is what CI runs.
 *
 * `npcs.test.ts` proves the repositories and the loop; this file proves the
 * *wire*: that every endpoint decodes, that a player at the table and a
 * stranger are refused with the campaign's ordinary 404, and that a rehearsal
 * with no model behind it is the declared 503 rather than a stack trace.
 */
const database = migratedDatabase("taverns_test_npcs_api");
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

const issue = (name: string) =>
  runtime.runPromise(
    Effect.flatMap(Accounts, (accounts) => accounts.issue(name)).pipe(
      Effect.map((issued) => issued.token),
      Effect.orDie,
    ),
  );

let creator: string;
let player: string;
let stranger: string;
let campaignId: CampaignId;

beforeAll(async () => {
  creator = await issue("Jo");
  player = await issue("Pim");
  stranger = await issue("Bo");

  campaignId = await runtime.runPromise(
    Effect.gen(function* () {
      const dm = yield* clientFor(creator);
      const campaign = yield* campaignVia(dm, { name: "The Salt Road", visibility: "shared" });
      // A real player, through a real invitation.
      const issued = yield* dm.invites.create({
        params: { groupId: campaign.groupId },
        payload: { label: "Pim", campaignId: campaign.id },
      });
      const pim = yield* clientFor(player);
      yield* pim.join.redeem({ payload: { token: issued.token } });
      return campaign.id;
    }).pipe(Effect.orDie),
  );
}, 60_000);

describe("the npcs group", () => {
  let cazril: NpcId;

  it("round-trips an NPC: create, list, find, update, archive, restore", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const dm = yield* clientFor(creator);
        const made = yield* dm.npcs.create({
          params: { campaignId },
          payload: {
            name: "Cazril",
            role: "the ferryman",
            persona: { identity: { summary: "Takes names, not coin." } },
            privateMaterial: { secrets: "He owes the hag." },
          },
        });
        cazril = made.id;
        const listed = yield* dm.npcs.list({ params: { campaignId }, query: {} });
        const found = yield* dm.npcs.findById({ params: { campaignId, npcId: made.id } });
        const updated = yield* dm.npcs.update({
          params: { campaignId, npcId: made.id },
          payload: { expectedVersion: made.version, role: "the ferryman at the crossing" },
        });
        const stale = yield* Effect.result(
          dm.npcs.update({
            params: { campaignId, npcId: made.id },
            payload: { expectedVersion: made.version, role: "nobody" },
          }),
        );
        const archived = yield* dm.npcs.archive({
          params: { campaignId, npcId: made.id },
          payload: {},
        });
        const liveAfter = yield* dm.npcs.list({ params: { campaignId }, query: {} });
        const shelf = yield* dm.npcs.list({ params: { campaignId }, query: { archived: true } });
        const restored = yield* dm.npcs.restore({
          params: { campaignId, npcId: made.id },
          payload: {},
        });
        return { made, listed, found, updated, stale, archived, liveAfter, shelf, restored };
      }).pipe(Effect.orDie),
    );

    expect(seen.made).toMatchObject({ name: "Cazril", version: 1, archivedAt: null });
    expect(seen.made.privateMaterial).toEqual({ secrets: "He owes the hag." });
    expect(seen.listed.map((npc) => npc.id)).toEqual([seen.made.id]);
    expect(seen.found.id).toBe(seen.made.id);
    expect(seen.updated.version).toBe(2);
    expect(seen.stale._tag).toBe("Failure");
    expect(seen.stale._tag === "Failure" && seen.stale.failure).toMatchObject({ _tag: "Conflict" });
    expect(seen.archived.archivedAt).not.toBeNull();
    expect(seen.liveAfter).toEqual([]);
    expect(seen.shelf.map((npc) => npc.id)).toEqual([seen.made.id]);
    expect(seen.restored.archivedAt).toBeNull();
  }, 60_000);

  it("answers the rehearsal status as unavailable, with the prompt metadata, and no threads yet", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const dm = yield* clientFor(creator);
        const status = yield* dm.npcs.rehearsal({ params: { campaignId, npcId: cazril } });
        const threads = yield* dm.npcs.threads({ params: { campaignId, npcId: cazril } });
        const rehearse = yield* Effect.result(
          dm.npcs.rehearse({ params: { campaignId, npcId: cazril }, payload: { text: "hello" } }),
        );
        return { status, threads, rehearse };
      }).pipe(Effect.orDie),
    );

    expect(seen.status).toMatchObject({
      available: false,
      model: null,
      npc: "Cazril",
      templateVersion: NPC_PROMPT_TEMPLATE_VERSION,
    });
    expect(seen.status.estimatedTokens).toBeGreaterThan(0);
    expect(seen.threads).toEqual([]);
    expect(seen.rehearse._tag).toBe("Failure");
    expect(seen.rehearse._tag === "Failure" && seen.rehearse.failure).toMatchObject({
      _tag: "HobUnavailable",
    });
  }, 60_000);

  it("refuses a player at the table and a stranger with the campaign's 404, on every endpoint", async () => {
    for (const token of [player, stranger]) {
      const outcomes = await runtime.runPromise(
        Effect.gen(function* () {
          const client = yield* clientFor(token);
          const params = { campaignId, npcId: cazril };
          const attempts: Record<string, Effect.Effect<unknown, unknown>> = {
            list: client.npcs.list({ params: { campaignId }, query: {} }),
            create: client.npcs.create({ params: { campaignId }, payload: { name: "Mine" } }),
            find: client.npcs.findById({ params }),
            update: client.npcs.update({ params, payload: { name: "Renamed" } }),
            archive: client.npcs.archive({ params, payload: {} }),
            restore: client.npcs.restore({ params, payload: {} }),
            rehearsal: client.npcs.rehearsal({ params }),
            rehearse: client.npcs.rehearse({ params, payload: { text: "hello" } }),
            threads: client.npcs.threads({ params }),
          };
          return yield* Effect.all(
            Object.fromEntries(
              Object.entries(attempts).map(([name, attempt]) => [name, Effect.result(attempt)]),
            ),
          );
        }).pipe(Effect.orDie),
      );

      for (const [name, outcome] of Object.entries(outcomes)) {
        expect(outcome._tag, name).toBe("Failure");
        expect(outcome._tag === "Failure" && outcome.failure, name).toMatchObject({
          _tag: "NotFound",
          resource: "campaign",
        });
      }
    }
    // And nothing the player or the stranger attempted left a row behind.
    const listed = await runtime.runPromise(
      Effect.flatMap(clientFor(creator), (dm) =>
        dm.npcs.list({ params: { campaignId }, query: {} }),
      ).pipe(Effect.orDie),
    );
    expect(listed.map((npc) => npc.name)).toEqual(["Cazril"]);
  }, 60_000);
});
