import { describe, expect } from "@effect/vitest";
import {
  type CampaignId,
  type EncounterRunBoard,
  type Level,
  LevelPartId,
  type LevelSave,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Fiber, Layer, Schema, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { LiveEvents } from "../src/live/LiveEvents.js";
import { type Person, aCharacterAt, admittedTo, aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A fight on a level: the encounter names the creator's own level, the
 * fight copies it at start and at resume, the DM opens doors and lights
 * lights on that copy, and a player walks rather than teleports**
 * (`0109_level_fights.ts`, `levelFights.ts`, `BattleMaps.updateDoor` and
 * `updateLight`, `PlayerTable.move`).
 *
 * Over the real application and Postgres, through the client derived from the
 * contract. The people are minted the shipped way (`support/actors.ts`): Jo
 * creates the table, Ilse is admitted through a real invitation with a seat Jo
 * shared, Wren is another creator with levels of her own, and Bo is a
 * stranger. Every refusal is driven by one of them.
 */

const database = migratedDatabase("taverns_test_level_fights");
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

/** The call's failure as the client sees it: its tag and, for a `Conflict`, the message. */
const failure = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({
        onFailure: (error) => ({
          tag: error._tag,
          message: "message" in error ? String(error.message) : undefined,
        }),
        onSuccess: () => ({ tag: "succeeded", message: undefined }),
      }),
    ),
  ).pipe(Effect.orDie);

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

const part = (n: number) =>
  Schema.decodeSync(LevelPartId)(`1e7e2000-0000-4000-8000-${String(n).padStart(12, "0")}`);

const DOOR = part(2);
const SECRET = part(4);
const TORCH = part(5);

/**
 * Seven squares by four of flagstone. A wall down x = 3 with a door in it
 * between rows 1 and 2 (closed); a solid wall down x = 5 with a secret door
 * between rows 3 and 4 (closed, unfound). A torch, a crate and a trap.
 *
 *     0 1 2 | 3 4 | 5 6
 *     row 1 is the door's row through x = 3.
 */
const hall = (level: Level): LevelSave => ({
  name: "The Hall",
  description: null,
  columns: 7,
  rows: 4,
  feetPerCell: 5,
  ambient: "dim",
  floor: Array.from({ length: 28 }, () => 1),
  walls: [
    { id: part(1), x1: 3, y1: 0, x2: 3, y2: 1, kind: "wall", doorState: null, low: false },
    { id: DOOR, x1: 3, y1: 1, x2: 3, y2: 2, kind: "door", doorState: "closed", low: false },
    { id: part(3), x1: 3, y1: 2, x2: 3, y2: 4, kind: "wall", doorState: null, low: false },
    { id: part(6), x1: 5, y1: 0, x2: 5, y2: 3, kind: "wall", doorState: null, low: false },
    {
      id: SECRET,
      x1: 5,
      y1: 3,
      x2: 5,
      y2: 4,
      kind: "secretDoor",
      doorState: "closed",
      low: false,
    },
  ],
  props: [
    {
      id: part(7),
      kind: "crate",
      x: 0,
      y: 3,
      rotation: 0,
      blocksMovement: null,
      blocksSight: null,
      cover: null,
      difficult: null,
      dmOnly: true,
    },
  ],
  lights: [
    { id: TORCH, x: 1.5, y: 0.5, bright: 20, dim: 20, tone: "fire", flicker: true, lit: true },
  ],
  regions: [{ id: part(8), kind: "trap", squares: [11], secret: true }],
  version: level.version,
});

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const wren = yield* aPerson("Wren");
  const bo = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const ilses = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, ilses, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" });
  const wrensTable = (yield* as(wren.token, (client) =>
    client.campaigns.create({ payload: { name: "Wren's Table" } }),
  )).id;
  const wrensLevel = yield* as(wren.token, (client) =>
    client.libraryLevels.create({ payload: { name: "Wren's Cellar", columns: 4, rows: 4 } }),
  );
  return { jo, ilse, wren, bo, table, wrensTable, wrensLevel };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "level-fights.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

/** A new level of Jo's, saved as `hall`. */
const aHall = () =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    const made = yield* as(jo.token, (client) =>
      client.libraryLevels.create({ payload: { name: "Hall", columns: 7, rows: 4 } }),
    );
    return yield* as(jo.token, (client) =>
      client.libraryLevels.save({ params: { levelId: made.id }, payload: hall(made) }),
    );
  });

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

/** A shared fight on an encounter of its own that names `level`, Tamsin on the board. */
const aFightOn = (level: Level, sessionId: SessionId) =>
  Effect.gen(function* () {
    const { jo, table } = yield* Fixture;
    const encounter = yield* as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: { name: "In the hall", visibility: "shared", ready: true, levelId: level.id },
      }),
    );
    const fight = yield* as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId },
        payload: { encounterId: encounter.id, visibility: "shared" },
      }),
    );
    const params = { campaignId: table, sessionId, runId: fight.id };
    return { encounter, fight, params };
  });

type Params = Effect.Success<ReturnType<typeof aFightOn>>["params"];

const boardOf = (params: Params) =>
  Effect.flatMap(Fixture, ({ jo }) => as(jo.token, (client) => client.runs.board({ params })));

const eventsOf = (runId: string, kind: string) =>
  sql(
    (sql) => sql<{ readonly visibility: string; readonly payload: unknown }>`
      select visibility, payload from session_event
      where encounter_run_id = ${runId} and kind = ${kind}
      order by seq
    `,
  );

const levelOf = (board: EncounterRunBoard | null) => {
  expect(board?.level).not.toBeNull();
  return board!.level!;
};

describeLayer("level-fights", shared, (it) => {
  describe("an encounter names only its creator's own level", () => {
    it.effect("keeps the pointer on create and update, and clears it with null", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const level = yield* aHall();
        const made = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table },
            payload: { name: "Pointed", levelId: level.id },
          }),
        );
        expect(made.levelId).toBe(level.id);
        const cleared = yield* as(jo.token, (client) =>
          client.encounters.update({
            params: { campaignId: table, encounterId: made.id },
            payload: { levelId: null },
          }),
        );
        expect(cleared.levelId).toBeNull();
        const again = yield* as(jo.token, (client) =>
          client.encounters.update({
            params: { campaignId: table, encounterId: made.id },
            payload: { levelId: level.id },
          }),
        );
        expect(again.levelId).toBe(level.id);
      }),
    );

    it.effect("refuses another account's level as NotFound, writing nothing", () =>
      Effect.gen(function* () {
        const { jo, wren, table, wrensTable, wrensLevel } = yield* Fixture;
        expect(
          yield* refusal(jo.token, (client) =>
            client.encounters.create({
              params: { campaignId: table },
              payload: { name: "Borrowed", levelId: wrensLevel.id },
            }),
          ),
        ).toBe("NotFound");
        const made = yield* as(jo.token, (client) =>
          client.encounters.create({ params: { campaignId: table }, payload: { name: "Mine" } }),
        );
        expect(
          yield* refusal(jo.token, (client) =>
            client.encounters.update({
              params: { campaignId: table, encounterId: made.id },
              payload: { levelId: wrensLevel.id, name: "Renamed" },
            }),
          ),
        ).toBe("NotFound");
        const read = yield* as(jo.token, (client) =>
          client.encounters.findById({ params: { campaignId: table, encounterId: made.id } }),
        );
        expect([read.name, read.levelId]).toEqual(["Mine", null]);

        // And the other way round: Wren cannot name Jo's level at her own table.
        const jos = yield* aHall();
        expect(
          yield* refusal(wren.token, (client) =>
            client.encounters.create({
              params: { campaignId: wrensTable },
              payload: { name: "Borrowed", levelId: jos.id },
            }),
          ),
        ).toBe("NotFound");
        // Nor a statement that bypasses the repository: the keys refuse it.
        const bypass = yield* Effect.flatMap(
          SqlClient.SqlClient,
          (sql) =>
            sql`
            update encounter set level_id = ${wrensLevel.id},
                                 level_owner_id = (select account_id from level where id = ${wrensLevel.id})
            where id = ${made.id}
          `,
        ).pipe(Effect.match({ onFailure: () => "refused", onSuccess: () => "written" }));
        expect(bypass).toBe("refused");
      }),
    );
  });

  describe("a fight copies its level", () => {
    it.effect("takes the level's size, ambient, floor and parts at start, and no picture", () =>
      Effect.gen(function* () {
        const level = yield* aHall();
        const session = yield* night();
        const { params } = yield* aFightOn(level, session);
        const board = yield* boardOf(params);
        expect(board).not.toBeNull();
        expect([board!.columns, board!.rows, board!.feetPerCell]).toEqual([7, 4, 5]);
        expect(board!.mapId).toBeNull();
        expect(board!.image).toBeNull();
        expect(board!.alignment).toEqual({ cellPx: 64, offsetXPx: 0, offsetYPx: 0 });
        const copy = levelOf(board);
        expect(copy.ambient).toBe("dim");
        expect(copy.floor).toEqual(level.floor);
        expect(copy.walls).toEqual(level.walls.map((wall) => ({ ...wall, revealed: false })));
        expect(copy.props).toEqual(level.props);
        expect(copy.lights).toEqual(level.lights);
        expect(copy.regions).toEqual(level.regions);
      }),
    );

    it.effect("keeps its copy when the level is edited or deleted after it starts", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const level = yield* aHall();
        const session = yield* night();
        const { encounter, params } = yield* aFightOn(level, session);
        const before = yield* boardOf(params);

        yield* as(jo.token, (client) =>
          client.libraryLevels.save({
            params: { levelId: level.id },
            payload: { ...hall(level), ambient: "bright", walls: [], lights: [] },
          }),
        );
        expect(yield* boardOf(params)).toEqual(before);

        yield* as(jo.token, (client) =>
          client.libraryLevels.remove({ params: { levelId: level.id } }),
        );
        expect(yield* boardOf(params)).toEqual(before);
        // The encounter goes back to its picture board.
        const read = yield* as(jo.token, (client) =>
          client.encounters.findById({ params: { campaignId: table, encounterId: encounter.id } }),
        );
        expect(read.levelId).toBeNull();
      }),
    );

    it.effect("carries its copy, doors and lights as left, to the fight that resumes it", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const level = yield* aHall();
        const session = yield* night();
        const { fight, params } = yield* aFightOn(level, session);
        yield* as(jo.token, (client) =>
          client.runs.updateDoor({
            params: { ...params, wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        yield* as(jo.token, (client) =>
          client.runs.updateLight({
            params: { ...params, lightId: TORCH },
            payload: { lit: false },
          }),
        );
        const left = yield* boardOf(params);
        yield* endNight(session);

        // The level changes between nights; the fight does not.
        yield* as(jo.token, (client) =>
          client.libraryLevels.save({
            params: { levelId: level.id },
            payload: { ...hall(level), walls: [] },
          }),
        );
        const next = yield* night();
        const resumed = yield* as(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: next },
            payload: { continuedFrom: fight.id },
          }),
        );
        const carried = yield* boardOf({ campaignId: table, sessionId: next, runId: resumed.id });
        expect(carried?.level).toEqual(left?.level);
        expect(levelOf(carried).walls.find((wall) => wall.id === DOOR)?.doorState).toBe("open");
        expect(levelOf(carried).lights[0]?.lit).toBe(false);
      }),
    );
  });

  describe("the DM's live writes", () => {
    it.effect("opens, locks and reveals doors and snuffs a light, each logged as the DM's", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const level = yield* aHall();
        const session = yield* night();
        const { fight, params } = yield* aFightOn(level, session);

        const opened = yield* as(jo.token, (client) =>
          client.runs.updateDoor({
            params: { ...params, wallId: DOOR },
            payload: { doorState: "open", requestId: "door-1" },
          }),
        );
        expect(levelOf(opened).walls.find((wall) => wall.id === DOOR)?.doorState).toBe("open");
        // A repeated request changes nothing more.
        yield* as(jo.token, (client) =>
          client.runs.updateDoor({
            params: { ...params, wallId: DOOR },
            payload: { doorState: "open", requestId: "door-1" },
          }),
        );
        const locked = yield* as(jo.token, (client) =>
          client.runs.updateDoor({
            params: { ...params, wallId: DOOR },
            payload: { doorState: "locked" },
          }),
        );
        expect(levelOf(locked).walls.find((wall) => wall.id === DOOR)?.doorState).toBe("locked");

        const found = yield* as(jo.token, (client) =>
          client.runs.updateDoor({
            params: { ...params, wallId: SECRET },
            payload: { revealed: true, doorState: "open" },
          }),
        );
        expect(levelOf(found).walls.find((wall) => wall.id === SECRET)).toMatchObject({
          revealed: true,
          doorState: "open",
        });
        const hidden = yield* as(jo.token, (client) =>
          client.runs.updateDoor({
            params: { ...params, wallId: SECRET },
            payload: { revealed: false },
          }),
        );
        expect(levelOf(hidden).walls.find((wall) => wall.id === SECRET)?.revealed).toBe(false);

        const snuffed = yield* as(jo.token, (client) =>
          client.runs.updateLight({
            params: { ...params, lightId: TORCH },
            payload: { lit: false },
          }),
        );
        expect(levelOf(snuffed).lights[0]?.lit).toBe(false);

        const doors = yield* eventsOf(fight.id, "board-door-updated");
        expect(doors.map((event) => event.visibility)).toEqual(["dm", "dm", "dm", "dm"]);
        expect(doors[0]?.payload).toEqual({ wallId: DOOR, doorState: "open", revealed: false });
        const lights = yield* eventsOf(fight.id, "board-light-updated");
        expect(lights).toEqual([{ visibility: "dm", payload: { lightId: TORCH, lit: false } }]);
      }),
    );

    it.effect("rings the doorbell once the write commits", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const level = yield* aHall();
        const session = yield* night();
        const { params } = yield* aFightOn(level, session);
        const live = yield* LiveEvents;
        const bell = yield* live
          .subscribe(session)
          .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);
        // Let the subscription open before the write.
        yield* Effect.sleep("50 millis");
        yield* as(jo.token, (client) =>
          client.runs.updateLight({
            params: { ...params, lightId: TORCH },
            payload: { lit: false },
          }),
        );
        const rung = yield* Fiber.join(bell).pipe(Effect.timeout("5 seconds"));
        expect([...rung].map((touch) => touch.sessionId)).toEqual([session]);
      }),
    );

    it.effect("refuses what is not a door, not secret, not there, or on no level", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const level = yield* aHall();
        const session = yield* night();
        const { params } = yield* aFightOn(level, session);
        const door = (wallId: LevelPartId, payload: { doorState?: "open"; revealed?: boolean }) =>
          refusal(jo.token, (client) =>
            client.runs.updateDoor({ params: { ...params, wallId }, payload }),
          );
        expect(yield* door(part(1), { doorState: "open" })).toBe("Conflict");
        expect(yield* door(DOOR, { revealed: true })).toBe("Conflict");
        expect(yield* door(part(99), { doorState: "open" })).toBe("NotFound");
        expect(
          yield* refusal(jo.token, (client) =>
            client.runs.updateLight({
              params: { ...params, lightId: part(99) },
              payload: { lit: true },
            }),
          ),
        ).toBe("NotFound");

        // A fight on a picture board has no door to open.
        const other = yield* night();
        const plain = yield* as(jo.token, (client) =>
          client.encounters.create({ params: { campaignId: table }, payload: { name: "Plain" } }),
        );
        const picture = yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table, sessionId: other },
            payload: { encounterId: plain.id },
          }),
        );
        expect(
          yield* refusal(jo.token, (client) =>
            client.runs.updateDoor({
              params: { campaignId: table, sessionId: other, runId: picture.id, wallId: DOOR },
              payload: { doorState: "open" },
            }),
          ),
        ).toBe("Conflict");
        const board = yield* boardOf({ campaignId: table, sessionId: other, runId: picture.id });
        expect(board?.level).toBeNull();
      }),
    );

    it.effect("is the creator's alone: a seated player and a stranger are NotFound", () =>
      Effect.gen(function* () {
        const { ilse, bo } = yield* Fixture;
        const level = yield* aHall();
        const session = yield* night();
        const { fight, params } = yield* aFightOn(level, session);
        for (const who of [ilse, bo]) {
          expect(
            yield* refusal(who.token, (client) =>
              client.runs.updateDoor({
                params: { ...params, wallId: DOOR },
                payload: { doorState: "open" },
              }),
            ),
          ).toBe("NotFound");
          expect(
            yield* refusal(who.token, (client) =>
              client.runs.updateLight({
                params: { ...params, lightId: TORCH },
                payload: { lit: false },
              }),
            ),
          ).toBe("NotFound");
          expect(yield* refusal(who.token, (client) => client.runs.board({ params }))).toBe(
            "NotFound",
          );
        }
        const copy = levelOf(yield* boardOf(params));
        expect(copy.walls.find((wall) => wall.id === DOOR)?.doorState).toBe("closed");
        expect(copy.lights[0]?.lit).toBe(true);
        expect(yield* eventsOf(fight.id, "board-door-updated")).toEqual([]);
      }),
    );
  });

  describe("a player walks on a level", () => {
    /** Tamsin up, on (1, 1), with the map shown. */
    const tamsinsTurn = (params: Params) =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const order = yield* as(jo.token, (client) => client.combatants.list({ params }));
        const tamsin = order.find((row) => row.displayName === "Tamsin")!;
        yield* as(jo.token, (client) =>
          client.combatants.update({
            params: { ...params, combatantId: tamsin.id },
            payload: { visibility: "shared" },
          }),
        );
        yield* as(jo.token, (client) =>
          client.combatants.move({
            params: { ...params, combatantId: tamsin.id },
            payload: { position: { column: 1, row: 1 } },
          }),
        );
        yield* as(jo.token, (client) =>
          client.runs.setInitiative({
            params,
            payload: {
              entries: order.map((row) => ({ combatantId: row.id, initiative: 10 })),
            },
          }),
        );
        yield* as(jo.token, (client) => client.runs.begin({ params, payload: {} }));
        yield* as(jo.token, (client) =>
          client.runs.update({
            params,
            payload: { activeCombatantId: tamsin.id, mapShown: true },
          }),
        );
        return tamsin;
      });

    const walk = (
      who: Person,
      table: CampaignId,
      params: Params,
      combatantId: string,
      to: { column: number; row: number },
    ) =>
      failure(who.token, (client) =>
        client.table.move({
          params: { campaignId: table, runId: params.runId, combatantId: combatantId as never },
          payload: { position: to },
        }),
      );

    it.effect("is refused through a wall and a closed door, and walks once the door is open", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        const level = yield* aHall();
        const session = yield* night();
        const { params } = yield* aFightOn(level, session);
        const tamsin = yield* tamsinsTurn(params);

        const throughDoor = yield* walk(ilse, table, params, tamsin.id, { column: 4, row: 1 });
        expect(throughDoor).toEqual({
          tag: "Conflict",
          message: "you cannot get there from where you stand",
        });
        // Past the solid wall and the unfound secret door: no way at all.
        expect((yield* walk(ilse, table, params, tamsin.id, { column: 6, row: 1 })).tag).toBe(
          "Conflict",
        );
        // On the crate the DM keeps to themselves: nobody stands there.
        expect((yield* walk(ilse, table, params, tamsin.id, { column: 0, row: 3 })).tag).toBe(
          "Conflict",
        );
        const still = (yield* as(jo.token, (client) => client.combatants.list({ params }))).find(
          (row) => row.id === tamsin.id,
        );
        expect(still?.position).toEqual({ column: 1, row: 1 });

        yield* as(jo.token, (client) =>
          client.runs.updateDoor({
            params: { ...params, wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        expect((yield* walk(ilse, table, params, tamsin.id, { column: 4, row: 1 })).tag).toBe(
          "succeeded",
        );
        // The secret door opened but not revealed is still a wall to the table.
        yield* as(jo.token, (client) =>
          client.runs.updateDoor({
            params: { ...params, wallId: SECRET },
            payload: { doorState: "open" },
          }),
        );
        expect((yield* walk(ilse, table, params, tamsin.id, { column: 6, row: 3 })).tag).toBe(
          "Conflict",
        );
        yield* as(jo.token, (client) =>
          client.runs.updateDoor({
            params: { ...params, wallId: SECRET },
            payload: { revealed: true },
          }),
        );
        expect((yield* walk(ilse, table, params, tamsin.id, { column: 6, row: 3 })).tag).toBe(
          "succeeded",
        );
      }),
    );

    it.effect("leaves the DM placing freely, through any wall", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const level = yield* aHall();
        const session = yield* night();
        const { params } = yield* aFightOn(level, session);
        const tamsin = yield* tamsinsTurn(params);
        const placed = yield* as(jo.token, (client) =>
          client.combatants.move({
            params: { ...params, combatantId: tamsin.id },
            payload: { position: { column: 6, row: 0 } },
          }),
        );
        expect(placed.position).toEqual({ column: 6, row: 0 });
      }),
    );

    it.effect("carries no level on the player's table: the board is the bare grid", () =>
      Effect.gen(function* () {
        const { ilse, table } = yield* Fixture;
        const level = yield* aHall();
        const session = yield* night();
        const { params } = yield* aFightOn(level, session);
        yield* tamsinsTurn(params);
        const raw = yield* wire(ilse.token, `/campaigns/${table}/table`);
        expect(raw.status).toBe(200);
        const read = JSON.parse(raw.body) as {
          readonly fight: { readonly board: Record<string, unknown> | null } | null;
        };
        const board = read.fight?.board;
        expect(board).not.toBeNull();
        expect(Object.keys(board!).sort()).toEqual(
          [
            "alignment",
            "area",
            "columns",
            "feetPerCell",
            "fog",
            "grid",
            "image",
            "rows",
            "tokens",
          ].sort(),
        );
        expect(board!["image"]).toBeNull();
        for (const word of [
          "walls",
          "floor",
          "props",
          "lights",
          "regions",
          "ambient",
          "secretDoor",
        ]) {
          expect(raw.body).not.toContain(word);
        }
      }),
    );
  });

  describe("where a level is used", () => {
    it.effect("lists the encounters naming it to its owner, and is NotFound to anybody else", () =>
      Effect.gen(function* () {
        const { jo, wren, table } = yield* Fixture;
        const level = yield* aHall();
        const named = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table },
            payload: { name: "Ambush in the hall", levelId: level.id },
          }),
        );
        const uses = yield* as(jo.token, (client) =>
          client.libraryLevels.uses({ params: { levelId: level.id } }),
        );
        expect(uses.map((use) => ({ ...use }))).toEqual([
          {
            encounterId: named.id,
            encounterName: "Ambush in the hall",
            campaignId: table,
            campaignName: "The Salt Road",
          },
        ]);
        expect(
          yield* refusal(wren.token, (client) =>
            client.libraryLevels.uses({ params: { levelId: level.id } }),
          ),
        ).toBe("NotFound");

        yield* as(jo.token, (client) =>
          client.libraryLevels.remove({ params: { levelId: level.id } }),
        );
        const after = yield* as(jo.token, (client) =>
          client.encounters.findById({ params: { campaignId: table, encounterId: named.id } }),
        );
        expect(after.levelId).toBeNull();
      }),
    );
  });
});
