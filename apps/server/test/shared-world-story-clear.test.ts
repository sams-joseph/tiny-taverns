import { type HobEvent, type SharedWorldId, TavernsApi } from "@taverns/api";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { migratedDatabase } from "./support/database.js";
import { type Round, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";
import { testServer } from "./support/http.js";

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
const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(testServer),
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

/** The same call, answering the failure's tag rather than dying on it. */
const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), (client) =>
      call(client).pipe(
        Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
      ),
    ).pipe(Effect.orDie),
  );

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie));

const issue = (name: string) =>
  runtime.runPromise(Effect.flatMap(Accounts, (accounts) => accounts.issue(name)));

let owner: string;
let member: string;
let stranger: string;
let worldId: SharedWorldId;

/** The owner asks the world's Hob for a Story So Far, and keeps it. */
const keepAStory = async (text: string) => {
  const before = model.requests().length;
  script.length = before;
  script.push(
    toolCallChunks("readStorySoFarSources", {}),
    toolCallChunks("proposeStorySoFar", { text }),
    textChunks("Here is the story so far."),
  );
  const collected = await as(owner, (client) =>
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
  await as(owner, (client) =>
    client.sharedWorldHob.accept({ params: { worldId, threadId, turnId }, payload: {} }),
  );
  return { requests: model.requests().slice(before) };
};

const summaryRows = () =>
  sql(
    (sql) =>
      sql<{ readonly status: string; readonly text: string }>`
        select status, text from group_history_summary
        where group_id = ${worldId}
        order by created_at
      `,
  );

beforeAll(async () => {
  const ownerIssued = await issue("Mara");
  const memberIssued = await issue("Ivo");
  const strangerIssued = await issue("Tamsin");
  owner = ownerIssued.token;
  member = memberIssued.token;
  stranger = strangerIssued.token;

  const world = await as(owner, (client) =>
    client.sharedWorlds.create({ payload: { name: "The Cinder Marches" } }),
  );
  worldId = world.id;
  // The member joins the world the shipped way: a campaign in it, and that
  // campaign's invitation, redeemed.
  const campaign = await as(owner, (client) =>
    client.sharedWorlds.createCampaign({
      params: { worldId },
      payload: { name: "Ashes of Bellwater", visibility: "shared" },
    }),
  );
  const invite = await as(owner, (client) =>
    client.campaignInvites.create({
      params: { campaignId: campaign.id },
      payload: { label: "Ivo at Bellwater" },
    }),
  );
  await as(member, (client) => client.join.redeem({ payload: { token: invite.token } }));
  await as(owner, (client) =>
    client.sharedWorldHistory.create({
      params: { worldId },
      payload: { body: "The eastern bridge fell in the spring floods." },
    }),
  );
  await keepAStory("The bridge fell, and the Marches are cut in two.");
}, 60_000);

describe("clearing the Story So Far", () => {
  it("is refused to a member who is not the owner, and to a stranger, as NotFound", async () => {
    // The member can read it, which is what makes the refusal a boundary.
    const read = await as(member, (client) =>
      client.sharedWorldHistory.summary({ params: { worldId } }),
    );
    expect(read?.text).toBe("The bridge fell, and the Marches are cut in two.");

    expect(
      await refusal(member, (client) =>
        client.sharedWorldHistory.clearSummary({ params: { worldId } }),
      ),
    ).toBe("NotFound");
    expect(
      await refusal(stranger, (client) =>
        client.sharedWorldHistory.clearSummary({ params: { worldId } }),
      ),
    ).toBe("NotFound");

    const still = await as(owner, (client) =>
      client.sharedWorldHistory.summary({ params: { worldId } }),
    );
    expect(still?.text).toBe("The bridge fell, and the Marches are cut in two.");
  }, 60_000);

  it("leaves the world with none, keeps the predecessor, and leaves the Chronicle", async () => {
    await as(owner, (client) => client.sharedWorldHistory.clearSummary({ params: { worldId } }));

    expect(
      await as(member, (client) => client.sharedWorldHistory.summary({ params: { worldId } })),
    ).toBeNull();
    // Superseded, as a replacement leaves its predecessor.
    expect(await summaryRows()).toEqual([
      { status: "superseded", text: "The bridge fell, and the Marches are cut in two." },
    ]);
    const chronicle = await as(owner, (client) =>
      client.sharedWorldHistory.list({ params: { worldId } }),
    );
    expect(chronicle.map((entry) => entry.body)).toEqual([
      "The eastern bridge fell in the spring floods.",
    ]);

    // Clearing a world with none is a no-op, not an error.
    await as(owner, (client) => client.sharedWorldHistory.clearSummary({ params: { worldId } }));
    expect(await summaryRows()).toHaveLength(1);
  }, 60_000);

  it("lets a new one be kept afterwards, read from the whole Chronicle again", async () => {
    const { requests } = await keepAStory("The Marches remember the bridge.");
    // With nothing current, the sources start from the first entry rather
    // than after the cleared summary's coverage.
    expect(JSON.stringify(requests)).toContain("The eastern bridge fell in the spring floods.");
    const now = await as(owner, (client) =>
      client.sharedWorldHistory.summary({ params: { worldId } }),
    );
    expect(now?.text).toBe("The Marches remember the bridge.");
    expect((await summaryRows()).map((row) => row.status)).toEqual(["superseded", "accepted"]);
  }, 60_000);
});
