import { expect } from "@effect/vitest";
import {
  type BoardFogUpdate,
  type CombatantPosition,
  type EncounterRun,
  type PlayerLiveTable,
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
 * **Fog of war on a fight's board: the DM's alone to paint, and what stands
 * under it is not on a player's table — neither its token nor its row of the
 * order — but the player's own character** (`0087_run_board_fog.ts`,
 * `BattleMaps.updateFog`, `liveTables.ts`' `hiddenByFog`).
 *
 * Over the real application and Postgres. A fight starts clear; the DM sees
 * through fog; *Reveal all*, *Cover all* and *Reset* change the whole board; a
 * repeated `requestId` applies once; a board the DM does not show carries no
 * fog and no tokens; and a resumed fight keeps its fog. The player's table is
 * read raw wherever a leak is the question, because the derived client would
 * drop a field the server should never have sent.
 *
 * The people are minted the shipped way (`support/actors.ts`): two players
 * admitted through real invitations, each with a seat the creator shared, and
 * a stranger.
 */
const database = migratedDatabase("taverns_test_run_fog");
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

/** A GET as it goes over the wire: the status and the body, undecoded. */
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
  const bram = yield* aPerson("Bram");
  const stranger = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;

  const ilses = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, ilses, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" });
  const brams = yield* admittedTo(table, bram.actor, "Bram");
  yield* aCharacterAt(table, brams, { name: "Wren", hpMax: 24 }, { seatVisibility: "shared" });

  const archerId = (yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
    }),
  )).id;

  return { jo, ilse, bram, stranger, table, archerId };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "run-fog.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

let nights = 0;

const night = () =>
  Effect.gen(function* () {
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

const TAMSIN = { column: 1, row: 2 };
const WREN = { column: 2, row: 2 };
const ARCHER = { column: 3, row: 4 };
const SENTRY = { column: 5, row: 6 };

/**
 * A shared fight, every row shared and on the board, the map shown: Tamsin,
 * Wren and two archers. An encounter is played once, so each fight is on an
 * encounter of its own.
 */
const aFight = (sessionId: SessionId) =>
  Effect.gen(function* () {
    const { jo, table, archerId } = yield* Fixture;
    const encounter = yield* as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: {
          name: "Ambush in the reeds",
          visibility: "shared",
          ready: true,
          creatures: [{ creatureId: archerId, count: 2 }],
        },
      }),
    );
    const fight = yield* as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId },
        payload: { encounterId: encounter.id, visibility: "shared" },
      }),
    );
    const params = { campaignId: table, sessionId, runId: fight.id };
    const order = yield* as(jo.token, (client) => client.combatants.list({ params }));
    const tamsin = order.find((row) => row.displayName === "Tamsin")!;
    const wren = order.find((row) => row.displayName === "Wren")!;
    const [archer, sentry] = order.filter((row) => row.kind === "npc");
    for (const [row, square] of [
      [tamsin, TAMSIN],
      [wren, WREN],
      [archer!, ARCHER],
      [sentry!, SENTRY],
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
          payload: { position: square },
        }),
      );
    }
    yield* as(jo.token, (client) => client.runs.update({ params, payload: { mapShown: true } }));
    return { fight, params, tamsin, wren, archer: archer!, sentry: sentry! };
  });

type Params = Effect.Success<ReturnType<typeof aFight>>["params"];

const fog = (params: Params, payload: BoardFogUpdate) =>
  Effect.flatMap(Fixture, ({ jo }) =>
    as(jo.token, (client) => client.runs.updateFog({ params, payload })),
  );

const tableOf = (who: Person) =>
  Effect.flatMap(Fixture, ({ table }) =>
    as(who.token, (client) => client.table.read({ params: { campaignId: table } })),
  );

const rawTableOf = (who: Person) =>
  Effect.flatMap(Fixture, ({ table }) => wire(who.token, `/campaigns/${table}/table`));

const orderOf = (read: PlayerLiveTable | null) =>
  (read?.fight?.order ?? []).map((row) => row.combatantId).sort();

const tokensOf = (read: PlayerLiveTable | null) =>
  (read?.fight?.board?.tokens ?? []).map((token) => token.combatantId).sort();

const eventsOf = (runId: EncounterRun["id"], kind: string) =>
  sql(
    (sql) => sql<{ readonly visibility: string; readonly payload: unknown }>`
      select visibility, payload from session_event
      where encounter_run_id = ${runId} and kind = ${kind}
      order by seq
    `,
  );

const sorted = (squares: ReadonlyArray<CombatantPosition>) =>
  [...squares].sort((a, b) => a.row - b.row || a.column - b.column);

describeLayer("run-fog", shared, (it) => {
  it.effect("starts a fight clear, for the DM and on a player's board", () =>
    Effect.gen(function* () {
      const { jo, ilse } = yield* Fixture;
      const session = yield* night();
      const { params, tamsin, wren, archer, sentry } = yield* aFight(session);
      const board = yield* as(jo.token, (client) => client.runs.board({ params }));
      expect(board?.fog).toEqual([]);
      const read = yield* tableOf(ilse);
      expect(read?.fight?.board?.fog).toEqual([]);
      const everyone = [tamsin.id, wren.id, archer.id, sentry.id].sort();
      expect(orderOf(read)).toEqual(everyone);
      expect(tokensOf(read)).toEqual(everyone);
      yield* endNight(session);
    }),
  );

  it.effect(
    "takes a fogged monster's token and row off a player's table, and the DM sees everything",
    () =>
      Effect.gen(function* () {
        const { jo, ilse } = yield* Fixture;
        const session = yield* night();
        const { fight, params, tamsin, wren, archer, sentry } = yield* aFight(session);

        const board = yield* fog(params, { hide: [ARCHER, { column: 9, row: 9 }] });
        expect(board.fog).toEqual([ARCHER, { column: 9, row: 9 }]);

        const read = yield* tableOf(ilse);
        expect(read?.fight?.board?.fog).toEqual([ARCHER, { column: 9, row: 9 }]);
        expect(orderOf(read)).toEqual([tamsin.id, wren.id, sentry.id].sort());
        expect(tokensOf(read)).toEqual([tamsin.id, wren.id, sentry.id].sort());
        const raw = yield* rawTableOf(ilse);
        expect(raw.status).toBe(200);
        expect(raw.body).not.toContain(archer.id);

        // The DM's own reads are not narrowed: the row, its square, the fog.
        const dms = yield* as(jo.token, (client) => client.combatants.list({ params }));
        expect(dms.find((row) => row.id === archer.id)?.position).toEqual(ARCHER);
        expect((yield* as(jo.token, (client) => client.runs.board({ params })))?.fog).toEqual([
          ARCHER,
          { column: 9, row: 9 },
        ]);

        // A player's recap of the night, read mid-fight, does not name it either.
        const recap = yield* as(ilse.token, (client) =>
          client.recap.readAsPlayer({
            params: { campaignId: params.campaignId, sessionId: session },
          }),
        );
        const named = recap.fights
          .find((one) => one.run.id === fight.id)!
          .combatants.map((row) => row.id);
        expect(named).toContain(sentry.id);
        expect(named).not.toContain(archer.id);

        // The line is shared while the board is shown, so the players re-read.
        const lines = yield* eventsOf(fight.id, "board-fog-updated");
        expect(lines).toEqual([{ visibility: "shared", payload: { hidden: 2 } }]);
        yield* endNight(session);
      }),
  );

  it.effect("keeps a player's own character under fog, and hides an ally's", () =>
    Effect.gen(function* () {
      const { ilse, bram } = yield* Fixture;
      const session = yield* night();
      const { params, tamsin, wren, sentry } = yield* aFight(session);
      yield* fog(params, { hide: [TAMSIN, WREN, ARCHER] });

      const ilses = yield* tableOf(ilse);
      expect(orderOf(ilses)).toEqual([tamsin.id, sentry.id].sort());
      expect(tokensOf(ilses)).toEqual([tamsin.id, sentry.id].sort());
      expect(ilses?.fight?.seats.map((seat) => seat.combatantId)).toEqual([tamsin.id]);
      expect((yield* rawTableOf(ilse)).body).not.toContain(wren.id);

      const brams = yield* tableOf(bram);
      expect(orderOf(brams)).toEqual([wren.id, sentry.id].sort());
      expect(tokensOf(brams)).toEqual([wren.id, sentry.id].sort());
      expect((yield* rawTableOf(bram)).body).not.toContain(tamsin.id);
      yield* endNight(session);
    }),
  );

  it.effect("brings everything back on Reveal all", () =>
    Effect.gen(function* () {
      const { ilse } = yield* Fixture;
      const session = yield* night();
      const { params, tamsin, wren, archer, sentry } = yield* aFight(session);
      yield* fog(params, { hide: [WREN, ARCHER, SENTRY] });
      expect(orderOf(yield* tableOf(ilse))).toEqual([tamsin.id]);

      const board = yield* fog(params, { revealAll: true });
      expect(board.fog).toEqual([]);
      const read = yield* tableOf(ilse);
      const everyone = [tamsin.id, wren.id, archer.id, sentry.id].sort();
      expect(orderOf(read)).toEqual(everyone);
      expect(tokensOf(read)).toEqual(everyone);
      expect(read?.fight?.board?.fog).toEqual([]);
      yield* endNight(session);
    }),
  );

  it.effect("covers every square, resets to the clear start, and reveals after it hides", () =>
    Effect.gen(function* () {
      const { ilse } = yield* Fixture;
      const session = yield* night();
      const { params, tamsin } = yield* aFight(session);

      const covered = yield* fog(params, { coverAll: true });
      expect(covered.fog).toHaveLength(covered.columns * covered.rows);
      expect(covered.fog[0]).toEqual({ column: 0, row: 0 });
      expect(covered.fog.at(-1)).toEqual({ column: covered.columns - 1, row: covered.rows - 1 });
      expect(orderOf(yield* tableOf(ilse))).toEqual([tamsin.id]);

      // The whole-board change first, then `hide`, then `reveal`.
      const opened = yield* fog(params, {
        reset: true,
        hide: [ARCHER, SENTRY],
        reveal: [SENTRY, TAMSIN],
      });
      expect(opened.fog).toEqual([ARCHER]);

      // A square named twice is under fog once, in reading order.
      const again = yield* fog(params, { hide: [SENTRY, ARCHER, SENTRY] });
      expect(again.fog).toEqual(sorted([ARCHER, SENTRY]));

      expect((yield* fog(params, { reset: true })).fog).toEqual([]);
      yield* endNight(session);
    }),
  );

  it.effect("applies a repeated requestId once", () =>
    Effect.gen(function* () {
      const session = yield* night();
      const { fight, params } = yield* aFight(session);
      yield* fog(params, { hide: [ARCHER], requestId: "stroke-1" });
      yield* fog(params, { reveal: [ARCHER], requestId: "stroke-2" });
      const repeated = yield* fog(params, { hide: [ARCHER], requestId: "stroke-1" });
      expect(repeated.fog).toEqual([]);
      expect(yield* eventsOf(fight.id, "board-fog-updated")).toHaveLength(2);
      yield* endNight(session);
    }),
  );

  it.effect("refuses a square off the board, and changes nothing", () =>
    Effect.gen(function* () {
      const { jo } = yield* Fixture;
      const session = yield* night();
      const { params } = yield* aFight(session);
      const board = yield* as(jo.token, (client) => client.runs.board({ params }));
      expect(
        yield* attempt(jo.token, (client) =>
          client.runs.updateFog({
            params,
            payload: { hide: [ARCHER, { column: board!.columns, row: 0 }] },
          }),
        ),
      ).toEqual({ ok: false, tag: "Conflict" });
      expect((yield* as(jo.token, (client) => client.runs.board({ params })))?.fog).toEqual([]);
      yield* endNight(session);
    }),
  );

  it.effect("is the DM's to paint: a player and a stranger are NotFound", () =>
    Effect.gen(function* () {
      const { jo, ilse, stranger } = yield* Fixture;
      const session = yield* night();
      const { params } = yield* aFight(session);
      for (const who of [ilse, stranger]) {
        expect(
          yield* attempt(who.token, (client) =>
            client.runs.updateFog({ params, payload: { coverAll: true } }),
          ),
        ).toEqual({ ok: false, tag: "NotFound" });
        expect(yield* attempt(who.token, (client) => client.runs.board({ params }))).toEqual({
          ok: false,
          tag: "NotFound",
        });
      }
      expect((yield* as(jo.token, (client) => client.runs.board({ params })))?.fog).toEqual([]);
      yield* endNight(session);
    }),
  );

  it.effect("leaks no fog and no tokens while the map is not shown, and keeps the row rule", () =>
    Effect.gen(function* () {
      const { jo, ilse } = yield* Fixture;
      const session = yield* night();
      const { fight, params, tamsin, wren, archer, sentry } = yield* aFight(session);
      yield* as(jo.token, (client) => client.runs.update({ params, payload: { mapShown: false } }));
      yield* fog(params, { hide: [ARCHER] });

      const raw = yield* rawTableOf(ilse);
      expect(raw.body).toContain('"board":null');
      for (const leak of ['"fog"', '"position"', '"column"', archer.id]) {
        expect(raw.body).not.toContain(leak);
      }
      // Turning the board off showed nobody what was under the fog.
      expect(orderOf(yield* tableOf(ilse))).toEqual([tamsin.id, wren.id, sentry.id].sort());
      // Nobody could see the change, so the line is the DM's.
      expect((yield* eventsOf(fight.id, "board-fog-updated")).at(-1)?.visibility).toBe("dm");

      // An unshared fight is not on the table at all.
      yield* as(jo.token, (client) =>
        client.runs.update({ params, payload: { mapShown: true, visibility: "dm" } }),
      );
      expect((yield* tableOf(ilse))?.fight).toBeNull();
      yield* fog(params, { revealAll: true });
      expect((yield* eventsOf(fight.id, "board-fog-updated")).at(-1)?.visibility).toBe("dm");
      yield* endNight(session);
    }),
  );

  it.effect("shares a move's line only while the token is out of the fog", () =>
    Effect.gen(function* () {
      const { jo, ilse } = yield* Fixture;
      const session = yield* night();
      const { fight, params, archer } = yield* aFight(session);
      yield* fog(params, { hide: [{ column: 7, row: 7 }] });
      for (const square of [
        { column: 7, row: 7 },
        { column: 8, row: 7 },
      ]) {
        yield* as(jo.token, (client) =>
          client.combatants.move({
            params: { ...params, combatantId: archer.id },
            payload: { position: square },
          }),
        );
      }
      const moves = (yield* eventsOf(fight.id, "combatant-moved")).slice(-2);
      expect(moves.map((move) => move.visibility)).toEqual(["dm", "shared"]);
      expect(tokensOf(yield* tableOf(ilse))).toContain(archer.id);
      yield* endNight(session);
    }),
  );

  it.effect("carries the fog to a resumed fight", () =>
    Effect.gen(function* () {
      const { jo, ilse, table } = yield* Fixture;
      const first = yield* night();
      const { fight, params } = yield* aFight(first);
      yield* fog(params, { hide: [ARCHER, { column: 0, row: 0 }] });
      yield* endNight(first);

      const second = yield* night();
      const resumed = yield* as(jo.token, (client) =>
        client.runs.resume({
          params: { campaignId: table, sessionId: second },
          payload: { continuedFrom: fight.id },
        }),
      );
      const next = { campaignId: table, sessionId: second, runId: resumed.id };
      const board = yield* as(jo.token, (client) => client.runs.board({ params: next }));
      expect(board?.fog).toEqual([{ column: 0, row: 0 }, ARCHER]);

      const read = yield* tableOf(ilse);
      expect(read?.fight?.id).toBe(resumed.id);
      expect(read?.fight?.board?.fog).toEqual([{ column: 0, row: 0 }, ARCHER]);
      // The rows are carried on the same squares, and one archer's is under fog.
      const names = read!.fight!.order.map((row) => row.displayName).sort();
      expect(names).toEqual(["Goblin Archer", "Tamsin", "Wren"].sort());

      // Reset goes back to the fight's start, which was clear.
      expect((yield* fog(next, { reset: true })).fog).toEqual([]);
      yield* endNight(second);
    }),
  );
});
