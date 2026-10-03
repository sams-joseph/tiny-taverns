import { expect } from "@effect/vitest";
import {
  type BoardAreaSet,
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
 * **An area template pinned on a fight's board: the DM's alone to pin and
 * clear, on a player's table exactly while the board is, and gone when the
 * fight ends** (`0090_run_board_area.ts`, `BattleMaps.setArea`).
 *
 * Over the real application and Postgres. The DM pins a sphere, cone, line or
 * cube and reads it back; a seated player reads it on a shared fight whose map
 * is shown, and nothing of it otherwise; a player of another campaign reads
 * nothing; a clear, ending the fight and ending the night each take it off,
 * and a resumed fight starts with nothing pinned. The player's table is read
 * raw wherever a leak is the question, because the derived client would drop
 * a field the server should never have sent.
 *
 * The people are minted the shipped way (`support/actors.ts`): a player
 * admitted through a real invitation with a seat the creator shared, a
 * stranger, and a player seated at another of the creator's campaigns.
 */
const database = migratedDatabase("taverns_test_run_area");
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

/** A request as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(request.pipe(HttpClientRequest.bearerToken(token)));
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const other = yield* aPerson("Odo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const ilses = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, ilses, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" });

  // Another table of Jo's, with a player of its own, who is nothing at this one.
  const elsewhere = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Ash Coast", visibility: "shared" } }),
  )).id;
  const odos = yield* admittedTo(elsewhere, other.actor, "Odo");
  yield* aCharacterAt(elsewhere, odos, { name: "Pell", hpMax: 20 }, { seatVisibility: "shared" });

  const archerId = (yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
    }),
  )).id;

  return { jo, ilse, stranger, other, table, elsewhere, archerId };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "run-area.test/Fixture",
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

/** A shared fight, the map shown: Tamsin and an archer. One encounter each. */
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
          creatures: [{ creatureId: archerId, count: 1 }],
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
    yield* as(jo.token, (client) => client.runs.update({ params, payload: { mapShown: true } }));
    return { fight, params };
  });

type Params = Effect.Success<ReturnType<typeof aFight>>["params"];

const FIREBALL = { shape: "sphere", feet: 20, origin: { column: 4, row: 4 } } as const;
const BREATH = {
  shape: "cone",
  feet: 15,
  origin: { column: 1, row: 1 },
  toward: { column: 4, row: 1 },
} as const;

const pin = (params: Params, payload: BoardAreaSet) =>
  Effect.flatMap(Fixture, ({ jo }) =>
    as(jo.token, (client) => client.runs.setArea({ params, payload })),
  );

const dmBoard = (params: Params) =>
  Effect.flatMap(Fixture, ({ jo }) => as(jo.token, (client) => client.runs.board({ params })));

const tableOf = (who: Person) =>
  Effect.flatMap(Fixture, ({ table }) =>
    as(who.token, (client) => client.table.read({ params: { campaignId: table } })),
  );

const rawTableOf = (who: Person, campaignId?: string) =>
  Effect.flatMap(Fixture, ({ table }) =>
    wire(who.token, HttpClientRequest.get(`/campaigns/${campaignId ?? table}/table`)),
  );

const areaOf = (read: PlayerLiveTable | null) => read?.fight?.board?.area;

const eventsOf = (runId: EncounterRun["id"]) =>
  sql(
    (sql) => sql<{ readonly visibility: string; readonly payload: unknown }>`
      select visibility, payload from session_event
      where encounter_run_id = ${runId} and kind = 'board-area-updated'
      order by seq
    `,
  );

/** The pin as it sits in the row, whatever any read would make of it. */
const storedShape = (runId: EncounterRun["id"]) =>
  sql(
    (sql) => sql<{ readonly area_shape: string | null }>`
      select area_shape from encounter_run_board where run_id = ${runId}
    `,
  ).pipe(Effect.map((rows) => rows[0]?.area_shape ?? null));

describeLayer("run-area", shared, (it) => {
  it.effect("starts a fight with nothing pinned", () =>
    Effect.gen(function* () {
      const { ilse } = yield* Fixture;
      const session = yield* night();
      const { params } = yield* aFight(session);
      expect((yield* dmBoard(params))?.area).toBeNull();
      expect(areaOf(yield* tableOf(ilse))).toBeNull();
      yield* endNight(session);
    }),
  );

  it.effect("shows a pinned template to the DM and on a seated player's shown board", () =>
    Effect.gen(function* () {
      const { ilse } = yield* Fixture;
      const session = yield* night();
      const { fight, params } = yield* aFight(session);

      const board = yield* pin(params, { area: FIREBALL });
      expect(board.area).toEqual(FIREBALL);
      expect((yield* dmBoard(params))?.area).toEqual(FIREBALL);
      expect(areaOf(yield* tableOf(ilse))).toEqual(FIREBALL);

      // Pinning again replaces it; a cone carries the square it points at.
      expect((yield* pin(params, { area: BREATH })).area).toEqual(BREATH);
      expect(areaOf(yield* tableOf(ilse))).toEqual(BREATH);

      // The lines are shared while the board is shown, so the players re-read.
      expect(yield* eventsOf(fight.id)).toEqual([
        { visibility: "shared", payload: { area: FIREBALL } },
        { visibility: "shared", payload: { area: BREATH } },
      ]);
      yield* endNight(session);
    }),
  );

  it.effect("takes it off both boards on a clear, and a second clear logs nothing", () =>
    Effect.gen(function* () {
      const { ilse } = yield* Fixture;
      const session = yield* night();
      const { fight, params } = yield* aFight(session);
      yield* pin(params, { area: FIREBALL });

      expect((yield* pin(params, { area: null })).area).toBeNull();
      expect((yield* dmBoard(params))?.area).toBeNull();
      expect(areaOf(yield* tableOf(ilse))).toBeNull();
      expect(yield* storedShape(fight.id)).toBeNull();

      yield* pin(params, { area: null });
      expect((yield* eventsOf(fight.id)).map((line) => line.payload)).toEqual([
        { area: FIREBALL },
        { area: null },
      ]);
      yield* endNight(session);
    }),
  );

  it.effect("applies a repeated requestId once", () =>
    Effect.gen(function* () {
      const session = yield* night();
      const { fight, params } = yield* aFight(session);
      yield* pin(params, { area: FIREBALL, requestId: "pin-1" });
      yield* pin(params, { area: null, requestId: "pin-2" });
      const repeated = yield* pin(params, { area: FIREBALL, requestId: "pin-1" });
      expect(repeated.area).toBeNull();
      expect(yield* eventsOf(fight.id)).toHaveLength(2);
      yield* endNight(session);
    }),
  );

  it.effect("refuses a square off the board and a cone aimed at itself, and changes nothing", () =>
    Effect.gen(function* () {
      const { jo } = yield* Fixture;
      const session = yield* night();
      const { params } = yield* aFight(session);
      yield* pin(params, { area: FIREBALL });
      const board = (yield* dmBoard(params))!;

      for (const area of [
        { ...FIREBALL, origin: { column: board.columns, row: 0 } },
        { ...BREATH, toward: { column: 0, row: board.rows } },
      ]) {
        expect(
          yield* attempt(jo.token, (client) => client.runs.setArea({ params, payload: { area } })),
        ).toEqual({ ok: false, tag: "Conflict" });
      }
      // The contract refuses a cone pointing at its own origin before any write.
      const self = yield* wire(
        jo.token,
        HttpClientRequest.put(
          `/campaigns/${params.campaignId}/sessions/${params.sessionId}/runs/${params.runId}/board/area`,
        ).pipe(HttpClientRequest.bodyJsonUnsafe({ area: { ...BREATH, toward: BREATH.origin } })),
      );
      expect(self.status).toBe(400);

      expect((yield* dmBoard(params))?.area).toEqual(FIREBALL);
      yield* endNight(session);
    }),
  );

  it.effect("is the DM's to pin: a player and a stranger are NotFound", () =>
    Effect.gen(function* () {
      const { ilse, stranger, other } = yield* Fixture;
      const session = yield* night();
      const { params } = yield* aFight(session);
      for (const who of [ilse, stranger, other]) {
        expect(
          yield* attempt(who.token, (client) =>
            client.runs.setArea({ params, payload: { area: FIREBALL } }),
          ),
        ).toEqual({ ok: false, tag: "NotFound" });
      }
      expect((yield* dmBoard(params))?.area).toBeNull();
      yield* endNight(session);
    }),
  );

  it.effect("leaks nothing while the map is not shown or the fight is not shared", () =>
    Effect.gen(function* () {
      const { jo, ilse } = yield* Fixture;
      const session = yield* night();
      const { fight, params } = yield* aFight(session);
      yield* as(jo.token, (client) => client.runs.update({ params, payload: { mapShown: false } }));
      yield* pin(params, { area: FIREBALL });

      const raw = yield* rawTableOf(ilse);
      expect(raw.status).toBe(200);
      expect(raw.body).toContain('"board":null');
      for (const leak of ['"area"', '"shape"', '"sphere"']) {
        expect(raw.body).not.toContain(leak);
      }
      // Nobody could see the pin, so the line is the DM's.
      expect((yield* eventsOf(fight.id)).at(-1)?.visibility).toBe("dm");

      // Showing the board shows what is pinned on it.
      yield* as(jo.token, (client) => client.runs.update({ params, payload: { mapShown: true } }));
      expect(areaOf(yield* tableOf(ilse))).toEqual(FIREBALL);

      // An unshared fight is not on the table at all.
      yield* as(jo.token, (client) =>
        client.runs.update({ params, payload: { visibility: "dm" } }),
      );
      expect((yield* tableOf(ilse))?.fight).toBeNull();
      expect((yield* rawTableOf(ilse)).body).not.toContain('"sphere"');
      yield* pin(params, { area: BREATH });
      expect((yield* eventsOf(fight.id)).at(-1)?.visibility).toBe("dm");
      yield* endNight(session);
    }),
  );

  it.effect("shows another campaign's player nothing of it", () =>
    Effect.gen(function* () {
      const { other, elsewhere } = yield* Fixture;
      const session = yield* night();
      const { params } = yield* aFight(session);
      yield* pin(params, { area: FIREBALL });

      // This table is not theirs to read, and saying so would be a disclosure.
      const here = yield* rawTableOf(other);
      expect(here.status).toBe(404);
      expect(here.body).not.toContain('"sphere"');
      // Their own table has no fight, so nothing pinned on one.
      const own = yield* rawTableOf(other, elsewhere);
      expect(own.status).toBe(200);
      expect(own.body).not.toContain('"sphere"');
      yield* endNight(session);
    }),
  );

  it.effect("takes it off when the fight ends, and refuses a pin on a fight that is over", () =>
    Effect.gen(function* () {
      const { jo, ilse } = yield* Fixture;
      const session = yield* night();
      const { fight, params } = yield* aFight(session);
      yield* pin(params, { area: FIREBALL });

      yield* as(jo.token, (client) => client.runs.end({ params, payload: {} }));
      expect(yield* storedShape(fight.id)).toBeNull();
      expect((yield* dmBoard(params))?.area).toBeNull();
      expect(areaOf(yield* tableOf(ilse)) ?? null).toBeNull();
      expect(
        yield* attempt(jo.token, (client) =>
          client.runs.setArea({ params, payload: { area: FIREBALL } }),
        ),
      ).toEqual({ ok: false, tag: "Conflict" });
      yield* endNight(session);
    }),
  );

  it.effect("takes it off when the night carries the fight, and a resumed fight has none", () =>
    Effect.gen(function* () {
      const { jo, ilse, table } = yield* Fixture;
      const first = yield* night();
      const { fight, params } = yield* aFight(first);
      yield* pin(params, { area: BREATH });
      yield* endNight(first);
      expect(yield* storedShape(fight.id)).toBeNull();

      const second = yield* night();
      const resumed = yield* as(jo.token, (client) =>
        client.runs.resume({
          params: { campaignId: table, sessionId: second },
          payload: { continuedFrom: fight.id },
        }),
      );
      const next = { campaignId: table, sessionId: second, runId: resumed.id };
      expect((yield* dmBoard(next))?.area).toBeNull();
      const read = yield* tableOf(ilse);
      expect(read?.fight?.id).toBe(resumed.id);
      expect(areaOf(read)).toBeNull();
      yield* endNight(second);
    }),
  );
});
