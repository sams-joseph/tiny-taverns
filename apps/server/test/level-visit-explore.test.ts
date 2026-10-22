import { describe, expect } from "@effect/vitest";
import {
  type CampaignCharacterId,
  type CampaignId,
  type Level,
  type LevelId,
  LevelPartId,
  type LevelSave,
  type LevelVisit,
  type LevelVisitId,
  type LiveEvent,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Fiber, Layer, Schema, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, admittedTo, aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **The DM explores a level visit** (`0114_level_visit_writes.ts`,
 * `repo/LevelVisits.ts`): tokens, fog, doors, lights and secret regions on
 * the visit's copy, with no fight on it; the party's vision recomputed on
 * each; the visit frozen while a fight borrows it; the way in (`entry`) the
 * party is stood on when a visit opens; and the visit's lines on an open
 * night, with the DM's visit stream.
 *
 * Over the real application and Postgres, through the client derived from the
 * contract. Jo creates the table; Ilse is admitted through a real invitation
 * with a seat; Bo is a stranger. Every refusal is driven by one of them.
 */

const database = migratedDatabase("taverns_test_level_visit_explore");
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

const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) => Effect.map(failure(token, call), (failed) => failed.tag);

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

const part = (n: number) =>
  Schema.decodeSync(LevelPartId)(`1e7e3000-0000-4000-8000-${String(n).padStart(12, "0")}`);

const PLAIN_WALL = part(1);
const DOOR = part(2);
const SECRET_DOOR = part(4);
const TORCH = part(5);
const TRAP = part(8);
const MUD = part(9);
const ENTRY = part(10);

const COLUMNS = 7;
const at = (column: number, row: number) => row * COLUMNS + column;

/**
 * Seven squares by four of flagstone, dim: a wall down x = 3 with a closed
 * door in it at row 1, a secret door further east at row 3, a torch in the
 * west, a crate in the west's bottom-left corner, a secret trap, mud, and,
 * when `entry` names squares, the way in.
 */
const hall = (level: Level, entry: ReadonlyArray<number> = []): LevelSave => ({
  name: level.name,
  description: null,
  columns: COLUMNS,
  rows: 4,
  feetPerCell: 5,
  ambient: "dim",
  floor: Array.from({ length: 28 }, () => 1),
  walls: [
    { id: PLAIN_WALL, x1: 3, y1: 0, x2: 3, y2: 1, kind: "wall", doorState: null, low: false },
    { id: DOOR, x1: 3, y1: 1, x2: 3, y2: 2, kind: "door", doorState: "closed", low: false },
    { id: part(3), x1: 3, y1: 2, x2: 3, y2: 4, kind: "wall", doorState: null, low: false },
    {
      id: SECRET_DOOR,
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
      dmOnly: false,
    },
  ],
  lights: [
    { id: TORCH, x: 1.5, y: 0.5, bright: 20, dim: 20, tone: "fire", flicker: true, lit: true },
  ],
  regions: [
    { id: TRAP, kind: "trap", squares: [at(4, 1)], secret: true },
    { id: MUD, kind: "difficult", squares: [at(1, 2)], secret: false },
    ...(entry.length === 0
      ? []
      : [{ id: ENTRY, kind: "entry" as const, squares: [...entry], secret: false }]),
  ],
  version: level.version,
});

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const bo = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, ilse.actor, { name: "Tamsin", hpMax: 30 });
  return { jo, ilse, bo, table };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "level-visit-explore.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

let levels = 0;

/** A new level of Jo's, saved as `hall`, and a visit of it at Jo's table. */
const aVisit = (entry: ReadonlyArray<number> = []) =>
  Effect.gen(function* () {
    const { jo, table } = yield* Fixture;
    levels += 1;
    const made = yield* as(jo.token, (client) =>
      client.libraryLevels.create({
        payload: { name: `Hall ${String(levels)}`, columns: COLUMNS, rows: 4 },
      }),
    );
    const level = yield* as(jo.token, (client) =>
      client.libraryLevels.save({ params: { levelId: made.id }, payload: hall(made, entry) }),
    );
    return yield* as(jo.token, (client) =>
      client.levelVisits.open({ params: { campaignId: table }, payload: { levelId: level.id } }),
    );
  });

const seatOf = (visit: LevelVisit): CampaignCharacterId => visit.tokens[0]!.seatId;

/** A visit's path at its table. */
const on = (table: CampaignId, visit: LevelVisit) => ({ campaignId: table, visitId: visit.id });

/** The visit's log lines, in order. */
const linesOf = (visitId: LevelVisitId) =>
  sql(
    (sql) => sql<{
      readonly kind: string;
      readonly visibility: string;
      readonly session_id: string;
      readonly payload: unknown;
    }>`
      select kind, visibility, session_id, payload from session_event
      where level_visit_id = ${visitId} order by seq
    `,
  );

/** A night at Jo's table, started and made the campaign's current one. */
const openNight = Effect.gen(function* () {
  const { jo, table } = yield* Fixture;
  const number = (yield* as(jo.token, (client) =>
    client.sessions.list({ params: { campaignId: table } }),
  )).length;
  const session = yield* as(jo.token, (client) =>
    client.sessions.create({ params: { campaignId: table }, payload: { number: number + 1 } }),
  );
  yield* as(jo.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId: session.id },
      payload: { startedAt: DateTime.nowUnsafe() },
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

/** Finish the night: ended, and the campaign's pointer cleared, as finishing does. */
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

describeLayer("level-visit-explore", shared, (it) => {
  describe("the way in", () => {
    it.effect("stands the party on the level's entry squares, skipping one no token fits", () =>
      Effect.gen(function* () {
        // The crate's square first: no token may stand there, so the next.
        const visit = yield* aVisit([at(0, 3), at(5, 2), at(6, 2)]);
        expect(visit.tokens.map(({ column, row }) => ({ column, row }))).toEqual([
          { column: 5, row: 2 },
        ]);
        // The overlay is the DM's, on the visit's copy.
        expect(visit.level.regions.find((region) => region.id === ENTRY)?.kind).toBe("entry");
      }),
    );

    it.effect("falls back to the left edge when the level has none it can use", () =>
      Effect.gen(function* () {
        const none = yield* aVisit();
        expect(none.tokens.map(({ column, row }) => ({ column, row }))).toEqual([
          { column: 0, row: 1 },
        ]);
        const blocked = yield* aVisit([at(0, 3)]);
        expect(blocked.tokens.map(({ column, row }) => ({ column, row }))).toEqual([
          { column: 0, row: 1 },
        ]);
      }),
    );

    it.effect("is never secret: the save refuses one", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const made = yield* as(jo.token, (client) =>
          client.libraryLevels.create({
            payload: { name: "Hidden way", columns: COLUMNS, rows: 4 },
          }),
        );
        const save = hall(made, [at(1, 1)]);
        const refused = yield* refusal(jo.token, (client) =>
          client.libraryLevels.save({
            params: { levelId: made.id },
            payload: {
              ...save,
              regions: save.regions.map((region) =>
                region.kind === "entry" ? { ...region, secret: true } : region,
              ),
            },
          }),
        );
        expect(refused).not.toBe("succeeded");
      }),
    );

    it.effect("is ignored by a fight on the level: the party starts down the left edge", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const made = yield* as(jo.token, (client) =>
          client.libraryLevels.create({
            payload: { name: "Fought in", columns: COLUMNS, rows: 4 },
          }),
        );
        const level = yield* as(jo.token, (client) =>
          client.libraryLevels.save({
            params: { levelId: made.id },
            payload: hall(made, [at(5, 2)]),
          }),
        );
        const sessionId = (yield* as(jo.token, (client) =>
          client.sessions.create({ params: { campaignId: table }, payload: { number: 900 } }),
        )).id;
        const encounter = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table },
            payload: { name: "In the hall", ready: true, levelId: level.id as LevelId },
          }),
        );
        const fight = yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table, sessionId },
            payload: { encounterId: encounter.id },
          }),
        );
        const order = yield* as(jo.token, (client) =>
          client.combatants.list({ params: { campaignId: table, sessionId, runId: fight.id } }),
        );
        const tamsin = order.find((row) => row.kind === "pc")!;
        expect(tamsin.position).toEqual({ column: 0, row: 1 });
        yield* as(jo.token, (client) =>
          client.runs.end({
            params: { campaignId: table, sessionId, runId: fight.id },
            payload: {},
          }),
        );
      }),
    );
  });

  describe("exploring", () => {
    it.effect("stands a token on any square it fits, and the party looks again", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const visit = yield* aVisit();
        const seatId = seatOf(visit);
        const moved = yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...on(table, visit), seatId },
            payload: { position: { column: 6, row: 0 } },
          }),
        );
        // Through the wall, as the DM sets a miniature down: no walk.
        expect(moved.tokens[0]).toMatchObject({ column: 6, row: 0 });
        expect(moved.partySees).toContain(at(6, 0));
        expect(moved.partySees).not.toEqual(visit.partySees);
        // What it has seen it keeps.
        expect(moved.partySeen).toEqual(
          expect.arrayContaining([...visit.partySeen, ...moved.partySees]),
        );
        expect(
          yield* as(jo.token, (client) =>
            client.levelVisits.findById({ params: on(table, visit) }),
          ),
        ).toEqual(moved);
      }),
    );

    it.effect("refuses a square off the board and one no token may stand on", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const visit = yield* aVisit();
        const seatId = seatOf(visit);
        const off = yield* failure(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...on(table, visit), seatId },
            payload: { position: { column: 7, row: 0 } },
          }),
        );
        expect(off).toEqual({ tag: "Conflict", message: "that square is off the board" });
        const crate = yield* failure(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...on(table, visit), seatId },
            payload: { position: { column: 0, row: 3 } },
          }),
        );
        expect(crate).toEqual({ tag: "Conflict", message: "no token can stand on that square" });
        expect(
          (yield* as(jo.token, (client) =>
            client.levelVisits.findById({ params: on(table, visit) }),
          )).tokens,
        ).toEqual(visit.tokens);
      }),
    );

    it.effect("answers a seat with no token on the visit NotFound", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const visit = yield* aVisit();
        const other = yield* aVisit();
        // Another visit's token is still a seat of this table; it is the
        // token on this visit that is asked for.
        yield* sql((sql) => sql`delete from level_visit_token where visit_id = ${other.id}`);
        expect(
          yield* refusal(jo.token, (client) =>
            client.levelVisits.moveToken({
              params: { ...on(table, other), seatId: seatOf(visit) },
              payload: { position: { column: 1, row: 1 } },
            }),
          ),
        ).toBe("NotFound");
      }),
    );

    it.effect("opens a door and the party sees through it; a plain wall is no door", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const visit = yield* aVisit();
        // From the west room, beside the closed door.
        const beside = yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...on(table, visit), seatId: seatOf(visit) },
            payload: { position: { column: 2, row: 1 } },
          }),
        );
        expect(beside.partySees).not.toContain(at(4, 1));
        const opened = yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { ...on(table, visit), wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        expect(opened.level.walls.find((wall) => wall.id === DOOR)?.doorState).toBe("open");
        expect(opened.partySees).toContain(at(4, 1));

        expect(
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateDoor({
              params: { ...on(table, visit), wallId: PLAIN_WALL },
              payload: { doorState: "open" },
            }),
          ),
        ).toEqual({ tag: "Conflict", message: "that wall is not a door" });
        expect(
          yield* refusal(jo.token, (client) =>
            client.levelVisits.updateDoor({
              params: { ...on(table, visit), wallId: part(99) },
              payload: { doorState: "open" },
            }),
          ),
        ).toBe("NotFound");
      }),
    );

    it.effect("reveals a secret door, and a plain door is not revealed", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const visit = yield* aVisit();
        const found = yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { ...on(table, visit), wallId: SECRET_DOOR },
            payload: { revealed: true },
          }),
        );
        expect(found.level.walls.find((wall) => wall.id === SECRET_DOOR)?.revealed).toBe(true);
        expect(
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateDoor({
              params: { ...on(table, visit), wallId: DOOR },
              payload: { revealed: true },
            }),
          ),
        ).toEqual({ tag: "Conflict", message: "only a secret door is revealed" });
      }),
    );

    it.effect("snuffs and lights a light, and the party sees by it", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const visit = yield* aVisit();
        const snuffed = yield* as(jo.token, (client) =>
          client.levelVisits.updateLight({
            params: { ...on(table, visit), lightId: TORCH },
            payload: { lit: false },
          }),
        );
        expect(snuffed.level.lights[0]?.lit).toBe(false);
        // Dim, with the torch out: the party sees less of the west room.
        expect(snuffed.partySees.length).toBeLessThanOrEqual(visit.partySees.length);
        const lit = yield* as(jo.token, (client) =>
          client.levelVisits.updateLight({
            params: { ...on(table, visit), lightId: TORCH },
            payload: { lit: true },
          }),
        );
        expect(lit.level.lights[0]?.lit).toBe(true);
        expect(lit.partySees).toEqual(visit.partySees);
        expect(
          yield* refusal(jo.token, (client) =>
            client.levelVisits.updateLight({
              params: { ...on(table, visit), lightId: part(98) },
              payload: { lit: true },
            }),
          ),
        ).toBe("NotFound");
      }),
    );

    it.effect("reveals and hides a secret region; one that is not secret is refused", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const visit = yield* aVisit();
        const shown = yield* as(jo.token, (client) =>
          client.levelVisits.updateRegion({
            params: { ...on(table, visit), regionId: TRAP },
            payload: { revealed: true },
          }),
        );
        expect(shown.level.regions.find((region) => region.id === TRAP)?.revealed).toBe(true);
        const hidden = yield* as(jo.token, (client) =>
          client.levelVisits.updateRegion({
            params: { ...on(table, visit), regionId: TRAP },
            payload: { revealed: false },
          }),
        );
        expect(hidden.level.regions.find((region) => region.id === TRAP)?.revealed).toBe(false);
        expect(
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateRegion({
              params: { ...on(table, visit), regionId: MUD },
              payload: { revealed: true },
            }),
          ),
        ).toEqual({ tag: "Conflict", message: "only a secret region is revealed" });
      }),
    );

    it.effect("paints and clears the DM's fog; a reset clears it, as the visit opened", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const visit = yield* aVisit();
        const covered = yield* as(jo.token, (client) =>
          client.levelVisits.updateFog({
            params: on(table, visit),
            payload: { coverAll: true, reveal: [{ column: 0, row: 0 }] },
          }),
        );
        expect(covered.fog).toHaveLength(27);
        expect(covered.fog).not.toContainEqual({ column: 0, row: 0 });
        const painted = yield* as(jo.token, (client) =>
          client.levelVisits.updateFog({
            params: on(table, visit),
            payload: { hide: [{ column: 0, row: 0 }], reveal: [{ column: 6, row: 3 }] },
          }),
        );
        expect(painted.fog).toHaveLength(27);
        expect(painted.fog).toContainEqual({ column: 0, row: 0 });
        const reset = yield* as(jo.token, (client) =>
          client.levelVisits.updateFog({ params: on(table, visit), payload: { reset: true } }),
        );
        expect(reset.fog).toEqual([]);
        expect(
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateFog({
              params: on(table, visit),
              payload: { hide: [{ column: 0, row: 4 }] },
            }),
          ),
        ).toEqual({ tag: "Conflict", message: "that square is off the board" });
      }),
    );

    it.effect("changes nothing for a repeated requestId, with no night open", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const visit = yield* aVisit();
        const seatId = seatOf(visit);
        const first = yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...on(table, visit), seatId },
            payload: { position: { column: 2, row: 0 }, requestId: "drag-1" },
          }),
        );
        yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...on(table, visit), seatId },
            payload: { position: { column: 2, row: 2 }, requestId: "drag-2" },
          }),
        );
        // `drag-1` again, arriving late: the token stays where `drag-2` put it.
        const repeat = yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...on(table, visit), seatId },
            payload: { position: { column: 2, row: 0 }, requestId: "drag-1" },
          }),
        );
        expect(first.tokens[0]).toMatchObject({ column: 2, row: 0 });
        expect(repeat.tokens[0]).toMatchObject({ column: 2, row: 2 });
        // One ledger per visit: another visit's `drag-1` is its own.
        const other = yield* aVisit();
        const elsewhere = yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...on(table, other), seatId },
            payload: { position: { column: 1, row: 0 }, requestId: "drag-1" },
          }),
        );
        expect(elsewhere.tokens[0]).toMatchObject({ column: 1, row: 0 });
        // A request refused changes nothing, and is not recorded as applied.
        const door = { ...on(table, visit), wallId: DOOR };
        yield* failure(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { ...on(table, visit), wallId: PLAIN_WALL },
            payload: { doorState: "open", requestId: "press-1" },
          }),
        );
        const opened = yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: door,
            payload: { doorState: "open", requestId: "press-1" },
          }),
        );
        expect(opened.level.walls.find((wall) => wall.id === DOOR)?.doorState).toBe("open");
      }),
    );
  });

  describe("who may explore", () => {
    it.effect("answers a seated player and a stranger NotFound at every write", () =>
      Effect.gen(function* () {
        const { jo, ilse, bo, table } = yield* Fixture;
        const visit = yield* aVisit();
        const seatId = seatOf(visit);
        for (const person of [ilse, bo]) {
          const refused = [
            yield* refusal(person.token, (client) =>
              client.levelVisits.moveToken({
                params: { ...on(table, visit), seatId },
                payload: { position: { column: 1, row: 1 } },
              }),
            ),
            yield* refusal(person.token, (client) =>
              client.levelVisits.updateFog({
                params: on(table, visit),
                payload: { coverAll: true },
              }),
            ),
            yield* refusal(person.token, (client) =>
              client.levelVisits.updateDoor({
                params: { ...on(table, visit), wallId: DOOR },
                payload: { doorState: "open" },
              }),
            ),
            yield* refusal(person.token, (client) =>
              client.levelVisits.updateLight({
                params: { ...on(table, visit), lightId: TORCH },
                payload: { lit: false },
              }),
            ),
            yield* refusal(person.token, (client) =>
              client.levelVisits.updateRegion({
                params: { ...on(table, visit), regionId: TRAP },
                payload: { revealed: true },
              }),
            ),
          ];
          expect(refused).toEqual(["NotFound", "NotFound", "NotFound", "NotFound", "NotFound"]);
        }
        // Nothing moved.
        expect(
          yield* as(jo.token, (client) =>
            client.levelVisits.findById({ params: on(table, visit) }),
          ),
        ).toEqual(visit);
      }),
    );

    it.effect("answers another campaign's visit NotFound, even to its own creator", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const visit = yield* aVisit();
        const elsewhere = (yield* as(jo.token, (client) =>
          client.campaigns.create({ payload: { name: "Another Road" } }),
        )).id;
        expect(
          yield* refusal(jo.token, (client) =>
            client.levelVisits.updateDoor({
              params: { campaignId: elsewhere, visitId: visit.id, wallId: DOOR },
              payload: { doorState: "open" },
            }),
          ),
        ).toBe("NotFound");
      }),
    );
  });

  describe("while a fight borrows the visit", () => {
    it.effect("refuses every write with a Conflict, and writes again once it ends", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const visit = yield* aVisit();
        const sessionId = (yield* as(jo.token, (client) =>
          client.sessions.create({ params: { campaignId: table }, payload: { number: 901 } }),
        )).id;
        const encounter = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table },
            payload: { name: "Borrowing", ready: true, levelId: visit.levelId! },
          }),
        );
        const fight = yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table, sessionId },
            payload: { encounterId: encounter.id },
          }),
        );
        // No shipped write borrows a visit yet (a later phase's start will),
        // so the pointer is set as that start will set it.
        yield* sql(
          (sql) =>
            sql`update encounter_run set level_visit_id = ${visit.id} where id = ${fight.id}`,
        );
        const seatId = seatOf(visit);
        const refused = [
          yield* failure(jo.token, (client) =>
            client.levelVisits.moveToken({
              params: { ...on(table, visit), seatId },
              payload: { position: { column: 1, row: 1 } },
            }),
          ),
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateFog({ params: on(table, visit), payload: { coverAll: true } }),
          ),
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateDoor({
              params: { ...on(table, visit), wallId: DOOR },
              payload: { doorState: "open" },
            }),
          ),
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateLight({
              params: { ...on(table, visit), lightId: TORCH },
              payload: { lit: false },
            }),
          ),
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateRegion({
              params: { ...on(table, visit), regionId: TRAP },
              payload: { revealed: true },
            }),
          ),
        ];
        for (const one of refused) {
          expect(one.tag).toBe("Conflict");
          expect(one.message).toContain("the board is the fight's until it ends");
        }
        expect(
          yield* as(jo.token, (client) =>
            client.levelVisits.findById({ params: on(table, visit) }),
          ),
        ).toEqual(visit);

        yield* as(jo.token, (client) =>
          client.runs.end({
            params: { campaignId: table, sessionId, runId: fight.id },
            payload: {},
          }),
        );
        const opened = yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { ...on(table, visit), wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        expect(opened.level.walls.find((wall) => wall.id === DOOR)?.doorState).toBe("open");
      }),
    );
  });

  describe("the night's log", () => {
    it.effect("logs nothing with no night open", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const visit = yield* aVisit();
        yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { ...on(table, visit), wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        yield* as(jo.token, (client) =>
          client.levelVisits.putOnTable({
            params: { campaignId: table },
            payload: { visitId: visit.id },
          }),
        );
        expect(yield* linesOf(visit.id)).toEqual([]);
      }),
    );

    it.effect("logs each write the DM's own line on the open night, naming the visit", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const sessionId = yield* openNight;
        const visit = yield* aVisit();
        const campaignId = table;
        const seatId = seatOf(visit);
        yield* as(jo.token, (client) =>
          client.levelVisits.putOnTable({ params: { campaignId }, payload: { visitId: visit.id } }),
        );
        yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...on(table, visit), seatId },
            payload: { position: { column: 2, row: 1 } },
          }),
        );
        yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { ...on(table, visit), wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        yield* as(jo.token, (client) =>
          client.levelVisits.updateLight({
            params: { ...on(table, visit), lightId: TORCH },
            payload: { lit: false },
          }),
        );
        yield* as(jo.token, (client) =>
          client.levelVisits.updateRegion({
            params: { ...on(table, visit), regionId: TRAP },
            payload: { revealed: true },
          }),
        );
        yield* as(jo.token, (client) =>
          client.levelVisits.updateFog({
            params: on(table, visit),
            payload: { hide: [{ column: 6, row: 3 }] },
          }),
        );
        yield* as(jo.token, (client) =>
          client.levelVisits.takeOffTable({ params: { campaignId } }),
        );

        const lines = yield* linesOf(visit.id);
        expect(lines.map((line) => line.kind)).toEqual([
          "visit-opened",
          "visit-tabled",
          "visit-token-moved",
          "visit-door-updated",
          "visit-light-updated",
          "visit-region-updated",
          "visit-fog-updated",
          "visit-tabled",
        ]);
        expect(new Set(lines.map((line) => line.visibility))).toEqual(new Set(["dm"]));
        expect(new Set(lines.map((line) => line.session_id))).toEqual(new Set([sessionId]));
        expect(lines[2]!.payload).toEqual({
          seatId,
          from: { column: 0, row: 1 },
          to: { column: 2, row: 1 },
        });
        expect(lines[3]!.payload).toMatchObject({ wallId: DOOR, doorState: "open" });
        expect(lines[1]!.payload).toEqual({ onTable: true });
        expect(lines[7]!.payload).toEqual({ onTable: false });

        // Once the night is over a write logs nothing again.
        yield* endNight(sessionId);
        yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { ...on(table, visit), wallId: DOOR },
            payload: { doorState: "closed" },
          }),
        );
        expect(yield* linesOf(visit.id)).toHaveLength(8);
      }),
    );

    it.effect("streams the visit's lines to the DM, replayed after `since`, then live", () =>
      Effect.gen(function* () {
        const { jo, ilse, bo, table } = yield* Fixture;
        const sessionId = yield* openNight;
        const visit = yield* aVisit();
        const campaignId = table;
        yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { ...on(table, visit), wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        const listen = (count: number, since?: number) =>
          as(jo.token, (client) =>
            client.live
              .visitEvents({
                params: { campaignId, sessionId, visitId: visit.id },
                query: since === undefined ? {} : { since },
                headers: {},
              })
              .pipe(
                Effect.flatMap((stream) =>
                  stream.pipe(
                    Stream.filter((event: LiveEvent) => event.event === "session-event"),
                    Stream.take(count),
                    Stream.runCollect,
                  ),
                ),
                Effect.timeout("20 seconds"),
              ),
          );
        const replayed = yield* listen(2);
        const kinds = (events: ReadonlyArray<LiveEvent>) =>
          events.map((event) => (event.event === "session-event" ? event.data.kind : "heartbeat"));
        expect(kinds(replayed)).toEqual(["visit-opened", "visit-door-updated"]);
        const first = replayed[0]!;
        const since = first.event === "session-event" ? first.data.seq : 0;
        // From `since`: the door's line, then a light lit while listening.
        const listening = yield* listen(2, since).pipe(
          Effect.forkChild({ startImmediately: true }),
        );
        // Long enough for the subscription to be in place before the write.
        yield* Effect.sleep("400 millis");
        yield* as(jo.token, (client) =>
          client.levelVisits.updateLight({
            params: { ...on(table, visit), lightId: TORCH },
            payload: { lit: false },
          }),
        );
        const tailed = yield* Fiber.join(listening);
        expect(kinds(tailed)).toEqual(["visit-door-updated", "visit-light-updated"]);
        const line = tailed[0];
        expect(line?.event === "session-event" ? line.data.levelVisitId : null).toBe(visit.id);

        // A player and a stranger are refused before any stream.
        for (const person of [ilse, bo]) {
          expect(
            yield* refusal(person.token, (client) =>
              client.live.visitEvents({
                params: { campaignId, sessionId, visitId: visit.id },
                query: {},
                headers: {},
              }),
            ),
          ).toBe("NotFound");
        }
        // So is a night of another campaign of Jo's.
        const elsewhere = (yield* as(jo.token, (client) =>
          client.campaigns.create({ payload: { name: "Yet Another Road" } }),
        )).id;
        const otherNight = (yield* as(jo.token, (client) =>
          client.sessions.create({ params: { campaignId: elsewhere }, payload: { number: 1 } }),
        )).id;
        expect(
          yield* refusal(jo.token, (client) =>
            client.live.visitEvents({
              params: { campaignId, sessionId: otherNight, visitId: visit.id },
              query: {},
              headers: {},
            }),
          ),
        ).toBe("NotFound");
        yield* endNight(sessionId);
      }),
    );

    it.effect("logs a seat leaving on every visit it stood on, when the party sees less", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        // A second seat, of a character of Jo's own, so a visit keeps a viewer.
        const sessionId = yield* openNight;
        const brannoc = yield* aCharacterAt(table, jo.actor, { name: "Brannoc", hpMax: 40 });
        const visit = yield* aVisit();
        expect(visit.tokens).toHaveLength(2);
        // Brannoc east, Tamsin west: the party sees both rooms.
        const brannocSeat = visit.tokens.find((token) => token.name === "Brannoc")!.seatId;
        yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...on(table, visit), seatId: brannocSeat },
            payload: { position: { column: 6, row: 1 } },
          }),
        );
        const before = (yield* linesOf(visit.id)).length;
        yield* as(jo.token, (client) =>
          client.party.leave({ params: { campaignId: table, campaignCharacterId: brannocSeat } }),
        );
        const after = yield* linesOf(visit.id);
        expect(after.slice(before).map((line) => line.kind)).toEqual(["visit-vision-updated"]);
        expect(after.at(-1)?.payload).toEqual({});
        void brannoc;
        void ilse;
        yield* endNight(sessionId);
      }),
    );
  });
});
