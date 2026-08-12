import { NodeHttpServer } from "@effect/platform-node";
import type { CampaignId, EncounterRunId, LiveEvent, SessionId } from "@taverns/api";
import { TavernsApi } from "@taverns/api";
import { ConfigProvider, Effect, Fiber, Layer, ManagedRuntime, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { migratedDatabase } from "./support/database.js";

/**
 * The live stream, end to end, through the client **derived from the same
 * declaration the server implements**.
 *
 * That is what makes this file worth its runtime: the SSE framing, the event
 * names, the `id` line carrying the cursor and the incremental decode are all
 * exercised by the consumer `apps/web` will actually use, so a change to any of
 * them stops this compiling or fails it rather than surfacing in a browser.
 *
 * The reconnect assertions are the point of the file. A DM's laptop sleeps and
 * their wifi drops mid-fight; a stream that only works on a perfect connection
 * is not finished.
 */
const database = migratedDatabase("taverns_test_live_stream");
const services = servicesOver(database);

/** A one-second heartbeat, so the keep-alive is a property this file can afford. */
const HEARTBEAT_SECONDS = 1;

/**
 * The environment, supplied as a provider rather than by writing to
 * `process.env`.
 *
 * Not a style choice: `ConfigProvider.fromEnv()` *copies* `process.env` into a
 * trie when it is constructed, and the default provider is a
 * `Context.Reference`, so the first config read in the process memoises that
 * snapshot for the whole run — mutating `process.env` in a test changes
 * nothing, silently. See `AGENTS.md`, and `identity-disabled.test.ts`, which
 * hit the same trap.
 */
const environment = Layer.succeed(
  ConfigProvider.ConfigProvider,
  ConfigProvider.fromEnv({ env: { LIVE_HEARTBEAT_SECONDS: String(HEARTBEAT_SECONDS) } }),
);

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
    // Outermost, so it covers the layers' construction and not only what runs
    // afterwards — the heartbeat interval is read when the group is built.
    Layer.provide(environment),
  ),
);
afterAll(() => runtime.dispose());

let client: Effect.Success<ReturnType<typeof clientFor>>;
let campaignId: CampaignId;
let sessionId: SessionId;
let runId: EncounterRunId;
let combatantId: string;

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

/**
 * Open the stream and take the first `count` events, then let it close.
 *
 * `Stream.take` is what ends it: the stream itself never completes, because a
 * live fight has no last event and the heartbeat keeps arriving. Closing it
 * this way is also how the disconnect below is simulated — the client stops
 * reading and the connection goes, which is what a lid closing looks like from
 * the server's side.
 */
const listen = (options: {
  readonly count: number;
  readonly since?: number;
  readonly lastEventId?: string;
}) =>
  client.live
    .events({
      params: { campaignId, sessionId, runId },
      query: options.since === undefined ? {} : { since: options.since },
      headers: options.lastEventId === undefined ? {} : { "last-event-id": options.lastEventId },
    })
    .pipe(
      Effect.flatMap((stream) =>
        stream.pipe(
          // Heartbeats are keep-alive, not content. Dropping them here keeps
          // the assertions about the fight; that they exist at all is asserted
          // separately below.
          Stream.filter((event: LiveEvent) => event.event === "session-event"),
          Stream.take(options.count),
          Stream.runCollect,
        ),
      ),
      Effect.timeout("20 seconds"),
    );

const kinds = (events: ReadonlyArray<LiveEvent>) =>
  events.map((event) => (event.event === "session-event" ? event.data.kind : "heartbeat"));

const seqs = (events: ReadonlyArray<LiveEvent>) =>
  events.map((event) => (event.event === "session-event" ? event.data.seq : -1));

beforeAll(async () => {
  const setUp = Effect.gen(function* () {
    const accounts = yield* Accounts;
    const issued = yield* accounts.issue("Jo");
    const api = yield* clientFor(issued.token);

    const campaign = yield* api.campaigns.create({
      payload: { name: "The Salt Road", visibility: "dm" },
    });
    yield* api.characters.create({
      params: { campaignId: campaign.id },
      payload: {
        name: "Brannoc",
        playerName: "Ilse",
        species: "Half-orc",
        className: "Paladin",
        hpMax: 52,
      },
    });
    const goblin = yield* api.creatures.create({
      params: { campaignId: campaign.id },
      payload: { name: "Goblin Archer", size: "Small", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
    });
    const encounter = yield* api.encounters.create({
      params: { campaignId: campaign.id },
      payload: { name: "Ambush in the reeds", difficulty: "Medium" },
    });
    yield* api.encounterCreatures.create({
      params: { campaignId: campaign.id, encounterId: encounter.id },
      payload: { creatureId: goblin.id, count: 2 },
    });
    const session = yield* api.sessions.create({
      params: { campaignId: campaign.id },
      payload: { number: 12, title: "The ford" },
    });
    const run = yield* api.runs.start({
      params: { campaignId: campaign.id, sessionId: session.id },
      payload: { encounterId: encounter.id },
    });
    const combatants = yield* api.combatants.list({
      params: { campaignId: campaign.id, sessionId: session.id, runId: run.id },
    });

    return { api, campaign, session, run, combatant: combatants[0]! };
  }).pipe(Effect.orDie);

  const set = await runtime.runPromise(setUp);
  client = set.api;
  campaignId = set.campaign.id;
  sessionId = set.session.id;
  runId = set.run.id;
  combatantId = set.combatant.id;
}, 60_000);

/** One damage tap, as the runner's `minus` button issues it. */
const hit = (amount: number, requestId?: string) =>
  runtime.runPromise(
    client.combatants
      .damage({
        params: { campaignId, sessionId, runId, combatantId: combatantId as never },
        payload: requestId === undefined ? { amount } : { amount, requestId },
      })
      .pipe(Effect.orDie),
  );

const advance = () =>
  runtime.runPromise(
    client.runs
      .nextTurn({ params: { campaignId, sessionId, runId }, payload: {} })
      .pipe(Effect.orDie),
  );

describe("the stream", () => {
  it("replays the fight so far to a client that has just connected", async () => {
    // A DM opening the runner mid-session must see the fight, not only what
    // happens next. `since` defaults to 0, so a fresh connection is the same
    // catch-up path a reconnect takes — which is why the reconnect path is
    // exercised by every single connection rather than only by failures.
    const seen = await runtime.runPromise(listen({ count: 1 }));

    expect(kinds(seen)).toEqual(["run-started"]);
    expect(seen[0]!.event === "session-event" && seen[0]!.data.encounterRunId).toBe(runId);
  });

  it("carries each event's cursor as the SSE id, so a client can resume from it", async () => {
    const seen = await runtime.runPromise(listen({ count: 1 }));

    // `HttpApiSchema.StreamSse` is given the event codec in `events` mode
    // rather than `data` mode precisely for this: `data` mode fixes the id to
    // `undefined` and the name to `message`, which throws away both halves of
    // the reconnect story.
    expect(seen[0]!.id).toBe(String(seqs(seen)[0]));
  });

  it("pushes an event that happens while the client is listening", async () => {
    // Opened at the current end of the log, so nothing is replayed: the only
    // way `take(1)` completes is a genuine push from the in-process fan-out.
    const log = await runtime.runPromise(
      client.live.log({ params: { campaignId, sessionId }, query: {} }).pipe(Effect.orDie),
    );
    const cursor = log.at(-1)!.seq;

    const collected = await runtime.runPromise(
      Effect.gen(function* () {
        const fiber = yield* listen({ count: 1, since: cursor }).pipe(
          Effect.forkChild({ startImmediately: true }),
        );
        // Long enough for the subscription to be in place before the write.
        yield* Effect.sleep("400 millis");
        yield* Effect.promise(() => hit(2));
        return yield* Fiber.join(fiber);
      }).pipe(Effect.orDie),
    );

    expect(kinds(collected)).toEqual(["combatant-damaged"]);
    expect(seqs(collected)[0]!).toBeGreaterThan(cursor);
  });

  it("sends heartbeats, without an id, so a quiet connection is still known to be alive", async () => {
    // The transport lies: a TCP connection to a sleeping laptop stays "open",
    // and a proxy usually cuts an idle one somewhere between 30 and 60 seconds
    // with nothing said to either end. A client that has seen no bytes for two
    // intervals knows to reconnect; without this it finds out when the DM does.
    const beats = await runtime.runPromise(
      client.live
        .events({
          // Past the end of the log, so nothing is replayed and the only thing
          // this connection can possibly receive is a heartbeat.
          params: { campaignId, sessionId, runId },
          query: { since: Number.MAX_SAFE_INTEGER },
          headers: {},
        })
        .pipe(
          Effect.flatMap((stream) => stream.pipe(Stream.take(2), Stream.runCollect)),
          Effect.timeout("20 seconds"),
          Effect.orDie,
        ),
    );

    expect(kinds(beats)).toEqual(["heartbeat", "heartbeat"]);
    // No `id` line, deliberately: a browser's `EventSource` keeps the last real
    // `seq` as its `Last-Event-ID`, so a reconnect after a quiet minute resumes
    // from the right place rather than from the beginning of the fight.
    expect(beats.every((beat) => beat.id === undefined)).toBe(true);
  }, 30_000);
});

describe("reconnect", () => {
  it("loses nothing when the connection drops mid-fight", async () => {
    // The scenario, exactly: the DM's laptop sleeps in the middle of combat,
    // things keep happening, and the runner comes back to find the fight where
    // it actually is rather than where it was.

    // 1. Connected. Note where we got to.
    const before = await runtime.runPromise(
      client.live.log({ params: { campaignId, sessionId }, query: {} }).pipe(Effect.orDie),
    );
    const cursor = before.at(-1)!.seq;

    // 2. The lid closes. Three things happen while nobody is listening.
    await hit(1);
    await advance();
    await hit(1);

    // 3. The lid opens, and the client asks for everything after its cursor.
    const missed = await runtime.runPromise(listen({ count: 3, since: cursor }));

    expect(kinds(missed)).toEqual(["combatant-damaged", "turn-advanced", "combatant-damaged"]);
    // In order, and strictly after the cursor — nothing replayed twice and
    // nothing skipped.
    expect(seqs(missed).every((seq) => seq > cursor)).toBe(true);
    expect(seqs(missed)).toEqual([...seqs(missed)].sort((a, b) => a - b));

    // 4. And the state itself is intact — the log is a notification channel,
    // not the source of truth. §3.4: live state is written straight through, so
    // a dropped connection loses a connection and never a fight.
    const run = await runtime.runPromise(
      client.runs.findById({ params: { campaignId, sessionId, runId } }).pipe(Effect.orDie),
    );
    expect(run.endedAt).toBeNull();
    expect(run.activeCombatantId).not.toBeNull();
  });

  it("resumes from the Last-Event-ID header, which is what a native EventSource sends", async () => {
    // `HttpApiClient` issues a plain `fetch`, and a plain `fetch` does not
    // resend `Last-Event-ID` — so `?since=` is the derived client's path. A
    // browser's `EventSource` cannot set a query parameter on its automatic
    // reconnect but does send this header by itself, and honouring it is what
    // makes that reconnect correct rather than silently lossy.
    const before = await runtime.runPromise(
      client.live.log({ params: { campaignId, sessionId }, query: {} }).pipe(Effect.orDie),
    );
    const lastEventId = String(before.at(-1)!.seq);

    await hit(1);

    const missed = await runtime.runPromise(listen({ count: 1, lastEventId }));

    expect(kinds(missed)).toEqual(["combatant-damaged"]);
    expect(seqs(missed)[0]!).toBeGreaterThan(Number(lastEventId));
  });

  it("gives a reconnecting client the same rows the log endpoint would", async () => {
    // The two transports are one query. That is what keeps the reconnect path
    // from rotting: it is not a replay branch that only runs after something
    // has gone wrong, it is the ordinary read with the ordinary cursor.
    const all = await runtime.runPromise(
      client.live.log({ params: { campaignId, sessionId }, query: {} }).pipe(Effect.orDie),
    );
    const forRun = all.filter((event) => event.encounterRunId === runId);
    const streamed = await runtime.runPromise(listen({ count: forRun.length, since: 0 }));

    expect(seqs(streamed)).toEqual(forRun.map((event) => event.seq));
  });

  it("does not re-apply a mutation the client retries after reconnecting", async () => {
    // The other half of a dropped connection: the client does not know whether
    // its last damage tap landed, so it sends it again with the same
    // `requestId`. Applying it twice would take ten hit points instead of five.
    const before = await runtime.runPromise(
      client.live.log({ params: { campaignId, sessionId }, query: {} }).pipe(Effect.orDie),
    );
    const cursor = before.at(-1)!.seq;

    const first = await hit(2, "retry-after-drop");
    const second = await hit(2, "retry-after-drop");

    expect(second.hpCurrent).toBe(first.hpCurrent);

    const after = await runtime.runPromise(
      client.live
        .log({ params: { campaignId, sessionId }, query: { since: cursor } })
        .pipe(Effect.orDie),
    );
    // One line in the log too, so a reconnecting client replaying it does not
    // see the hit twice either.
    expect(after.map((event) => event.kind)).toEqual(["combatant-damaged"]);
  });
});

describe("authorization on the stream", () => {
  it("answers a status, not a failure event inside a 200", async () => {
    // The handler resolves the actor and reads the run before it returns a
    // stream at all. A client that got a 200 and then a failure event would
    // have to be listening for one to discover it was never allowed in.
    const stranger = await runtime.runPromise(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const issued = yield* accounts.issue("Someone else");
        return yield* clientFor(issued.token);
      }).pipe(Effect.orDie),
    );

    const result = await runtime.runPromise(
      stranger.live
        .events({ params: { campaignId, sessionId, runId }, query: {}, headers: {} })
        .pipe(Effect.result),
    );

    expect(result._tag).toBe("Failure");
  });

  it("refuses a stream for a run reached through the wrong session", async () => {
    const other = await runtime.runPromise(
      client.sessions
        .create({ params: { campaignId }, payload: { number: 13 } })
        .pipe(Effect.orDie),
    );

    const result = await runtime.runPromise(
      client.live
        .events({
          params: { campaignId, sessionId: other.id, runId },
          query: {},
          headers: {},
        })
        .pipe(Effect.result),
    );

    expect(result._tag).toBe("Failure");
  });
});
