import { describe, expect } from "@effect/vitest";
import {
  type Combatant,
  type CombatantId,
  type CombatantResources,
  type EncounterRun,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { type Person, aCharacterAt, admittedTo, aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **What a monster has spent over its fight, on the fight's own row**
 * (`0093_combatant_resources.ts`): the DM's hand on it
 * (`Combatants.resources`), the legendary actions the start of its own turn
 * gives back (`freshTurn`), the copy a resumed fight carries, and the player
 * reads that never see it.
 *
 * Over the real application and Postgres, with the people minted the shipped
 * way (`support/actors.ts`).
 */
const database = migratedDatabase("taverns_test_npc_resources");
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
      }),
    ),
  );

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

const wire = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const player = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, player, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" });
  const wyrmId = (yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Marsh Wyrm", type: "Dragon", cr: "10", ac: 18, hp: 150 },
    }),
  )).id;
  return { jo, ilse, stranger, table, wyrmId };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "npc-resources.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

let nights = 0;

const night = Effect.gen(function* () {
  const { jo, table } = yield* Fixture;
  nights += 1;
  const number = nights;
  const session = yield* as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number, visibility: "shared" },
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
  Effect.gen(function* () {
    const { jo, table } = yield* Fixture;
    yield* as(jo.token, (client) =>
      client.sessions.update({
        params: { campaignId: table, sessionId },
        payload: { endedAt: DateTime.nowUnsafe() },
      }),
    );
  });

/** Tamsin, then the wyrm: round 1 begun, Tamsin up. */
const underWay = (sessionId: SessionId) =>
  Effect.gen(function* () {
    const { jo, table, wyrmId } = yield* Fixture;
    const encounterId = (yield* as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: {
          name: "The wyrm's pool",
          visibility: "shared",
          ready: true,
          creatures: [{ creatureId: wyrmId, count: 1 }],
        },
      }),
    )).id;
    const fight = yield* as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId },
        payload: { encounterId, visibility: "shared" },
      }),
    );
    const params = { campaignId: table, sessionId, runId: fight.id };
    const seeded = yield* as(jo.token, (client) => client.combatants.list({ params }));
    const tamsin = seeded.find((row) => row.kind === "pc")!;
    const wyrm = seeded.find((row) => row.kind === "npc")!;
    yield* as(jo.token, (client) =>
      client.runs.setInitiative({
        params,
        payload: {
          entries: [
            { combatantId: tamsin.id, initiative: 20 },
            { combatantId: wyrm.id, initiative: 10 },
          ],
        },
      }),
    );
    yield* as(jo.token, (client) => client.runs.begin({ params, payload: {} }));
    return { fight, params, tamsin, wyrm };
  });

type Params = Effect.Success<ReturnType<typeof underWay>>["params"];

const spend = (who: Person, params: Params, combatant: Combatant, payload: CombatantResources) =>
  attempt(who.token, (client) =>
    client.combatants.resources({ params: { ...params, combatantId: combatant.id }, payload }),
  );

const resourcesOf = (row: Combatant | undefined) =>
  row === undefined
    ? undefined
    : {
        legendarySpent: row.legendarySpent,
        rechargeSpent: row.rechargeSpent,
        usesSpent: row.usesSpent,
        slotsSpent: row.slotsSpent,
      };

const nothing = { legendarySpent: 0, rechargeSpent: [], usesSpent: {}, slotsSpent: {} };

const rowOf = (params: Params, id: CombatantId) =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    const rows = yield* as(jo.token, (client) => client.combatants.list({ params }));
    return rows.find((row) => row.id === id);
  });

const updatesIn = (runId: EncounterRun["id"]) =>
  sql(
    (sql) => sql<{ readonly visibility: string; readonly payload: Record<string, unknown> }>`
      select visibility, payload from session_event
      where encounter_run_id = ${runId} and kind = 'combatant-updated'
      order by seq
    `,
  );

describeLayer("npc-resources", shared, (it) => {
  describe("the DM's hand on a monster's spending", () => {
    it.effect("starts at nothing spent, and sets and takes back each one", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const session = yield* night;
        const { fight, params, wyrm } = yield* underWay(session);
        expect(resourcesOf(wyrm)).toEqual(nothing);

        const spent = yield* spend(jo, params, wyrm, {
          legendarySpent: 2,
          rechargeSpent: ["actions/Fire Breath", "actions/Fire Breath"],
          usesSpent: { "specialAbilities/Legendary Resistance (3/Day)": 1 },
          slotsSpent: { "slot/Spellcasting/1": 2, "slot/Spellcasting/2": 0 },
        });
        // A set is a set, and a count of zero is no entry.
        expect(spent).toMatchObject({
          ok: true,
          value: {
            legendarySpent: 2,
            rechargeSpent: ["actions/Fire Breath"],
            usesSpent: { "specialAbilities/Legendary Resistance (3/Day)": 1 },
            slotsSpent: { "slot/Spellcasting/1": 2 },
          },
        });

        // What it does not name stays; what it names is the whole new value.
        const back = yield* spend(jo, params, wyrm, { rechargeSpent: [], slotsSpent: {} });
        expect(back.ok && resourcesOf(back.value)).toEqual({
          legendarySpent: 2,
          rechargeSpent: [],
          usesSpent: { "specialAbilities/Legendary Resistance (3/Day)": 1 },
          slotsSpent: {},
        });

        const log = yield* updatesIn(fight.id);
        expect(log.map((event) => event.visibility)).toEqual(["dm", "dm"]);
        yield* endNight(session);
      }),
    );

    it.effect("applies a repeated requestId once", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const session = yield* night;
        const { fight, params, wyrm } = yield* underWay(session);
        const requestId = crypto.randomUUID();
        yield* spend(jo, params, wyrm, { legendarySpent: 1, requestId });
        const again = yield* spend(jo, params, wyrm, { legendarySpent: 3, requestId });
        expect(again).toMatchObject({ ok: true, value: { legendarySpent: 1 } });
        expect(yield* updatesIn(fight.id)).toHaveLength(1);
        yield* endNight(session);
      }),
    );

    it.effect("refuses a party member's row, whose spending is its sheet's", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const session = yield* night;
        const { params, tamsin } = yield* underWay(session);
        expect(yield* spend(jo, params, tamsin, { legendarySpent: 1 })).toEqual({
          ok: false,
          tag: "Conflict",
        });
        yield* endNight(session);
      }),
    );

    it.effect("answers a player and a stranger NotFound, and writes nothing", () =>
      Effect.gen(function* () {
        const { ilse, stranger } = yield* Fixture;
        const session = yield* night;
        const { fight, params, wyrm } = yield* underWay(session);
        for (const who of [ilse, stranger]) {
          expect(yield* spend(who, params, wyrm, { legendarySpent: 1 })).toEqual({
            ok: false,
            tag: "NotFound",
          });
        }
        expect(resourcesOf(yield* rowOf(params, wyrm.id))).toEqual(nothing);
        expect(yield* updatesIn(fight.id)).toEqual([]);
        yield* endNight(session);
      }),
    );
  });

  describe("the start of its own turn", () => {
    it.effect("gives its legendary actions back, and nothing else", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const session = yield* night;
        const { params, wyrm } = yield* underWay(session);
        // Spent on Tamsin's turn, between turns, as legendary actions are.
        yield* spend(jo, params, wyrm, {
          legendarySpent: 3,
          rechargeSpent: ["actions/Fire Breath"],
          usesSpent: { "actions/Frightful Presence": 1 },
        });
        yield* as(jo.token, (client) => client.runs.nextTurn({ params, payload: {} }));
        expect(resourcesOf(yield* rowOf(params, wyrm.id))).toEqual({
          legendarySpent: 0,
          rechargeSpent: ["actions/Fire Breath"],
          usesSpent: { "actions/Frightful Presence": 1 },
          slotsSpent: {},
        });
        yield* endNight(session);
      }),
    );
  });

  describe("the creator's alone", () => {
    it.effect("reaches no player's table or recap", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        const session = yield* night;
        const { params, wyrm } = yield* underWay(session);
        yield* as(jo.token, (client) =>
          client.combatants.update({
            params: { ...params, combatantId: wyrm.id },
            payload: { visibility: "shared" },
          }),
        );
        yield* spend(jo, params, wyrm, { legendarySpent: 1, rechargeSpent: ["actions/Bite"] });

        const tableRead = yield* wire(ilse.token, `/campaigns/${table}/table`);
        expect(tableRead.status).toBe(200);
        expect(tableRead.body).toContain('"Marsh Wyrm"');
        for (const key of ["legendarySpent", "rechargeSpent", "usesSpent", "slotsSpent"]) {
          expect(tableRead.body).not.toContain(key);
        }

        yield* endNight(session);
        const recap = yield* wire(
          ilse.token,
          `/campaigns/${table}/sessions/${session}/recap/player`,
        );
        expect(recap.status).toBe(200);
        expect(recap.body).toContain('"Marsh Wyrm"');
        expect(recap.body).not.toContain("rechargeSpent");
        expect(recap.body).not.toContain("legendarySpent");
      }),
    );
  });

  describe("a resumed fight", () => {
    it.effect("carries what was spent", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const first = yield* night;
        const { fight, params, wyrm } = yield* underWay(first);
        const spending = {
          legendarySpent: 1,
          rechargeSpent: ["actions/Fire Breath"],
          usesSpent: { "spell/Innate Spellcasting/Darkness": 1 },
          slotsSpent: { "slot/Spellcasting/3": 1 },
        };
        yield* spend(jo, params, wyrm, spending);
        yield* endNight(first);

        const second = yield* night;
        const resumed = yield* as(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: second },
            payload: { continuedFrom: fight.id },
          }),
        );
        const rows = yield* as(jo.token, (client) =>
          client.combatants.list({
            params: { campaignId: table, sessionId: second, runId: resumed.id },
          }),
        );
        expect(resourcesOf(rows.find((row) => row.kind === "npc"))).toEqual(spending);
        yield* endNight(second);
      }),
    );
  });
});
