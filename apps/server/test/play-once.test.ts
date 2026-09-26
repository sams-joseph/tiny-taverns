import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  type CreatureId,
  type EncounterId,
  type EncounterKind,
  type EncounterRunId,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

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
type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(Effect.flatMap(clientFor(token), call).pipe(Effect.orDie));

/** The same call, answering the failure's tag and message rather than dying on it. */
const attempt = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
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
          message:
            typeof error === "object" && error !== null && "message" in error
              ? String(error.message)
              : "",
        }),
      ),
    ),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie));

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

let jo: Person;
let ilse: Person;
let stranger: Person;
let table: CampaignId;
let archerId: CreatureId;
let nights = 0;

/** A night of its own, current, so no two tests share the live-run index. */
const night = async (): Promise<SessionId> => {
  nights += 1;
  const session = await as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number: nights, visibility: "shared" },
    }),
  );
  await as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: session.id },
    }),
  );
  return session.id;
};

const endNight = (sessionId: SessionId) =>
  as(jo.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId },
      payload: { endedAt: DateTime.nowUnsafe() },
    }),
  );

const anEncounter = async (kind: EncounterKind = "combat"): Promise<EncounterId> =>
  (
    await as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: {
          name: "Ambush in the reeds",
          kind,
          creatures: [{ creatureId: archerId, count: 2 }],
        },
      }),
    )
  ).id;

const start = (who: Person, sessionId: SessionId, encounterId: EncounterId) =>
  attempt(who.token, (client) =>
    client.runs.start({ params: { campaignId: table, sessionId }, payload: { encounterId } }),
  );

const started = async (sessionId: SessionId, encounterId: EncounterId) => {
  const result = await start(jo, sessionId, encounterId);
  if (!result.ok) throw new Error(`start refused: ${result.tag} ${result.message}`);
  return result.value;
};

const end = (sessionId: SessionId, runId: EncounterRunId) =>
  as(jo.token, (client) =>
    client.runs.end({
      params: { campaignId: table, sessionId, runId },
      payload: {},
    }),
  );

const runsOf = (encounterId: EncounterId) =>
  sql(
    (sql) => sql<{ readonly id: string }>`
      select id from encounter_run where encounter_id = ${encounterId}
    `,
  );

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
  await run(admittedTo(table, ilse.actor, "Ilse"));
  archerId = (
    await as(jo.token, (client) =>
      client.library.create({
        payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
      }),
    )
  ).id;
}, 60_000);

describe("starting an encounter", () => {
  it("is refused once it has been played, on any night", async () => {
    const ambush = await anEncounter();
    const first = await night();
    const fight = await started(first, ambush);
    await end(first, fight.id);

    const refused = await start(jo, await night(), ambush);
    expect(refused).toMatchObject({ ok: false, tag: "Conflict" });
    expect(!refused.ok && refused.message).toBe(
      "that encounter has been played, and an encounter is played once",
    );
    expect(await runsOf(ambush)).toHaveLength(1);
  }, 60_000);

  it("is refused while its fight is still on the table, which the DM goes back to", async () => {
    const ambush = await anEncounter();
    const tonight = await night();
    await started(tonight, ambush);

    // On the same night, before the one-live-per-session index is reached,
    // and on another.
    for (const sessionId of [tonight, await night()]) {
      const refused = await start(jo, sessionId, ambush);
      expect(refused).toMatchObject({ ok: false, tag: "Conflict" });
      expect(!refused.ok && refused.message).toContain("on the table now");
    }
    expect(await runsOf(ambush)).toHaveLength(1);
  }, 60_000);

  it("leaves every other encounter startable", async () => {
    const played = await anEncounter();
    const tonight = await night();
    const fight = await started(tonight, played);
    await end(tonight, fight.id);

    const fresh = await anEncounter();
    const next = await started(tonight, fresh);
    expect(next.encounterId).toBe(fresh);
  }, 60_000);
});

describe("the same playthrough", () => {
  it("picks a carried fight up, and still refuses to start it again", async () => {
    const ambush = await anEncounter();
    const first = await night();
    const fight = await started(first, ambush);
    await endNight(first);

    const second = await night();
    const refused = await start(jo, second, ambush);
    expect(refused).toMatchObject({ ok: false, tag: "Conflict" });
    expect(!refused.ok && refused.message).toContain("pick it up");

    const picked = await as(jo.token, (client) =>
      client.runs.resume({
        params: { campaignId: table, sessionId: second },
        payload: { continuedFrom: fight.id },
      }),
    );
    expect(picked.continuedFrom).toBe(fight.id);

    // Live again, then over: refused both times.
    const whileLive = await start(jo, await night(), ambush);
    expect(!whileLive.ok && whileLive.message).toContain("on the table now");
    await end(second, picked.id);
    const afterwards = await start(jo, await night(), ambush);
    expect(!afterwards.ok && afterwards.message).toBe(
      "that encounter has been played, and an encounter is played once",
    );
  }, 60_000);

  it("turns a conversation into a fight on the same run", async () => {
    const parley = await anEncounter("social");
    const tonight = await night();
    const talk = await started(tonight, parley);

    const fight = await as(jo.token, (client) =>
      client.runs.escalate({
        params: { campaignId: table, sessionId: tonight, runId: talk.id },
        payload: {},
      }),
    );
    expect(fight).toMatchObject({ id: talk.id, mode: "combat" });
    expect(await runsOf(parley)).toHaveLength(1);

    const refused = await start(jo, await night(), parley);
    expect(refused).toMatchObject({ ok: false, tag: "Conflict" });
  }, 60_000);
});

describe("encounters from before the rule", () => {
  it("refuses one that was run several times already, and changes none of its runs", async () => {
    const veteran = await anEncounter();
    // Planted as they are on disk: two ended runs of one encounter, as any
    // encounter started twice before an encounter was played once has.
    const [a, b] = [await night(), await night()];
    await sql(
      (sql) => sql`
        insert into encounter_run (session_id, encounter_id, encounter_name, mode, visibility, ended_at)
        values (${a}, ${veteran}, 'Ambush in the reeds', 'combat', 'dm', now()),
               (${b}, ${veteran}, 'Ambush in the reeds', 'combat', 'dm', now())
      `,
    );

    const refused = await start(jo, await night(), veteran);
    expect(refused).toMatchObject({ ok: false, tag: "Conflict" });
    expect(await runsOf(veteran)).toHaveLength(2);
  }, 60_000);
});

describe("two starts at once", () => {
  it("put one run on the table and refuse the other", async () => {
    // Two tabs, two nights: the one-live-per-session index cannot settle it,
    // so the lock on the encounter has to.
    const ambush = await anEncounter();
    const [first, second] = [await night(), await night()];

    const results = await Promise.all([start(jo, first, ambush), start(jo, second, ambush)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toMatchObject([{ tag: "Conflict" }]);
    expect(await runsOf(ambush)).toHaveLength(1);
  }, 60_000);
});

describe("a start the rule never reaches", () => {
  it("is NotFound to a player and a stranger, played or not", async () => {
    const unplayed = await anEncounter();
    const played = await anEncounter();
    const tonight = await night();
    const fight = await started(tonight, played);
    await end(tonight, fight.id);

    for (const who of [ilse, stranger]) {
      for (const encounterId of [unplayed, played]) {
        expect(await start(who, tonight, encounterId)).toMatchObject({
          ok: false,
          tag: "NotFound",
        });
      }
    }
    expect(await runsOf(unplayed)).toHaveLength(0);
  }, 60_000);
});
