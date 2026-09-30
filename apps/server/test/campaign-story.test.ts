import {
  Actor,
  CAMPAIGN_PREVIOUSLY_MAX,
  CAMPAIGN_STORY_MAX,
  type CampaignId,
  type CampaignStoryPut,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";

/**
 * **A campaign's story so far is the creator's until they share it.**
 *
 * Over the real application and Postgres, through the client derived from the
 * contract: the creator writes, reads back and clears the story; the night it
 * follows is stamped by the server (the newest ended night when the words
 * change, untouched by the share switch); a player and a stranger are refused
 * the creator's three endpoints with the ordinary `NotFound`; and a player's own read answers `null` — not a refusal, and not
 * one byte of the story — until it is shared, then the narrow schema alone.
 */

const database = migratedDatabase("taverns_test_campaign_story");
const services = servicesOver(database);

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
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(
    Effect.flatMap(clientFor(token), call).pipe(
      Effect.map((value) => ({ ok: true as const, value })),
      Effect.catch((error: unknown) =>
        Effect.succeed({
          ok: false as const,
          tag:
            typeof error === "object" && error !== null && "_tag" in error
              ? String(error._tag)
              : "unknown",
        }),
      ),
    ),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

/** A request's exact status and body, for what a decoded value would blur. */
const raw = (token: string, method: "GET" | "PUT", path: string, body?: unknown) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const request =
        method === "GET"
          ? HttpClientRequest.get(path)
          : HttpClientRequest.put(path).pipe(HttpClientRequest.bodyJsonUnsafe(body));
      const response = yield* HttpClient.execute(
        request.pipe(HttpClientRequest.bearerToken(token)),
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

const read = (who: Person, campaignId: CampaignId) =>
  as(who.token, (client) => client.story.read({ params: { campaignId } }));
const readAsPlayer = (who: Person, campaignId: CampaignId) =>
  as(who.token, (client) => client.story.readAsPlayer({ params: { campaignId } }));
const put = (who: Person, campaignId: CampaignId, payload: CampaignStoryPut) =>
  as(who.token, (client) => client.story.put({ params: { campaignId }, payload }));
const remove = (who: Person, campaignId: CampaignId) =>
  as(who.token, (client) => client.story.remove({ params: { campaignId } }));

/** A night of this campaign, left planned, on the table, or ended. */
const night = async (
  who: Person,
  campaignId: CampaignId,
  number: number,
  state: "planned" | "running" | "ended",
): Promise<SessionId> => {
  const session = await as(who.token, (client) =>
    client.sessions.create({ params: { campaignId }, payload: { number } }),
  );
  if (state !== "planned") await endNight(who, campaignId, session.id, state);
  return session.id;
};

const endNight = (
  who: Person,
  campaignId: CampaignId,
  sessionId: SessionId,
  state: "running" | "ended",
) => {
  const now = DateTime.nowUnsafe();
  return as(who.token, (client) =>
    client.sessions.update({
      params: { campaignId, sessionId },
      payload: state === "ended" ? { startedAt: now, endedAt: now } : { startedAt: now },
    }),
  );
};

let jo: Person;
let ilse: Person;
let stranger: Person;
let table: CampaignId;
let otherTable: CampaignId;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
  otherTable = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "Salt and Sixpence", visibility: "shared" } }),
    )
  ).id;
  await run(admittedTo(table, ilse.actor, "Ilse"));
}, 60_000);

describe("the creator's story", () => {
  it("is null until written, and stamps zero before any night has ended", async () => {
    expect(await read(jo, table)).toBeNull();
    await night(jo, table, 1, "running");

    const written = await put(jo, table, {
      text: "  The party left Saltmarsh on the salt road.  ",
      previously: "  Last time, you set out.  ",
      visibility: "dm",
    });
    // Trimmed on the way in; the creator's own words; nothing has ended yet.
    expect(written).toMatchObject({
      campaignId: table,
      text: "The party left Saltmarsh on the salt road.",
      previously: "Last time, you set out.",
      afterSessionNumber: 0,
      visibility: "dm",
      origin: "authored",
      assistantTurnId: null,
    });
    expect(await read(jo, table)).toEqual(written);
  });

  it("restamps the newest ended night when the words change, and not for the share switch", async () => {
    const running = await as(jo.token, (client) =>
      client.sessions.list({ params: { campaignId: table } }),
    );
    await endNight(jo, table, running[0]!.id, "ended");
    await night(jo, table, 2, "ended");
    const third = await night(jo, table, 3, "running");
    await night(jo, table, 4, "planned");

    const rewritten = await put(jo, table, {
      text: "Two nights on the road, and a toll bridge.",
      previously: null,
      visibility: "dm",
    });
    // Night 3 is still on the table and night 4 has not begun: 2 is the newest ended.
    expect(rewritten).toMatchObject({ afterSessionNumber: 2, previously: null });

    await endNight(jo, table, third, "ended");
    const shared = await put(jo, table, {
      text: "Two nights on the road, and a toll bridge.",
      previously: null,
      visibility: "shared",
    });
    // The same words: the share switch, which is not a claim to have read night 3.
    expect(shared).toMatchObject({ afterSessionNumber: 2, visibility: "shared" });
    expect(shared.id).toBe(rewritten.id);

    const updated = await put(jo, table, {
      text: "Three nights on the road; the bridge fell.",
      previously: "Last time, the bridge fell.",
      visibility: "shared",
    });
    expect(updated).toMatchObject({ afterSessionNumber: 3, visibility: "shared" });

    // No `visibility` keeps the story's own: an edit does not unshare it.
    const edited = await put(jo, table, {
      text: "Three nights on the road; the bridge fell behind them.",
      previously: "Last time, the bridge fell.",
    });
    expect(edited).toMatchObject({ visibility: "shared", origin: "authored" });
  });

  it("lands a new story dm when the write names no visibility", async () => {
    const fresh = await put(jo, otherTable, { text: "Sixpence.", previously: null });
    expect(fresh.visibility).toBe("dm");
    await remove(jo, otherTable);
  });

  it("refuses a blank story and one past the bound at the wire", async () => {
    const path = `/campaigns/${table}/story`;
    const before = await read(jo, table);
    for (const body of [
      { text: "   ", previously: null, visibility: "dm" },
      { text: "x".repeat(CAMPAIGN_STORY_MAX + 1), previously: null, visibility: "dm" },
      { text: "Fine.", previously: "x".repeat(CAMPAIGN_PREVIOUSLY_MAX + 1), visibility: "dm" },
      { text: "Fine.", previously: null, visibility: "dm", origin: "assistant" },
      { text: "Fine." },
    ]) {
      const status = (await raw(jo.token, "PUT", path, body)).status;
      // An unknown key is dropped by the schema rather than refused; what
      // matters is that it cannot claim the assistant wrote the story.
      if ("origin" in body) {
        expect(status).toBe(200);
        expect((await read(jo, table))?.origin).toBe("authored");
      } else {
        expect(status).toBe(400);
      }
    }
    // Put it back as it was before this test's one accepted write.
    if (before !== null) {
      await put(jo, table, {
        text: before.text,
        previously: before.previously,
        visibility: before.visibility,
      });
    }
  });

  it("clears, and clearing nothing is still a success", async () => {
    await put(jo, otherTable, { text: "Sixpence.", previously: null, visibility: "dm" });
    await remove(jo, otherTable);
    expect(await read(jo, otherTable)).toBeNull();
    await remove(jo, otherTable);
    expect(await read(jo, otherTable)).toBeNull();
  });
});

describe("nobody but the creator", () => {
  const SENTINEL = "STORYSENTINEL the hag is Ilse's mother";

  beforeAll(async () => {
    await put(jo, table, { text: SENTINEL, previously: `${SENTINEL} again`, visibility: "dm" });
  }, 60_000);

  it("answers a player and a stranger NotFound on the creator's three", async () => {
    for (const who of [ilse, stranger]) {
      expect(
        await attempt(who.token, (client) => client.story.read({ params: { campaignId: table } })),
      ).toEqual({ ok: false, tag: "NotFound" });
      expect(
        await attempt(who.token, (client) =>
          client.story.put({
            params: { campaignId: table },
            payload: { text: "Overwritten.", previously: null, visibility: "shared" },
          }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
      expect(
        await attempt(who.token, (client) =>
          client.story.remove({ params: { campaignId: table } }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
    }
    // None of those reached the row.
    expect(await read(jo, table)).toMatchObject({ text: SENTINEL, visibility: "dm" });
  });

  it("answers a player null, and not one byte of it, while the story is the creator's", async () => {
    expect(await readAsPlayer(ilse, table)).toBeNull();
    const body = (await raw(ilse.token, "GET", `/campaigns/${table}/story/player`)).body;
    expect(body).toBe("null");
    expect(body).not.toContain("STORYSENTINEL");
  });

  it("answers a stranger NotFound on the player's read, which is a campaign they cannot see", async () => {
    expect(
      await attempt(stranger.token, (client) =>
        client.story.readAsPlayer({ params: { campaignId: table } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
  });

  it("tells a player the narrow story once shared, and nothing once unshared", async () => {
    const stored = await put(jo, table, {
      text: SENTINEL,
      previously: `${SENTINEL} again`,
      visibility: "shared",
    });
    const told = await readAsPlayer(ilse, table);
    expect(told).toMatchObject({
      text: SENTINEL,
      previously: `${SENTINEL} again`,
      afterSessionNumber: stored.afterSessionNumber,
    });
    // The narrow schema on the wire, not a filtered wide one.
    const body = JSON.parse(
      (await raw(ilse.token, "GET", `/campaigns/${table}/story/player`)).body,
    ) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "afterSessionNumber",
      "previously",
      "text",
      "updatedAt",
    ]);

    await put(jo, table, { text: SENTINEL, previously: `${SENTINEL} again`, visibility: "dm" });
    expect(await readAsPlayer(ilse, table)).toBeNull();
  });

  it("is one campaign's: another table's shared story is not this player's to read", async () => {
    await put(jo, otherTable, { text: "Sixpence again.", previously: null, visibility: "shared" });
    expect(await read(jo, table)).toMatchObject({ text: SENTINEL });
    expect(
      await attempt(ilse.token, (client) =>
        client.story.readAsPlayer({ params: { campaignId: otherTable } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
  });
});
