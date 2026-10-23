import { describe, expect } from "@effect/vitest";
import {
  type CampaignId,
  type EncounterRun,
  type Level,
  LevelPartId,
  type LevelSave,
  type LevelVisit,
  type LevelVisitId,
  type SessionId,
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
 * **The party notices a placed encounter, and a carried fight keeps its
 * dungeon** (`LevelVisits.ts`' `noticedIn` and `watchNotice`, `heldBy`,
 * `tableVisit`; `EncounterRuns.resume`): an encounter placed on the visit is
 * noticed when one of its creatures is in the party's sight with the DM's fog
 * taken out, or a live party token stands in its trigger area; the DM's line
 * `visit-encounter-noticed` is logged on the write that made it so, once, and
 * again only after the party lost it and found it again; a carried fight
 * freezes the visit until it is picked up, which puts the visit back on the
 * table, and *Reset level* stays allowed.
 *
 * Over the real application and Postgres, through the client derived from the
 * contract. Every person is minted the shipped way (`support/actors.ts`): Jo
 * creates each table; Ilse (Tamsin) is admitted through a real invitation
 * with a shared seat; Bo is a stranger.
 */

const database = migratedDatabase("taverns_test_level_visit_noticed");
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
  "level-visit-noticed.test/People",
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

/** The visit's `visit-encounter-noticed` lines, by the encounter each names, in order. */
const noticedLines = (visitId: LevelVisitId) =>
  Effect.map(
    sql(
      (sql) => sql<{
        readonly visibility: string;
        readonly payload: { readonly encounterId: string; readonly name: string };
      }>`
        select visibility, payload from session_event
        where level_visit_id = ${visitId} and kind = 'visit-encounter-noticed'
        order by seq
      `,
    ),
    (lines) => lines.map((line) => ({ ...line.payload, visibility: line.visibility })),
  );

/** Place the encounter's one goblin on a square, with a trigger area or none. */
const placeOne = (
  campaignId: CampaignId,
  ambush: Effect.Success<ReturnType<typeof anAmbush>>,
  column: number,
  row: number,
  trigger: ReadonlyArray<number> | null = null,
) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    yield* as(jo.token, (client) =>
      client.encounters.place({
        params: { campaignId, encounterId: ambush.encounter.id },
        payload: {
          spots: [{ encounterCreatureId: ambush.line, ordinal: 0, column, row }],
          trigger,
        },
      }),
    );
  });

/** A table with a fresh hall's visit on it during an open night, the party at the way in. */
const exploring = Effect.gen(function* () {
  const table = yield* aTable;
  const level = yield* aHall();
  const visit = yield* openVisit(table, level);
  yield* putOnTable(table, visit);
  const sessionId = yield* openNight(table);
  return { table, level, visit, sessionId, on: { campaignId: table, visitId: visit.id } };
});

const noticedOf = (visit: LevelVisit, encounterId: string) =>
  visit.encounters.find((encounter) => encounter.id === encounterId)?.noticed;

describeLayer("level-visit-noticed", shared, (it) => {
  describe("noticing a placed encounter", () => {
    it.effect(
      "notices one by sight, tells the DM once, and again once sight is lost and found",
      () =>
        Effect.gen(function* () {
          const { jo } = yield* People;
          const { table, level, visit, on } = yield* exploring;
          // East of the closed door, where the party cannot see.
          const ambush = yield* anAmbush(table, level, 1);
          yield* placeOne(table, ambush, 5, 1);
          expect(noticedOf(yield* dmVisit(table, visit), ambush.encounter.id)).toBe(false);

          yield* as(jo.token, (client) =>
            client.levelVisits.moveToken({
              params: { ...on, seatId: tamsinOf(visit).seatId },
              payload: { position: { column: 3, row: 1 } },
            }),
          );
          expect(yield* noticedLines(visit.id)).toEqual([]);

          const opened = yield* as(jo.token, (client) =>
            client.levelVisits.updateDoor({
              params: { ...on, wallId: DOOR },
              payload: { doorState: "open" },
            }),
          );
          expect(noticedOf(opened, ambush.encounter.id)).toBe(true);
          expect(yield* noticedLines(visit.id)).toEqual([
            { encounterId: ambush.encounter.id, name: "Ambush", visibility: "dm" },
          ]);

          // Still in sight: another write tells nothing again.
          yield* as(jo.token, (client) =>
            client.levelVisits.updateLight({
              params: { ...on, lightId: TORCH },
              payload: { lit: false },
            }),
          );
          expect(yield* noticedLines(visit.id)).toHaveLength(1);

          // The door shut: out of sight, no longer noticed, nothing logged.
          const shut = yield* as(jo.token, (client) =>
            client.levelVisits.updateDoor({
              params: { ...on, wallId: DOOR },
              payload: { doorState: "closed" },
            }),
          );
          expect(noticedOf(shut, ambush.encounter.id)).toBe(false);
          expect(yield* noticedLines(visit.id)).toHaveLength(1);

          // Seen again: noticed again, and told again.
          yield* as(jo.token, (client) =>
            client.levelVisits.updateDoor({
              params: { ...on, wallId: DOOR },
              payload: { doorState: "open" },
            }),
          );
          expect(yield* noticedLines(visit.id)).toHaveLength(2);
          // The players hear nothing of it.
          expect(yield* linesOf(visit.id)).not.toContain("visit-encounter-noticed:shared");
        }),
    );

    it.effect("notices one when a party token stands in its trigger area", () =>
      Effect.gen(function* () {
        const { ilse } = yield* People;
        const { table, level, visit } = yield* exploring;
        // Behind the plain wall, out of sight from the west room.
        const ambush = yield* anAmbush(table, level, 1);
        yield* placeOne(table, ambush, 6, 2, [at(2, 2)]);
        expect(noticedOf(yield* dmVisit(table, visit), ambush.encounter.id)).toBe(false);

        // The player walks onto the trigger.
        yield* as(ilse.token, (client) =>
          client.table.moveOnVisit({
            params: { campaignId: table, visitId: visit.id, seatId: tamsinOf(visit).seatId },
            payload: { position: { column: 2, row: 2 } },
          }),
        );
        const after = yield* dmVisit(table, visit);
        expect(noticedOf(after, ambush.encounter.id)).toBe(true);
        // Not by sight: the goblin is not on the player's board.
        const seen = yield* as(ilse.token, (client) =>
          client.table.read({ params: { campaignId: table } }),
        );
        expect(seen!.visit!.creatures).toEqual([]);
        expect(yield* noticedLines(visit.id)).toEqual([
          { encounterId: ambush.encounter.id, name: "Ambush", visibility: "dm" },
        ]);
      }),
    );

    it.effect("does not notice a creature in sight under the DM's fog", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const { table, level, visit, on } = yield* exploring;
        const ambush = yield* anAmbush(table, level, 1);
        yield* placeOne(table, ambush, 5, 1);
        yield* as(jo.token, (client) =>
          client.levelVisits.updateFog({ params: on, payload: { hide: [{ column: 5, row: 1 }] } }),
        );
        yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...on, seatId: tamsinOf(visit).seatId },
            payload: { position: { column: 3, row: 1 } },
          }),
        );
        const opened = yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { ...on, wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        expect(opened.partySees).toContain(at(5, 1));
        expect(noticedOf(opened, ambush.encounter.id)).toBe(false);
        expect(yield* noticedLines(visit.id)).toEqual([]);

        // The fog lifted: noticed, by the fog's write.
        const lifted = yield* as(jo.token, (client) =>
          client.levelVisits.updateFog({
            params: on,
            payload: { reveal: [{ column: 5, row: 1 }] },
          }),
        );
        expect(noticedOf(lifted, ambush.encounter.id)).toBe(true);
        expect(yield* noticedLines(visit.id)).toHaveLength(1);
      }),
    );

    it.effect(
      "tells the DM when a placement lands in sight, and of nothing while a fight is on",
      () =>
        Effect.gen(function* () {
          const { table, level, visit, sessionId } = yield* exploring;
          const first = yield* anAmbush(table, level, 1, "First");
          const second = yield* anAmbush(table, level, 1, "Second");
          // In the west room, where the party stands.
          yield* placeOne(table, second, 2, 2);
          expect(yield* noticedLines(visit.id)).toEqual([
            { encounterId: second.encounter.id, name: "Second", visibility: "dm" },
          ]);

          // A fight on the level holds the visit: nothing is noticed while it
          // is on, and the encounter played is not listed.
          yield* placeOne(table, first, 6, 1);
          const run = yield* start(table, sessionId, first.encounter.id);
          const during = yield* dmVisit(table, visit);
          expect(during.encounters.map((encounter) => encounter.id)).toEqual([second.encounter.id]);
          expect(noticedOf(during, second.encounter.id)).toBe(false);

          // The fight hands the dungeon back resolved: the party notices the
          // second encounter again from where it stands, and only that one.
          yield* endRun(table, run);
          const back = yield* dmVisit(table, visit);
          expect(back.encounters.map((encounter) => encounter.id)).toEqual([second.encounter.id]);
          expect(noticedOf(back, second.encounter.id)).toBe(true);
          expect((yield* noticedLines(visit.id)).map((line) => line.name)).toEqual([
            "Second",
            "Second",
          ]);
        }),
    );
  });

  describe("a trigger with no creature placed", () => {
    it.effect("is listed on the DM's read and noticed when the party steps on it", () =>
      Effect.gen(function* () {
        const { jo, ilse } = yield* People;
        const { table, level, visit } = yield* exploring;
        const ambush = yield* anAmbush(table, level, 2);
        yield* as(jo.token, (client) =>
          client.encounters.place({
            params: { campaignId: table, encounterId: ambush.encounter.id },
            payload: { spots: [], trigger: [at(2, 2)] },
          }),
        );
        const before = yield* dmVisit(table, visit);
        const listed = before.encounters.find((encounter) => encounter.id === ambush.encounter.id);
        expect(listed?.creatures).toEqual([]);
        expect(listed?.trigger).toEqual([{ column: 2, row: 2 }]);
        expect(listed?.noticed).toBe(false);

        yield* as(ilse.token, (client) =>
          client.table.moveOnVisit({
            params: { campaignId: table, visitId: visit.id, seatId: tamsinOf(visit).seatId },
            payload: { position: { column: 2, row: 2 } },
          }),
        );
        expect(noticedOf(yield* dmVisit(table, visit), ambush.encounter.id)).toBe(true);
        expect(yield* noticedLines(visit.id)).toEqual([
          { encounterId: ambush.encounter.id, name: "Ambush", visibility: "dm" },
        ]);
      }),
    );
  });

  describe("a roster or encounter edit that moves a placement", () => {
    /**
     * Each edit takes the one goblin the party sees off the visit: the line
     * removed, counted down past the placed instance, the encounter moved to
     * another level, the encounter deleted.
     */
    type Ambush = Effect.Success<ReturnType<typeof anAmbush>>;
    const edits = [
      [
        "a roster line removed",
        (campaignId: CampaignId, ambush: Ambush) =>
          Effect.gen(function* () {
            const { jo } = yield* People;
            yield* as(jo.token, (client) =>
              client.encounterCreatures.remove({
                params: {
                  campaignId,
                  encounterId: ambush.encounter.id,
                  encounterCreatureId: ambush.line,
                },
              }),
            );
          }),
      ],
      [
        "a roster line counted down",
        (campaignId: CampaignId, ambush: Ambush) =>
          Effect.gen(function* () {
            const { jo } = yield* People;
            yield* as(jo.token, (client) =>
              client.encounterCreatures.update({
                params: {
                  campaignId,
                  encounterId: ambush.encounter.id,
                  encounterCreatureId: ambush.line,
                },
                payload: { count: 1 },
              }),
            );
          }),
      ],
      [
        "the encounter moved to another level",
        (campaignId: CampaignId, ambush: Ambush) =>
          Effect.gen(function* () {
            const { jo } = yield* People;
            const elsewhere = yield* aHall();
            yield* as(jo.token, (client) =>
              client.encounters.update({
                params: { campaignId, encounterId: ambush.encounter.id },
                payload: { levelId: elsewhere.id },
              }),
            );
          }),
      ],
      [
        "the encounter deleted",
        (campaignId: CampaignId, ambush: Ambush) =>
          Effect.gen(function* () {
            const { jo } = yield* People;
            yield* as(jo.token, (client) =>
              client.encounters.remove({
                params: { campaignId, encounterId: ambush.encounter.id },
              }),
            );
          }),
      ],
    ] as const;

    for (const [name, edit] of edits) {
      it.effect(`tells the DM and rings the table for ${name}`, () =>
        Effect.gen(function* () {
          const { jo, ilse } = yield* People;
          const { table, level, visit } = yield* exploring;
          const ambush = yield* anAmbush(table, level, 2);
          // The second goblin in the west room with the party, the first
          // behind the plain wall: the count down takes only the second.
          yield* as(jo.token, (client) =>
            client.encounters.place({
              params: { campaignId: table, encounterId: ambush.encounter.id },
              payload: {
                spots: [
                  { encounterCreatureId: ambush.line, ordinal: 0, column: 6, row: 3 },
                  { encounterCreatureId: ambush.line, ordinal: 1, column: 2, row: 2 },
                ],
                trigger: null,
              },
            }),
          );
          const seen = () =>
            Effect.map(
              as(ilse.token, (client) => client.table.read({ params: { campaignId: table } })),
              (read) => read!.visit!.creatures.map((creature) => creature.name),
            );
          expect(yield* seen()).toEqual(["Goblin"]);
          const before = (yield* linesOf(visit.id)).length;

          yield* edit(table, ambush);

          expect(yield* seen()).toEqual([]);
          expect((yield* linesOf(visit.id)).slice(before)).toEqual([
            "visit-placement-updated:dm",
            "visit-vision-updated:shared",
          ]);
        }),
      );
    }

    it.effect("tells nothing when the edit leaves the placement as it was", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const { table, level, visit } = yield* exploring;
        const ambush = yield* anAmbush(table, level, 2);
        yield* placeOne(table, ambush, 2, 2);
        const before = (yield* linesOf(visit.id)).length;
        // Counted down to the one placed: no spot goes.
        yield* as(jo.token, (client) =>
          client.encounterCreatures.update({
            params: {
              campaignId: table,
              encounterId: ambush.encounter.id,
              encounterCreatureId: ambush.line,
            },
            payload: { count: 1 },
          }),
        );
        expect((yield* linesOf(visit.id)).slice(before)).toEqual([]);
      }),
    );
  });

  describe("a carried fight", () => {
    it.effect("keeps the visit frozen until it is picked up, and lets the level be reset", () =>
      Effect.gen(function* () {
        const { jo, ilse } = yield* People;
        const { table, level, visit, sessionId } = yield* explored();
        const other = yield* openVisit(table, yield* aHall());
        const ambush = yield* anAmbush(table, level);
        const waiting = yield* anAmbush(table, level, 1, "Waiting");
        const run = yield* start(table, sessionId, ambush.encounter.id);
        yield* endNight(table, sessionId);
        const on = { campaignId: table, visitId: visit.id };
        const seatId = tamsinOf(visit).seatId;

        const held = yield* dmVisit(table, visit);
        expect(held.fight).toEqual({ runId: run.id, sessionId, name: "Ambush", carried: true });
        const listed = yield* as(jo.token, (client) =>
          client.levelVisits.list({ params: { campaignId: table } }),
        );
        expect(listed.find((one) => one.id === visit.id)!.fight).toEqual(held.fight);
        expect(listed.find((one) => one.id === other.id)!.fight).toBeNull();

        const nextNight = yield* openNight(table);
        const writes = [
          yield* failure(jo.token, (client) =>
            client.levelVisits.moveToken({
              params: { ...on, seatId },
              payload: { position: { column: 1, row: 1 } },
            }),
          ),
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateFog({ params: on, payload: { coverAll: true } }),
          ),
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateDoor({
              params: { ...on, wallId: DOOR },
              payload: { doorState: "closed" },
            }),
          ),
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateLight({
              params: { ...on, lightId: TORCH },
              payload: { lit: true },
            }),
          ),
          yield* failure(jo.token, (client) =>
            client.levelVisits.updateRegion({
              params: { ...on, regionId: TRAP },
              payload: { revealed: false },
            }),
          ),
        ];
        for (const one of writes) {
          expect(one.tag).toBe("Conflict");
          expect(one.message).toBe("the fight on this level was carried: pick it up first");
        }
        const tabling = [
          yield* failure(jo.token, (client) =>
            client.levelVisits.putOnTable({
              params: { campaignId: table },
              payload: { visitId: other.id },
            }),
          ),
          yield* failure(jo.token, (client) =>
            client.levelVisits.takeOffTable({ params: { campaignId: table } }),
          ),
          yield* failure(jo.token, (client) =>
            client.runs.start({
              params: { campaignId: table, sessionId: nextNight },
              payload: { encounterId: waiting.encounter.id },
            }),
          ),
        ];
        for (const one of tabling) {
          expect(one.tag).toBe("Conflict");
          expect(one.message).toContain("was carried: pick it up first");
        }

        // The player cannot walk it, and their table shows no visit.
        const walk = yield* failure(ilse.token, (client) =>
          client.table.moveOnVisit({
            params: { campaignId: table, visitId: visit.id, seatId },
            payload: { position: { column: 1, row: 1 } },
          }),
        );
        expect(walk.tag).toBe("Conflict");
        const reading = yield* as(ilse.token, (client) =>
          client.table.read({ params: { campaignId: table } }),
        );
        expect(reading!.visit).toBeNull();

        // *Reset level* is still the DM's: the carried fight keeps its own
        // copy, loses the pointer, and hands nothing back when it resolves.
        yield* as(jo.token, (client) => client.levelVisits.remove({ params: on }));
        const resumed = yield* as(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: nextNight },
            payload: { continuedFrom: run.id },
          }),
        );
        expect(resumed.levelVisitId).toBeNull();
        yield* endRun(table, resumed);
        // And the table may change again.
        yield* putOnTable(table, other);
      }),
    );

    it.effect("is picked up with its visit put back on the table", () =>
      Effect.gen(function* () {
        const { jo, ilse } = yield* People;
        const { table, level, visit, sessionId } = yield* explored();
        const ambush = yield* anAmbush(table, level);
        const run = yield* start(table, sessionId, ambush.encounter.id);
        yield* endNight(table, sessionId);
        // A table from before the freeze held it, with the visit taken off.
        yield* sql((sql) => sql`update campaign set table_visit_id = null where id = ${table}`);
        expect((yield* dmVisit(table, visit)).onTable).toBe(false);

        const nextNight = yield* openNight(table);
        const before = (yield* linesOf(visit.id)).length;
        const resumed = yield* as(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: nextNight },
            payload: { continuedFrom: run.id },
          }),
        );
        const now = yield* dmVisit(table, visit);
        expect(now.onTable).toBe(true);
        expect(now.fight).toEqual({
          runId: resumed.id,
          sessionId: nextNight,
          name: "Ambush",
          carried: false,
        });
        expect((yield* linesOf(visit.id)).slice(before)).toContain("visit-tabled:shared");
        const reading = yield* as(ilse.token, (client) =>
          client.table.read({ params: { campaignId: table } }),
        );
        expect(reading!.fight!.id).toBe(resumed.id);
        yield* endRun(table, resumed);
      }),
    );

    it.effect("is not picked up while a fight is live in another of the table's levels", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const { table, level, visit, sessionId } = yield* explored();
        const ambush = yield* anAmbush(table, level);
        const run = yield* start(table, sessionId, ambush.encounter.id);
        yield* endNight(table, sessionId);

        // Another level put on the table behind the freeze's back, and a
        // fight started there on a night of its own.
        const otherLevel = yield* aHall();
        const other = yield* openVisit(table, otherLevel);
        yield* sql(
          (sql) => sql`update campaign set table_visit_id = ${other.id} where id = ${table}`,
        );
        const elsewhere = yield* anAmbush(table, otherLevel, 1, "Elsewhere");
        const thirdNight = (yield* as(jo.token, (client) =>
          client.sessions.create({ params: { campaignId: table }, payload: { number: 900 } }),
        )).id;
        const live = yield* start(table, thirdNight, elsewhere.encounter.id);
        expect(live.levelVisitId).toBe(other.id);

        const nextNight = yield* openNight(table);
        const refused = yield* failure(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: nextNight },
            payload: { continuedFrom: run.id },
          }),
        );
        expect(refused.tag).toBe("Conflict");
        expect(refused.message).toContain(`a fight is being played in ${other.name}`);
        // Nothing moved: the other visit is still on the table, and the
        // carried fight still holds its own.
        expect((yield* dmVisit(table, other)).onTable).toBe(true);
        expect((yield* dmVisit(table, visit)).fight).toMatchObject({ carried: true });
        yield* endRun(table, live);
      }),
    );
  });

  describe("the Levels list", () => {
    it.effect("names the fight a visit is borrowed by, and none once it resolves", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const { table, level, visit, sessionId } = yield* exploring;
        const ambush = yield* anAmbush(table, level);
        const run = yield* start(table, sessionId, ambush.encounter.id);
        const list = () =>
          as(jo.token, (client) => client.levelVisits.list({ params: { campaignId: table } }));
        expect((yield* list()).find((one) => one.id === visit.id)!.fight).toEqual({
          runId: run.id,
          sessionId,
          name: "Ambush",
          carried: false,
        });
        yield* endRun(table, run);
        expect((yield* list()).find((one) => one.id === visit.id)!.fight).toBeNull();
      }),
    );
  });
});
