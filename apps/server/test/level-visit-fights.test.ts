import { describe, expect } from "@effect/vitest";
import {
  type CampaignId,
  type Combatant,
  type EncounterRun,
  type Level,
  LevelPartId,
  type LevelSave,
  type LevelVisit,
  type LevelVisitId,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Deferred, Effect, Fiber, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, admittedTo, aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A fight borrows the level visit and hands it back** (`EncounterRuns.start`
 * and `end`, `levelFights.ts`' `borrowVisit` and `returnBoardState`,
 * `LevelVisits.handBack`): starting an encounter on the level whose visit is
 * on the table plays the fight on the dungeon as it stands, the party where
 * its tokens are and the monsters on their spots; a visit off the table
 * refuses the start; a level with no visit plays on a fresh copy; ending the
 * fight resolved writes the dungeon back; a carried fight hands back only
 * once its successor resolves; a deleted night hands nothing back; and every
 * table change is refused while the fight is on.
 *
 * Over the real application and Postgres, through the client derived from the
 * contract. Every person is minted the shipped way (`support/actors.ts`): Jo
 * creates each table; Ilse (Tamsin) is admitted through a real invitation
 * with a shared seat; Bo is a stranger.
 */

const database = migratedDatabase("taverns_test_level_visit_fights");
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

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

const part = (n: number) =>
  Schema.decodeSync(LevelPartId)(`1e7e3300-0000-4000-8000-${String(n).padStart(12, "0")}`);

const SECRET = part(1);
const DOOR = part(2);
const TORCH = part(5);
const TRAP = part(10);

const COLUMNS = 8;
const ROWS = 4;
const at = (column: number, row: number, columns = COLUMNS) => row * columns + column;

/**
 * Eight squares by four of flagstone, dim. A wall down x = 4 parts the west
 * room (columns 0 to 3) from the east: a secret door at row 0, a closed door
 * at row 1, wall below. A torch in the west, a lamp in the east, a secret
 * trap at (6, 3), a crate at (0, 3) unless `crate` is false, and the way in
 * at (0, 0) and (0, 1). `columns` widens the board eastward.
 */
const hall = (
  level: Level,
  over: { readonly columns?: number; readonly crate?: boolean } = {},
): LevelSave => {
  const columns = over.columns ?? COLUMNS;
  return {
    name: level.name,
    description: null,
    columns,
    rows: ROWS,
    feetPerCell: 5,
    ambient: "dim",
    floor: Array.from({ length: columns * ROWS }, () => 1),
    walls: [
      {
        id: SECRET,
        x1: 4,
        y1: 0,
        x2: 4,
        y2: 1,
        kind: "secretDoor",
        doorState: "closed",
        low: false,
      },
      { id: DOOR, x1: 4, y1: 1, x2: 4, y2: 2, kind: "door", doorState: "closed", low: false },
      { id: part(3), x1: 4, y1: 2, x2: 4, y2: 4, kind: "wall", doorState: null, low: false },
    ],
    props:
      over.crate === false
        ? []
        : [
            {
              id: part(12),
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
      { id: TORCH, x: 1.5, y: 1.5, bright: 20, dim: 20, tone: "fire", flicker: true, lit: true },
      {
        id: part(6),
        x: columns - 1.5,
        y: 1.5,
        bright: 20,
        dim: 20,
        tone: "fire",
        flicker: false,
        lit: true,
      },
    ],
    regions: [
      {
        id: part(11),
        kind: "entry",
        squares: [at(0, 0, columns), at(0, 1, columns)],
        secret: false,
      },
      { id: TRAP, kind: "trap", squares: [at(columns - 2, 3, columns)], secret: true },
    ],
    version: level.version,
  };
};

const makePeople = Effect.gen(function* () {
  return { jo: yield* aPerson("Jo"), ilse: yield* aPerson("Ilse"), bo: yield* aPerson("Bo") };
}).pipe(Effect.orDie);

class People extends Context.Service<People, Effect.Success<typeof makePeople>>()(
  "level-visit-fights.test/People",
) {}

const shared = Layer.effect(People)(makePeople).pipe(Layer.provideMerge(application));

let tables = 0;

/** A new table of Jo's, shared, with Ilse seating Tamsin in a shared seat. */
const aTable = Effect.gen(function* () {
  const { jo, ilse } = yield* People;
  tables += 1;
  const campaignId = (yield* as(jo.token, (client) =>
    client.campaigns.create({
      payload: { name: `The Deep Road ${String(tables)}`, visibility: "shared" },
    }),
  )).id;
  yield* admittedTo(campaignId, ilse.actor, "Ilse");
  yield* aCharacterAt(
    campaignId,
    ilse.actor,
    { name: "Tamsin", hpMax: 30 },
    { seatVisibility: "shared" },
  );
  return campaignId;
});

let levels = 0;

/** A new level of Jo's, saved as `hall`. */
const aHall = (over: Parameters<typeof hall>[1] = {}) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    levels += 1;
    const made = yield* as(jo.token, (client) =>
      client.libraryLevels.create({
        payload: {
          name: `Undercroft ${String(levels)}`,
          columns: over.columns ?? COLUMNS,
          rows: ROWS,
        },
      }),
    );
    return yield* as(jo.token, (client) =>
      client.libraryLevels.save({ params: { levelId: made.id }, payload: hall(made, over) }),
    );
  });

/** The level saved again as `hall` with `over`. */
const resave = (level: Level, over: Parameters<typeof hall>[1]) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.libraryLevels.save({ params: { levelId: level.id }, payload: hall(level, over) }),
    );
  });

/** An encounter on the level with a roster line of `count` goblins. */
const anAmbush = (campaignId: CampaignId, level: Level, count = 2, name = "Ambush") =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    const goblin = yield* as(jo.token, (client) =>
      client.library.create({
        payload: { name: "Goblin", size: "Small", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
      }),
    );
    const encounter = yield* as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId },
        payload: {
          name,
          ready: true,
          levelId: level.id,
          creatures: [{ creatureId: goblin.id, count }],
        },
      }),
    );
    const lines = yield* as(jo.token, (client) =>
      client.encounterCreatures.list({ params: { campaignId, encounterId: encounter.id } }),
    );
    return { encounter, line: lines[0]!.id };
  });

/** A night at the table, started, shared and made the campaign's current one. */
const openNight = (campaignId: CampaignId) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    const number = (yield* as(jo.token, (client) =>
      client.sessions.list({ params: { campaignId } }),
    )).length;
    const session = yield* as(jo.token, (client) =>
      client.sessions.create({ params: { campaignId }, payload: { number: number + 1 } }),
    );
    yield* as(jo.token, (client) =>
      client.sessions.update({
        params: { campaignId, sessionId: session.id },
        payload: { startedAt: DateTime.nowUnsafe(), visibility: "shared" },
      }),
    );
    yield* as(jo.token, (client) =>
      client.campaigns.update({
        params: { campaignId },
        payload: { currentSessionId: session.id },
      }),
    );
    return session.id as SessionId;
  });

const endNight = (campaignId: CampaignId, sessionId: SessionId) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    yield* as(jo.token, (client) =>
      client.sessions.update({
        params: { campaignId, sessionId },
        payload: { endedAt: DateTime.nowUnsafe() },
      }),
    );
  });

const openVisit = (campaignId: CampaignId, level: Level) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.levelVisits.open({ params: { campaignId }, payload: { levelId: level.id } }),
    );
  });

const putOnTable = (campaignId: CampaignId, visit: { readonly id: LevelVisitId }) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.levelVisits.putOnTable({ params: { campaignId }, payload: { visitId: visit.id } }),
    );
  });

const dmVisit = (campaignId: CampaignId, visit: { readonly id: LevelVisitId }) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.levelVisits.findById({ params: { campaignId, visitId: visit.id } }),
    );
  });

const start = (
  campaignId: CampaignId,
  sessionId: SessionId,
  encounterId: EncounterRun["encounterId"] & string,
) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId, sessionId },
        payload: { encounterId, visibility: "shared" },
      }),
    );
  });

const endRun = (campaignId: CampaignId, run: EncounterRun) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.runs.end({
        params: { campaignId, sessionId: run.sessionId, runId: run.id },
        payload: {},
      }),
    );
  });

const combatantsOf = (campaignId: CampaignId, run: EncounterRun) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.combatants.list({
        params: { campaignId, sessionId: run.sessionId, runId: run.id },
      }),
    );
  });

const boardOf = (campaignId: CampaignId, run: EncounterRun) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.runs.board({ params: { campaignId, sessionId: run.sessionId, runId: run.id } }),
    );
  });

const square = (combatant: Combatant) => combatant.position;

/** The visit's log lines as `kind:visibility`, in order. */
const linesOf = (visitId: LevelVisitId) =>
  Effect.map(
    sql(
      (sql) => sql<{ readonly kind: string; readonly visibility: string }>`
        select kind, visibility from session_event
        where level_visit_id = ${visitId} order by seq
      `,
    ),
    (lines) => lines.map((line) => `${line.kind}:${line.visibility}`),
  );

const seenOf = (table: "level_visit" | "encounter_run_board", key: string, id: string) =>
  Effect.map(
    sql(
      (sql) => sql<{ readonly party_seen: ReadonlyArray<number> | null }>`
        select party_seen from ${sql(table)} where ${sql(key)} = ${id}
      `,
    ),
    (rows) => rows[0]?.party_seen ?? [],
  );

const tamsinOf = (visit: LevelVisit) => visit.tokens.find((token) => token.name === "Tamsin")!;

/**
 * A table with the level's visit on it during an open night, Tamsin's token
 * moved to (2, 1), the door and the secret door opened, the trap revealed,
 * the torch snuffed and the far corner fogged: a dungeon the party has
 * changed.
 */
const explored = (over: Parameters<typeof hall>[1] = {}) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    const table = yield* aTable;
    const level = yield* aHall(over);
    const opened = yield* openVisit(table, level);
    yield* putOnTable(table, opened);
    const sessionId = yield* openNight(table);
    const on = { campaignId: table, visitId: opened.id };
    yield* as(jo.token, (client) =>
      client.levelVisits.moveToken({
        params: { ...on, seatId: tamsinOf(opened).seatId },
        payload: { position: { column: 2, row: 1 } },
      }),
    );
    yield* as(jo.token, (client) =>
      client.levelVisits.updateDoor({
        params: { ...on, wallId: DOOR },
        payload: { doorState: "open" },
      }),
    );
    yield* as(jo.token, (client) =>
      client.levelVisits.updateDoor({
        params: { ...on, wallId: SECRET },
        payload: { revealed: true, doorState: "open" },
      }),
    );
    yield* as(jo.token, (client) =>
      client.levelVisits.updateRegion({
        params: { ...on, regionId: TRAP },
        payload: { revealed: true },
      }),
    );
    yield* as(jo.token, (client) =>
      client.levelVisits.updateLight({
        params: { ...on, lightId: TORCH },
        payload: { lit: false },
      }),
    );
    const visit = yield* as(jo.token, (client) =>
      client.levelVisits.updateFog({
        params: on,
        payload: { hide: [{ column: 7, row: 0 }] },
      }),
    );
    return { table, level, visit, sessionId };
  });

describeLayer("level-visit-fights", shared, (it) => {
  describe("starting on the visit on the table", () => {
    it.effect("copies the dungeon as it stands, and seats the party and the monsters", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const { table, level, visit, sessionId } = yield* explored();
        const { encounter, line } = yield* anAmbush(table, level);
        yield* as(jo.token, (client) =>
          client.encounters.place({
            params: { campaignId: table, encounterId: encounter.id },
            payload: {
              spots: [
                { encounterCreatureId: line, ordinal: 0, column: 6, row: 1 },
                { encounterCreatureId: line, ordinal: 1, column: 6, row: 2 },
              ],
              trigger: null,
            },
          }),
        );

        const run = yield* start(table, sessionId, encounter.id);
        expect(run.levelVisitId).toBe(visit.id);

        const board = (yield* boardOf(table, run))!;
        expect(board.columns).toBe(visit.columns);
        expect(board.level).toEqual(visit.level);
        const walls = new Map(board.level!.walls.map((wall) => [wall.id, wall]));
        expect(walls.get(DOOR)!.doorState).toBe("open");
        expect(walls.get(SECRET)).toMatchObject({ revealed: true, doorState: "open" });
        expect(board.level!.lights.find((light) => light.id === TORCH)!.lit).toBe(false);
        expect(board.level!.regions.find((region) => region.id === TRAP)!.revealed).toBe(true);
        expect(board.fog).toEqual([{ column: 7, row: 0 }]);
        const seen = new Set(yield* seenOf("encounter_run_board", "run_id", run.id));
        for (const square of visit.partySeen) expect(seen.has(square)).toBe(true);

        const combatants = yield* combatantsOf(table, run);
        expect(square(combatants.find((row) => row.displayName === "Tamsin")!)).toEqual({
          column: 2,
          row: 1,
        });
        expect(
          combatants
            .filter((row) => row.kind === "npc")
            .map(square)
            .sort((a, b) => a!.row - b!.row),
        ).toEqual([
          { column: 6, row: 1 },
          { column: 6, row: 2 },
        ]);
        // Seeded one after another, a line's instances in ordinal order: the
        // order a token's number follows (`tokenLabels`, by `createdAt`), so the
        // placed Goblin 2 is G2 in the fight as it was on the level.
        const byAge = [...combatants].sort(
          (a, b) => a.createdAt.epochMilliseconds - b.createdAt.epochMilliseconds,
        );
        expect(new Set(byAge.map((row) => row.createdAt.epochMilliseconds)).size).toBe(
          combatants.length,
        );
        expect(byAge.filter((row) => row.kind === "npc").map(square)).toEqual([
          { column: 6, row: 1 },
          { column: 6, row: 2 },
        ]);

        const borrowed = yield* dmVisit(table, visit);
        expect(borrowed.fight).toEqual({
          runId: run.id,
          sessionId,
          name: "Ambush",
          carried: false,
        });
        // Played, so no longer waiting on the level.
        expect(borrowed.encounters).toEqual([]);
        expect(yield* linesOf(visit.id)).toContain("run-started:shared");
        yield* endRun(table, run);
      }),
    );

    it.effect("falls back to the edges for a spot it cannot use and a seat with no token", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const table = yield* aTable;
        // The visit is opened from a six-wide level with its crate; the level
        // is then widened and loses the crate, so a spot can be placed past
        // the visit's edge and on the crate's square.
        const level = yield* aHall({ columns: 6 });
        const visit = yield* openVisit(table, level);
        yield* putOnTable(table, visit);
        const sessionId = yield* openNight(table);
        const wider = yield* resave(level, { columns: COLUMNS, crate: false });
        const { encounter, line } = yield* anAmbush(table, wider, 3);
        const tamsin = tamsinOf(visit);
        yield* as(jo.token, (client) =>
          client.encounters.place({
            params: { campaignId: table, encounterId: encounter.id },
            payload: {
              spots: [
                // Past the visit's six columns.
                { encounterCreatureId: line, ordinal: 0, column: 7, row: 2 },
                // The visit's copy still has the crate here.
                { encounterCreatureId: line, ordinal: 1, column: 0, row: 3 },
                // Where Tamsin stands.
                {
                  encounterCreatureId: line,
                  ordinal: 2,
                  column: tamsin.column,
                  row: tamsin.row,
                },
              ],
              trigger: null,
            },
          }),
        );
        const run = yield* start(table, sessionId, encounter.id);
        const combatants = yield* combatantsOf(table, run);
        for (const row of combatants) {
          expect(row.position?.column).not.toBeNull();
          expect(row.position!.column).toBeLessThan(6);
          expect(row.position!.column === 0 && row.position?.row === 3).toBe(false);
        }
        // Tamsin on her token; every goblin down the right edge instead.
        expect(square(combatants.find((row) => row.kind === "pc")!)).toEqual({
          column: tamsin.column,
          row: tamsin.row,
        });
        const goblins = combatants.filter((row) => row.kind === "npc");
        expect(goblins.map((row) => row.position?.column)).toEqual([5, 5, 5]);
        expect(new Set(goblins.map((row) => row.position?.row)).size).toBe(3);
        yield* endRun(table, run);
      }),
    );

    it.effect("stands a seat with no token on the visit down the left edge", () =>
      Effect.gen(function* () {
        const { table, level, visit, sessionId } = yield* explored();
        const { encounter } = yield* anAmbush(table, level, 1);
        // None of the shipped writes leaves a live seat without a token on
        // the visit on the table, so the token is taken away by hand.
        yield* sql(
          (sql) => sql`
            delete from level_visit_token
            where visit_id = ${visit.id} and seat_id = ${tamsinOf(visit).seatId}
          `,
        );
        const run = yield* start(table, sessionId, encounter.id);
        const combatants = yield* combatantsOf(table, run);
        expect(combatants.find((row) => row.kind === "pc")!.position?.column).toBe(0);
        expect(combatants.find((row) => row.kind === "npc")!.position?.column).toBe(COLUMNS - 1);
        yield* endRun(table, run);
      }),
    );

    it.effect("is refused while the level's visit is off the table, saying what to do", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const table = yield* aTable;
        const level = yield* aHall();
        const visit = yield* openVisit(table, level);
        const other = yield* openVisit(table, yield* aHall());
        const sessionId = yield* openNight(table);
        const { encounter } = yield* anAmbush(table, level);
        const params = { campaignId: table, sessionId };

        for (const tabled of [null, other] as const) {
          if (tabled !== null) yield* putOnTable(table, tabled);
          const refused = yield* failure(jo.token, (client) =>
            client.runs.start({ params, payload: { encounterId: encounter.id } }),
          );
          expect(refused.tag).toBe("Conflict");
          expect(refused.message).toContain(`put ${visit.name} on the table first, or reset it`);
        }
        const runs = yield* as(jo.token, (client) => client.runs.list({ params }));
        expect(runs).toEqual([]);

        // Neither a player nor a stranger learns anything of it.
        const { ilse, bo } = yield* People;
        for (const person of [ilse, bo]) {
          const hidden = yield* failure(person.token, (client) =>
            client.runs.start({ params, payload: { encounterId: encounter.id } }),
          );
          expect(hidden.tag).toBe("NotFound");
        }
      }),
    );

    it.effect("plays a level with no visit on a fresh copy, its creatures on their spots", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const table = yield* aTable;
        const level = yield* aHall();
        const sessionId = yield* openNight(table);
        const { encounter, line } = yield* anAmbush(table, level, 1);
        yield* as(jo.token, (client) =>
          client.encounters.place({
            params: { campaignId: table, encounterId: encounter.id },
            payload: {
              spots: [{ encounterCreatureId: line, ordinal: 0, column: 5, row: 2 }],
              trigger: null,
            },
          }),
        );
        const run = yield* start(table, sessionId, encounter.id);
        expect(run.levelVisitId).toBeNull();
        const board = (yield* boardOf(table, run))!;
        expect(board.level!.walls.find((wall) => wall.id === DOOR)!.doorState).toBe("closed");
        expect(board.fog).toEqual([]);
        const combatants = yield* combatantsOf(table, run);
        expect(square(combatants.find((row) => row.kind === "npc")!)).toEqual({
          column: 5,
          row: 2,
        });
        // The party down the left edge, as a level fight always seeded it.
        expect(combatants.find((row) => row.kind === "pc")!.position?.column).toBe(0);
        yield* endRun(table, run);
      }),
    );
  });

  describe("while the fight is on", () => {
    it.effect("refuses every change to the dungeon and the table with a Conflict", () =>
      Effect.gen(function* () {
        const { jo, ilse } = yield* People;
        const { table, level, visit, sessionId } = yield* explored();
        const other = yield* openVisit(table, yield* aHall());
        const { encounter } = yield* anAmbush(table, level);
        const run = yield* start(table, sessionId, encounter.id);
        const on = { campaignId: table, visitId: visit.id };

        const refused = [
          yield* failure(jo.token, (client) =>
            client.levelVisits.putOnTable({
              params: { campaignId: table },
              payload: { visitId: other.id },
            }),
          ),
          yield* failure(jo.token, (client) =>
            client.levelVisits.takeOffTable({ params: { campaignId: table } }),
          ),
          yield* failure(jo.token, (client) => client.levelVisits.remove({ params: on })),
          yield* failure(jo.token, (client) =>
            client.levelVisits.moveToken({
              params: { ...on, seatId: tamsinOf(visit).seatId },
              payload: { position: { column: 1, row: 1 } },
            }),
          ),
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateDoor({
              params: { ...on, wallId: DOOR },
              payload: { doorState: "closed" },
            }),
          ),
        ];
        for (const one of refused) expect(one.tag).toBe("Conflict");
        expect(refused[0]!.message).toContain("end it before putting another level on the table");
        expect(refused[1]!.message).toContain("end it before taking the level off the table");
        expect(refused[2]!.message).toContain("end it before resetting the level");

        // The player's own walk is refused the same way, and their table
        // plays the fight, not the visit.
        const walk = yield* failure(ilse.token, (client) =>
          client.table.moveOnVisit({
            params: { campaignId: table, visitId: visit.id, seatId: tamsinOf(visit).seatId },
            payload: { position: { column: 1, row: 1 } },
          }),
        );
        expect(walk.tag).toBe("Conflict");
        const during = yield* as(ilse.token, (client) =>
          client.table.read({ params: { campaignId: table } }),
        );
        expect(during!.visit).toBeNull();
        expect(during!.fight!.id).toBe(run.id);

        // Visit still on the table and the other one never put on it.
        expect((yield* dmVisit(table, visit)).onTable).toBe(true);
        expect((yield* dmVisit(table, other)).onTable).toBe(false);

        yield* endRun(table, run);
        const after = yield* as(ilse.token, (client) =>
          client.table.read({ params: { campaignId: table } }),
        );
        expect(after!.fight).toBeNull();
        expect(after!.visit!.id).toBe(visit.id);
        // And the table may change again.
        yield* putOnTable(table, other);
      }),
    );
  });

  describe("handing back", () => {
    it.effect("writes the fight's dungeon and the party's squares back when it resolves", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const { table, level, visit, sessionId } = yield* explored();
        const { encounter } = yield* anAmbush(table, level);
        const run = yield* start(table, sessionId, encounter.id);
        const params = { campaignId: table, sessionId, runId: run.id };
        const tamsin = (yield* combatantsOf(table, run)).find((row) => row.kind === "pc")!;

        // In the fight: Tamsin goes through the door to (5, 1), then the
        // door is shut behind her and the torch lit again.
        yield* as(jo.token, (client) =>
          client.combatants.move({
            params: { ...params, combatantId: tamsin.id },
            payload: { position: { column: 5, row: 1 } },
          }),
        );
        yield* as(jo.token, (client) =>
          client.runs.updateDoor({
            params: { ...params, wallId: DOOR },
            payload: { doorState: "closed" },
          }),
        );
        yield* as(jo.token, (client) =>
          client.runs.updateLight({
            params: { ...params, lightId: TORCH },
            payload: { lit: true },
          }),
        );
        yield* as(jo.token, (client) =>
          client.runs.updateFog({ params, payload: { reveal: [{ column: 7, row: 0 }] } }),
        );
        const fightSeen = yield* seenOf("encounter_run_board", "run_id", run.id);
        const before = yield* linesOf(visit.id);

        yield* endRun(table, run);
        const back = yield* dmVisit(table, visit);
        expect(back.fight).toBeNull();
        expect(back.level.walls.find((wall) => wall.id === DOOR)!.doorState).toBe("closed");
        expect(back.level.walls.find((wall) => wall.id === SECRET)!.revealed).toBe(true);
        expect(back.level.lights.find((light) => light.id === TORCH)!.lit).toBe(true);
        expect(back.level.regions.find((region) => region.id === TRAP)!.revealed).toBe(true);
        expect(back.fog).toEqual([]);
        expect(tamsinOf(back)).toMatchObject({ column: 5, row: 1 });
        const seen = new Set(back.partySeen);
        for (const square of [...visit.partySeen, ...fightSeen])
          expect(seen.has(square)).toBe(true);
        // The party looks again from where it stands now: the east room.
        expect(back.partySees).toContain(at(5, 1));

        const lines = (yield* linesOf(visit.id)).slice(before.length);
        expect(lines).toContain("visit-returned:shared");
        expect(lines.filter((line) => line.startsWith("visit-returned"))).toHaveLength(1);
        // Ending again hands nothing back twice.
        yield* endRun(table, run);
        expect((yield* linesOf(visit.id)).slice(before.length)).toEqual(lines);
      }),
    );

    it.effect("hands a carried fight back only once its successor resolves", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const { table, level, visit, sessionId } = yield* explored();
        const { encounter } = yield* anAmbush(table, level);
        const first = yield* start(table, sessionId, encounter.id);
        const tamsin = (yield* combatantsOf(table, first)).find((row) => row.kind === "pc")!;
        yield* as(jo.token, (client) =>
          client.combatants.move({
            params: { campaignId: table, sessionId, runId: first.id, combatantId: tamsin.id },
            payload: { position: { column: 3, row: 2 } },
          }),
        );
        yield* endNight(table, sessionId);

        // Carried: nothing handed back, and the visit is still the fight's.
        const carried = yield* dmVisit(table, visit);
        expect(carried.fight).toEqual({
          runId: first.id,
          sessionId,
          name: "Ambush",
          carried: true,
        });
        expect(tamsinOf(carried)).toMatchObject({ column: 2, row: 1 });
        expect(
          (yield* linesOf(visit.id)).filter((line) => line.startsWith("visit-returned")),
        ).toEqual([]);

        const nextNight = yield* openNight(table);
        const resumed = yield* as(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: nextNight },
            payload: { continuedFrom: first.id },
          }),
        );
        expect(resumed.levelVisitId).toBe(visit.id);
        expect((yield* dmVisit(table, visit)).fight).toEqual({
          runId: resumed.id,
          sessionId: nextNight,
          name: "Ambush",
          carried: false,
        });

        yield* endRun(table, resumed);
        const back = yield* dmVisit(table, visit);
        expect(back.fight).toBeNull();
        expect(tamsinOf(back)).toMatchObject({ column: 3, row: 2 });
        expect(
          (yield* linesOf(visit.id)).filter((line) => line.startsWith("visit-returned")),
        ).toEqual(["visit-returned:shared"]);
      }),
    );

    it.effect("hands nothing back when the fight's night is deleted, and unfreezes the visit", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const { table, level, visit, sessionId } = yield* explored();
        const { encounter } = yield* anAmbush(table, level);
        const run = yield* start(table, sessionId, encounter.id);
        const tamsin = (yield* combatantsOf(table, run)).find((row) => row.kind === "pc")!;
        yield* as(jo.token, (client) =>
          client.combatants.move({
            params: { campaignId: table, sessionId, runId: run.id, combatantId: tamsin.id },
            payload: { position: { column: 3, row: 2 } },
          }),
        );
        yield* as(jo.token, (client) =>
          client.sessions.remove({ params: { campaignId: table, sessionId } }),
        );

        const after = yield* dmVisit(table, visit);
        expect(after.fight).toBeNull();
        const { updatedAt: _a, ...was } = visit;
        const { updatedAt: _b, ...now } = after;
        // The encounter is playable again, so it is listed as waiting.
        expect({ ...now, encounters: [] }).toEqual({ ...was, encounters: [] });
        // Unfrozen: the DM explores it again.
        yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { campaignId: table, visitId: visit.id, seatId: tamsinOf(visit).seatId },
            payload: { position: { column: 1, row: 1 } },
          }),
        );
      }),
    );

    it.effect("stands a seat that sat down while the fight held the visit", () =>
      Effect.gen(function* () {
        const { table, level, visit, sessionId } = yield* explored();
        const { encounter } = yield* anAmbush(table, level);
        const run = yield* start(table, sessionId, encounter.id);
        // Wren sits down mid-fight: the held visit gives the seat no token,
        // and nobody adds Pell to the fight.
        const wren = yield* aPerson("Wren").pipe(Effect.orDie);
        yield* admittedTo(table, wren.actor, "Wren");
        yield* aCharacterAt(
          table,
          wren.actor,
          { name: "Pell", hpMax: 20 },
          {
            seatVisibility: "shared",
          },
        );
        expect((yield* dmVisit(table, visit)).tokens.map((token) => token.name)).toEqual([
          "Tamsin",
        ]);

        yield* endRun(table, run);
        const back = yield* dmVisit(table, visit);
        expect(back.tokens.map((token) => token.name)).toEqual(["Tamsin", "Pell"]);
      }),
    );
  });

  /**
   * Two writes racing on one visit: a transaction of the test's own holds a
   * lock the way a write in flight would, and the real writes queue behind
   * it. Under `read committed` a statement that waited on a lock sees other
   * tables as they were when it began, so each write asks what holds the
   * visit only once it has the lock (`holdVisits`).
   */
  describe("racing", () => {
    /** Hold `lock` in a transaction until the answered `release` is run. */
    const holdOpen = <A>(lock: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
      Effect.gen(function* () {
        const client = yield* SqlClient.SqlClient;
        const held = yield* Deferred.make<void>();
        const go = yield* Deferred.make<void>();
        const fiber = yield* Effect.forkChild(
          client.withTransaction(
            Effect.gen(function* () {
              yield* lock(client);
              yield* Deferred.succeed(held, undefined);
              yield* Deferred.await(go);
            }),
          ),
        );
        yield* Deferred.await(held);
        return Effect.gen(function* () {
          yield* Deferred.succeed(go, undefined);
          yield* Fiber.join(fiber).pipe(Effect.orDie);
        });
      });

    const lockVisit = (visitId: LevelVisitId) => (sql: SqlClient.SqlClient) =>
      sql`select level_visit.id from level_visit where level_visit.id = ${visitId} for update`;

    /** A DM's call as `failure` answers it. */
    const byJo = <A, E extends { readonly _tag: string }>(
      call: (client: Client) => Effect.Effect<A, E>,
    ) =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        return yield* failure(jo.token, call);
      });

    const writes = [
      [
        "a token's move",
        (table: CampaignId, visit: LevelVisit) =>
          byJo((client) =>
            client.levelVisits.moveToken({
              params: { campaignId: table, visitId: visit.id, seatId: tamsinOf(visit).seatId },
              payload: { position: { column: 1, row: 1 } },
            }),
          ),
      ],
      [
        "taking it off the table",
        (table: CampaignId) =>
          byJo((client) => client.levelVisits.takeOffTable({ params: { campaignId: table } })),
      ],
      [
        "resetting it",
        (table: CampaignId, visit: LevelVisit) =>
          byJo((client) =>
            client.levelVisits.remove({ params: { campaignId: table, visitId: visit.id } }),
          ),
      ],
    ] as const;

    for (const [name, write] of writes) {
      it.effect(`refuses ${name} that waited on a fight's start`, () =>
        Effect.gen(function* () {
          const { table, level, visit, sessionId } = yield* explored();
          const { encounter } = yield* anAmbush(table, level);
          const release = yield* holdOpen(lockVisit(visit.id));
          // The start queues on the visit first, then the write behind it.
          const starting = yield* Effect.forkChild(start(table, sessionId, encounter.id));
          yield* Effect.sleep("300 millis");
          const writing = yield* Effect.forkChild(write(table, visit));
          yield* Effect.sleep("300 millis");
          expect(starting.pollUnsafe()).toBeUndefined();
          expect(writing.pollUnsafe()).toBeUndefined();
          yield* release;
          const run = yield* Fiber.join(starting);
          expect(run.levelVisitId).toBe(visit.id);
          expect((yield* Fiber.join(writing)).tag).toBe("Conflict");
          const after = yield* dmVisit(table, visit);
          expect(after.onTable).toBe(true);
          expect(after.fight?.runId).toBe(run.id);
          expect(tamsinOf(after)).toMatchObject({ column: 2, row: 1 });
          yield* endRun(table, run);
        }),
      );
    }

    it.effect("refuses a start while another visit is being put on the table", () =>
      Effect.gen(function* () {
        const { table, level, visit, sessionId } = yield* explored();
        const other = yield* openVisit(table, yield* aHall());
        const { encounter } = yield* anAmbush(table, level);
        // Putting the other visit on the table, in flight: the campaign row
        // written and not yet committed.
        const release = yield* holdOpen(
          (sql) => sql`
            update campaign set table_visit_id = ${other.id} where campaign.id = ${table}
          `,
        );
        const starting = yield* Effect.forkChild(
          byJo((client) =>
            client.runs.start({
              params: { campaignId: table, sessionId },
              payload: { encounterId: encounter.id, visibility: "shared" },
            }),
          ),
        );
        yield* Effect.sleep("300 millis");
        // The start waits on the table rather than borrowing a visit that is
        // leaving it.
        expect(starting.pollUnsafe()).toBeUndefined();
        yield* release;
        const refused = yield* Fiber.join(starting);
        expect(refused.tag).toBe("Conflict");
        expect(refused.message).toContain("it is not on the table");
        expect((yield* dmVisit(table, visit)).fight).toBeNull();
      }),
    );

    it.effect("refuses putting another visit on the table while a start is in flight", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const { table, level, visit, sessionId } = yield* explored();
        const other = yield* openVisit(table, yield* aHall());
        const { encounter } = yield* anAmbush(table, level);
        // A start in flight, in the shape `EncounterRuns.start` takes its
        // locks (`visitOfEncounter`): the visit, then its campaign `for
        // share`, then the fight borrowing it, not yet committed.
        const release = yield* holdOpen((sql) =>
          Effect.gen(function* () {
            yield* lockVisit(visit.id)(sql);
            yield* sql`select campaign.id from campaign where campaign.id = ${table} for share`;
            yield* sql`
              insert into encounter_run (session_id, encounter_id, encounter_name, level_visit_id)
              values (${sessionId}, ${encounter.id}, ${encounter.name}, ${visit.id})
            `;
          }),
        );
        const putting = yield* Effect.forkChild(
          failure(jo.token, (client) =>
            client.levelVisits.putOnTable({
              params: { campaignId: table },
              payload: { visitId: other.id },
            }),
          ),
        );
        yield* Effect.sleep("300 millis");
        expect(putting.pollUnsafe()).toBeUndefined();
        yield* release;
        const refused = yield* Fiber.join(putting);
        expect(refused.tag).toBe("Conflict");
        expect(refused.message).toContain("end it before putting another level on the table");
        expect((yield* dmVisit(table, visit)).onTable).toBe(true);
        expect((yield* dmVisit(table, other)).onTable).toBe(false);
      }),
    );

    it.effect("lets a seat leave while a write holds the visit, with no deadlock", () =>
      Effect.gen(function* () {
        const { ilse } = yield* People;
        const { table, visit } = yield* explored();
        const seatId = tamsinOf(visit).seatId;
        // A visit write in flight: the visit held, the token it moves next.
        const tokenLocked = yield* Deferred.make<void>();
        const client = yield* SqlClient.SqlClient;
        const go = yield* Deferred.make<void>();
        const held = yield* Deferred.make<void>();
        const writer = yield* Effect.forkChild(
          client.withTransaction(
            Effect.gen(function* () {
              yield* lockVisit(visit.id)(client);
              yield* Deferred.succeed(held, undefined);
              yield* Deferred.await(go);
              yield* client`
                select level_visit_token.seat_id from level_visit_token
                where level_visit_token.visit_id = ${visit.id}
                  and level_visit_token.seat_id = ${seatId}
                for update
              `;
              yield* Deferred.succeed(tokenLocked, undefined);
            }),
          ),
        );
        yield* Deferred.await(held);
        const leaving = yield* Effect.forkChild(
          failure(ilse.token, (client) =>
            client.party.leave({ params: { campaignId: table, campaignCharacterId: seatId } }),
          ),
        );
        yield* Effect.sleep("300 millis");
        // The leave waits on the visit before it touches the token, so the
        // write takes the token at once and commits.
        yield* Deferred.succeed(go, undefined);
        yield* Deferred.await(tokenLocked).pipe(Effect.timeout("700 millis"), Effect.orDie);
        yield* Fiber.join(writer).pipe(Effect.orDie);
        expect((yield* Fiber.join(leaving)).tag).toBe("succeeded");
        expect((yield* dmVisit(table, visit)).tokens).toEqual([]);
      }),
    );
  });
});
