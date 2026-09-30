import { describe, expect } from "@effect/vitest";
import {
  CAMPAIGN_PREVIOUSLY_MAX,
  CAMPAIGN_STORY_MAX,
  type CampaignId,
  type CampaignStoryPut,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { applicationOver, servicesOver } from "../src/app.js";
import { type Person, aPerson, admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

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
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
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
  );

/** A request's exact status and body, for what a decoded value would blur. */
const raw = (token: string, method: "GET" | "PUT", path: string, body?: unknown) =>
  Effect.gen(function* () {
    const request =
      method === "GET"
        ? HttpClientRequest.get(path)
        : HttpClientRequest.put(path).pipe(HttpClientRequest.bodyJsonUnsafe(body));
    const response = yield* HttpClient.execute(request.pipe(HttpClientRequest.bearerToken(token)));
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

const read = (who: Person, campaignId: CampaignId) =>
  as(who.token, (client) => client.story.read({ params: { campaignId } }));
const readAsPlayer = (who: Person, campaignId: CampaignId) =>
  as(who.token, (client) => client.story.readAsPlayer({ params: { campaignId } }));
const put = (who: Person, campaignId: CampaignId, payload: CampaignStoryPut) =>
  as(who.token, (client) => client.story.put({ params: { campaignId }, payload }));
const remove = (who: Person, campaignId: CampaignId) =>
  as(who.token, (client) => client.story.remove({ params: { campaignId } }));

/** A night of this campaign, left planned, on the table, or ended. */
const night = (
  who: Person,
  campaignId: CampaignId,
  number: number,
  state: "planned" | "running" | "ended",
) =>
  Effect.gen(function* () {
    const session = yield* as(who.token, (client) =>
      client.sessions.create({ params: { campaignId }, payload: { number } }),
    );
    if (state !== "planned") yield* endNight(who, campaignId, session.id, state);
    return session.id;
  });

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

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const otherTable = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "Salt and Sixpence", visibility: "shared" } }),
  )).id;
  yield* admittedTo(table, ilse.actor, "Ilse");
  return { jo, ilse, stranger, table, otherTable };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "campaign-story.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const SENTINEL = "STORYSENTINEL the hag is Ilse's mother";

describeLayer("campaign-story", shared, (it) => {
  describe("the creator's story", () => {
    it.effect("is null until written, and stamps zero before any night has ended", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        expect(yield* read(jo, table)).toBeNull();
        yield* night(jo, table, 1, "running");

        const written = yield* put(jo, table, {
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
        expect(yield* read(jo, table)).toEqual(written);
      }),
    );

    it.effect(
      "restamps the newest ended night when the words change, and not for the share switch",
      () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const running = yield* as(jo.token, (client) =>
            client.sessions.list({ params: { campaignId: table } }),
          );
          yield* endNight(jo, table, running[0]!.id, "ended");
          yield* night(jo, table, 2, "ended");
          const third = yield* night(jo, table, 3, "running");
          yield* night(jo, table, 4, "planned");

          const rewritten = yield* put(jo, table, {
            text: "Two nights on the road, and a toll bridge.",
            previously: null,
            visibility: "dm",
          });
          // Night 3 is still on the table and night 4 has not begun: 2 is the newest ended.
          expect(rewritten).toMatchObject({ afterSessionNumber: 2, previously: null });

          yield* endNight(jo, table, third, "ended");
          const shared = yield* put(jo, table, {
            text: "Two nights on the road, and a toll bridge.",
            previously: null,
            visibility: "shared",
          });
          // The same words: the share switch, which is not a claim to have read night 3.
          expect(shared).toMatchObject({ afterSessionNumber: 2, visibility: "shared" });
          expect(shared.id).toBe(rewritten.id);

          const updated = yield* put(jo, table, {
            text: "Three nights on the road; the bridge fell.",
            previously: "Last time, the bridge fell.",
            visibility: "shared",
          });
          expect(updated).toMatchObject({ afterSessionNumber: 3, visibility: "shared" });

          // No `visibility` keeps the story's own: an edit does not unshare it.
          const edited = yield* put(jo, table, {
            text: "Three nights on the road; the bridge fell behind them.",
            previously: "Last time, the bridge fell.",
          });
          expect(edited).toMatchObject({ visibility: "shared", origin: "authored" });
        }),
    );

    it.effect("lands a new story dm when the write names no visibility", () =>
      Effect.gen(function* () {
        const { jo, otherTable } = yield* Fixture;
        const fresh = yield* put(jo, otherTable, { text: "Sixpence.", previously: null });
        expect(fresh.visibility).toBe("dm");
        yield* remove(jo, otherTable);
      }),
    );

    it.effect("refuses a blank story and one past the bound at the wire", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const path = `/campaigns/${table}/story`;
        const before = yield* read(jo, table);
        for (const body of [
          { text: "   ", previously: null, visibility: "dm" },
          { text: "x".repeat(CAMPAIGN_STORY_MAX + 1), previously: null, visibility: "dm" },
          { text: "Fine.", previously: "x".repeat(CAMPAIGN_PREVIOUSLY_MAX + 1), visibility: "dm" },
          { text: "Fine.", previously: null, visibility: "dm", origin: "assistant" },
          { text: "Fine." },
        ]) {
          const status = (yield* raw(jo.token, "PUT", path, body)).status;
          // An unknown key is dropped by the schema rather than refused; what
          // matters is that it cannot claim the assistant wrote the story.
          if ("origin" in body) {
            expect(status).toBe(200);
            expect((yield* read(jo, table))?.origin).toBe("authored");
          } else {
            expect(status).toBe(400);
          }
        }
        // Put it back as it was before this test's one accepted write.
        if (before !== null) {
          yield* put(jo, table, {
            text: before.text,
            previously: before.previously,
            visibility: before.visibility,
          });
        }
      }),
    );

    it.effect("clears, and clearing nothing is still a success", () =>
      Effect.gen(function* () {
        const { jo, otherTable } = yield* Fixture;
        yield* put(jo, otherTable, { text: "Sixpence.", previously: null, visibility: "dm" });
        yield* remove(jo, otherTable);
        expect(yield* read(jo, otherTable)).toBeNull();
        yield* remove(jo, otherTable);
        expect(yield* read(jo, otherTable)).toBeNull();
      }),
    );
  });

  it.layer(
    Layer.effectDiscard(
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        yield* put(jo, table, {
          text: SENTINEL,
          previously: `${SENTINEL} again`,
          visibility: "dm",
        });
      }),
    ),
  )("nobody but the creator", (it) => {
    it.effect("answers a player and a stranger NotFound on the creator's three", () =>
      Effect.gen(function* () {
        const { jo, ilse, stranger, table } = yield* Fixture;
        for (const who of [ilse, stranger]) {
          expect(
            yield* attempt(who.token, (client) =>
              client.story.read({ params: { campaignId: table } }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          expect(
            yield* attempt(who.token, (client) =>
              client.story.put({
                params: { campaignId: table },
                payload: { text: "Overwritten.", previously: null, visibility: "shared" },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          expect(
            yield* attempt(who.token, (client) =>
              client.story.remove({ params: { campaignId: table } }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
        }
        // None of those reached the row.
        expect(yield* read(jo, table)).toMatchObject({ text: SENTINEL, visibility: "dm" });
      }),
    );

    it.effect(
      "answers a player null, and not one byte of it, while the story is the creator's",
      () =>
        Effect.gen(function* () {
          const { ilse, table } = yield* Fixture;
          expect(yield* readAsPlayer(ilse, table)).toBeNull();
          const body = (yield* raw(ilse.token, "GET", `/campaigns/${table}/story/player`)).body;
          expect(body).toBe("null");
          expect(body).not.toContain("STORYSENTINEL");
        }),
    );

    it.effect(
      "answers a stranger NotFound on the player's read, which is a campaign they cannot see",
      () =>
        Effect.gen(function* () {
          const { stranger, table } = yield* Fixture;
          expect(
            yield* attempt(stranger.token, (client) =>
              client.story.readAsPlayer({ params: { campaignId: table } }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
        }),
    );

    it.effect("tells a player the narrow story once shared, and nothing once unshared", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        const stored = yield* put(jo, table, {
          text: SENTINEL,
          previously: `${SENTINEL} again`,
          visibility: "shared",
        });
        const told = yield* readAsPlayer(ilse, table);
        expect(told).toMatchObject({
          text: SENTINEL,
          previously: `${SENTINEL} again`,
          afterSessionNumber: stored.afterSessionNumber,
        });
        // The narrow schema on the wire, not a filtered wide one.
        const body = JSON.parse(
          (yield* raw(ilse.token, "GET", `/campaigns/${table}/story/player`)).body,
        ) as Record<string, unknown>;
        expect(Object.keys(body).sort()).toEqual([
          "afterSessionNumber",
          "previously",
          "text",
          "updatedAt",
        ]);

        yield* put(jo, table, {
          text: SENTINEL,
          previously: `${SENTINEL} again`,
          visibility: "dm",
        });
        expect(yield* readAsPlayer(ilse, table)).toBeNull();
      }),
    );

    it.effect("is one campaign's: another table's shared story is not this player's to read", () =>
      Effect.gen(function* () {
        const { jo, ilse, table, otherTable } = yield* Fixture;
        yield* put(jo, otherTable, {
          text: "Sixpence again.",
          previously: null,
          visibility: "shared",
        });
        expect(yield* read(jo, table)).toMatchObject({ text: SENTINEL });
        expect(
          yield* attempt(ilse.token, (client) =>
            client.story.readAsPlayer({ params: { campaignId: otherTable } }),
          ),
        ).toEqual({ ok: false, tag: "NotFound" });
      }),
    );
  });
});
