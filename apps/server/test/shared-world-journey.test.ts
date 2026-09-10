import { NodeHttpServer } from "@effect/platform-node";
import { TavernsApi } from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedModel, textChunks, toolCallChunks } from "./support/model.js";

/**
 * The Shared World promise as one public journey.
 *
 * Most focused tests below the HTTP boundary prove an individual predicate.
 * This suite proves that those predicates compose into the product we expose:
 * a campaign starts alone, can opt into a world without moving, and one invite
 * grants one table while still making the surrounding world discoverable.
 *
 * Hob is included through its real SSE endpoint and OpenAI-compatible provider
 * seam. The captured requests are the final privacy assertion: canonical play
 * from both campaigns reaches the model, while neither creator-only note does.
 */
const model = scriptedModel({
  model: "scripted-shared-world",
  maxTokens: 4096,
  rounds: [
    toolCallChunks("listPlayedNights", {}),
    toolCallChunks("searchSharedWorldHistory", { query: "bridge" }),
    textChunks("Both campaigns have changed the world around the bridge."),
  ],
});

const database = migratedDatabase("taverns_test_shared_world_journey");
const assistant = Hob.layer({ model: "scripted-shared-world" }).pipe(Layer.provide(model.layer));
const services = servicesOver(database, undefined, assistant);
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

describe("Shared World lifecycle", () => {
  it("connects campaigns with shared context while keeping participation and private content local", async () => {
    const seen = await runtime.runPromise(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const ownerIdentity = yield* accounts.issue("Mara");
        const playerIdentity = yield* accounts.issue("Ivo");
        const owner = yield* clientFor(ownerIdentity.token);
        const player = yield* clientFor(playerIdentity.token);

        // A normal campaign begins with an internal context, not a visible
        // container the creator has to name or navigate first.
        const first = yield* owner.campaigns.create({
          payload: { name: "Ashes of Bellwater", visibility: "shared" },
        });
        const ownerWorldsBeforePromotion = yield* owner.sharedWorlds.list();
        const playerWorldsBeforeInvite = yield* player.sharedWorlds.list();

        // Promotion keeps the backing id, so links and campaign state do not
        // move. A second campaign is then founded directly inside the world.
        const world = yield* owner.campaigns.promoteSharedWorld({
          params: { campaignId: first.id },
          payload: { name: "The Cinder Marches" },
        });
        const second = yield* owner.sharedWorlds.createCampaign({
          params: { worldId: world.id },
          payload: { name: "Lanterns Below", visibility: "shared" },
        });

        // Plant one player-visible fact and one creator-only sentinel at each
        // table. The visible facts prove participation was really granted;
        // the sentinels make every accidental cross-boundary read obvious.
        yield* owner.notes.create({
          params: { campaignId: first.id },
          payload: {
            title: "Bellwater rumor",
            body: "The eastern bridge is open.",
            visibility: "shared",
          },
        });
        yield* owner.notes.create({
          params: { campaignId: first.id },
          payload: {
            title: "FIRST_PRIVATE_SENTINEL",
            body: "The bellringer is the hidden patron.",
          },
        });
        yield* owner.notes.create({
          params: { campaignId: second.id },
          payload: {
            title: "Lantern rumor",
            body: "Footprints cross the western bridge.",
            visibility: "shared",
          },
        });
        yield* owner.notes.create({
          params: { campaignId: second.id },
          payload: {
            title: "SECOND_PRIVATE_SENTINEL",
            body: "The lantern guild serves the buried queen.",
          },
        });

        // Played story, not prep, is canonical world context. Publish each
        // night through the public Chronicle operation that snapshots a recap.
        const firstNight = yield* owner.sessions.create({
          params: { campaignId: first.id },
          payload: { number: 1, title: "The Eastern Crossing" },
        });
        yield* owner.sessions.update({
          params: { campaignId: first.id, sessionId: firstNight.id },
          payload: { startedAt: yield* DateTime.now },
        });
        yield* owner.beats.create({
          params: { campaignId: first.id, sessionId: firstNight.id },
          payload: { body: "FIRST_CANONICAL the party repaired the eastern bridge." },
        });
        yield* owner.sharedWorldHistory.fromRecap({
          params: { worldId: world.id },
          payload: { campaignId: first.id, sessionId: firstNight.id },
        });

        const secondNight = yield* owner.sessions.create({
          params: { campaignId: second.id },
          payload: { number: 1, title: "Under the Lantern" },
        });
        yield* owner.sessions.update({
          params: { campaignId: second.id, sessionId: secondNight.id },
          payload: { startedAt: yield* DateTime.now },
        });
        yield* owner.beats.create({
          params: { campaignId: second.id, sessionId: secondNight.id },
          payload: { body: "SECOND_CANONICAL the guild crossed the western bridge." },
        });
        yield* owner.sharedWorldHistory.fromRecap({
          params: { worldId: world.id },
          payload: { campaignId: second.id, sessionId: secondNight.id },
        });

        // The first campaign invitation also establishes world eligibility.
        // It does not silently seat the player at every campaign in that world.
        const firstInvite = yield* owner.campaignInvites.create({
          params: { campaignId: first.id },
          payload: { label: "Ivo at Bellwater" },
        });
        yield* player.join.redeem({ payload: { token: firstInvite.token } });

        const playerWorldsAfterFirstInvite = yield* player.sharedWorlds.list();
        const directoryAfterFirstInvite = yield* player.sharedWorlds.campaigns({
          params: { worldId: world.id },
        });
        const firstNotes = yield* player.notes.list({
          params: { campaignId: first.id },
          query: {},
        });
        const secondBeforeInvite = yield* Effect.result(
          player.notes.list({ params: { campaignId: second.id }, query: {} }),
        );
        const chronicleAfterFirstInvite = yield* player.sharedWorldHistory.list({
          params: { worldId: world.id },
        });

        // Participation at the second table remains an explicit campaign act.
        const secondInvite = yield* owner.campaignInvites.create({
          params: { campaignId: second.id },
          payload: { label: "Ivo below" },
        });
        yield* player.join.redeem({ payload: { token: secondInvite.token } });

        const directoryAfterSecondInvite = yield* player.sharedWorlds.campaigns({
          params: { worldId: world.id },
        });
        const membershipsAfterSecondInvite = yield* player.me.campaigns();
        const secondNotes = yield* player.notes.list({
          params: { campaignId: second.id },
          query: {},
        });

        // Ask through the generated HTTP client and drain the SSE response.
        // The scripted provider calls the world timeline and Chronicle tools;
        // its captured request bodies show exactly what Hob was allowed to see.
        const hobStream = yield* player.sharedWorldHob.ask({
          params: { worldId: world.id },
          payload: { text: "What connects the two campaigns?" },
        });
        const hobEvents = Array.from(yield* Stream.runCollect(hobStream));

        return {
          first,
          second,
          world,
          ownerWorldsBeforePromotion,
          playerWorldsBeforeInvite,
          playerWorldsAfterFirstInvite,
          directoryAfterFirstInvite,
          firstNotes,
          secondBeforeInvite,
          chronicleAfterFirstInvite,
          directoryAfterSecondInvite,
          membershipsAfterSecondInvite,
          secondNotes,
          hobEvents,
        };
      }).pipe(Effect.orDie),
    );

    expect(seen.ownerWorldsBeforePromotion).toEqual([]);
    expect(seen.playerWorldsBeforeInvite).toEqual([]);
    expect(seen.world).toMatchObject({
      id: seen.first.contextId,
      name: "The Cinder Marches",
    });
    expect(seen.second.contextId).toBe(seen.world.id);

    expect(seen.playerWorldsAfterFirstInvite.map((row) => row.sharedWorld.id)).toEqual([
      seen.world.id,
    ]);
    expect(
      Object.fromEntries(
        seen.directoryAfterFirstInvite.map((campaign) => [campaign.id, campaign.relation]),
      ),
    ).toEqual({
      [seen.first.id]: "player",
      [seen.second.id]: "none",
    });
    expect(seen.firstNotes.items.map((note) => note.title)).toEqual(["Bellwater rumor"]);
    expect(seen.secondBeforeInvite._tag).toBe("Failure");

    expect(seen.chronicleAfterFirstInvite).toHaveLength(2);
    expect(seen.chronicleAfterFirstInvite.map((entry) => entry.campaignId)).toEqual(
      expect.arrayContaining([seen.first.id, seen.second.id]),
    );
    expect(seen.chronicleAfterFirstInvite.map((entry) => entry.body).join(" ")).toContain(
      "FIRST_CANONICAL",
    );
    expect(seen.chronicleAfterFirstInvite.map((entry) => entry.body).join(" ")).toContain(
      "SECOND_CANONICAL",
    );

    expect(seen.directoryAfterSecondInvite.map((campaign) => campaign.relation)).toEqual([
      "player",
      "player",
    ]);
    expect(seen.membershipsAfterSecondInvite.map((row) => row.campaign.id)).toEqual(
      expect.arrayContaining([seen.first.id, seen.second.id]),
    );
    expect(
      seen.membershipsAfterSecondInvite.every((row) => row.sharedWorld?.id === seen.world.id),
    ).toBe(true);
    expect(seen.secondNotes.items.map((note) => note.title)).toEqual(["Lantern rumor"]);

    expect(seen.hobEvents.some((event) => event.event === "delta")).toBe(true);
    const shownToHob = JSON.stringify(model.requests());
    expect(shownToHob).toContain("Ashes of Bellwater");
    expect(shownToHob).toContain("Lanterns Below");
    expect(shownToHob).toContain("FIRST_CANONICAL");
    expect(shownToHob).toContain("SECOND_CANONICAL");
    expect(shownToHob).not.toContain("FIRST_PRIVATE_SENTINEL");
    expect(shownToHob).not.toContain("SECOND_PRIVATE_SENTINEL");
    expect(shownToHob).not.toContain("hidden patron");
    expect(shownToHob).not.toContain("buried queen");
  }, 60_000);
});
