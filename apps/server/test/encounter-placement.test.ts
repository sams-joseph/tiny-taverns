import { describe, expect } from "@effect/vitest";
import {
  type CampaignId,
  type EncounterLevelPlacement,
  type Level,
  LevelPartId,
  type LevelSave,
  type LevelVisit,
  type LevelVisitId,
  type PlayerLevelVisit,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, admittedTo, aPerson, type Person } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Placing an encounter on its level** (`repo/placements.ts`,
 * `Encounters.place`): the DM's write replacing every spot and the trigger
 * area, each refusal, the level change that clears them; the DM's visit
 * read listing the placed, unplayed encounters with a spot that cannot stand
 * on the copy flagged; and a seated player's visit read showing a placed
 * creature only while the party sees its square, and nothing else of the
 * placement, on any player read.
 *
 * Over the real application and Postgres, through the client derived from
 * the contract and the raw wire. Every person is minted the shipped way
 * (`support/actors.ts`): Jo creates each table; Ilse (Tamsin) is admitted
 * through a real invitation with a shared seat; Bo is a stranger.
 */

const database = migratedDatabase("taverns_test_encounter_placement");
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

/** A request as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, method: "GET" | "PUT", path: string, body?: unknown) =>
  Effect.gen(function* () {
    const request =
      method === "GET"
        ? HttpClientRequest.get(path)
        : HttpClientRequest.put(path).pipe(HttpClientRequest.bodyJsonUnsafe(body));
    const response = yield* HttpClient.execute(request.pipe(HttpClientRequest.bearerToken(token)));
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

const part = (n: number) =>
  Schema.decodeSync(LevelPartId)(`1e7e3200-0000-4000-8000-${String(n).padStart(12, "0")}`);

const DOOR = part(2);
const CRATE = part(12);

const COLUMNS = 7;
const ROWS = 4;
const at = (column: number, row: number, columns = COLUMNS) => row * columns + column;

/**
 * Seven squares by four of flagstone, dim. A wall down x = 3 parts the west
 * room (columns 0 to 2) from the east, with a closed door in it at row 1; a
 * torch in the west, a lamp in the east, a crate in the bottom-left corner
 * and the way in at (0, 0) and (0, 1). `columns` widens the board, eastward.
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
      { id: part(1), x1: 3, y1: 0, x2: 3, y2: 1, kind: "wall", doorState: null, low: false },
      { id: DOOR, x1: 3, y1: 1, x2: 3, y2: 2, kind: "door", doorState: "closed", low: false },
      { id: part(3), x1: 3, y1: 2, x2: 3, y2: 4, kind: "wall", doorState: null, low: false },
    ],
    props:
      over.crate === false
        ? []
        : [
            {
              id: CRATE,
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
      { id: part(5), x: 1.5, y: 1.5, bright: 20, dim: 20, tone: "fire", flicker: true, lit: true },
      {
        id: part(6),
        x: 5.5,
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
    ],
    version: level.version,
  };
};

const makePeople = Effect.gen(function* () {
  return { jo: yield* aPerson("Jo"), ilse: yield* aPerson("Ilse"), bo: yield* aPerson("Bo") };
}).pipe(Effect.orDie);

class People extends Context.Service<People, Effect.Success<typeof makePeople>>()(
  "encounter-placement.test/People",
) {}

const shared = Layer.effect(People)(makePeople).pipe(Layer.provideMerge(application));

let tables = 0;

/** A new table of Jo's, shared, with Ilse seating Tamsin in a shared seat. */
const aTable = Effect.gen(function* () {
  const { jo, ilse } = yield* People;
  tables += 1;
  const campaignId = (yield* as(jo.token, (client) =>
    client.campaigns.create({
      payload: { name: `The Salt Road ${String(tables)}`, visibility: "shared" },
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
const aHall = Effect.gen(function* () {
  const { jo } = yield* People;
  levels += 1;
  const made = yield* as(jo.token, (client) =>
    client.libraryLevels.create({
      payload: { name: `Undercroft ${String(levels)}`, columns: COLUMNS, rows: ROWS },
    }),
  );
  return yield* as(jo.token, (client) =>
    client.libraryLevels.save({ params: { levelId: made.id }, payload: hall(made) }),
  );
});

/** A Library goblin of Jo's. */
const aGoblin = Effect.gen(function* () {
  const { jo } = yield* People;
  return yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Goblin", size: "Small", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
    }),
  );
});

/** An encounter on the level with a roster line of `count` goblins. */
const anAmbush = (campaignId: CampaignId, level: Level, count = 3, name = "Ambush") =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    const goblin = yield* aGoblin;
    const encounter = yield* as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId },
        payload: { name, levelId: level.id, creatures: [{ creatureId: goblin.id, count }] },
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

const openVisit = (campaignId: CampaignId, level: Level) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.levelVisits.open({ params: { campaignId }, payload: { levelId: level.id } }),
    );
  });

const putOnTable = (campaignId: CampaignId, visit: LevelVisit) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.levelVisits.putOnTable({ params: { campaignId }, payload: { visitId: visit.id } }),
    );
  });

const place = (
  person: Person,
  campaignId: CampaignId,
  encounterId: Parameters<Client["encounters"]["place"]>[0]["params"]["encounterId"],
  payload: EncounterLevelPlacement,
) =>
  failure(person.token, (client) =>
    client.encounters.place({ params: { campaignId, encounterId }, payload }),
  );

const prepOf = (
  campaignId: CampaignId,
  encounterId: Parameters<Client["encounterPrep"]["find"]>[0]["params"]["encounterId"],
) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.encounterPrep.find({ params: { campaignId, encounterId } }),
    );
  });

const dmVisit = (campaignId: CampaignId, visit: LevelVisit) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.levelVisits.findById({ params: { campaignId, visitId: visit.id } }),
    );
  });

const tableVisit = (person: Person, campaignId: CampaignId) =>
  Effect.map(
    as(person.token, (client) => client.table.read({ params: { campaignId } })),
    (read): PlayerLevelVisit | null => read?.visit ?? null,
  );

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

describeLayer("encounter-placement", shared, (it) => {
  describe("the placement write", () => {
    it.effect("replaces every spot and the trigger, and the prep reads them back", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const table = yield* aTable;
        const level = yield* aHall;
        const { encounter, line } = yield* anAmbush(table, level);
        expect((yield* prepOf(table, encounter.id)).placement).toEqual({
          spots: [],
          trigger: null,
        });

        expect(
          yield* place(jo, table, encounter.id, {
            spots: [
              { encounterCreatureId: line, ordinal: 2, column: 5, row: 1 },
              { encounterCreatureId: line, ordinal: 0, column: 1, row: 1 },
            ],
            trigger: [at(5, 2), at(4, 1), at(5, 2)],
          }),
        ).toEqual({ tag: "succeeded", message: undefined });
        expect((yield* prepOf(table, encounter.id)).placement).toEqual({
          spots: [
            { encounterCreatureId: line, ordinal: 0, column: 1, row: 1 },
            { encounterCreatureId: line, ordinal: 2, column: 5, row: 1 },
          ],
          // Ascending and distinct, as the fog is spelled.
          trigger: [at(4, 1), at(5, 2)],
        });

        // Replaced whole: one spot left, and an empty area is none.
        yield* place(jo, table, encounter.id, {
          spots: [{ encounterCreatureId: line, ordinal: 1, column: 2, row: 2 }],
          trigger: [],
        });
        expect((yield* prepOf(table, encounter.id)).placement).toEqual({
          spots: [{ encounterCreatureId: line, ordinal: 1, column: 2, row: 2 }],
          trigger: null,
        });
      }),
    );

    it.effect("is refused to a player and a stranger as not found", () =>
      Effect.gen(function* () {
        const { ilse, bo } = yield* People;
        const table = yield* aTable;
        const level = yield* aHall;
        const { encounter, line } = yield* anAmbush(table, level);
        const payload = {
          spots: [{ encounterCreatureId: line, ordinal: 0, column: 1, row: 1 }],
          trigger: null,
        };
        expect((yield* place(ilse, table, encounter.id, payload)).tag).toBe("NotFound");
        expect((yield* place(bo, table, encounter.id, payload)).tag).toBe("NotFound");
        expect((yield* prepOf(table, encounter.id)).placement.spots).toEqual([]);
      }),
    );

    it.effect("refuses a line of another encounter, and every bad square, in words", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const table = yield* aTable;
        const level = yield* aHall;
        const { encounter, line } = yield* anAmbush(table, level, 2);
        const other = yield* anAmbush(table, level, 2, "Elsewhere");
        const spot = (column: number, row: number, ordinal = 0) => ({
          spots: [{ encounterCreatureId: line, ordinal, column, row }],
          trigger: null,
        });

        expect(
          (yield* place(jo, table, encounter.id, {
            spots: [{ encounterCreatureId: other.line, ordinal: 0, column: 1, row: 1 }],
            trigger: null,
          })).tag,
        ).toBe("NotFound");
        // The roster line has two: there is no third to place.
        expect(yield* place(jo, table, encounter.id, spot(1, 1, 2))).toMatchObject({
          tag: "Conflict",
          message: expect.stringContaining("no number 3"),
        });
        expect(yield* place(jo, table, encounter.id, spot(9, 1))).toMatchObject({
          tag: "Conflict",
          message: expect.stringContaining("off the level"),
        });
        // The crate's square.
        expect(yield* place(jo, table, encounter.id, spot(0, 3))).toMatchObject({
          tag: "Conflict",
          message: expect.stringContaining("nothing can stand"),
        });
        expect(
          yield* place(jo, table, encounter.id, { ...spot(1, 1), trigger: [at(6, 3) + 1] }),
        ).toMatchObject({ tag: "Conflict", message: expect.stringContaining("trigger") });
        // Two on one square never reaches the server's statements: the
        // contract refuses it on the wire.
        const doubled = yield* wire(
          jo.token,
          "PUT",
          `/campaigns/${table}/encounters/${encounter.id}/placement`,
          {
            spots: [
              { encounterCreatureId: line, ordinal: 0, column: 1, row: 1 },
              { encounterCreatureId: line, ordinal: 1, column: 1, row: 1 },
            ],
            trigger: null,
          },
        );
        expect(doubled.status).toBe(400);
        expect((yield* prepOf(table, encounter.id)).placement.spots).toEqual([]);
      }),
    );

    it.effect("refuses an encounter with no level, and one that has been played", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const table = yield* aTable;
        const level = yield* aHall;
        const { encounter, line } = yield* anAmbush(table, level);
        const payload = {
          spots: [{ encounterCreatureId: line, ordinal: 0, column: 1, row: 1 }],
          trigger: null,
        };
        yield* as(jo.token, (client) =>
          client.encounters.update({
            params: { campaignId: table, encounterId: encounter.id },
            payload: { levelId: null },
          }),
        );
        expect(yield* place(jo, table, encounter.id, payload)).toMatchObject({
          tag: "Conflict",
          message: expect.stringContaining("no level"),
        });

        const played = yield* anAmbush(table, level, 1, "Played");
        const night = yield* openNight(table);
        yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table, sessionId: night },
            payload: { encounterId: played.encounter.id },
          }),
        );
        expect(
          yield* place(jo, table, played.encounter.id, {
            spots: [{ encounterCreatureId: played.line, ordinal: 0, column: 1, row: 1 }],
            trigger: null,
          }),
        ).toMatchObject({ tag: "Conflict", message: expect.stringContaining("played") });
      }),
    );

    it.effect("goes, spots and trigger, when the encounter's level changes", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const table = yield* aTable;
        const level = yield* aHall;
        const another = yield* aHall;
        const { encounter, line } = yield* anAmbush(table, level);
        yield* place(jo, table, encounter.id, {
          spots: [{ encounterCreatureId: line, ordinal: 0, column: 1, row: 1 }],
          trigger: [at(1, 1)],
        });
        // The same level again changes nothing.
        yield* as(jo.token, (client) =>
          client.encounters.update({
            params: { campaignId: table, encounterId: encounter.id },
            payload: { levelId: level.id },
          }),
        );
        expect((yield* prepOf(table, encounter.id)).placement.spots).toHaveLength(1);
        yield* as(jo.token, (client) =>
          client.encounters.update({
            params: { campaignId: table, encounterId: encounter.id },
            payload: { levelId: another.id },
          }),
        );
        expect((yield* prepOf(table, encounter.id)).placement).toEqual({
          spots: [],
          trigger: null,
        });
      }),
    );
  });

  describe("the DM's visit", () => {
    it.effect("lists the placed, unplayed encounters on its level, flagging bad spots", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const table = yield* aTable;
        const level = yield* aHall;
        const elsewhere = yield* aHall;
        const { encounter, line } = yield* anAmbush(table, level);
        // Not placed, and on another level: neither is on the visit.
        yield* anAmbush(table, level, 1, "Unplaced");
        const away = yield* anAmbush(table, elsewhere, 1, "Away");
        yield* place(jo, table, away.encounter.id, {
          spots: [{ encounterCreatureId: away.line, ordinal: 0, column: 1, row: 1 }],
          trigger: null,
        });

        const visit = yield* openVisit(table, level);
        expect(visit.encounters).toEqual([]);

        // The level is widened and its crate taken away after the visit was
        // opened: the copy is still seven wide, with the crate.
        const widened = yield* as(jo.token, (client) =>
          client.libraryLevels.save({
            params: { levelId: level.id },
            payload: hall(level, { columns: 8, crate: false }),
          }),
        );
        expect(widened.columns).toBe(8);
        yield* place(jo, table, encounter.id, {
          spots: [
            { encounterCreatureId: line, ordinal: 0, column: 1, row: 1 },
            { encounterCreatureId: line, ordinal: 1, column: 0, row: 3 },
            { encounterCreatureId: line, ordinal: 2, column: 7, row: 0 },
          ],
          trigger: [at(1, 1, 8), at(7, 3, 8)],
        });

        const read = yield* dmVisit(table, visit);
        expect(read.encounters).toEqual([
          {
            id: encounter.id,
            name: "Ambush",
            kind: "combat",
            creatures: [
              {
                encounterCreatureId: line,
                ordinal: 0,
                name: "Goblin",
                column: 1,
                row: 1,
                problem: null,
              },
              {
                encounterCreatureId: line,
                ordinal: 1,
                name: "Goblin",
                column: 0,
                row: 3,
                problem: "blocked",
              },
              {
                encounterCreatureId: line,
                ordinal: 2,
                name: "Goblin",
                column: 7,
                row: 0,
                problem: "offBoard",
              },
            ],
            // Squares of the eight-wide level, on the seven-wide copy.
            trigger: [{ column: 1, row: 1 }],
            noticed: true,
          },
        ]);

        // Once played, it is no longer waiting on the level. A fight on a
        // level the party has been to is played on the visit on the table.
        const night = yield* openNight(table);
        yield* putOnTable(table, visit);
        yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table, sessionId: night },
            payload: { encounterId: encounter.id },
          }),
        );
        expect((yield* dmVisit(table, visit)).encounters).toEqual([]);
      }),
    );

    it.effect(
      "logs the DM's line on an open night, and rings the table when it sees a change",
      () =>
        Effect.gen(function* () {
          const { jo } = yield* People;
          const table = yield* aTable;
          const level = yield* aHall;
          const { encounter, line } = yield* anAmbush(table, level);
          const visit = yield* openVisit(table, level);
          // No night open: nothing is logged.
          yield* place(jo, table, encounter.id, {
            spots: [{ encounterCreatureId: line, ordinal: 0, column: 5, row: 1 }],
            trigger: null,
          });
          expect(yield* linesOf(visit.id)).toEqual([]);

          yield* openNight(table);
          yield* putOnTable(table, visit);
          const before = (yield* linesOf(visit.id)).length;
          // Behind the closed door: the party sees no change.
          yield* place(jo, table, encounter.id, {
            spots: [{ encounterCreatureId: line, ordinal: 0, column: 5, row: 2 }],
            trigger: null,
          });
          expect((yield* linesOf(visit.id)).slice(before)).toEqual(["visit-placement-updated:dm"]);
          // In the west room, where the party stands: the table is rung, and
          // the DM is told the party has noticed the encounter.
          yield* place(jo, table, encounter.id, {
            spots: [{ encounterCreatureId: line, ordinal: 0, column: 1, row: 1 }],
            trigger: null,
          });
          expect((yield* linesOf(visit.id)).slice(before + 1)).toEqual([
            "visit-placement-updated:dm",
            "visit-vision-updated:shared",
            "visit-encounter-noticed:dm",
          ]);
        }),
    );
  });

  describe("the player's visit", () => {
    it.effect("shows a placed creature only while the party sees its square", () =>
      Effect.gen(function* () {
        const { jo, ilse } = yield* People;
        const table = yield* aTable;
        const level = yield* aHall;
        const { encounter, line } = yield* anAmbush(table, level);
        // The DM keeps the roster line to themself: sight still decides.
        yield* as(jo.token, (client) =>
          client.encounterCreatures.update({
            params: { campaignId: table, encounterId: encounter.id, encounterCreatureId: line },
            payload: { visibility: "dm" },
          }),
        );
        yield* place(jo, table, encounter.id, {
          spots: [
            { encounterCreatureId: line, ordinal: 0, column: 2, row: 2 },
            { encounterCreatureId: line, ordinal: 1, column: 5, row: 1 },
          ],
          trigger: [at(4, 1)],
        });
        yield* openNight(table);
        const visit = yield* openVisit(table, level);
        yield* putOnTable(table, visit);

        // The west room is in sight; the east, past the closed door, is not.
        expect((yield* tableVisit(ilse, table))?.creatures).toEqual([
          { name: "Goblin", column: 2, row: 2 },
        ]);

        // Tamsin at the door, and the door open: the east is in sight.
        yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { campaignId: table, visitId: visit.id, seatId: visit.tokens[0]!.seatId },
            payload: { position: { column: 2, row: 1 } },
          }),
        );
        yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { campaignId: table, visitId: visit.id, wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        expect((yield* tableVisit(ilse, table))?.creatures).toEqual([
          { name: "Goblin", column: 5, row: 1 },
          { name: "Goblin", column: 2, row: 2 },
        ]);

        // Under the DM's fog a square is not in sight.
        yield* as(jo.token, (client) =>
          client.levelVisits.updateFog({
            params: { campaignId: table, visitId: visit.id },
            payload: { hide: [{ column: 2, row: 2 }] },
          }),
        );
        expect((yield* tableVisit(ilse, table))?.creatures).toEqual([
          { name: "Goblin", column: 5, row: 1 },
        ]);

        // On the raw wire: the creature's name and square, nothing more.
        const read = yield* wire(ilse.token, "GET", `/campaigns/${table}/table`);
        expect(read.status).toBe(200);
        for (const leak of ["Ambush", encounter.id, line, "trigger", "ordinal", "problem"]) {
          expect(read.body).not.toContain(leak);
        }
      }),
    );

    it.effect("is never told a spot or a trigger on the player encounter reads", () =>
      Effect.gen(function* () {
        const { jo, ilse } = yield* People;
        const table = yield* aTable;
        const level = yield* aHall;
        const { encounter, line } = yield* anAmbush(table, level);
        yield* as(jo.token, (client) =>
          client.encounters.update({
            params: { campaignId: table, encounterId: encounter.id },
            payload: { visibility: "shared", ready: true },
          }),
        );
        yield* place(jo, table, encounter.id, {
          spots: [{ encounterCreatureId: line, ordinal: 0, column: 2, row: 2 }],
          trigger: [at(1, 1)],
        });
        for (const path of [
          `/campaigns/${table}/player-encounters`,
          `/campaigns/${table}/player-encounters/${encounter.id}`,
        ]) {
          const read = yield* wire(ilse.token, "GET", path);
          expect(read.status).toBe(200);
          expect(read.body).toContain("Ambush");
          for (const leak of ["trigger", "spots", "placement", "ordinal", line]) {
            expect(read.body).not.toContain(leak);
          }
        }
        // The prep, where the placement is, is the creator's alone.
        expect(
          (yield* failure(ilse.token, (client) =>
            client.encounterPrep.find({ params: { campaignId: table, encounterId: encounter.id } }),
          )).tag,
        ).toBe("NotFound");
      }),
    );
  });
});
