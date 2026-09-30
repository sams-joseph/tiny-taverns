import { describe, expect } from "@effect/vitest";
import { type HobEvent, type SharedWorldId, TavernsApi } from "@taverns/api";
import { Context, Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { migratedDatabase } from "./support/database.js";
import { type Round, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * Clearing a Shared World's Story So Far — `DELETE /worlds/:worldId/history/summary`,
 * the reverse of keeping one.
 *
 * Over the real application, with the Story So Far kept the shipped way (the
 * world's Hob drafts it and the owner keeps it) and the member admitted the
 * shipped way (a campaign invitation in the world, redeemed). Three claims:
 *
 * - **it is the owner's alone** — a member who is not the owner and a
 *   stranger are both the ordinary `NotFound`, and the summary stays;
 * - **it clears, and keeps the predecessor** — the world reads no Story So
 *   Far, the cleared row is `superseded` as a replaced one is, and the
 *   Chronicle is untouched;
 * - **it is a door, not a wall** — clearing again is a no-op, and a new draft
 *   can be kept afterwards, read from the whole Chronicle again.
 */

const script: Array<Round> = [];
const model = scriptedModel({ model: "scripted-story-clear", maxTokens: 512, rounds: script });

const database = migratedDatabase("taverns_test_shared_world_story_clear");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-story-clear" }).pipe(Layer.provide(model.layer)),
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

/** The owner asks the world's Hob for a Story So Far, and keeps it. */
const keepAStory = (owner: string, worldId: SharedWorldId, text: string) =>
  Effect.gen(function* () {
    const before = model.requests().length;
    script.length = before;
    script.push(
      toolCallChunks("readStorySoFarSources", {}),
      toolCallChunks("proposeStorySoFar", { text }),
      textChunks("Here is the story so far."),
    );
    const collected = yield* as(owner, (client) =>
      Effect.flatMap(
        client.sharedWorldHob.ask({
          params: { worldId },
          payload: { text: "Draft the Story So Far." },
        }),
        (stream) => Stream.runCollect(stream),
      ),
    );
    const events: ReadonlyArray<HobEvent> = Array.from(collected);
    const began = events.find((event) => event.event === "began");
    if (began?.event !== "began") throw new Error("no began event");
    const { threadId, turnId } = began.data;
    yield* as(owner, (client) =>
      client.sharedWorldHob.accept({ params: { worldId, threadId, turnId }, payload: {} }),
    );
    return { requests: model.requests().slice(before) };
  });

const summaryRows = (worldId: SharedWorldId) =>
  sql(
    (sql) =>
      sql<{ readonly status: string; readonly text: string }>`
        select status, text from group_history_summary
        where group_id = ${worldId}
        order by created_at
      `,
  );

const makeFixture = Effect.gen(function* () {
  const accounts = yield* Accounts;
  const ownerIssued = yield* accounts.issue("Mara");
  const memberIssued = yield* accounts.issue("Ivo");
  const strangerIssued = yield* accounts.issue("Tamsin");
  const owner = ownerIssued.token;
  const member = memberIssued.token;
  const stranger = strangerIssued.token;

  const world = yield* as(owner, (client) =>
    client.sharedWorlds.create({ payload: { name: "The Cinder Marches" } }),
  );
  const worldId = world.id;
  // The member joins the world the shipped way: a campaign in it, and that
  // campaign's invitation, redeemed.
  const campaign = yield* as(owner, (client) =>
    client.sharedWorlds.createCampaign({
      params: { worldId },
      payload: { name: "Ashes of Bellwater", visibility: "shared" },
    }),
  );
  const invite = yield* as(owner, (client) =>
    client.campaignInvites.create({
      params: { campaignId: campaign.id },
      payload: { label: "Ivo at Bellwater" },
    }),
  );
  yield* as(member, (client) => client.join.redeem({ payload: { token: invite.token } }));
  yield* as(owner, (client) =>
    client.sharedWorldHistory.create({
      params: { worldId },
      payload: { body: "The eastern bridge fell in the spring floods." },
    }),
  );
  yield* keepAStory(owner, worldId, "The bridge fell, and the Marches are cut in two.");
  return { owner, member, stranger, worldId };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "shared-world-story-clear.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

describeLayer("shared-world-story-clear", shared, (it) => {
  describe("clearing the Story So Far", () => {
    it.effect("is refused to a member who is not the owner, and to a stranger, as NotFound", () =>
      Effect.gen(function* () {
        const { owner, member, stranger, worldId } = yield* Fixture;
        // The member can read it, which is what makes the refusal a boundary.
        const read = yield* as(member, (client) =>
          client.sharedWorldHistory.summary({ params: { worldId } }),
        );
        expect(read?.text).toBe("The bridge fell, and the Marches are cut in two.");

        expect(
          yield* refusal(member, (client) =>
            client.sharedWorldHistory.clearSummary({ params: { worldId } }),
          ),
        ).toBe("NotFound");
        expect(
          yield* refusal(stranger, (client) =>
            client.sharedWorldHistory.clearSummary({ params: { worldId } }),
          ),
        ).toBe("NotFound");

        const still = yield* as(owner, (client) =>
          client.sharedWorldHistory.summary({ params: { worldId } }),
        );
        expect(still?.text).toBe("The bridge fell, and the Marches are cut in two.");
      }),
    );

    it.effect("leaves the world with none, keeps the predecessor, and leaves the Chronicle", () =>
      Effect.gen(function* () {
        const { owner, member, worldId } = yield* Fixture;
        yield* as(owner, (client) =>
          client.sharedWorldHistory.clearSummary({ params: { worldId } }),
        );

        expect(
          yield* as(member, (client) => client.sharedWorldHistory.summary({ params: { worldId } })),
        ).toBeNull();
        // Superseded, as a replacement leaves its predecessor.
        expect(yield* summaryRows(worldId)).toEqual([
          { status: "superseded", text: "The bridge fell, and the Marches are cut in two." },
        ]);
        const chronicle = yield* as(owner, (client) =>
          client.sharedWorldHistory.list({ params: { worldId } }),
        );
        expect(chronicle.map((entry) => entry.body)).toEqual([
          "The eastern bridge fell in the spring floods.",
        ]);

        // Clearing a world with none is a no-op, not an error.
        yield* as(owner, (client) =>
          client.sharedWorldHistory.clearSummary({ params: { worldId } }),
        );
        expect(yield* summaryRows(worldId)).toHaveLength(1);
      }),
    );

    it.effect("lets a new one be kept afterwards, read from the whole Chronicle again", () =>
      Effect.gen(function* () {
        const { owner, worldId } = yield* Fixture;
        const { requests } = yield* keepAStory(owner, worldId, "The Marches remember the bridge.");
        // With nothing current, the sources start from the first entry rather
        // than after the cleared summary's coverage.
        expect(JSON.stringify(requests)).toContain("The eastern bridge fell in the spring floods.");
        const now = yield* as(owner, (client) =>
          client.sharedWorldHistory.summary({ params: { worldId } }),
        );
        expect(now?.text).toBe("The Marches remember the bridge.");
        expect((yield* summaryRows(worldId)).map((row) => row.status)).toEqual([
          "superseded",
          "accepted",
        ]);
      }),
    );
  });
});
