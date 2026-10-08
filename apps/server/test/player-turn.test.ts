import { describe, expect } from "@effect/vitest";
import {
  type Combatant,
  type CombatantPosition,
  type CombatantTurn,
  type PlayerLiveCombatantYou,
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
 * **A player's own turn, from their Table** (`PlayerTable.move`,
 * `PlayerTable.turn`): moving their own token and ticking their own action,
 * bonus action and reaction, and the `you` row that reads them back.
 *
 * Over the real application and Postgres, with the people minted the shipped
 * way (`support/actors.ts`): two players admitted through real invitations,
 * each with a shared seat, another table's creator, and a stranger. Each
 * write reaches exactly one row — the asker's own seated character's, in the
 * fight their table shows — and every other path is refused the way the read
 * refuses it.
 */
const database = migratedDatabase("taverns_test_player_turn");
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

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const wren = yield* aPerson("Wren");
  const stranger = yield* aPerson("Bo");
  const rook = yield* aPerson("Rook");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  yield* as(rook.token, (client) =>
    client.campaigns.create({ payload: { name: "Rook's Rest", visibility: "shared" } }),
  );

  const ilseHere = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, ilseHere, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" });
  const wrenHere = yield* admittedTo(table, wren.actor, "Wren");
  yield* aCharacterAt(table, wrenHere, { name: "Nessa", hpMax: 24 }, { seatVisibility: "shared" });

  const archerId = (yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
    }),
  )).id;

  return { jo, ilse, wren, stranger, rook, table, archerId };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "player-turn.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

let nights = 0;

/**
 * A fresh night, made the campaign's current one, with a fresh fight on it —
 * shared, every row shared, the map shown, initiative written as Tamsin, the
 * archer, then Nessa, and round 1 begun, so Tamsin is up. Each token is taken
 * off the board and put down on a known square, so a walk's feet are known.
 */
const fight = Effect.gen(function* () {
  const { jo, table, archerId } = yield* Fixture;
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
  const encounterId = (yield* as(jo.token, (client) =>
    client.encounters.create({
      params: { campaignId: table },
      payload: {
        name: `Ambush ${String(nights)}`,
        visibility: "shared",
        ready: true,
        creatures: [{ creatureId: archerId, count: 1 }],
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
  yield* as(jo.token, (client) => client.runs.update({ params, payload: { mapShown: true } }));
  const seeded = yield* as(jo.token, (client) => client.combatants.list({ params }));
  const named = (name: string) => seeded.find((row) => row.displayName.startsWith(name))!;
  const tamsin = named("Tamsin");
  const nessa = named("Nessa");
  const archer = named("Goblin Archer");
  for (const [row, column] of [
    [tamsin, 0],
    [nessa, 1],
    [archer, 2],
  ] as const) {
    yield* as(jo.token, (client) =>
      client.combatants.update({
        params: { ...params, combatantId: row.id },
        payload: { visibility: "shared" },
      }),
    );
    yield* as(jo.token, (client) =>
      client.combatants.move({
        params: { ...params, combatantId: row.id },
        payload: { position: { column, row: 0 } },
      }),
    );
  }
  yield* as(jo.token, (client) =>
    client.runs.setInitiative({
      params,
      payload: {
        entries: [
          { combatantId: tamsin.id, initiative: 20 },
          { combatantId: archer.id, initiative: 15 },
          { combatantId: nessa.id, initiative: 10 },
        ],
      },
    }),
  );
  return { sessionId, params, tamsin, nessa, archer };
});

type Fight = Effect.Success<typeof fight>;

const begin = (params: Fight["params"]) =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    yield* as(jo.token, (client) => client.runs.begin({ params, payload: {} }));
  });

const nextTurn = (params: Fight["params"]) =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    yield* as(jo.token, (client) => client.runs.nextTurn({ params, payload: {} }));
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

const playerMove = (
  who: Person,
  params: Fight["params"],
  combatant: Combatant,
  position: CombatantPosition,
  requestId?: string,
) =>
  attempt(who.token, (client) =>
    client.table.move({
      params: { campaignId: params.campaignId, runId: params.runId, combatantId: combatant.id },
      payload: { position, ...(requestId === undefined ? {} : { requestId }) },
    }),
  );

const playerTick = (
  who: Person,
  params: Fight["params"],
  combatant: Combatant,
  payload: CombatantTurn,
) =>
  attempt(who.token, (client) =>
    client.table.turn({
      params: { campaignId: params.campaignId, runId: params.runId, combatantId: combatant.id },
      payload,
    }),
  );

/** The DM's own reading of a row. */
const dmRow = (params: Fight["params"], combatant: Combatant) =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    const rows = yield* as(jo.token, (client) => client.combatants.list({ params }));
    return rows.find((row) => row.id === combatant.id)!;
  });

/** The `you` row on a player's own table. */
const yourRow = (who: Person) =>
  Effect.gen(function* () {
    const { table } = yield* Fixture;
    const read = yield* as(who.token, (client) =>
      client.table.read({ params: { campaignId: table } }),
    );
    return read?.fight?.order.find((row): row is PlayerLiveCombatantYou => row.kind === "you");
  });

describeLayer("player-turn", shared, (it) => {
  describe("what your own row says", () => {
    it.effect("carries your AC and this turn's spending, and nobody else's row does", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        const { sessionId, params, tamsin } = yield* fight;
        yield* begin(params);
        yield* as(jo.token, (client) =>
          client.combatants.turn({
            params: { ...params, combatantId: tamsin.id },
            payload: { actionUsed: true },
          }),
        );

        expect(yield* yourRow(ilse)).toMatchObject({
          combatantId: tamsin.id,
          actionUsed: true,
          bonusUsed: false,
          reactionUsed: false,
          feetMoved: 0,
        });

        const read = yield* wire(ilse.token, `/campaigns/${table}/table`);
        expect(read.status).toBe(200);
        const order = (
          JSON.parse(read.body) as { fight: { order: Array<Record<string, unknown>> } }
        ).fight.order;
        for (const row of order) {
          if (row["kind"] === "you") continue;
          for (const key of ["ac", "actionUsed", "bonusUsed", "reactionUsed", "feetMoved"]) {
            expect(Object.keys(row)).not.toContain(key);
          }
        }
        yield* endNight(sessionId);
      }),
    );
  });

  describe("moving your own token", () => {
    it.effect("moves it on your turn and counts the walk, as the DM's move does", () =>
      Effect.gen(function* () {
        const { ilse } = yield* Fixture;
        const { sessionId, params, tamsin } = yield* fight;
        yield* begin(params);

        expect(yield* playerMove(ilse, params, tamsin, { column: 0, row: 3 })).toBe("ok");
        const row = yield* dmRow(params, tamsin);
        expect(row.position).toEqual({ column: 0, row: 3 });
        expect(row.feetMoved).toBe(15);
        expect((yield* yourRow(ilse))?.feetMoved).toBe(15);

        const moves = yield* sql(
          (sql) => sql<{ readonly visibility: string; readonly payload: unknown }>`
            select visibility, payload from session_event
            where encounter_run_id = ${params.runId} and kind = 'combatant-moved'
              and combatant_id = ${tamsin.id}
            order by seq desc limit 1
          `,
        );
        // On every seated player's board, so the line is theirs too.
        expect(moves[0]).toEqual({
          visibility: "shared",
          payload: { from: { column: 0, row: 0 }, to: { column: 0, row: 3 } },
        });
        yield* endNight(sessionId);
      }),
    );

    it.effect("applies a repeated requestId once", () =>
      Effect.gen(function* () {
        const { ilse } = yield* Fixture;
        const { sessionId, params, tamsin } = yield* fight;
        yield* begin(params);

        expect(yield* playerMove(ilse, params, tamsin, { column: 0, row: 2 }, "walk-1")).toBe("ok");
        expect(yield* playerMove(ilse, params, tamsin, { column: 0, row: 2 }, "walk-1")).toBe("ok");
        expect((yield* dmRow(params, tamsin)).feetMoved).toBe(10);
        yield* endNight(sessionId);
      }),
    );

    it.effect("is refused off your turn, while rolling initiative, and with the map hidden", () =>
      Effect.gen(function* () {
        const { jo, ilse, wren } = yield* Fixture;
        const { sessionId, params, tamsin, nessa } = yield* fight;

        expect(yield* playerMove(ilse, params, tamsin, { column: 0, row: 1 })).toBe("Conflict");
        yield* begin(params);
        // Tamsin is up; Nessa is not.
        expect(yield* playerMove(wren, params, nessa, { column: 1, row: 1 })).toBe("Conflict");
        expect(yield* playerMove(ilse, params, tamsin, { column: 99, row: 0 })).toBe("Conflict");

        yield* as(jo.token, (client) =>
          client.runs.update({ params, payload: { mapShown: false } }),
        );
        expect(yield* playerMove(ilse, params, tamsin, { column: 0, row: 1 })).toBe("Conflict");

        expect((yield* dmRow(params, tamsin)).position).toEqual({ column: 0, row: 0 });
        expect((yield* dmRow(params, nessa)).position).toEqual({ column: 1, row: 0 });
        yield* endNight(sessionId);
      }),
    );

    it.effect("answers another player's row, a monster and outsiders NotFound", () =>
      Effect.gen(function* () {
        const { jo, ilse, wren, stranger, rook } = yield* Fixture;
        const { sessionId, params, tamsin, archer } = yield* fight;
        yield* begin(params);

        expect(yield* playerMove(wren, params, tamsin, { column: 0, row: 1 })).toBe("NotFound");
        expect(yield* playerMove(stranger, params, tamsin, { column: 0, row: 1 })).toBe("NotFound");
        expect(yield* playerMove(rook, params, tamsin, { column: 0, row: 1 })).toBe("NotFound");
        // The DM sits in no seat: their writes are the runner's.
        expect(yield* playerMove(jo, params, tamsin, { column: 0, row: 1 })).toBe("NotFound");
        yield* nextTurn(params);
        expect(yield* playerMove(ilse, params, archer, { column: 2, row: 1 })).toBe("NotFound");

        expect((yield* dmRow(params, tamsin)).position).toEqual({ column: 0, row: 0 });
        expect((yield* dmRow(params, archer)).position).toEqual({ column: 2, row: 0 });
        yield* endNight(sessionId);
      }),
    );

    it.effect("reaches no fight but tonight's", () =>
      Effect.gen(function* () {
        const { ilse } = yield* Fixture;
        const earlier = yield* fight;
        yield* begin(earlier.params);
        yield* endNight(earlier.sessionId);
        const later = yield* fight;
        yield* begin(later.params);

        expect(yield* playerMove(ilse, earlier.params, earlier.tamsin, { column: 0, row: 1 })).toBe(
          "NotFound",
        );
        yield* endNight(later.sessionId);
      }),
    );
  });

  describe("ticking your own turn", () => {
    it.effect("ticks and unticks your action and bonus action on your turn", () =>
      Effect.gen(function* () {
        const { ilse } = yield* Fixture;
        const { sessionId, params, tamsin } = yield* fight;
        yield* begin(params);

        expect(yield* playerTick(ilse, params, tamsin, { actionUsed: true, bonusUsed: true })).toBe(
          "ok",
        );
        expect(yield* yourRow(ilse)).toMatchObject({ actionUsed: true, bonusUsed: true });
        expect(yield* playerTick(ilse, params, tamsin, { bonusUsed: false })).toBe("ok");
        const row = yield* dmRow(params, tamsin);
        expect([row.actionUsed, row.bonusUsed, row.reactionUsed]).toEqual([true, false, false]);

        const lines = yield* sql(
          (sql) => sql<{ readonly visibility: string }>`
            select visibility from session_event
            where encounter_run_id = ${params.runId} and kind = 'combatant-updated'
              and combatant_id = ${tamsin.id} and payload ? 'actionUsed'
          `,
        );
        // A turn's spending is on no other player's table.
        expect(lines.map((line) => line.visibility)).toEqual(["dm"]);
        yield* endNight(sessionId);
      }),
    );

    it.effect("lets a reaction be ticked off your turn, but not an action", () =>
      Effect.gen(function* () {
        const { wren } = yield* Fixture;
        const { sessionId, params, nessa } = yield* fight;
        yield* begin(params);

        expect(yield* playerTick(wren, params, nessa, { reactionUsed: true })).toBe("ok");
        expect(yield* playerTick(wren, params, nessa, { actionUsed: true })).toBe("Conflict");
        const row = yield* dmRow(params, nessa);
        expect([row.actionUsed, row.reactionUsed]).toEqual([false, true]);
        yield* endNight(sessionId);
      }),
    );

    it.effect("is refused while rolling initiative", () =>
      Effect.gen(function* () {
        const { ilse } = yield* Fixture;
        const { sessionId, params, tamsin } = yield* fight;
        expect(yield* playerTick(ilse, params, tamsin, { reactionUsed: true })).toBe("Conflict");
        yield* endNight(sessionId);
      }),
    );

    it.effect("answers another player's row and outsiders NotFound", () =>
      Effect.gen(function* () {
        const { jo, wren, stranger, rook } = yield* Fixture;
        const { sessionId, params, tamsin } = yield* fight;
        yield* begin(params);

        for (const who of [wren, stranger, rook, jo]) {
          expect(yield* playerTick(who, params, tamsin, { reactionUsed: true })).toBe("NotFound");
        }
        expect((yield* dmRow(params, tamsin)).reactionUsed).toBe(false);
        yield* endNight(sessionId);
      }),
    );
  });
});
