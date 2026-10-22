import { describe, expect } from "@effect/vitest";
import {
  type CampaignId,
  type Level,
  type LevelId,
  LevelPartId,
  type LevelSave,
  type LevelVisitId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, admittedTo, aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A level visit: a campaign's live state of one of its creator's levels,
 * opened as a copy, one per campaign and level, put on and taken off the
 * table, and deleted by *Reset level*** (`0113_level_visits.ts`,
 * `repo/LevelVisits.ts`).
 *
 * Over the real application and Postgres, through the client derived from the
 * contract. The people are minted the shipped way (`support/actors.ts`): Jo
 * creates the table, Ilse is admitted through a real invitation with a seat,
 * Wren is another creator with a level and a table of her own, and Bo is a
 * stranger. Every refusal is driven by one of them.
 */

const database = migratedDatabase("taverns_test_level_visits");
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

/** The constraint a statement broke, or `none` when it ran. */
const violated = (query: (sql: SqlClient.SqlClient) => Effect.Effect<unknown, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, (client) =>
    query(client).pipe(
      Effect.match({
        // The driver's error, which names the constraint, is the innermost cause.
        onFailure: (error) => {
          for (let at: unknown = error; at !== null && at !== undefined;) {
            const named = (at as { readonly constraint?: unknown }).constraint;
            if (typeof named === "string") return named;
            at = (at as { readonly cause?: unknown }).cause;
          }
          return String(error);
        },
        onSuccess: () => "none",
      }),
    ),
  );

const part = (n: number) =>
  Schema.decodeSync(LevelPartId)(`1e7e3000-0000-4000-8000-${String(n).padStart(12, "0")}`);

/**
 * Seven squares by four of flagstone, dim: a wall down x = 3 with a closed
 * door in it, a secret door further east, a torch, a DM-only crate and a
 * secret trap.
 */
const hall = (level: Level, name = "The Hall"): LevelSave => ({
  name,
  description: null,
  columns: 7,
  rows: 4,
  feetPerCell: 5,
  ambient: "dim",
  floor: Array.from({ length: 28 }, () => 1),
  walls: [
    { id: part(1), x1: 3, y1: 0, x2: 3, y2: 1, kind: "wall", doorState: null, low: false },
    { id: part(2), x1: 3, y1: 1, x2: 3, y2: 2, kind: "door", doorState: "closed", low: false },
    { id: part(3), x1: 3, y1: 2, x2: 3, y2: 4, kind: "wall", doorState: null, low: false },
    {
      id: part(4),
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
    { id: part(5), x: 1.5, y: 0.5, bright: 20, dim: 20, tone: "fire", flicker: true, lit: true },
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
  yield* admittedTo(table, ilse.actor, "Ilse");
  const tamsin = yield* aCharacterAt(table, ilse.actor, { name: "Tamsin", hpMax: 30 });
  const wrensTable = (yield* as(wren.token, (client) =>
    client.campaigns.create({ payload: { name: "Wren's Table" } }),
  )).id;
  const wrensLevel = yield* as(wren.token, (client) =>
    client.libraryLevels.create({ payload: { name: "Wren's Cellar", columns: 4, rows: 4 } }),
  );
  return { jo, ilse, wren, bo, table, tamsin, wrensTable, wrensLevel };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "level-visits.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

/** A new level of Jo's, saved as `hall`. */
const aHall = (name = "The Hall") =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    const made = yield* as(jo.token, (client) =>
      client.libraryLevels.create({ payload: { name, columns: 7, rows: 4 } }),
    );
    return yield* as(jo.token, (client) =>
      client.libraryLevels.save({ params: { levelId: made.id }, payload: hall(made, name) }),
    );
  });

const openAt = (token: string, campaignId: CampaignId, levelId: LevelId) =>
  as(token, (client) => client.levelVisits.open({ params: { campaignId }, payload: { levelId } }));

const visitOf = (token: string, campaignId: CampaignId, visitId: LevelVisitId) =>
  as(token, (client) => client.levelVisits.findById({ params: { campaignId, visitId } }));

/** How many rows of each of a visit's tables it has. */
const rowsOf = (visitId: LevelVisitId) =>
  sql(
    (sql) => sql<{ readonly table: string; readonly count: number }>`
      select 'visit' as table, count(*)::int as count from level_visit where id = ${visitId}
      union all select 'wall', count(*)::int from level_visit_wall where visit_id = ${visitId}
      union all select 'prop', count(*)::int from level_visit_prop where visit_id = ${visitId}
      union all select 'light', count(*)::int from level_visit_light where visit_id = ${visitId}
      union all select 'region', count(*)::int from level_visit_region where visit_id = ${visitId}
      union all select 'token', count(*)::int from level_visit_token where visit_id = ${visitId}
    `,
  ).pipe(Effect.map((rows) => Object.fromEntries(rows.map((row) => [row.table, row.count]))));

const tableVisitOf = (campaignId: CampaignId) =>
  sql(
    (sql) => sql<{ readonly table_visit_id: string | null }>`
      select table_visit_id from campaign where id = ${campaignId}
    `,
  ).pipe(Effect.map((rows) => rows[0]?.table_visit_id ?? null));

let nights = 0;

const night = (campaignId: CampaignId) =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    nights += 1;
    return (yield* as(jo.token, (client) =>
      client.sessions.create({ params: { campaignId }, payload: { number: nights } }),
    )).id;
  });

describeLayer("level-visits", shared, (it) => {
  describe("opening a visit", () => {
    it.effect("copies the level's size, scale and every part, and stands the party on it", () =>
      Effect.gen(function* () {
        const { jo, table, tamsin } = yield* Fixture;
        const level = yield* aHall("The Copied Hall");
        const visit = yield* openAt(jo.token, table, level.id);

        expect([visit.levelId, visit.name, visit.columns, visit.rows, visit.feetPerCell]).toEqual([
          level.id,
          "The Copied Hall",
          7,
          4,
          5,
        ]);
        expect(visit.level.ambient).toBe("dim");
        expect(visit.level.floor).toEqual(level.floor);
        expect(visit.level.walls).toEqual(
          level.walls.map((wall) => ({ ...wall, revealed: false })),
        );
        expect(visit.level.props).toEqual(level.props);
        expect(visit.level.lights).toEqual(level.lights);
        expect(visit.level.regions).toEqual(
          level.regions.map((region) => ({ ...region, revealed: false })),
        );
        expect(visit.fog).toEqual([]);
        expect(visit.onTable).toBe(false);
        // The seat down the left edge, from its middle row, as a fight seeds it.
        expect(visit.tokens).toEqual([
          { seatId: tamsin.seatId, name: "Tamsin", column: 0, row: 1 },
        ]);
        // And the party has looked around: it sees its own square, at least,
        // and has seen everything it sees.
        expect(visit.partySees).toContain(1 * 7 + 0);
        expect(visit.partySeen).toEqual(expect.arrayContaining([...visit.partySees]));

        const listed = yield* as(jo.token, (client) =>
          client.levelVisits.list({ params: { campaignId: table } }),
        );
        expect(listed.find((one) => one.id === visit.id)?.name).toBe("The Copied Hall");
      }),
    );

    it.effect("is once per campaign and level: a second open is a Conflict saying what to do", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const level = yield* aHall("Visited Once");
        yield* openAt(jo.token, table, level.id);
        const again = yield* failure(jo.token, (client) =>
          client.levelVisits.open({
            params: { campaignId: table },
            payload: { levelId: level.id },
          }),
        );
        expect(again.tag).toBe("Conflict");
        expect(again.message).toContain("put it on the table, or reset the level");
        const count = yield* sql(
          (sql) => sql<{ readonly count: number }>`
            select count(*)::int as count from level_visit
            where campaign_id = ${table} and level_id = ${level.id}
          `,
        );
        expect(count[0]!.count).toBe(1);
      }),
    );

    it.effect("refuses another account's level as NotFound, writing nothing", () =>
      Effect.gen(function* () {
        const { jo, table, wrensLevel } = yield* Fixture;
        expect(
          yield* refusal(jo.token, (client) =>
            client.levelVisits.open({
              params: { campaignId: table },
              payload: { levelId: wrensLevel.id },
            }),
          ),
        ).toBe("NotFound");
        const count = yield* sql(
          (sql) => sql<{ readonly count: number }>`
            select count(*)::int as count from level_visit where level_id = ${wrensLevel.id}
          `,
        );
        expect(count[0]!.count).toBe(0);
        // Nor can a statement that bypasses the repository name it: the
        // owner key refuses a level that is not the campaign's creator's.
        expect(
          yield* violated(
            (sql) => sql`
              insert into level_visit (
                campaign_id, level_id, level_owner_id, name,
                board_columns, board_rows, feet_per_cell, ambient, floor
              )
              select ${table}, level.id, level.account_id, level.name,
                     level.columns, level.rows, level.feet_per_cell, level.ambient, level.floor
              from level where level.id = ${wrensLevel.id}
            `,
          ),
        ).toBe("level_visit_level_owner_fkey");
      }),
    );
  });

  describe("is the creator's alone", () => {
    it.effect("answers a seated player and a stranger NotFound at every route", () =>
      Effect.gen(function* () {
        const { jo, ilse, bo, table } = yield* Fixture;
        const level = yield* aHall("Not Yours");
        const visit = yield* openAt(jo.token, table, level.id);
        yield* as(jo.token, (client) =>
          client.levelVisits.putOnTable({
            params: { campaignId: table },
            payload: { visitId: visit.id },
          }),
        );
        const other = yield* aHall("Not Yours Either");

        for (const person of [ilse, bo]) {
          const routes = [
            yield* refusal(person.token, (client) =>
              client.levelVisits.list({ params: { campaignId: table } }),
            ),
            yield* refusal(person.token, (client) =>
              client.levelVisits.findById({ params: { campaignId: table, visitId: visit.id } }),
            ),
            yield* refusal(person.token, (client) =>
              client.levelVisits.open({
                params: { campaignId: table },
                payload: { levelId: other.id },
              }),
            ),
            yield* refusal(person.token, (client) =>
              client.levelVisits.putOnTable({
                params: { campaignId: table },
                payload: { visitId: visit.id },
              }),
            ),
            yield* refusal(person.token, (client) =>
              client.levelVisits.takeOffTable({ params: { campaignId: table } }),
            ),
            yield* refusal(person.token, (client) =>
              client.levelVisits.remove({ params: { campaignId: table, visitId: visit.id } }),
            ),
          ];
          expect(routes).toEqual(Array.from({ length: 6 }, () => "NotFound"));
        }
        // Nothing moved: the visit is there, still on the table, and nobody
        // opened the other level.
        expect((yield* visitOf(jo.token, table, visit.id)).onTable).toBe(true);
        expect((yield* rowsOf(visit.id)).visit).toBe(1);
        const opened = yield* sql(
          (sql) => sql<{ readonly count: number }>`
            select count(*)::int as count from level_visit where level_id = ${other.id}
          `,
        );
        expect(opened[0]!.count).toBe(0);
      }),
    );

    it.effect("answers another campaign's visit NotFound, even to its own creator", () =>
      Effect.gen(function* () {
        const { jo, wren, table, wrensTable, wrensLevel } = yield* Fixture;
        const wrens = yield* openAt(wren.token, wrensTable, wrensLevel.id);
        // Wren is the creator of her table, not Jo's: through Jo's table's path
        // her own visit is nothing.
        expect(
          yield* refusal(wren.token, (client) =>
            client.levelVisits.findById({ params: { campaignId: table, visitId: wrens.id } }),
          ),
        ).toBe("NotFound");
        // And Jo cannot put it on his table, by the route or by a statement.
        expect(
          yield* refusal(jo.token, (client) =>
            client.levelVisits.putOnTable({
              params: { campaignId: table },
              payload: { visitId: wrens.id },
            }),
          ),
        ).toBe("NotFound");
        expect(
          yield* violated(
            (sql) => sql`update campaign set table_visit_id = ${wrens.id} where id = ${table}`,
          ),
        ).toBe("campaign_table_visit_fkey");
      }),
    );
  });

  describe("the table", () => {
    it.effect("has one visit on it at a time, put on, replaced and taken off", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const upper = yield* openAt(jo.token, table, (yield* aHall("Upper")).id);
        const lower = yield* openAt(jo.token, table, (yield* aHall("Lower")).id);

        const on = yield* as(jo.token, (client) =>
          client.levelVisits.putOnTable({
            params: { campaignId: table },
            payload: { visitId: upper.id },
          }),
        );
        expect(on.onTable).toBe(true);
        expect(yield* tableVisitOf(table)).toBe(upper.id);

        yield* as(jo.token, (client) =>
          client.levelVisits.putOnTable({
            params: { campaignId: table },
            payload: { visitId: lower.id },
          }),
        );
        expect((yield* visitOf(jo.token, table, upper.id)).onTable).toBe(false);
        expect((yield* visitOf(jo.token, table, lower.id)).onTable).toBe(true);
        const listed = yield* as(jo.token, (client) =>
          client.levelVisits.list({ params: { campaignId: table } }),
        );
        expect(listed.filter((one) => one.onTable).map((one) => one.id)).toEqual([lower.id]);

        yield* as(jo.token, (client) =>
          client.levelVisits.takeOffTable({ params: { campaignId: table } }),
        );
        expect(yield* tableVisitOf(table)).toBeNull();
        expect((yield* visitOf(jo.token, table, lower.id)).onTable).toBe(false);
      }),
    );
  });

  describe("Reset level", () => {
    it.effect("deletes the visit, its parts and its tokens, and takes it off the table", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const level = yield* aHall("Reset Me");
        const visit = yield* openAt(jo.token, table, level.id);
        yield* as(jo.token, (client) =>
          client.levelVisits.putOnTable({
            params: { campaignId: table },
            payload: { visitId: visit.id },
          }),
        );
        expect(yield* rowsOf(visit.id)).toEqual({
          visit: 1,
          wall: 4,
          prop: 1,
          light: 1,
          region: 1,
          token: 1,
        });

        yield* as(jo.token, (client) =>
          client.levelVisits.remove({ params: { campaignId: table, visitId: visit.id } }),
        );
        expect(yield* rowsOf(visit.id)).toEqual({
          visit: 0,
          wall: 0,
          prop: 0,
          light: 0,
          region: 0,
          token: 0,
        });
        expect(yield* tableVisitOf(table)).toBeNull();
        expect(
          yield* refusal(jo.token, (client) =>
            client.levelVisits.findById({ params: { campaignId: table, visitId: visit.id } }),
          ),
        ).toBe("NotFound");
        // And the level can be visited afresh.
        const fresh = yield* openAt(jo.token, table, level.id);
        expect(fresh.id).not.toBe(visit.id);
      }),
    );

    it.effect("is refused while a live fight borrows the visit; an ended one keeps its copy", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const level = yield* aHall("Borrowed");
        const visit = yield* openAt(jo.token, table, level.id);
        const sessionId = yield* night(table);
        const encounter = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table },
            payload: { name: "In the borrowed hall", ready: true, levelId: level.id },
          }),
        );
        const fight = yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table, sessionId },
            payload: { encounterId: encounter.id },
          }),
        );
        // No shipped write borrows a visit yet (the fight's start learns it
        // in a later phase), so the pointer is set as that start will set it.
        yield* sql(
          (sql) =>
            sql`update encounter_run set level_visit_id = ${visit.id} where id = ${fight.id}`,
        );
        const params = { campaignId: table, sessionId, runId: fight.id };

        const refused = yield* failure(jo.token, (client) =>
          client.levelVisits.remove({ params: { campaignId: table, visitId: visit.id } }),
        );
        expect(refused.tag).toBe("Conflict");
        expect(refused.message).toContain("end it before resetting the level");
        expect((yield* rowsOf(visit.id)).visit).toBe(1);

        // A second live fight on the same visit is unrepresentable.
        const another = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table },
            payload: { name: "Also in the hall", ready: true, levelId: level.id },
          }),
        );
        // On another night: a night has one fight on the table at a time.
        const otherNight = yield* night(table);
        const second = yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table, sessionId: otherNight },
            payload: { encounterId: another.id },
          }),
        );
        expect(
          yield* violated(
            (sql) => sql`
              update encounter_run set level_visit_id = ${visit.id} where id = ${second.id}
            `,
          ),
        ).toBe("encounter_run_level_visit_live");
        yield* as(jo.token, (client) =>
          client.runs.end({
            params: { campaignId: table, sessionId: otherNight, runId: second.id },
            payload: {},
          }),
        );

        yield* as(jo.token, (client) => client.runs.end({ params, payload: {} }));
        const board = yield* as(jo.token, (client) => client.runs.board({ params }));
        yield* as(jo.token, (client) =>
          client.levelVisits.remove({ params: { campaignId: table, visitId: visit.id } }),
        );
        expect(yield* as(jo.token, (client) => client.runs.board({ params }))).toEqual(board);
        const pointer = yield* sql(
          (sql) => sql<{ readonly level_visit_id: string | null }>`
            select level_visit_id from encounter_run where id = ${fight.id}
          `,
        );
        expect(pointer[0]!.level_visit_id).toBeNull();
        yield* as(jo.token, (client) =>
          client.sessions.update({
            params: { campaignId: table, sessionId },
            payload: { endedAt: DateTime.nowUnsafe() },
          }),
        );
      }),
    );
  });

  describe("is a copy", () => {
    it.effect("outlives its level's delete, and an edit to the level never moves it", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const level = yield* aHall("Short-lived");
        const visit = yield* openAt(jo.token, table, level.id);
        yield* as(jo.token, (client) =>
          client.libraryLevels.save({
            params: { levelId: level.id },
            payload: { ...hall(level, "Short-lived"), ambient: "bright", walls: [] },
          }),
        );
        expect(yield* visitOf(jo.token, table, visit.id)).toEqual(visit);

        yield* as(jo.token, (client) =>
          client.libraryLevels.remove({ params: { levelId: level.id } }),
        );
        const after = yield* visitOf(jo.token, table, visit.id);
        expect(after.levelId).toBeNull();
        expect({ ...after, levelId: visit.levelId }).toEqual(visit);
      }),
    );
  });

  describe("a placed creature's squares", () => {
    it.effect("hold one per instance, go with a lowered count, and clear with the level", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const level = yield* aHall("Placed");
        const goblin = yield* as(jo.token, (client) =>
          client.library.create({
            payload: { name: "Goblin", size: "Small", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
          }),
        );
        const encounter = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table },
            payload: { name: "Ambush", levelId: level.id },
          }),
        );
        const line = yield* as(jo.token, (client) =>
          client.encounterCreatures.create({
            params: { campaignId: table, encounterId: encounter.id },
            payload: { creatureId: goblin.id, count: 3 },
          }),
        );
        // No shipped write places a creature yet (the builder learns it in a
        // later phase), so the squares are written as it will write them.
        const place = (ordinal: number) =>
          violated(
            (sql) => sql`
              insert into encounter_creature_spot
                (encounter_creature_id, count, ordinal, board_column, board_row)
              select id, count, ${ordinal}, 6, ${ordinal} from encounter_creature
              where id = ${line.id}
            `,
          );
        const spots = sql(
          (sql) => sql<{ readonly ordinal: number }>`
            select ordinal from encounter_creature_spot
            where encounter_creature_id = ${line.id} order by ordinal
          `,
        ).pipe(Effect.map((rows) => rows.map((row) => row.ordinal)));

        expect([yield* place(0), yield* place(1), yield* place(2)]).toEqual([
          "none",
          "none",
          "none",
        ]);
        // There is no fourth goblin to stand anywhere.
        expect(yield* place(3)).toBe("encounter_creature_spot_instance");

        yield* as(jo.token, (client) =>
          client.encounterCreatures.update({
            params: { campaignId: table, encounterId: encounter.id, encounterCreatureId: line.id },
            payload: { count: 2 },
          }),
        );
        expect(yield* spots).toEqual([0, 1]);

        // The same level again is no change; another level clears them.
        yield* as(jo.token, (client) =>
          client.encounters.update({
            params: { campaignId: table, encounterId: encounter.id },
            payload: { levelId: level.id },
          }),
        );
        expect(yield* spots).toEqual([0, 1]);
        const elsewhere = yield* aHall("Elsewhere");
        yield* as(jo.token, (client) =>
          client.encounters.update({
            params: { campaignId: table, encounterId: encounter.id },
            payload: { levelId: elsewhere.id },
          }),
        );
        expect(yield* spots).toEqual([]);

        // And deleting the level the encounter names clears them too.
        yield* place(0);
        expect(yield* spots).toEqual([0]);
        yield* as(jo.token, (client) =>
          client.libraryLevels.remove({ params: { levelId: elsewhere.id } }),
        );
        expect(yield* spots).toEqual([]);
      }),
    );
  });

  describe("a seat", () => {
    it.effect("leaving drops its token, and every visit it stood on looks again", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const pim = yield* aPerson("Pim");
        const quill = yield* aPerson("Quill");
        const campaignId = (yield* as(jo.token, (client) =>
          client.campaigns.create({ payload: { name: "The Short Stay", visibility: "shared" } }),
        )).id;
        yield* admittedTo(campaignId, pim.actor, "Pim");
        const pims = yield* aCharacterAt(campaignId, pim.actor, { name: "Pell", hpMax: 12 });
        const shown = yield* openAt(jo.token, campaignId, (yield* aHall("Shown")).id);
        const shelved = yield* openAt(jo.token, campaignId, (yield* aHall("Shelved")).id);
        yield* as(jo.token, (client) =>
          client.levelVisits.putOnTable({ params: { campaignId }, payload: { visitId: shown.id } }),
        );
        expect(shown.tokens.map((token) => token.seatId)).toEqual([pims.seatId]);
        expect(shown.partySees.length).toBeGreaterThan(0);

        // A seat joining while the visits stand gets a token on the one on the
        // table, and none on the other until it is put on
        // (`level-visit-players.test.ts`).
        yield* admittedTo(campaignId, quill.actor, "Quill");
        const quens = yield* aCharacterAt(campaignId, quill.actor, { name: "Quen", hpMax: 9 });
        expect(
          (yield* visitOf(jo.token, campaignId, shown.id)).tokens.map((token) => token.seatId),
        ).toEqual([pims.seatId, quens.seatId]);
        expect(
          (yield* visitOf(jo.token, campaignId, shelved.id)).tokens.map((token) => token.seatId),
        ).toEqual([pims.seatId]);

        yield* as(pim.token, (client) =>
          client.party.leave({ params: { campaignId, campaignCharacterId: pims.seatId } }),
        );
        const onTable = yield* visitOf(jo.token, campaignId, shown.id);
        expect(onTable.tokens.map((token) => token.seatId)).toEqual([quens.seatId]);
        // What the party saw stays seen.
        expect(onTable.partySeen).toEqual(expect.arrayContaining([...shown.partySeen]));
        // A visit off the table looks again too, so none keeps a view drawn
        // from a token that is gone.
        const offTable = yield* visitOf(jo.token, campaignId, shelved.id);
        expect(offTable.tokens).toEqual([]);
        expect(offTable.partySees).toEqual([]);
        expect(offTable.partySeen).toEqual(shelved.partySeen);
      }),
    );
  });

  describe("deleting the campaign", () => {
    it.effect("takes its visits, the one on the table included", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const campaignId = (yield* as(jo.token, (client) =>
          client.campaigns.create({ payload: { name: "The Last Night" } }),
        )).id;
        const visit = yield* openAt(jo.token, campaignId, (yield* aHall("Gone")).id);
        yield* as(jo.token, (client) =>
          client.levelVisits.putOnTable({ params: { campaignId }, payload: { visitId: visit.id } }),
        );
        yield* as(jo.token, (client) =>
          client.campaigns.deletePermanently({ params: { campaignId } }),
        );
        expect((yield* rowsOf(visit.id)).visit).toBe(0);
      }),
    );
  });
});
