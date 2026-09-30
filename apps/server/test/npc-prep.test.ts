import { describe, expect } from "@effect/vitest";
import {
  type CampaignId,
  CurrentActor,
  NPC_WHEREABOUTS_MAX,
  type NpcId,
  type NpcPrepUpdate,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { applicationOver, servicesOver } from "../src/app.js";
import { Invites } from "../src/repo/Invites.js";
import { type Person, aCharacterAt, aPerson, admittedTo, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **An NPC's prep is the creator's alone.**
 *
 * The DM's attitude, status, whereabouts and first meeting for each NPC, on a
 * table of their own (`0073_npc_prep.ts`) and behind the creator proof, with
 * the nights the NPC was at the table derived from its live-session
 * conversations. Over the real application and Postgres, through the client
 * derived from the contract: the creator writes, reads back and clears it; a
 * first meeting must be a night of this campaign and is forgotten when that
 * night is deleted; a player at the table, a player whose invitation was
 * withdrawn and a stranger are refused both endpoints with the campaign's
 * `NotFound`; and nothing a player reads about a shared NPC moves when its prep
 * is written.
 */

const database = migratedDatabase("taverns_test_npc_prep");
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

/** The same call, answering the failure rather than dying on it. */
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
        resource:
          typeof error === "object" && error !== null && "resource" in error
            ? String(error.resource)
            : undefined,
      }),
    ),
  );

/** A GET's exact body, for the byte-for-byte comparison a decoded value would blur. */
const rawGet = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

/** A PATCH the derived client would refuse to encode, sent as it stands. */
const rawPatch = (token: string, path: string, body: unknown) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.patch(path).pipe(
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.bodyJsonUnsafe(body),
      ),
    );
    return response.status;
  }).pipe(Effect.orDie);

const anNpcBy = (jo: Person, campaignId: CampaignId, name: string, visibility: "dm" | "shared") =>
  as(jo.token, (client) =>
    client.npcs.create({
      params: { campaignId },
      payload: { name, role: "a face at the ford", visibility },
    }),
  ).pipe(Effect.map((made) => made.id));

const aNightBy = (jo: Person, campaignId: CampaignId, number: number) =>
  as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId },
      payload: { number, visibility: "shared" },
    }),
  ).pipe(Effect.map((made) => made.id));

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const withdrawn = yield* aPerson("Wren");
  const stranger = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const elsewhere = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Hag's Bargain" } }),
  )).id;
  const seatedIlse = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, seatedIlse, { name: "Tamsin" }, { seatVisibility: "shared" });
  // Admitted through a real invitation, then withdrawn by the creator.
  yield* Effect.gen(function* () {
    const invites = yield* Invites;
    const proof = yield* asDm(jo.actor, table);
    const issued = yield* invites.createForCampaign(proof, { label: "Wren" });
    yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, withdrawn.actor);
    yield* invites.revokeForCampaign(proof, issued.invite.id);
  });

  /** Shared with the table: a player reads it. */
  const grusk = yield* anNpcBy(jo, table, "Grusk", "shared");
  /** Kept to the DM. */
  const hollis = yield* anNpcBy(jo, table, "Hollis", "dm");
  const first = yield* aNightBy(jo, table, 1);
  const second = yield* aNightBy(jo, table, 2);
  const otherNight = yield* aNightBy(jo, elsewhere, 1);
  return {
    jo,
    ilse,
    withdrawn,
    stranger,
    table,
    elsewhere,
    grusk,
    hollis,
    first,
    second,
    otherNight,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "npc-prep.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const prepList = (campaignId: CampaignId, archived?: boolean) =>
  Effect.flatMap(Fixture, ({ jo }) =>
    as(jo.token, (client) =>
      client.npcs.prepList({
        params: { campaignId },
        query: archived === undefined ? {} : { archived },
      }),
    ),
  );

const prepOf = (campaignId: CampaignId, npcId: NpcId) =>
  Effect.map(prepList(campaignId), (listed) => listed.find((entry) => entry.npcId === npcId));

const writePrep = (campaignId: CampaignId, npcId: NpcId, payload: NpcPrepUpdate) =>
  Effect.flatMap(Fixture, ({ jo }) =>
    as(jo.token, (client) => client.npcs.updatePrep({ params: { campaignId, npcId }, payload })),
  );

const anNpc = (campaignId: CampaignId, name: string, visibility: "dm" | "shared") =>
  Effect.flatMap(Fixture, ({ jo }) => anNpcBy(jo, campaignId, name, visibility));

const aNight = (campaignId: CampaignId, number: number) =>
  Effect.flatMap(Fixture, ({ jo }) => aNightBy(jo, campaignId, number));

/** The night goes on the table, as *Start session* puts it there. */
const begin = (sessionId: SessionId) =>
  Effect.gen(function* () {
    const { jo, table } = yield* Fixture;
    yield* as(jo.token, (client) =>
      client.campaigns.update({
        params: { campaignId: table },
        payload: { currentSessionId: sessionId },
      }),
    );
    yield* as(jo.token, (client) =>
      client.sessions.update({
        params: { campaignId: table, sessionId },
        payload: { startedAt: DateTime.nowUnsafe() },
      }),
    );
  });

/** The DM opens the NPC at tonight's table: its live-session conversation. */
const openAtTable = (npcId: NpcId, sessionId: SessionId) =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(jo.token, (client) =>
      client.npcs.openSession({
        params: { campaignId: table, npcId, sessionId },
        payload: {},
      }),
    ),
  );

describeLayer("npc-prep", shared, (it) => {
  describe("the creator's NPC prep", () => {
    it.effect("answers every live NPC in the cast's order, nulls where nothing is written", () =>
      Effect.gen(function* () {
        const { jo, table, hollis } = yield* Fixture;
        const listed = yield* prepList(table);
        const cast = yield* as(jo.token, (client) =>
          client.npcs.list({ params: { campaignId: table }, query: {} }),
        );
        expect(listed.map((entry) => entry.npcId)).toEqual(cast.map((npc) => npc.id));
        expect(listed.find((entry) => entry.npcId === hollis)).toEqual(
          expect.objectContaining({
            attitude: null,
            status: null,
            whereabouts: null,
            metSessionId: null,
            tableNights: [],
          }),
        );
      }),
    );

    it.effect("writes, reads back, leaves what a patch does not name, and clears with null", () =>
      Effect.gen(function* () {
        const { table, hollis, first } = yield* Fixture;
        const written = yield* writePrep(table, hollis, {
          attitude: "hostile",
          status: "captive",
          whereabouts: "  The tollhouse cellar  ",
          metSessionId: first,
        });
        // Trimmed on the way in, as every prose line is.
        expect(written).toMatchObject({
          npcId: hollis,
          attitude: "hostile",
          status: "captive",
          whereabouts: "The tollhouse cellar",
          metSessionId: first,
          tableNights: [],
        });
        expect(yield* prepOf(table, hollis)).toEqual(written);

        const attitudeOnly = yield* writePrep(table, hollis, { attitude: "friendly" });
        expect(attitudeOnly).toMatchObject({
          attitude: "friendly",
          status: "captive",
          whereabouts: "The tollhouse cellar",
          metSessionId: first,
        });

        const cleared = yield* writePrep(table, hollis, {
          attitude: null,
          status: null,
          whereabouts: null,
          metSessionId: null,
        });
        expect(cleared).toMatchObject({
          attitude: null,
          status: null,
          whereabouts: null,
          metSessionId: null,
        });
        expect(yield* prepOf(table, hollis)).toEqual(cleared);
      }),
    );

    it.effect(
      "refuses a blank or over-long whereabouts and an unknown attitude or status at the wire",
      () =>
        Effect.gen(function* () {
          const { jo, table, hollis } = yield* Fixture;
          const path = `/campaigns/${table}/npcs/${hollis}/prep`;
          expect(yield* rawPatch(jo.token, path, { whereabouts: "   " })).toBe(400);
          expect(
            yield* rawPatch(jo.token, path, { whereabouts: "x".repeat(NPC_WHEREABOUTS_MAX + 1) }),
          ).toBe(400);
          expect(yield* rawPatch(jo.token, path, { attitude: "wary" })).toBe(400);
          expect(yield* rawPatch(jo.token, path, { status: "missing" })).toBe(400);
          expect(yield* prepOf(table, hollis)).toMatchObject({
            attitude: null,
            status: null,
            whereabouts: null,
          });

          const longest = "x".repeat(NPC_WHEREABOUTS_MAX);
          expect((yield* writePrep(table, hollis, { whereabouts: longest })).whereabouts).toBe(
            longest,
          );
          yield* writePrep(table, hollis, { whereabouts: null });
        }),
    );

    it.effect(
      "keeps an archived NPC's prep on the archived shelf, writable, and back on restore",
      () =>
        Effect.gen(function* () {
          const { jo, table, hollis } = yield* Fixture;
          yield* writePrep(table, hollis, { status: "dead" });
          yield* as(jo.token, (client) =>
            client.npcs.archive({ params: { campaignId: table, npcId: hollis }, payload: {} }),
          );
          expect((yield* prepList(table)).map((entry) => entry.npcId)).not.toContain(hollis);
          expect((yield* prepList(table, true)).map((entry) => entry.npcId)).toEqual([hollis]);
          expect((yield* writePrep(table, hollis, { status: "unknown" })).status).toBe("unknown");

          yield* as(jo.token, (client) =>
            client.npcs.restore({ params: { campaignId: table, npcId: hollis }, payload: {} }),
          );
          expect(yield* prepOf(table, hollis)).toMatchObject({ status: "unknown" });
          yield* writePrep(table, hollis, { status: null });
        }),
    );
  });

  describe("the night the party first met them", () => {
    it.effect("refuses a night of another campaign, even to the creator of both", () =>
      Effect.gen(function* () {
        const { jo, table, grusk, second, otherNight } = yield* Fixture;
        yield* writePrep(table, grusk, { metSessionId: second });
        expect(
          yield* attempt(jo.token, (client) =>
            client.npcs.updatePrep({
              params: { campaignId: table, npcId: grusk },
              payload: { metSessionId: otherNight, attitude: "hostile" },
            }),
          ),
        ).toEqual({ ok: false, tag: "NotFound", resource: "session" });
        // Refused whole: the attitude sent beside it was not written either.
        expect(yield* prepOf(table, grusk)).toMatchObject({ metSessionId: second, attitude: null });
        yield* writePrep(table, grusk, { metSessionId: null });
      }),
    );

    it.effect("forgets the meeting, and nothing else, when that night is deleted", () =>
      Effect.gen(function* () {
        const { jo, table, hollis } = yield* Fixture;
        const doomed = yield* aNight(table, 9);
        yield* writePrep(table, hollis, {
          attitude: "indifferent",
          whereabouts: "Rowing the ferry",
          metSessionId: doomed,
        });
        yield* as(jo.token, (client) =>
          client.sessions.remove({ params: { campaignId: table, sessionId: doomed } }),
        );
        expect(yield* prepOf(table, hollis)).toMatchObject({
          attitude: "indifferent",
          whereabouts: "Rowing the ferry",
          metSessionId: null,
        });
        yield* writePrep(table, hollis, { attitude: null, whereabouts: null });
      }),
    );
  });

  describe("the nights an NPC was at the table", () => {
    it.effect(
      "are its live-session conversations, oldest night first, and go with a deleted night",
      () =>
        Effect.gen(function* () {
          const { jo, table, grusk, hollis, first, second } = yield* Fixture;
          // Opened on the second night before the first: the order is the nights',
          // not the conversations'.
          yield* begin(second);
          yield* openAtTable(grusk, second);
          yield* begin(first);
          yield* openAtTable(grusk, first);

          const prep = yield* prepOf(table, grusk);
          expect(prep?.tableNights).toEqual([first, second]);
          // Nothing typed: the DM's first meeting is a separate answer.
          expect(prep?.metSessionId).toBeNull();
          expect((yield* prepOf(table, hollis))?.tableNights).toEqual([]);

          const brief = yield* aNight(table, 3);
          yield* begin(brief);
          yield* openAtTable(grusk, brief);
          expect((yield* prepOf(table, grusk))?.tableNights).toEqual([first, second, brief]);
          yield* as(jo.token, (client) =>
            client.sessions.remove({ params: { campaignId: table, sessionId: brief } }),
          );
          expect((yield* prepOf(table, grusk))?.tableNights).toEqual([first, second]);
          yield* begin(second);
        }),
    );
  });

  describe("the NPC the path names", () => {
    it.effect(
      "refuses another campaign's NPC named in this one's path, even to the creator of both",
      () =>
        Effect.gen(function* () {
          const { jo, table, elsewhere } = yield* Fixture;
          const theirs = yield* anNpc(elsewhere, "Mother Sallow", "dm");
          yield* writePrep(elsewhere, theirs, { whereabouts: "WHERE-ELSEWHERE" });

          expect(
            yield* attempt(jo.token, (client) =>
              client.npcs.updatePrep({
                params: { campaignId: table, npcId: theirs },
                payload: { whereabouts: "Smuggled" },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound", resource: "npc" });
          expect((yield* prepList(table)).map((entry) => entry.npcId)).not.toContain(theirs);
          expect((yield* prepOf(elsewhere, theirs))?.whereabouts).toBe("WHERE-ELSEWHERE");
        }),
    );
  });

  it.layer(
    Layer.effectDiscard(
      Effect.gen(function* () {
        const { table, grusk, first } = yield* Fixture;
        yield* writePrep(table, grusk, {
          attitude: "hostile",
          status: "captive",
          whereabouts: "WHERE-GRUSK",
          metSessionId: first,
        });
      }),
    ),
  )("nobody but the creator", (it) => {
    it.effect(
      "answers a player at the table, a withdrawn player and a stranger the campaign's NotFound",
      () =>
        Effect.gen(function* () {
          const { ilse, withdrawn, stranger, table, grusk, hollis } = yield* Fixture;
          for (const who of [ilse, withdrawn, stranger]) {
            expect(
              yield* attempt(who.token, (client) =>
                client.npcs.prepList({ params: { campaignId: table }, query: {} }),
              ),
            ).toEqual({ ok: false, tag: "NotFound", resource: "campaign" });
            for (const npcId of [grusk, hollis]) {
              expect(
                yield* attempt(who.token, (client) =>
                  client.npcs.updatePrep({
                    params: { campaignId: table, npcId },
                    payload: { whereabouts: "Mine now", attitude: "friendly" },
                  }),
                ),
              ).toEqual({ ok: false, tag: "NotFound", resource: "campaign" });
            }
          }
          expect(yield* prepOf(table, grusk)).toMatchObject({
            attitude: "hostile",
            whereabouts: "WHERE-GRUSK",
          });
          expect((yield* prepOf(table, hollis))?.whereabouts).toBeNull();
        }),
    );

    it.effect("carries none of the prep on anything a player reads about a shared NPC", () =>
      Effect.gen(function* () {
        const { jo, ilse, table, grusk, second } = yield* Fixture;
        const paths = [
          `/campaigns/${table}/npcs/-/player`,
          `/campaigns/${table}/npcs/${grusk}/player`,
          `/campaigns/${table}/npcs/-/sessions/${second}`,
        ];
        for (const path of paths) {
          const read = yield* rawGet(ilse.token, path);
          expect(read.status, path).toBe(200);
          expect(read.body, path).toContain("Grusk");
          for (const marker of [
            "WHERE-GRUSK",
            "hostile",
            "captive",
            "whereabouts",
            "metSessionId",
            "tableNights",
          ]) {
            expect(read.body, `${path} ${marker}`).not.toContain(marker);
          }
        }
        // Nor on the creator's own NPC reads, the wide type a player's projection
        // is cut from: the prep is a read of its own.
        for (const path of [`/campaigns/${table}/npcs`, `/campaigns/${table}/npcs/${grusk}`]) {
          const read = yield* rawGet(jo.token, path);
          expect(read.status, path).toBe(200);
          expect(read.body, path).not.toContain("WHERE-GRUSK");
        }
      }),
    );

    it.effect("leaves a player's NPC reads byte for byte what they were", () =>
      Effect.gen(function* () {
        const { ilse, table, grusk, second } = yield* Fixture;
        const paths = [
          `/campaigns/${table}/npcs/-/player`,
          `/campaigns/${table}/npcs/${grusk}/player`,
          `/campaigns/${table}/npcs/-/sessions/${second}`,
        ];
        const before = yield* Effect.all(
          paths.map((path) => rawGet(ilse.token, path)),
          { concurrency: "unbounded" },
        );
        yield* writePrep(table, grusk, {
          attitude: "friendly",
          status: "dead",
          whereabouts: "Somewhere new",
          metSessionId: second,
        });
        const after = yield* Effect.all(
          paths.map((path) => rawGet(ilse.token, path)),
          { concurrency: "unbounded" },
        );
        expect(after).toEqual(before);
      }),
    );
  });
});
