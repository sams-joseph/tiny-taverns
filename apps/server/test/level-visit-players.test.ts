import { describe, expect } from "@effect/vitest";
import {
  type CampaignCharacterId,
  type CampaignId,
  type Level,
  LevelPartId,
  type LevelSave,
  type LevelVisit,
  type LevelVisitId,
  type PlayerLevelVisit,
  type PlayerLiveEvent,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Fiber, Layer, Schema, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, admittedTo, aPerson, type Person } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Players explore a level visit** (`repo/LevelVisits.ts`' `playerVisitOnTable`
 * and `playerVisitMove`, `PlayerTable`): the visit on the table, read by a
 * seated player as the party has seen it, narrowed in SQL; a player walking
 * their own token on it, and nobody else's; which of the visit's lines are
 * the table's, and the players' doorbell ringing for them; and a seat that
 * sits down mid-visit standing on it.
 *
 * Over the real application and Postgres, through the client derived from the
 * contract and the raw wire. Every person is minted the shipped way
 * (`support/actors.ts`): Jo creates each table; Ilse (Tamsin) and Pell (Wren)
 * are admitted through real invitations with shared seats; Bo is a stranger.
 * Each test sits at a table of its own.
 */

const database = migratedDatabase("taverns_test_level_visit_players");
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

/** A GET as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

const part = (n: number) =>
  Schema.decodeSync(LevelPartId)(`1e7e3100-0000-4000-8000-${String(n).padStart(12, "0")}`);

const PLAIN_WALL = part(1);
const DOOR = part(2);
const EAST_SECRET = part(4);
const TORCH = part(5);
const EAST_LAMP = part(6);
const WEST_SECRET = part(7);
const DM_CRATE = part(8);
const TRAP = part(9);
const MUD = part(10);
const ENTRY = part(11);
const CRATE = part(12);

const COLUMNS = 7;
const ROWS = 4;
const at = (column: number, row: number) => row * COLUMNS + column;

/**
 * Seven squares by four of flagstone, dim. A wall down x = 3 parts the west
 * room (columns 0 to 2) from the east, with a closed door in it at row 1. In
 * the west: a torch, mud, a crate in the bottom-left corner, a DM-only crate
 * at (2, 0), a secret door along the top of (2, 3), and the way in at (0, 0)
 * and (0, 1). In the east, unseen from the west: a lamp, a secret trap, and a
 * secret door further east.
 */
const hall = (level: Level): LevelSave => ({
  name: level.name,
  description: null,
  columns: COLUMNS,
  rows: ROWS,
  feetPerCell: 5,
  ambient: "dim",
  floor: Array.from({ length: COLUMNS * ROWS }, () => 1),
  walls: [
    { id: PLAIN_WALL, x1: 3, y1: 0, x2: 3, y2: 1, kind: "wall", doorState: null, low: false },
    { id: DOOR, x1: 3, y1: 1, x2: 3, y2: 2, kind: "door", doorState: "closed", low: false },
    { id: part(3), x1: 3, y1: 2, x2: 3, y2: 4, kind: "wall", doorState: null, low: false },
    {
      id: EAST_SECRET,
      x1: 5,
      y1: 3,
      x2: 5,
      y2: 4,
      kind: "secretDoor",
      doorState: "closed",
      low: false,
    },
    {
      id: WEST_SECRET,
      x1: 2,
      y1: 3,
      x2: 3,
      y2: 3,
      kind: "secretDoor",
      doorState: "closed",
      low: false,
    },
  ],
  props: [
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
    {
      id: DM_CRATE,
      kind: "crate",
      x: 2,
      y: 0,
      rotation: 0,
      blocksMovement: null,
      blocksSight: null,
      cover: null,
      difficult: null,
      dmOnly: true,
    },
  ],
  lights: [
    { id: TORCH, x: 1.5, y: 1.5, bright: 20, dim: 20, tone: "fire", flicker: true, lit: true },
    { id: EAST_LAMP, x: 5.5, y: 1.5, bright: 20, dim: 20, tone: "fire", flicker: false, lit: true },
  ],
  regions: [
    { id: TRAP, kind: "trap", squares: [at(4, 1)], secret: true },
    { id: MUD, kind: "difficult", squares: [at(1, 2)], secret: false },
    { id: ENTRY, kind: "entry", squares: [at(0, 0), at(0, 1)], secret: false },
  ],
  version: level.version,
});

const makePeople = Effect.gen(function* () {
  return {
    jo: yield* aPerson("Jo"),
    ilse: yield* aPerson("Ilse"),
    pell: yield* aPerson("Pell"),
    bo: yield* aPerson("Bo"),
  };
}).pipe(Effect.orDie);

class People extends Context.Service<People, Effect.Success<typeof makePeople>>()(
  "level-visit-players.test/People",
) {}

const shared = Layer.effect(People)(makePeople).pipe(Layer.provideMerge(application));

let tables = 0;

interface Table {
  readonly campaignId: CampaignId;
  readonly tamsin: CampaignCharacterId;
  readonly wren: CampaignCharacterId;
}

/** A new table of Jo's, shared, with Ilse seating Tamsin and Pell seating Wren, both seats shared. */
const aTable = Effect.gen(function* () {
  const { jo, ilse, pell } = yield* People;
  tables += 1;
  const campaignId = (yield* as(jo.token, (client) =>
    client.campaigns.create({
      payload: { name: `The Salt Road ${String(tables)}`, visibility: "shared" },
    }),
  )).id;
  yield* admittedTo(campaignId, ilse.actor, "Ilse");
  yield* admittedTo(campaignId, pell.actor, "Pell");
  const tamsin = yield* aCharacterAt(
    campaignId,
    ilse.actor,
    { name: "Tamsin", hpMax: 30 },
    { seatVisibility: "shared" },
  );
  const wren = yield* aCharacterAt(
    campaignId,
    pell.actor,
    { name: "Wren", hpMax: 24 },
    { seatVisibility: "shared" },
  );
  return { campaignId, tamsin: tamsin.seatId, wren: wren.seatId } satisfies Table;
});

let levels = 0;

/** A new level of Jo's, saved as `hall`, and a visit of it at the table. */
const aVisit = (table: Table) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    levels += 1;
    const made = yield* as(jo.token, (client) =>
      client.libraryLevels.create({
        payload: { name: `Undercroft ${String(levels)}`, columns: COLUMNS, rows: ROWS },
      }),
    );
    const level = yield* as(jo.token, (client) =>
      client.libraryLevels.save({ params: { levelId: made.id }, payload: hall(made) }),
    );
    return yield* as(jo.token, (client) =>
      client.levelVisits.open({
        params: { campaignId: table.campaignId },
        payload: { levelId: level.id },
      }),
    );
  });

/** A night at the table, started and made the campaign's current one. */
const openNight = (table: Table) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    const { campaignId } = table;
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
    return session.id;
  });

const endNight = (table: Table, sessionId: SessionId) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    yield* as(jo.token, (client) =>
      client.sessions.update({
        params: { campaignId: table.campaignId, sessionId },
        payload: { endedAt: DateTime.nowUnsafe() },
      }),
    );
  });

const putOnTable = (table: Table, visit: LevelVisit) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.levelVisits.putOnTable({
        params: { campaignId: table.campaignId },
        payload: { visitId: visit.id },
      }),
    );
  });

/** A night open, and a visit of the hall on the table: what most tests start from. */
const exploring = Effect.gen(function* () {
  const table = yield* aTable;
  const sessionId = yield* openNight(table);
  const visit = yield* aVisit(table);
  yield* putOnTable(table, visit);
  return { table, sessionId, visit };
});

/** The visit as a player's table reads it, or `null`. */
const tableVisit = (person: Person, table: Table) =>
  Effect.map(
    as(person.token, (client) => client.table.read({ params: { campaignId: table.campaignId } })),
    (read): PlayerLevelVisit | null => read?.visit ?? null,
  );

const walk = (
  person: Person,
  table: Table,
  visit: LevelVisit,
  seatId: CampaignCharacterId,
  column: number,
  row: number,
) =>
  failure(person.token, (client) =>
    client.table.moveOnVisit({
      params: { campaignId: table.campaignId, visitId: visit.id, seatId },
      payload: { position: { column, row } },
    }),
  );

const dmVisit = (table: Table, visit: LevelVisit) =>
  Effect.gen(function* () {
    const { jo } = yield* People;
    return yield* as(jo.token, (client) =>
      client.levelVisits.findById({
        params: { campaignId: table.campaignId, visitId: visit.id },
      }),
    );
  });

/** The visit's log lines, in order. */
const linesOf = (visitId: LevelVisitId) =>
  sql(
    (sql) => sql<{
      readonly seq: number;
      readonly kind: string;
      readonly visibility: string;
    }>`
      select seq::int as seq, kind, visibility from session_event
      where level_visit_id = ${visitId} order by seq
    `,
  );

/** The lines a write added, as `kind:visibility`. */
const linesSince = (visitId: LevelVisitId, before: number) =>
  Effect.map(linesOf(visitId), (lines) =>
    lines.slice(before).map((line) => `${line.kind}:${line.visibility}`),
  );

describeLayer("level-visit-players", shared, (it) => {
  describe("the player's read", () => {
    it.effect("is the visit on the table, narrowed to what the party has seen", () =>
      Effect.gen(function* () {
        const { ilse } = yield* People;
        const { table, visit } = yield* exploring;
        const seen = yield* tableVisit(ilse, table);
        expect(seen).not.toBeNull();
        if (seen === null) return;
        expect(seen.id).toBe(visit.id);
        expect({ columns: seen.columns, rows: seen.rows, feetPerCell: seen.feetPerCell }).toEqual({
          columns: COLUMNS,
          rows: ROWS,
          feetPerCell: 5,
        });
        // The party stands in the west room, on the way in, and sees it and
        // nothing past the closed door.
        expect(
          seen.tokens.map(({ name, own, column, row }) => ({ name, own, column, row })),
        ).toEqual([
          { name: "Tamsin", own: true, column: 0, row: 0 },
          { name: "Wren", own: false, column: 0, row: 1 },
        ]);
        expect(seen.level.seen).toContain(at(2, 1));
        expect(seen.level.seen).not.toContain(at(5, 1));
        expect(seen.level.floor).toHaveLength(seen.level.seen.length);
        // What the DM's copy has and the party's view does not.
        expect(seen.level.props.map((prop) => prop.id)).toEqual([CRATE]);
        expect(seen.level.regions.map((region) => region.id)).toEqual([MUD]);
        expect(seen.level.lights.map((light) => light.id)).toEqual([TORCH]);
        const westSecret = seen.level.walls.find((wall) => wall.id === WEST_SECRET);
        expect(westSecret).toMatchObject({ kind: "wall", doorState: null });
        expect(seen.level.walls.map((wall) => wall.id)).not.toContain(EAST_SECRET);
      }),
    );

    it.effect("never carries the DM's columns, on the raw wire", () =>
      Effect.gen(function* () {
        const { ilse } = yield* People;
        const { table, visit } = yield* exploring;
        const dm = yield* dmVisit(table, visit);
        const read = yield* wire(ilse.token, `/campaigns/${table.campaignId}/table`);
        expect(read.status).toBe(200);
        const body = read.body;
        expect(body).toContain(visit.id);
        for (const leak of [
          dm.name,
          String(dm.levelId),
          "levelId",
          "entry",
          "dmOnly",
          "secret",
          "revealed",
          "partySees",
          DM_CRATE,
          TRAP,
          ENTRY,
          EAST_SECRET,
          EAST_LAMP,
        ]) {
          expect(body).not.toContain(leak);
        }
      }),
    );

    it.effect("takes the DM's fog out of what the party has seen, and keeps their own token", () =>
      Effect.gen(function* () {
        const { jo, ilse, pell } = yield* People;
        const { table, visit } = yield* exploring;
        yield* as(jo.token, (client) =>
          client.levelVisits.updateFog({
            params: { campaignId: table.campaignId, visitId: visit.id },
            payload: {
              hide: [
                { column: 2, row: 1 },
                { column: 0, row: 0 },
              ],
            },
          }),
        );
        const seen = yield* tableVisit(ilse, table);
        expect(seen?.level.seen).not.toContain(at(2, 1));
        expect(seen?.level.sees).not.toContain(at(2, 1));
        expect(seen?.fog).toEqual([
          { column: 0, row: 0 },
          { column: 2, row: 1 },
        ]);
        // Ilse keeps her own token under the fog; Pell is not shown it.
        expect(seen?.tokens.map((token) => token.name)).toEqual(["Tamsin", "Wren"]);
        const pells = yield* tableVisit(pell, table);
        expect(pells?.tokens.map((token) => token.name)).toEqual(["Wren"]);
      }),
    );

    it.effect("leaves out a seat the player may not see, but never their own", () =>
      Effect.gen(function* () {
        const { jo, ilse, pell } = yield* People;
        const { table } = yield* exploring;
        yield* as(jo.token, (client) =>
          client.party.update({
            params: { campaignId: table.campaignId, campaignCharacterId: table.wren },
            payload: { visibility: "dm" },
          }),
        );
        expect((yield* tableVisit(ilse, table))?.tokens.map((token) => token.name)).toEqual([
          "Tamsin",
        ]);
        expect((yield* tableVisit(pell, table))?.tokens.map((token) => token.name)).toEqual([
          "Tamsin",
          "Wren",
        ]);
      }),
    );

    it.effect("is null with no visit on the table, no open night, or a fight borrowing it", () =>
      Effect.gen(function* () {
        const { jo, ilse } = yield* People;
        const table = yield* aTable;
        const visit = yield* aVisit(table);
        // A night not started: no visit, whatever is on the table.
        yield* putOnTable(table, visit);
        expect(yield* tableVisit(ilse, table)).toBeNull();
        const sessionId = yield* openNight(table);
        expect(yield* tableVisit(ilse, table)).not.toBeNull();
        // Off the table.
        yield* as(jo.token, (client) =>
          client.levelVisits.takeOffTable({ params: { campaignId: table.campaignId } }),
        );
        expect(yield* tableVisit(ilse, table)).toBeNull();
        yield* putOnTable(table, visit);
        // A fight on the visit's level borrows it: the table plays the fight.
        const encounter = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table.campaignId },
            payload: { name: "In the undercroft", ready: true, levelId: visit.levelId! },
          }),
        );
        const fight = yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table.campaignId, sessionId },
            payload: { encounterId: encounter.id },
          }),
        );
        expect(fight.levelVisitId).toBe(visit.id);
        expect(yield* tableVisit(ilse, table)).toBeNull();
        expect(yield* walk(ilse, table, visit, table.tamsin, 1, 0)).toEqual({
          tag: "Conflict",
          message: "a fight is being played on this level: the board is the fight's until it ends",
        });
        yield* as(jo.token, (client) =>
          client.runs.end({
            params: { campaignId: table.campaignId, sessionId, runId: fight.id },
            payload: {},
          }),
        );
        expect(yield* tableVisit(ilse, table)).not.toBeNull();
        // The night over: no visit again.
        yield* endNight(table, sessionId);
        expect(yield* tableVisit(ilse, table)).toBeNull();
      }),
    );

    it.effect("is NotFound to a stranger and to a removed member", () =>
      Effect.gen(function* () {
        const { jo, pell, bo } = yield* People;
        const { table } = yield* exploring;
        expect(
          yield* refusal(bo.token, (client) =>
            client.table.read({ params: { campaignId: table.campaignId } }),
          ),
        ).toBe("NotFound");
        yield* as(jo.token, (client) =>
          client.members.remove({
            params: { campaignId: table.campaignId, accountId: pell.actor.accountId },
          }),
        );
        expect(
          yield* refusal(pell.token, (client) =>
            client.table.read({ params: { campaignId: table.campaignId } }),
          ),
        ).toBe("NotFound");
      }),
    );
  });

  describe("a player's walk", () => {
    it.effect("moves their own token where the walk reaches, and the party looks again", () =>
      Effect.gen(function* () {
        const { ilse } = yield* People;
        const { table, visit } = yield* exploring;
        expect(yield* walk(ilse, table, visit, table.tamsin, 2, 2)).toEqual({
          tag: "succeeded",
          message: undefined,
        });
        const dm = yield* dmVisit(table, visit);
        expect(dm.tokens.find((token) => token.seatId === table.tamsin)).toMatchObject({
          column: 2,
          row: 2,
        });
        expect(dm.partySees).toContain(at(2, 2));
        // No speed: the length of the walk is not refused.
        expect((yield* walk(ilse, table, visit, table.tamsin, 0, 0)).tag).toBe("succeeded");
      }),
    );

    it.effect(
      "is refused, in the same words, past a closed door, onto a DM-only prop, or into the unseen",
      () =>
        Effect.gen(function* () {
          const { ilse } = yield* People;
          const { table, visit } = yield* exploring;
          const noWay = { tag: "Conflict", message: "No way there" };
          // Behind the closed door: a square the party has not seen.
          expect(yield* walk(ilse, table, visit, table.tamsin, 4, 1)).toEqual(noWay);
          // The DM-only crate blocks, though the table is never sent it.
          expect(yield* walk(ilse, table, visit, table.tamsin, 2, 0)).toEqual(noWay);
          // The crate the table does see.
          expect(yield* walk(ilse, table, visit, table.tamsin, 0, 3)).toEqual(noWay);
          // Off the board.
          expect((yield* walk(ilse, table, visit, table.tamsin, 9, 0)).tag).toBe("Conflict");
          const dm = yield* dmVisit(table, visit);
          expect(dm.tokens.find((token) => token.seatId === table.tamsin)).toMatchObject({
            column: 0,
            row: 0,
          });
        }),
    );

    it.effect("goes through a door once the DM opens it", () =>
      Effect.gen(function* () {
        const { jo, ilse } = yield* People;
        const { table, visit } = yield* exploring;
        yield* walk(ilse, table, visit, table.tamsin, 2, 1);
        yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { campaignId: table.campaignId, visitId: visit.id, wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        // The party sees through the open door now.
        const seen = yield* tableVisit(ilse, table);
        expect(seen?.level.seen).toContain(at(5, 1));
        expect(seen?.level.lights.map((light) => light.id)).toEqual([TORCH, EAST_LAMP]);
        expect((yield* walk(ilse, table, visit, table.tamsin, 5, 1)).tag).toBe("succeeded");
      }),
    );

    it.effect("is idempotent on its requestId", () =>
      Effect.gen(function* () {
        const { ilse } = yield* People;
        const { table, visit } = yield* exploring;
        const send = (column: number) =>
          as(ilse.token, (client) =>
            client.table.moveOnVisit({
              params: { campaignId: table.campaignId, visitId: visit.id, seatId: table.tamsin },
              payload: { position: { column, row: 0 }, requestId: "walk-once" },
            }),
          );
        yield* send(1);
        yield* send(0);
        const dm = yield* dmVisit(table, visit);
        expect(dm.tokens.find((token) => token.seatId === table.tamsin)).toMatchObject({
          column: 1,
          row: 0,
        });
      }),
    );

    it.effect(
      "reaches only the asker's own seat: anything else is NotFound and moves nothing",
      () =>
        Effect.gen(function* () {
          const { jo, ilse, pell, bo } = yield* People;
          const { table, visit, sessionId } = yield* exploring;
          // Another player's seat.
          expect((yield* walk(ilse, table, visit, table.wren, 1, 1)).tag).toBe("NotFound");
          // A stranger, and the DM, who holds no seat and moves tokens on the stage.
          expect((yield* walk(bo, table, visit, table.tamsin, 1, 0)).tag).toBe("NotFound");
          expect((yield* walk(jo, table, visit, table.tamsin, 1, 0)).tag).toBe("NotFound");
          // A visit that is not on the table.
          const shelved = yield* aVisit(table);
          expect((yield* walk(ilse, table, shelved, table.tamsin, 1, 0)).tag).toBe("NotFound");
          // No open night.
          yield* endNight(table, sessionId);
          expect((yield* walk(ilse, table, visit, table.tamsin, 1, 0)).tag).toBe("NotFound");
          yield* openNight(table);
          // A member removed from the table.
          yield* as(jo.token, (client) =>
            client.members.remove({
              params: { campaignId: table.campaignId, accountId: pell.actor.accountId },
            }),
          );
          expect((yield* walk(pell, table, visit, table.wren, 0, 2)).tag).toBe("NotFound");
          const dm = yield* dmVisit(table, visit);
          expect(dm.tokens.map(({ seatId, column, row }) => ({ seatId, column, row }))).toEqual([
            { seatId: table.tamsin, column: 0, row: 0 },
          ]);
        }),
    );
  });

  describe("the table's lines", () => {
    it.effect("shares a seen token's move, a seen door's opening and a seen light's change", () =>
      Effect.gen(function* () {
        const { jo, ilse } = yield* People;
        const { table, visit } = yield* exploring;
        const path = { campaignId: table.campaignId, visitId: visit.id };
        let before = (yield* linesOf(visit.id)).length;
        const step = <A, E, R>(write: Effect.Effect<A, E, R>) =>
          Effect.gen(function* () {
            yield* write;
            const added = yield* linesSince(visit.id, before);
            before += added.length;
            return added;
          });

        expect(yield* step(walk(ilse, table, visit, table.tamsin, 2, 1))).toEqual([
          "visit-token-moved:shared",
        ]);
        // A light the party has never seen is the DM's alone.
        expect(
          yield* step(
            as(jo.token, (client) =>
              client.levelVisits.updateLight({
                params: { ...path, lightId: EAST_LAMP },
                payload: { lit: false },
              }),
            ),
          ),
        ).toEqual(["visit-light-updated:dm"]);
        expect(
          yield* step(
            as(jo.token, (client) =>
              client.levelVisits.updateDoor({
                params: { ...path, wallId: DOOR },
                payload: { doorState: "open" },
              }),
            ),
          ),
        ).toEqual(["visit-door-updated:shared"]);
        // A lock is the DM's: the table sees a shut door either way.
        yield* step(
          as(jo.token, (client) =>
            client.levelVisits.updateDoor({
              params: { ...path, wallId: DOOR },
              payload: { doorState: "closed" },
            }),
          ),
        );
        expect(
          yield* step(
            as(jo.token, (client) =>
              client.levelVisits.updateDoor({
                params: { ...path, wallId: DOOR },
                payload: { doorState: "locked" },
              }),
            ),
          ),
        ).toEqual(["visit-door-updated:dm"]);
        expect(
          yield* step(
            as(jo.token, (client) =>
              client.levelVisits.updateLight({
                params: { ...path, lightId: TORCH },
                payload: { lit: false },
              }),
            ),
          ),
        ).toEqual(["visit-light-updated:shared"]);
        // Once the party has seen the east room through the open door, its
        // lamp is the table's too.
        expect(
          yield* step(
            as(jo.token, (client) =>
              client.levelVisits.updateLight({
                params: { ...path, lightId: EAST_LAMP },
                payload: { lit: true },
              }),
            ),
          ),
        ).toEqual(["visit-light-updated:shared"]);
      }),
    );

    it.effect(
      "keeps region, fog and reveal lines the DM's, ringing the table when it draws differently",
      () =>
        Effect.gen(function* () {
          const { jo } = yield* People;
          const { table, visit } = yield* exploring;
          const path = { campaignId: table.campaignId, visitId: visit.id };
          let before = (yield* linesOf(visit.id)).length;
          const step = <A, E, R>(write: Effect.Effect<A, E, R>) =>
            Effect.gen(function* () {
              yield* write;
              const added = yield* linesSince(visit.id, before);
              before += added.length;
              return added;
            });
          // A secret door the party has seen, revealed: the DM's line, and a ring.
          expect(
            yield* step(
              as(jo.token, (client) =>
                client.levelVisits.updateDoor({
                  params: { ...path, wallId: WEST_SECRET },
                  payload: { revealed: true },
                }),
              ),
            ),
          ).toEqual(["visit-door-updated:dm", "visit-vision-updated:shared"]);
          // A secret region nobody has seen: the DM's alone.
          expect(
            yield* step(
              as(jo.token, (client) =>
                client.levelVisits.updateRegion({
                  params: { ...path, regionId: TRAP },
                  payload: { revealed: true },
                }),
              ),
            ),
          ).toEqual(["visit-region-updated:dm"]);
          // Fog over a square nobody has seen: the DM's alone.
          expect(
            yield* step(
              as(jo.token, (client) =>
                client.levelVisits.updateFog({
                  params: path,
                  payload: { hide: [{ column: 6, row: 3 }] },
                }),
              ),
            ),
          ).toEqual(["visit-fog-updated:dm"]);
          // Fog over a seen square: the DM's line, and a ring.
          expect(
            yield* step(
              as(jo.token, (client) =>
                client.levelVisits.updateFog({
                  params: path,
                  payload: { hide: [{ column: 1, row: 1 }] },
                }),
              ),
            ),
          ).toEqual(["visit-fog-updated:dm", "visit-vision-updated:shared"]);
          // The door opened: the trap's room seen, so hiding the trap again rings.
          yield* step(
            as(jo.token, (client) =>
              client.levelVisits.updateDoor({
                params: { ...path, wallId: DOOR },
                payload: { doorState: "open" },
              }),
            ),
          );
          expect(
            yield* step(
              as(jo.token, (client) =>
                client.levelVisits.updateRegion({
                  params: { ...path, regionId: TRAP },
                  payload: { revealed: false },
                }),
              ),
            ),
          ).toEqual(["visit-region-updated:dm", "visit-vision-updated:shared"]);
        }),
    );

    it.effect("keeps every line the DM's while the visit is off the table", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const table = yield* aTable;
        yield* openNight(table);
        const visit = yield* aVisit(table);
        const path = { campaignId: table.campaignId, visitId: visit.id };
        yield* as(jo.token, (client) =>
          client.levelVisits.moveToken({
            params: { ...path, seatId: table.tamsin },
            payload: { position: { column: 2, row: 1 } },
          }),
        );
        yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { ...path, wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        const lines = yield* linesOf(visit.id);
        expect(new Set(lines.map((line) => line.visibility))).toEqual(new Set(["dm"]));
      }),
    );

    it.effect("rings the players' doorbell for a shared line", () =>
      Effect.gen(function* () {
        const { jo, pell } = yield* People;
        const { table, visit, sessionId } = yield* exploring;
        const last = (yield* linesOf(visit.id)).at(-1)!.seq;
        const listening = yield* as(pell.token, (client) =>
          client.table
            .events({
              params: { campaignId: table.campaignId, sessionId },
              query: { since: last },
            })
            .pipe(
              Effect.flatMap((stream) =>
                stream.pipe(
                  Stream.filter((event: PlayerLiveEvent) => event.event === "tick"),
                  Stream.take(1),
                  Stream.runCollect,
                ),
              ),
              Effect.timeout("20 seconds"),
            ),
        ).pipe(Effect.forkChild({ startImmediately: true }));
        // Long enough for the subscription to be in place before the write.
        yield* Effect.sleep("400 millis");
        yield* as(jo.token, (client) =>
          client.levelVisits.updateDoor({
            params: { campaignId: table.campaignId, visitId: visit.id, wallId: DOOR },
            payload: { doorState: "open" },
          }),
        );
        const ticks = yield* Fiber.join(listening);
        const door = (yield* linesOf(visit.id)).at(-1)!;
        expect(door).toMatchObject({ kind: "visit-door-updated", visibility: "shared" });
        expect(ticks.map((tick) => tick.id)).toEqual([String(door.seq)]);
      }),
    );
  });

  describe("a seat mid-visit", () => {
    it.effect("stands a seat that sits down on the visit on the table, on a free way in", () =>
      Effect.gen(function* () {
        const { jo } = yield* People;
        const { table, visit } = yield* exploring;
        const before = (yield* linesOf(visit.id)).length;
        const kit = yield* aPerson("Kit");
        yield* admittedTo(table.campaignId, kit.actor, "Kit");
        const seat = yield* aCharacterAt(table.campaignId, kit.actor, {
          name: "Kestrel",
          hpMax: 20,
        });
        const dm = yield* dmVisit(table, visit);
        // Both entry squares are held, so the next down the left edge.
        expect(dm.tokens.find((token) => token.seatId === seat.seatId)).toMatchObject({
          column: 0,
          row: 2,
        });
        expect(yield* linesSince(visit.id, before)).toEqual(["visit-vision-updated:shared"]);
        // Leaving takes the token; sitting down again is a new seat, a new token.
        yield* as(kit.token, (client) =>
          client.party.leave({
            params: { campaignId: table.campaignId, campaignCharacterId: seat.seatId },
          }),
        );
        const back = yield* as(kit.token, (client) =>
          client.party.join({
            params: { campaignId: table.campaignId },
            payload: { characterId: seat.character.id },
          }),
        );
        const again = yield* dmVisit(table, visit);
        expect(again.tokens.map((token) => token.seatId)).not.toContain(seat.seatId);
        expect(again.tokens.find((token) => token.seatId === back.seat.id)).toMatchObject({
          column: 0,
          row: 2,
        });
        void jo;
      }),
    );

    it.effect("gives a seat with no token one when its visit is put on the table", () =>
      Effect.gen(function* () {
        const { table, visit } = yield* exploring;
        const shelved = yield* aVisit(table);
        const kit = yield* aPerson("Kit");
        yield* admittedTo(table.campaignId, kit.actor, "Kit");
        const seat = yield* aCharacterAt(table.campaignId, kit.actor, {
          name: "Kestrel",
          hpMax: 20,
        });
        // On the visit on the table at once; not on the one off it.
        expect((yield* dmVisit(table, visit)).tokens.map((token) => token.seatId)).toContain(
          seat.seatId,
        );
        expect((yield* dmVisit(table, shelved)).tokens.map((token) => token.seatId)).not.toContain(
          seat.seatId,
        );
        const tabled = yield* putOnTable(table, shelved);
        expect(tabled.tokens.find((token) => token.seatId === seat.seatId)).toMatchObject({
          column: 0,
          row: 2,
        });
        expect(tabled.partySees).toContain(at(0, 2));
      }),
    );
  });
});
