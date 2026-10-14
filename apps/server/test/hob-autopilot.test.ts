import { describe, expect } from "@effect/vitest";
import { type EncounterRun, type HobAutopilotDriverId, TavernsApi } from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, admittedTo, aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Hob's autopilot switch on a fight** (`0099_hob_autopilot.ts`): the
 * creator's alone, written through the run update, logged `dm` whatever the
 * fight's Share says, not carried by `resume`, and on no player's read. And
 * the guard the autopilot advances with: a `nextTurn` that names who it saw up
 * is refused once the marker has moved, so two drivers cannot skip a turn.
 *
 * Over the real application and Postgres, with the people minted the shipped
 * way (`support/actors.ts`): a player admitted through a real invitation with
 * a shared seat, and another table's creator.
 */
const database = migratedDatabase("taverns_test_hob_autopilot");
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

/** The same call, answering `ok` or the failure's tag rather than dying on it. */
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(
    Effect.as("ok"),
    Effect.catch((error: unknown) =>
      Effect.succeed(
        typeof error === "object" && error !== null && "_tag" in error
          ? String(error._tag)
          : "unknown",
      ),
    ),
  );

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

/** A read as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

const LAPTOP = "5d1c2b7a-0099-4000-8000-00000000000a" as HobAutopilotDriverId;
const PHONE = "5d1c2b7a-0099-4000-8000-00000000000b" as HobAutopilotDriverId;

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const rook = yield* aPerson("Rook");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const elsewhere = (yield* as(rook.token, (client) =>
    client.campaigns.create({ payload: { name: "Rook's Rest", visibility: "shared" } }),
  )).id;
  const ilseHere = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, ilseHere, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" });
  const archerId = (yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
    }),
  )).id;
  return { jo, ilse, rook, table, elsewhere, archerId };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "hob-autopilot.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

let nights = 0;

/** A fresh shared night, made the campaign's current one. */
const night = Effect.gen(function* () {
  const { jo, table } = yield* Fixture;
  nights += 1;
  const sessionId = (yield* as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number: nights, visibility: "shared" },
    }),
  )).id;
  yield* as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: sessionId },
    }),
  );
  return sessionId;
});

/**
 * A shared fight on a fresh night, initiative written as Tamsin then two
 * archers, and round 1 begun, so Tamsin is up.
 */
const fight = Effect.gen(function* () {
  const { jo, table, archerId } = yield* Fixture;
  const sessionId = yield* night;
  const encounterId = (yield* as(jo.token, (client) =>
    client.encounters.create({
      params: { campaignId: table },
      payload: {
        name: `Ambush ${String(nights)}`,
        visibility: "shared",
        ready: true,
        creatures: [{ creatureId: archerId, count: 2 }],
      },
    }),
  )).id;
  const run = yield* as(jo.token, (client) =>
    client.runs.start({
      params: { campaignId: table, sessionId },
      payload: { encounterId, visibility: "shared" },
    }),
  );
  const params = { campaignId: table, sessionId, runId: run.id };
  const seeded = yield* as(jo.token, (client) => client.combatants.list({ params }));
  const tamsin = seeded.find((row) => row.displayName === "Tamsin")!;
  const [first, second] = seeded.filter((row) => row.kind === "npc");
  yield* as(jo.token, (client) =>
    client.runs.setInitiative({
      params,
      payload: {
        entries: [
          { combatantId: tamsin.id, initiative: 20 },
          { combatantId: first!.id, initiative: 15 },
          { combatantId: second!.id, initiative: 10 },
        ],
      },
    }),
  );
  yield* as(jo.token, (client) => client.runs.begin({ params, payload: {} }));
  return { sessionId, params, tamsin, first: first!, second: second! };
});

type Params = Effect.Success<typeof fight>["params"];

const setDriver = (params: Params, hobAutopilotDriver: HobAutopilotDriverId | null) =>
  Effect.flatMap(Fixture, ({ jo }) =>
    as(jo.token, (client) => client.runs.update({ params, payload: { hobAutopilotDriver } })),
  );

/** The run's `run-updated` lines that name the autopilot, oldest first. */
const autopilotLines = (runId: EncounterRun["id"]) =>
  sql(
    (sql) => sql<{ readonly driver: string | null; readonly visibility: string }>`
      select payload->>'hobAutopilotDriver' as driver, visibility from session_event
      where encounter_run_id = ${runId} and kind = 'run-updated'
        and payload ? 'hobAutopilotDriver'
      order by seq
    `,
  );

describeLayer("Hob's autopilot switch", shared, (it) => {
  describe("the creator's write", () => {
    it.effect("turns it on for one tab, hands it to another and turns it off", () =>
      Effect.gen(function* () {
        const { params } = yield* fight;
        expect((yield* setDriver(params, LAPTOP)).hobAutopilotDriver).toBe(LAPTOP);
        expect((yield* setDriver(params, PHONE)).hobAutopilotDriver).toBe(PHONE);
        expect((yield* setDriver(params, null)).hobAutopilotDriver).toBeNull();
      }),
    );

    it.effect("starts off", () =>
      Effect.gen(function* () {
        const { params } = yield* fight;
        const { jo } = yield* Fixture;
        const run = yield* as(jo.token, (client) => client.runs.findById({ params }));
        expect(run.hobAutopilotDriver).toBeNull();
      }),
    );

    it.effect("is a 404 to a player and to another table's creator", () =>
      Effect.gen(function* () {
        const { params } = yield* fight;
        const { ilse, rook, elsewhere } = yield* Fixture;
        const payload = { hobAutopilotDriver: LAPTOP };
        expect(
          yield* attempt(ilse.token, (client) => client.runs.update({ params, payload })),
        ).toBe("NotFound");
        expect(
          yield* attempt(rook.token, (client) => client.runs.update({ params, payload })),
        ).toBe("NotFound");
        expect(
          yield* attempt(rook.token, (client) =>
            client.runs.update({ params: { ...params, campaignId: elsewhere }, payload }),
          ),
        ).toBe("NotFound");
        const { jo } = yield* Fixture;
        const run = yield* as(jo.token, (client) => client.runs.findById({ params }));
        expect(run.hobAutopilotDriver).toBeNull();
      }),
    );

    it.effect("is refused on a fight that is over, and turned off there all the same", () =>
      Effect.gen(function* () {
        const { params } = yield* fight;
        const { jo } = yield* Fixture;
        yield* setDriver(params, LAPTOP);
        yield* as(jo.token, (client) => client.runs.end({ params, payload: {} }));
        expect(
          yield* attempt(jo.token, (client) =>
            client.runs.update({ params, payload: { hobAutopilotDriver: PHONE } }),
          ),
        ).toBe("Conflict");
        expect((yield* setDriver(params, null)).hobAutopilotDriver).toBeNull();
      }),
    );
  });

  describe("the log", () => {
    it.effect("logs each change dm, on a shared fight, apart from the rest of the patch", () =>
      Effect.gen(function* () {
        const { params } = yield* fight;
        const { jo } = yield* Fixture;
        yield* setDriver(params, LAPTOP);
        yield* as(jo.token, (client) =>
          client.runs.update({ params, payload: { mapShown: true, hobAutopilotDriver: null } }),
        );
        expect(yield* autopilotLines(params.runId)).toEqual([
          { driver: LAPTOP, visibility: "dm" },
          { driver: null, visibility: "dm" },
        ]);
        const shown = yield* sql(
          (sql) => sql<{ readonly visibility: string; readonly named: boolean }>`
            select visibility, payload ? 'hobAutopilotDriver' as named from session_event
            where encounter_run_id = ${params.runId} and kind = 'run-updated'
              and payload ? 'mapShown'
          `,
        );
        expect(shown).toEqual([{ visibility: "shared", named: false }]);
      }),
    );
  });

  describe("resume", () => {
    it.effect("does not carry it to the next night", () =>
      Effect.gen(function* () {
        const { params } = yield* fight;
        const { jo, table } = yield* Fixture;
        yield* setDriver(params, LAPTOP);
        yield* as(jo.token, (client) =>
          client.sessions.update({
            params: { campaignId: table, sessionId: params.sessionId },
            payload: { endedAt: DateTime.nowUnsafe() },
          }),
        );
        const next = yield* night;
        const resumed = yield* as(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: next },
            payload: { continuedFrom: params.runId },
          }),
        );
        expect(resumed.continuedFrom).toBe(params.runId);
        expect(resumed.hobAutopilotDriver).toBeNull();
      }),
    );
  });

  describe("a player's reads", () => {
    it.effect("carry neither Hob switch: the table, the recap and the Chronicle", () =>
      Effect.gen(function* () {
        const { params } = yield* fight;
        const { jo, ilse, table } = yield* Fixture;
        yield* as(jo.token, (client) =>
          client.runs.update({
            params,
            payload: { hobAutopilotDriver: LAPTOP, allowHobDirectWrites: true },
          }),
        );
        const live = yield* wire(ilse.token, `/campaigns/${table}/table`);
        expect(live.status).toBe(200);
        expect(live.body).toContain(params.runId);

        yield* as(jo.token, (client) =>
          client.sessions.update({
            params: { campaignId: table, sessionId: params.sessionId },
            payload: { endedAt: DateTime.nowUnsafe() },
          }),
        );
        const recap = yield* wire(
          ilse.token,
          `/campaigns/${table}/sessions/${params.sessionId}/recap/player`,
        );
        const chronicle = yield* wire(ilse.token, `/campaigns/${table}/chronicle/player`);
        for (const read of [live, recap, chronicle]) {
          expect(read.status).toBe(200);
          expect(read.body).not.toContain(LAPTOP);
          expect(read.body).not.toContain("hobAutopilotDriver");
          expect(read.body).not.toContain("allowHobDirectWrites");
        }
        expect(recap.body).toContain(params.runId);
        expect(chronicle.body).toContain(params.runId);

        // The creator's own reads of the same night still say it.
        const own = yield* wire(jo.token, `/campaigns/${table}/sessions/${params.sessionId}/recap`);
        expect(own.body).toContain(LAPTOP);
      }),
    );
  });

  describe("nextTurn's guard", () => {
    it.effect("advances from who the caller saw up, and refuses once the marker moved", () =>
      Effect.gen(function* () {
        const { params, tamsin, first } = yield* fight;
        const { jo } = yield* Fixture;
        const moved = yield* as(jo.token, (client) =>
          client.runs.nextTurn({
            params,
            payload: { requestId: "laptop-1", expectedActiveCombatantId: tamsin.id },
          }),
        );
        expect(moved.activeCombatantId).toBe(first.id);
        // The phone saw Tamsin up too: its advance is refused, not a second step.
        expect(
          yield* attempt(jo.token, (client) =>
            client.runs.nextTurn({
              params,
              payload: { requestId: "phone-1", expectedActiveCombatantId: tamsin.id },
            }),
          ),
        ).toBe("Conflict");
        // A repeat of the advance already applied answers the run unchanged.
        const repeated = yield* as(jo.token, (client) =>
          client.runs.nextTurn({
            params,
            payload: { requestId: "laptop-1", expectedActiveCombatantId: tamsin.id },
          }),
        );
        expect(repeated.activeCombatantId).toBe(first.id);
        const run = yield* as(jo.token, (client) => client.runs.findById({ params }));
        expect(run.activeCombatantId).toBe(first.id);
      }),
    );
  });
});
