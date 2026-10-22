import { describe, expect } from "@effect/vitest";
import {
  BOARD_COLUMNS_DEFAULT,
  BOARD_ROWS_DEFAULT,
  type CampaignId,
  type EncounterId,
  type EncounterRunId,
  LEVEL_MATERIALS,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Deferred, Effect, Fiber, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, aPerson, admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Every encounter starts on a level, and a fight with none is played on the
 * plain grid.** The form's create makes the encounter an empty level in the
 * creator's Library, named after it, at the plain board's size and scale,
 * with the setting line as its description; a create naming a level links
 * that one instead. An encounter whose level was cleared or deleted fights on
 * `BOARD_COLUMNS_DEFAULT × BOARD_ROWS_DEFAULT` squares with no level, and fog
 * and areas still land on it. Hob's encounter accept is in
 * `hob-levels.test.ts`.
 *
 * Over the real application and Postgres, through the client derived from the
 * contract. People are minted the shipped way (`support/actors.ts`).
 */

const database = migratedDatabase("taverns_test_encounter_levels");
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

/** The call's failure tag, or `succeeded`. */
const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
    ),
  ).pipe(Effect.orDie);

const FLAGSTONE = LEVEL_MATERIALS.indexOf("flagstone");

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const bo = yield* aPerson("Bo");
  const table: CampaignId = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const player = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, player, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" });
  return { jo, ilse, bo, table };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "encounter-levels.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

let nights = 0;

/** A new night at the table, made current. */
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

const fightOn = (sessionId: SessionId, encounterId: EncounterId) =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId },
        payload: { encounterId, visibility: "shared" },
      }),
    ),
  );

const boardOf = (sessionId: SessionId, runId: EncounterRunId) =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(jo.token, (client) =>
      client.runs.board({ params: { campaignId: table, sessionId, runId } }),
    ),
  );

/** An encounter made by the form, then taken off its level. */
const anEncounterOnTheGrid = (name: string) =>
  Effect.gen(function* () {
    const { jo, table } = yield* Fixture;
    const made = yield* as(jo.token, (client) =>
      client.encounters.create({ params: { campaignId: table }, payload: { name } }),
    );
    return yield* as(jo.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: made.id },
        payload: { levelId: null },
      }),
    );
  });

describeLayer("encounter-levels", shared, (it) => {
  describe("the form's create", () => {
    it.effect(
      "makes and links an empty level named after the encounter, described by its setting",
      () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const made = yield* as(jo.token, (client) =>
            client.encounters.create({
              params: { campaignId: table },
              payload: { name: "Ambush in the reeds", setting: "  A boardwalk over black water " },
            }),
          );
          expect(made.levelId).not.toBeNull();
          const level = yield* as(jo.token, (client) =>
            client.libraryLevels.findById({ params: { levelId: made.levelId! } }),
          );
          expect(level).toMatchObject({
            name: "Ambush in the reeds",
            description: "A boardwalk over black water",
            columns: BOARD_COLUMNS_DEFAULT,
            rows: BOARD_ROWS_DEFAULT,
            feetPerCell: 5,
            origin: "authored",
            walls: [],
            props: [],
            lights: [],
            regions: [],
          });
          // Ground everywhere, so a fight on it plays as the plain grid does.
          expect(level.floor).toHaveLength(BOARD_COLUMNS_DEFAULT * BOARD_ROWS_DEFAULT);
          expect(new Set(level.floor)).toEqual(new Set([FLAGSTONE]));
          // On the creator's shelf, with its use listed.
          const uses = yield* as(jo.token, (client) =>
            client.libraryLevels.uses({ params: { levelId: level.id } }),
          );
          expect(uses.map((use) => use.encounterId)).toEqual([made.id]);
        }),
    );

    it.effect("with no setting, makes a level with no description", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const made = yield* as(jo.token, (client) =>
          client.encounters.create({ params: { campaignId: table }, payload: { name: "Quiet" } }),
        );
        const level = yield* as(jo.token, (client) =>
          client.libraryLevels.findById({ params: { levelId: made.levelId! } }),
        );
        expect(level.description).toBeNull();
      }),
    );

    it.effect("links a level it names and makes none", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const own = yield* as(jo.token, (client) =>
          client.libraryLevels.create({ payload: { name: "The crypt", columns: 10, rows: 8 } }),
        );
        const before = (yield* as(jo.token, (client) => client.libraryLevels.list())).length;
        const made = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table },
            payload: { name: "In the crypt", setting: "Bones", levelId: own.id },
          }),
        );
        expect(made.levelId).toBe(own.id);
        expect((yield* as(jo.token, (client) => client.libraryLevels.list())).length).toBe(before);
        const level = yield* as(jo.token, (client) =>
          client.libraryLevels.findById({ params: { levelId: own.id } }),
        );
        expect(level.description).toBeNull();
      }),
    );

    it.effect("rolls the level back with an encounter the create refuses", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        const before = (yield* as(jo.token, (client) => client.libraryLevels.list())).length;
        // A player cannot write the table: nothing is made, the level included.
        expect(
          yield* refusal(ilse.token, (client) =>
            client.encounters.create({ params: { campaignId: table }, payload: { name: "Mine" } }),
          ),
        ).toBe("NotFound");
        expect(yield* as(ilse.token, (client) => client.libraryLevels.list())).toEqual([]);
        expect((yield* as(jo.token, (client) => client.libraryLevels.list())).length).toBe(before);
      }),
    );

    it.effect("keeps the level in the Library when the encounter is deleted", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const made = yield* as(jo.token, (client) =>
          client.encounters.create({ params: { campaignId: table }, payload: { name: "Gone" } }),
        );
        yield* as(jo.token, (client) =>
          client.encounters.remove({ params: { campaignId: table, encounterId: made.id } }),
        );
        const level = yield* as(jo.token, (client) =>
          client.libraryLevels.findById({ params: { levelId: made.levelId! } }),
        );
        expect(level.name).toBe("Gone");
        expect(
          yield* as(jo.token, (client) =>
            client.libraryLevels.uses({ params: { levelId: level.id } }),
          ),
        ).toEqual([]);
      }),
    );
  });

  describe("a fight with no level", () => {
    it.effect("runs on the plain grid, and fog and areas land on it", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const encounter = yield* anEncounterOnTheGrid("On the grid");
        expect(encounter.levelId).toBeNull();
        const session = yield* night();
        const fight = yield* fightOn(session, encounter.id);
        const params = { campaignId: table, sessionId: session, runId: fight.id };
        expect(yield* boardOf(session, fight.id)).toEqual({
          columns: BOARD_COLUMNS_DEFAULT,
          rows: BOARD_ROWS_DEFAULT,
          feetPerCell: 5,
          fog: [],
          area: null,
          level: null,
        });
        // Tokens start on it: the party from the left edge.
        const order = yield* as(jo.token, (client) => client.combatants.list({ params }));
        const tamsin = order.find((row) => row.displayName === "Tamsin");
        expect(tamsin?.position).toEqual({ column: 0, row: 7 });

        const fogged = yield* as(jo.token, (client) =>
          client.runs.updateFog({ params, payload: { hide: [{ column: 23, row: 15 }] } }),
        );
        expect(fogged.fog).toEqual([{ column: 23, row: 15 }]);
        expect(
          yield* refusal(jo.token, (client) =>
            client.runs.updateFog({ params, payload: { hide: [{ column: 24, row: 0 }] } }),
          ),
        ).toBe("Conflict");
        const pinned = yield* as(jo.token, (client) =>
          client.runs.setArea({
            params,
            payload: { area: { shape: "sphere", feet: 10, origin: { column: 5, row: 5 } } },
          }),
        );
        expect(pinned.area).toEqual({ shape: "sphere", feet: 10, origin: { column: 5, row: 5 } });
        yield* endNight(session);
      }),
    );

    it.effect("carries the plain grid and its fog to the fight that resumes it", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const encounter = yield* anEncounterOnTheGrid("Carried");
        const first = yield* night();
        const fight = yield* fightOn(first, encounter.id);
        yield* as(jo.token, (client) =>
          client.runs.updateFog({
            params: { campaignId: table, sessionId: first, runId: fight.id },
            payload: { hide: [{ column: 2, row: 3 }] },
          }),
        );
        yield* endNight(first);
        const second = yield* night();
        const resumed = yield* as(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: second },
            payload: { continuedFrom: fight.id },
          }),
        );
        expect(yield* boardOf(second, resumed.id)).toEqual({
          columns: BOARD_COLUMNS_DEFAULT,
          rows: BOARD_ROWS_DEFAULT,
          feetPerCell: 5,
          fog: [{ column: 2, row: 3 }],
          area: null,
          level: null,
        });
        yield* endNight(second);
      }),
    );

    it.effect("is what an encounter whose level was deleted fights on", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const made = yield* as(jo.token, (client) =>
          client.encounters.create({ params: { campaignId: table }, payload: { name: "Razed" } }),
        );
        yield* as(jo.token, (client) =>
          client.libraryLevels.remove({ params: { levelId: made.levelId! } }),
        );
        const session = yield* night();
        const fight = yield* fightOn(session, made.id);
        const board = yield* boardOf(session, fight.id);
        expect([board?.columns, board?.rows, board?.level]).toEqual([
          BOARD_COLUMNS_DEFAULT,
          BOARD_ROWS_DEFAULT,
          null,
        ]);
        yield* endNight(session);
      }),
    );

    it.effect("waits for a delete of the level in flight, then fights on the plain grid", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const sql = yield* SqlClient.SqlClient;
        const made = yield* as(jo.token, (client) =>
          client.encounters.create({ params: { campaignId: table }, payload: { name: "Raced" } }),
        );
        const session = yield* night();
        // A delete of the level, in a transaction held open until `gate`.
        const gate = yield* Deferred.make<void>();
        const deleted = yield* Deferred.make<void>();
        const deleting = yield* Effect.forkChild(
          sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`delete from level where id = ${made.levelId!}`;
              yield* Deferred.succeed(deleted, undefined);
              yield* Deferred.await(gate);
            }),
          ),
        );
        yield* Deferred.await(deleted);
        const starting = yield* Effect.forkChild(fightOn(session, made.id));
        yield* Effect.sleep("300 millis");
        // The start waits on the level rather than copying half of it.
        expect(starting.pollUnsafe()).toBeUndefined();
        yield* Deferred.succeed(gate, undefined);
        yield* Fiber.join(deleting).pipe(Effect.orDie);
        const fight = yield* Fiber.join(starting);
        const board = yield* boardOf(session, fight.id);
        expect([board?.columns, board?.rows, board?.level]).toEqual([
          BOARD_COLUMNS_DEFAULT,
          BOARD_ROWS_DEFAULT,
          null,
        ]);
        yield* endNight(session);
      }),
    );

    it.effect("waits for a save of the level in flight, and copies what it saved", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const sql = yield* SqlClient.SqlClient;
        const made = yield* as(jo.token, (client) =>
          client.encounters.create({ params: { campaignId: table }, payload: { name: "Mid-edit" } }),
        );
        const session = yield* night();
        // A save's write to the level row, held open until `gate`: the
        // encounter is not touched, so only the copy's own lock waits on it.
        const gate = yield* Deferred.make<void>();
        const saving = yield* Deferred.make<void>();
        const save = yield* Effect.forkChild(
          sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`
                update level set ambient = 'dark', version = version + 1
                where id = ${made.levelId!}
              `;
              yield* Deferred.succeed(saving, undefined);
              yield* Deferred.await(gate);
            }),
          ),
        );
        yield* Deferred.await(saving);
        const starting = yield* Effect.forkChild(fightOn(session, made.id));
        yield* Effect.sleep("300 millis");
        expect(starting.pollUnsafe()).toBeUndefined();
        yield* Deferred.succeed(gate, undefined);
        yield* Fiber.join(save).pipe(Effect.orDie);
        const fight = yield* Fiber.join(starting);
        const board = yield* boardOf(session, fight.id);
        expect(board?.level?.ambient).toBe("dark");
        yield* endNight(session);
      }),
    );

    it.effect("is the creator's alone: a seated player and a stranger are NotFound", () =>
      Effect.gen(function* () {
        const { ilse, bo, table } = yield* Fixture;
        const encounter = yield* anEncounterOnTheGrid("Private");
        const session = yield* night();
        const fight = yield* fightOn(session, encounter.id);
        for (const who of [ilse, bo]) {
          expect(
            yield* refusal(who.token, (client) =>
              client.runs.board({
                params: { campaignId: table, sessionId: session, runId: fight.id },
              }),
            ),
          ).toBe("NotFound");
        }
        yield* endNight(session);
      }),
    );
  });
});
