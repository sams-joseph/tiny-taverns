import { describe, expect } from "@effect/vitest";
import {
  Actor,
  type CampaignId,
  type EncounterId,
  type EncounterKind,
  type EncounterRunId,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **An encounter is played once** (`playthroughOf` in `repo/EncounterRuns.ts`).
 *
 * Over the real application and Postgres: `start` refuses an encounter with any
 * run, live, ended or carried, on any night, with a `Conflict` that says what
 * to do instead; picking a carried fight up (`resume`) and turning a
 * conversation into a fight (`escalate`) are the same playthrough and are not
 * refused; an encounter run several times before the rule is simply played;
 * two starts racing for one encounter produce one run; and a player, whose
 * start never reaches the rule, is answered `NotFound` whether or not the
 * encounter has been played.
 *
 * The player is minted the shipped way (`support/actors.ts`): admitted through
 * a real invitation.
 */
const database = migratedDatabase("taverns_test_play_once");
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

/** The same call, answering the failure's tag and message rather than dying on it. */
const attempt = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), call).pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catch((error: unknown) =>
      Effect.succeed({
        ok: false as const,
        tag:
          typeof error === "object" && error !== null && "_tag" in error
            ? String(error._tag)
            : "unknown",
        message:
          typeof error === "object" && error !== null && "message" in error
            ? String(error.message)
            : "",
      }),
    ),
  );

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

interface Person {
  readonly token: string;
  readonly actor: Actor;
}

const person = (name: string) =>
  Effect.gen(function* () {
    const issued = yield* Effect.flatMap(Accounts, (accounts) => accounts.issue(name));
    return {
      token: issued.token,
      actor: new Actor({ accountId: issued.accountId, scope: { _tag: "account" } }),
    } satisfies Person;
  }).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  const jo = yield* person("Jo");
  const ilse = yield* person("Ilse");
  const stranger = yield* person("Bo");
  const table: CampaignId = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  yield* admittedTo(table, ilse.actor, "Ilse");
  const archerId = (yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
    }),
  )).id;
  return { jo, ilse, stranger, table, archerId };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "play-once.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

let nights = 0;

/** A night of its own, current, so no two tests share the live-run index. */
const night = Effect.gen(function* () {
  const { jo, table } = yield* Fixture;
  nights += 1;
  const session = yield* as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number: nights, visibility: "shared" },
    }),
  );
  yield* as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: session.id },
    }),
  );
  return session.id;
});

const endNight = (sessionId: SessionId) =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(jo.token, (client) =>
      client.sessions.update({
        params: { campaignId: table, sessionId },
        payload: { endedAt: DateTime.nowUnsafe() },
      }),
    ),
  );

const anEncounter = (kind: EncounterKind = "combat") =>
  Effect.flatMap(Fixture, ({ jo, table, archerId }) =>
    as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: {
          name: "Ambush in the reeds",
          kind,
          creatures: [{ creatureId: archerId, count: 2 }],
        },
      }),
    ),
  ).pipe(Effect.map((made): EncounterId => made.id));

const start = (who: Person, sessionId: SessionId, encounterId: EncounterId) =>
  Effect.flatMap(Fixture, ({ table }) =>
    attempt(who.token, (client) =>
      client.runs.start({ params: { campaignId: table, sessionId }, payload: { encounterId } }),
    ),
  );

const started = (sessionId: SessionId, encounterId: EncounterId) =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    const result = yield* start(jo, sessionId, encounterId);
    if (!result.ok) throw new Error(`start refused: ${result.tag} ${result.message}`);
    return result.value;
  });

const end = (sessionId: SessionId, runId: EncounterRunId) =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(jo.token, (client) =>
      client.runs.end({
        params: { campaignId: table, sessionId, runId },
        payload: {},
      }),
    ),
  );

const runsOf = (encounterId: EncounterId) =>
  sql(
    (sql) => sql<{ readonly id: string }>`
      select id from encounter_run where encounter_id = ${encounterId}
    `,
  );

describeLayer("play-once", shared, (it) => {
  describe("starting an encounter", () => {
    it.effect("is refused once it has been played, on any night", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const ambush = yield* anEncounter();
        const first = yield* night;
        const fight = yield* started(first, ambush);
        yield* end(first, fight.id);

        const refused = yield* start(jo, yield* night, ambush);
        expect(refused).toMatchObject({ ok: false, tag: "Conflict" });
        expect(!refused.ok && refused.message).toBe(
          "that encounter has been played, and an encounter is played once",
        );
        expect(yield* runsOf(ambush)).toHaveLength(1);
      }),
    );

    it.effect("is refused while its fight is still on the table, which the DM goes back to", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const ambush = yield* anEncounter();
        const tonight = yield* night;
        yield* started(tonight, ambush);

        // On the same night, before the one-live-per-session index is reached,
        // and on another.
        for (const sessionId of [tonight, yield* night]) {
          const refused = yield* start(jo, sessionId, ambush);
          expect(refused).toMatchObject({ ok: false, tag: "Conflict" });
          expect(!refused.ok && refused.message).toContain("on the table now");
        }
        expect(yield* runsOf(ambush)).toHaveLength(1);
      }),
    );

    it.effect("leaves every other encounter startable", () =>
      Effect.gen(function* () {
        const played = yield* anEncounter();
        const tonight = yield* night;
        const fight = yield* started(tonight, played);
        yield* end(tonight, fight.id);

        const fresh = yield* anEncounter();
        const next = yield* started(tonight, fresh);
        expect(next.encounterId).toBe(fresh);
      }),
    );
  });

  describe("the same playthrough", () => {
    it.effect("picks a carried fight up, and still refuses to start it again", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const ambush = yield* anEncounter();
        const first = yield* night;
        const fight = yield* started(first, ambush);
        yield* endNight(first);

        const second = yield* night;
        const refused = yield* start(jo, second, ambush);
        expect(refused).toMatchObject({ ok: false, tag: "Conflict" });
        expect(!refused.ok && refused.message).toContain("pick it up");

        const picked = yield* as(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: second },
            payload: { continuedFrom: fight.id },
          }),
        );
        expect(picked.continuedFrom).toBe(fight.id);

        // Live again, then over: refused both times.
        const whileLive = yield* start(jo, yield* night, ambush);
        expect(!whileLive.ok && whileLive.message).toContain("on the table now");
        yield* end(second, picked.id);
        const afterwards = yield* start(jo, yield* night, ambush);
        expect(!afterwards.ok && afterwards.message).toBe(
          "that encounter has been played, and an encounter is played once",
        );
      }),
    );

    it.effect("turns a conversation into a fight on the same run", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const parley = yield* anEncounter("social");
        const tonight = yield* night;
        const talk = yield* started(tonight, parley);

        const fight = yield* as(jo.token, (client) =>
          client.runs.escalate({
            params: { campaignId: table, sessionId: tonight, runId: talk.id },
            payload: {},
          }),
        );
        expect(fight).toMatchObject({ id: talk.id, mode: "combat" });
        expect(yield* runsOf(parley)).toHaveLength(1);

        const refused = yield* start(jo, yield* night, parley);
        expect(refused).toMatchObject({ ok: false, tag: "Conflict" });
      }),
    );
  });

  describe("encounters from before the rule", () => {
    it.effect("refuses one that was run several times already, and changes none of its runs", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const veteran = yield* anEncounter();
        // Planted as they are on disk: two ended runs of one encounter, as any
        // encounter started twice before an encounter was played once has.
        const [a, b] = [yield* night, yield* night];
        yield* sql(
          (sql) => sql`
            insert into encounter_run (session_id, encounter_id, encounter_name, mode, visibility, ended_at)
            values (${a}, ${veteran}, 'Ambush in the reeds', 'combat', 'dm', now()),
                   (${b}, ${veteran}, 'Ambush in the reeds', 'combat', 'dm', now())
          `,
        );

        const refused = yield* start(jo, yield* night, veteran);
        expect(refused).toMatchObject({ ok: false, tag: "Conflict" });
        expect(yield* runsOf(veteran)).toHaveLength(2);
      }),
    );
  });

  describe("two starts at once", () => {
    it.effect("put one run on the table and refuse the other", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        // Two tabs, two nights: the one-live-per-session index cannot settle it,
        // so the lock on the encounter has to.
        const ambush = yield* anEncounter();
        const [first, second] = [yield* night, yield* night];

        const results = yield* Effect.all([start(jo, first, ambush), start(jo, second, ambush)], {
          concurrency: "unbounded",
        });

        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(results.filter((result) => !result.ok)).toMatchObject([{ tag: "Conflict" }]);
        expect(yield* runsOf(ambush)).toHaveLength(1);
      }),
    );
  });

  describe("a start the rule never reaches", () => {
    it.effect("is NotFound to a player and a stranger, played or not", () =>
      Effect.gen(function* () {
        const { ilse, stranger } = yield* Fixture;
        const unplayed = yield* anEncounter();
        const played = yield* anEncounter();
        const tonight = yield* night;
        const fight = yield* started(tonight, played);
        yield* end(tonight, fight.id);

        for (const who of [ilse, stranger]) {
          for (const encounterId of [unplayed, played]) {
            expect(yield* start(who, tonight, encounterId)).toMatchObject({
              ok: false,
              tag: "NotFound",
            });
          }
        }
        expect(yield* runsOf(unplayed)).toHaveLength(0);
      }),
    );
  });
});
