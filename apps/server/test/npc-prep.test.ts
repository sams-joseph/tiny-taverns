import {
  Actor,
  type CampaignId,
  CurrentActor,
  NPC_WHEREABOUTS_MAX,
  type NpcId,
  type NpcPrepUpdate,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Invites } from "../src/repo/Invites.js";
import { aCharacterAt, admittedTo, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";

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

/** The same call, answering the failure rather than dying on it. */
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
          resource:
            typeof error === "object" && error !== null && "resource" in error
              ? String(error.resource)
              : undefined,
        }),
      ),
    ),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

/** A GET's exact body, for the byte-for-byte comparison a decoded value would blur. */
const rawGet = (token: string, path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
      );
      return { status: response.status, body: yield* response.text };
    }).pipe(Effect.orDie),
  );

/** A PATCH the derived client would refuse to encode, sent as it stands. */
const rawPatch = (token: string, path: string, body: unknown) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.patch(path).pipe(
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.bodyJsonUnsafe(body),
        ),
      );
      return response.status;
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

const prepList = (campaignId: CampaignId, archived?: boolean) =>
  as(jo.token, (client) =>
    client.npcs.prepList({
      params: { campaignId },
      query: archived === undefined ? {} : { archived },
    }),
  );

const prepOf = async (campaignId: CampaignId, npcId: NpcId) =>
  (await prepList(campaignId)).find((entry) => entry.npcId === npcId);

const writePrep = (campaignId: CampaignId, npcId: NpcId, payload: NpcPrepUpdate) =>
  as(jo.token, (client) => client.npcs.updatePrep({ params: { campaignId, npcId }, payload }));

const anNpc = async (
  campaignId: CampaignId,
  name: string,
  visibility: "dm" | "shared",
): Promise<NpcId> =>
  (
    await as(jo.token, (client) =>
      client.npcs.create({
        params: { campaignId },
        payload: { name, role: "a face at the ford", visibility },
      }),
    )
  ).id;

const aNight = async (campaignId: CampaignId, number: number): Promise<SessionId> =>
  (
    await as(jo.token, (client) =>
      client.sessions.create({
        params: { campaignId },
        payload: { number, visibility: "shared" },
      }),
    )
  ).id;

/** The night goes on the table, as *Start session* puts it there. */
const begin = async (sessionId: SessionId) => {
  await as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: sessionId },
    }),
  );
  await as(jo.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId },
      payload: { startedAt: DateTime.nowUnsafe() },
    }),
  );
};

/** The DM opens the NPC at tonight's table: its live-session conversation. */
const openAtTable = (npcId: NpcId, sessionId: SessionId) =>
  as(jo.token, (client) =>
    client.npcs.openSession({
      params: { campaignId: table, npcId, sessionId },
      payload: {},
    }),
  );

let jo: Person;
let ilse: Person;
let withdrawn: Person;
let stranger: Person;
let table: CampaignId;
let elsewhere: CampaignId;
/** Shared with the table: a player reads it. */
let grusk: NpcId;
/** Kept to the DM. */
let hollis: NpcId;
let first: SessionId;
let second: SessionId;
let otherNight: SessionId;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  withdrawn = await person("Wren");
  stranger = await person("Bo");
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
  elsewhere = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Hag's Bargain" } }),
    )
  ).id;
  const seatedIlse = await run(admittedTo(table, ilse.actor, "Ilse"));
  await run(aCharacterAt(table, seatedIlse, { name: "Tamsin" }, { seatVisibility: "shared" }));
  // Admitted through a real invitation, then withdrawn by the creator.
  await run(
    Effect.gen(function* () {
      const invites = yield* Invites;
      const proof = yield* asDm(jo.actor, table);
      const issued = yield* invites.createForCampaign(proof, { label: "Wren" });
      yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, withdrawn.actor);
      yield* invites.revokeForCampaign(proof, issued.invite.id);
    }),
  );

  grusk = await anNpc(table, "Grusk", "shared");
  hollis = await anNpc(table, "Hollis", "dm");
  first = await aNight(table, 1);
  second = await aNight(table, 2);
  otherNight = await aNight(elsewhere, 1);
}, 60_000);

describe("the creator's NPC prep", () => {
  it("answers every live NPC in the cast's order, nulls where nothing is written", async () => {
    const listed = await prepList(table);
    const cast = await as(jo.token, (client) =>
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
  });

  it("writes, reads back, leaves what a patch does not name, and clears with null", async () => {
    const written = await writePrep(table, hollis, {
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
    expect(await prepOf(table, hollis)).toEqual(written);

    const attitudeOnly = await writePrep(table, hollis, { attitude: "friendly" });
    expect(attitudeOnly).toMatchObject({
      attitude: "friendly",
      status: "captive",
      whereabouts: "The tollhouse cellar",
      metSessionId: first,
    });

    const cleared = await writePrep(table, hollis, {
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
    expect(await prepOf(table, hollis)).toEqual(cleared);
  });

  it("refuses a blank or over-long whereabouts and an unknown attitude or status at the wire", async () => {
    const path = `/campaigns/${table}/npcs/${hollis}/prep`;
    expect(await rawPatch(jo.token, path, { whereabouts: "   " })).toBe(400);
    expect(
      await rawPatch(jo.token, path, { whereabouts: "x".repeat(NPC_WHEREABOUTS_MAX + 1) }),
    ).toBe(400);
    expect(await rawPatch(jo.token, path, { attitude: "wary" })).toBe(400);
    expect(await rawPatch(jo.token, path, { status: "missing" })).toBe(400);
    expect(await prepOf(table, hollis)).toMatchObject({
      attitude: null,
      status: null,
      whereabouts: null,
    });

    const longest = "x".repeat(NPC_WHEREABOUTS_MAX);
    expect((await writePrep(table, hollis, { whereabouts: longest })).whereabouts).toBe(longest);
    await writePrep(table, hollis, { whereabouts: null });
  });

  it("keeps an archived NPC's prep on the archived shelf, writable, and back on restore", async () => {
    await writePrep(table, hollis, { status: "dead" });
    await as(jo.token, (client) =>
      client.npcs.archive({ params: { campaignId: table, npcId: hollis }, payload: {} }),
    );
    expect((await prepList(table)).map((entry) => entry.npcId)).not.toContain(hollis);
    expect((await prepList(table, true)).map((entry) => entry.npcId)).toEqual([hollis]);
    expect((await writePrep(table, hollis, { status: "unknown" })).status).toBe("unknown");

    await as(jo.token, (client) =>
      client.npcs.restore({ params: { campaignId: table, npcId: hollis }, payload: {} }),
    );
    expect(await prepOf(table, hollis)).toMatchObject({ status: "unknown" });
    await writePrep(table, hollis, { status: null });
  });
});

describe("the night the party first met them", () => {
  it("refuses a night of another campaign, even to the creator of both", async () => {
    await writePrep(table, grusk, { metSessionId: second });
    expect(
      await attempt(jo.token, (client) =>
        client.npcs.updatePrep({
          params: { campaignId: table, npcId: grusk },
          payload: { metSessionId: otherNight, attitude: "hostile" },
        }),
      ),
    ).toEqual({ ok: false, tag: "NotFound", resource: "session" });
    // Refused whole: the attitude sent beside it was not written either.
    expect(await prepOf(table, grusk)).toMatchObject({ metSessionId: second, attitude: null });
    await writePrep(table, grusk, { metSessionId: null });
  });

  it("forgets the meeting, and nothing else, when that night is deleted", async () => {
    const doomed = await aNight(table, 9);
    await writePrep(table, hollis, {
      attitude: "indifferent",
      whereabouts: "Rowing the ferry",
      metSessionId: doomed,
    });
    await as(jo.token, (client) =>
      client.sessions.remove({ params: { campaignId: table, sessionId: doomed } }),
    );
    expect(await prepOf(table, hollis)).toMatchObject({
      attitude: "indifferent",
      whereabouts: "Rowing the ferry",
      metSessionId: null,
    });
    await writePrep(table, hollis, { attitude: null, whereabouts: null });
  });
});

describe("the nights an NPC was at the table", () => {
  it("are its live-session conversations, oldest night first, and go with a deleted night", async () => {
    // Opened on the second night before the first: the order is the nights',
    // not the conversations'.
    await begin(second);
    await openAtTable(grusk, second);
    await begin(first);
    await openAtTable(grusk, first);

    const prep = await prepOf(table, grusk);
    expect(prep?.tableNights).toEqual([first, second]);
    // Nothing typed: the DM's first meeting is a separate answer.
    expect(prep?.metSessionId).toBeNull();
    expect((await prepOf(table, hollis))?.tableNights).toEqual([]);

    const brief = await aNight(table, 3);
    await begin(brief);
    await openAtTable(grusk, brief);
    expect((await prepOf(table, grusk))?.tableNights).toEqual([first, second, brief]);
    await as(jo.token, (client) =>
      client.sessions.remove({ params: { campaignId: table, sessionId: brief } }),
    );
    expect((await prepOf(table, grusk))?.tableNights).toEqual([first, second]);
    await begin(second);
  });
});

describe("the NPC the path names", () => {
  it("refuses another campaign's NPC named in this one's path, even to the creator of both", async () => {
    const theirs = await anNpc(elsewhere, "Mother Sallow", "dm");
    await writePrep(elsewhere, theirs, { whereabouts: "WHERE-ELSEWHERE" });

    expect(
      await attempt(jo.token, (client) =>
        client.npcs.updatePrep({
          params: { campaignId: table, npcId: theirs },
          payload: { whereabouts: "Smuggled" },
        }),
      ),
    ).toEqual({ ok: false, tag: "NotFound", resource: "npc" });
    expect((await prepList(table)).map((entry) => entry.npcId)).not.toContain(theirs);
    expect((await prepOf(elsewhere, theirs))?.whereabouts).toBe("WHERE-ELSEWHERE");
  });
});

describe("nobody but the creator", () => {
  beforeAll(async () => {
    await writePrep(table, grusk, {
      attitude: "hostile",
      status: "captive",
      whereabouts: "WHERE-GRUSK",
      metSessionId: first,
    });
  }, 60_000);

  it("answers a player at the table, a withdrawn player and a stranger the campaign's NotFound", async () => {
    for (const who of [ilse, withdrawn, stranger]) {
      expect(
        await attempt(who.token, (client) =>
          client.npcs.prepList({ params: { campaignId: table }, query: {} }),
        ),
      ).toEqual({ ok: false, tag: "NotFound", resource: "campaign" });
      for (const npcId of [grusk, hollis]) {
        expect(
          await attempt(who.token, (client) =>
            client.npcs.updatePrep({
              params: { campaignId: table, npcId },
              payload: { whereabouts: "Mine now", attitude: "friendly" },
            }),
          ),
        ).toEqual({ ok: false, tag: "NotFound", resource: "campaign" });
      }
    }
    expect(await prepOf(table, grusk)).toMatchObject({
      attitude: "hostile",
      whereabouts: "WHERE-GRUSK",
    });
    expect((await prepOf(table, hollis))?.whereabouts).toBeNull();
  });

  it("carries none of the prep on anything a player reads about a shared NPC", async () => {
    const paths = [
      `/campaigns/${table}/npcs/-/player`,
      `/campaigns/${table}/npcs/${grusk}/player`,
      `/campaigns/${table}/npcs/-/sessions/${second}`,
    ];
    for (const path of paths) {
      const read = await rawGet(ilse.token, path);
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
      const read = await rawGet(jo.token, path);
      expect(read.status, path).toBe(200);
      expect(read.body, path).not.toContain("WHERE-GRUSK");
    }
  });

  it("leaves a player's NPC reads byte for byte what they were", async () => {
    const paths = [
      `/campaigns/${table}/npcs/-/player`,
      `/campaigns/${table}/npcs/${grusk}/player`,
      `/campaigns/${table}/npcs/-/sessions/${second}`,
    ];
    const before = await Promise.all(paths.map((path) => rawGet(ilse.token, path)));
    await writePrep(table, grusk, {
      attitude: "friendly",
      status: "dead",
      whereabouts: "Somewhere new",
      metSessionId: second,
    });
    const after = await Promise.all(paths.map((path) => rawGet(ilse.token, path)));
    expect(after).toEqual(before);
  });
});
