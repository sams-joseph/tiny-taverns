import { describe, expect } from "@effect/vitest";
import {
  type CampaignId,
  type CombatantId,
  type EncounterRunId,
  emptyCharacterSheet,
  type Level,
  LevelPartId,
  type LevelSave,
  type PlayerLiveTable,
  partyVision,
  runLevelLayout,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, admittedTo, aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **Shared party vision on a level, and the seated player's narrowed view of
 * it** (`0110_party_vision.ts`, `levelFights.ts`' `refreshPartyVision` and
 * `playerLevelColumn`, `liveTables.ts`' `underFog`).
 *
 * Over the real application and Postgres, through the client derived from the
 * contract and the raw wire. The people are minted the shipped way
 * (`support/actors.ts`): Jo creates the table, Ilse is admitted through a
 * real invitation and seats Tamsin (who has darkvision on her sheet), and Bo
 * is a stranger.
 */

const database = migratedDatabase("taverns_test_party_vision");
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

const refusal = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), (client) =>
    call(client).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "succeeded" }),
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
  Schema.decodeSync(LevelPartId)(`1e7e3000-0000-4000-8000-${String(n).padStart(12, "0")}`);

const DOOR = part(2);
const SECRET = part(3);
const BARREL_WEST = part(10);
const CRATE_DM = part(11);
const TORCH_EAST = part(20);
const LAMP_UNLIT = part(21);
const TRAP = part(30);
const MUD = part(31);

const COLUMNS = 9;
const at = (column: number, row: number) => row * COLUMNS + column;

/**
 * Two rooms, nine squares by five, brightly lit. A wall down x = 4 with a
 * closed door between rows 2 and 3 and an unfound secret door (closed)
 * between rows 3 and 4. The west room (columns 0–3) is flagstone, the east
 * (4–8) planks. A barrel and a DM-only crate in the west; a lit torch in the
 * east; an unlit lamp in the west; a secret trap in the west, and mud across
 * both rooms' top rows.
 */
const twoRooms = (level: Level, ambient: "bright" | "dark" = "bright"): LevelSave => ({
  name: "Two Rooms",
  description: null,
  columns: COLUMNS,
  rows: 5,
  feetPerCell: 5,
  ambient,
  floor: Array.from({ length: COLUMNS * 5 }, (_, square) => (square % COLUMNS >= 4 ? 2 : 1)),
  walls: [
    { id: part(1), x1: 4, y1: 0, x2: 4, y2: 2, kind: "wall", doorState: null, low: false },
    { id: DOOR, x1: 4, y1: 2, x2: 4, y2: 3, kind: "door", doorState: "closed", low: false },
    {
      id: SECRET,
      x1: 4,
      y1: 3,
      x2: 4,
      y2: 4,
      kind: "secretDoor",
      doorState: "closed",
      low: false,
    },
    { id: part(4), x1: 4, y1: 4, x2: 4, y2: 5, kind: "wall", doorState: null, low: false },
  ],
  props: [
    {
      id: BARREL_WEST,
      kind: "barrel",
      x: 0,
      y: 0,
      rotation: 0,
      blocksMovement: null,
      blocksSight: null,
      cover: null,
      difficult: null,
      dmOnly: false,
    },
    {
      id: CRATE_DM,
      kind: "crate",
      x: 2,
      y: 4,
      rotation: 0,
      blocksMovement: null,
      blocksSight: null,
      cover: null,
      difficult: null,
      dmOnly: true,
    },
  ],
  lights: [
    {
      id: TORCH_EAST,
      x: 6.5,
      y: 2.5,
      bright: 20,
      dim: 20,
      tone: "fire",
      flicker: true,
      lit: true,
    },
    {
      id: LAMP_UNLIT,
      x: 0.5,
      y: 4.5,
      bright: 15,
      dim: 30,
      tone: "fire",
      flicker: false,
      lit: false,
    },
  ],
  regions: [
    { id: TRAP, kind: "trap", squares: [at(1, 1)], secret: true },
    { id: MUD, kind: "difficult", squares: [at(3, 0), at(8, 0)], secret: false },
  ],
  version: level.version,
});

const DARKVISION =
  "You have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light.";

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const bo = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const ilses = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(
    table,
    ilses,
    {
      name: "Tamsin",
      hpMax: 30,
      sheet: { ...emptyCharacterSheet, traits: [{ name: "Darkvision", text: DARKVISION }] },
    },
    { seatVisibility: "shared" },
  );
  return { jo, ilse, bo, table };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "party-vision.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

let nights = 0;

/** A new night on the table, made current. */
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

/**
 * A shared fight on `twoRooms`, with a goblin (shared) on (6, 0) in the east
 * room and Tamsin on (1, 2) in the west, taking turns with Tamsin up and the
 * map shown to the table.
 */
const aFight = (ambient: "bright" | "dark" = "bright") =>
  Effect.gen(function* () {
    const { jo, table } = yield* Fixture;
    const made = yield* as(jo.token, (client) =>
      client.libraryLevels.create({ payload: { name: "Two Rooms", columns: COLUMNS, rows: 5 } }),
    );
    const level = yield* as(jo.token, (client) =>
      client.libraryLevels.save({ params: { levelId: made.id }, payload: twoRooms(made, ambient) }),
    );
    const sessionId: SessionId = yield* night();
    const encounter = yield* as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: { name: "Two rooms", visibility: "shared", ready: true, levelId: level.id },
      }),
    );
    const fight = yield* as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId },
        payload: { encounterId: encounter.id, visibility: "shared" },
      }),
    );
    const params = { campaignId: table, sessionId, runId: fight.id };
    const goblin = yield* as(jo.token, (client) =>
      client.combatants.create({
        params,
        payload: { displayName: "Goblin", kind: "npc", visibility: "shared" },
      }),
    );
    const order = yield* as(jo.token, (client) => client.combatants.list({ params }));
    const tamsin = order.find((row) => row.displayName === "Tamsin")!;
    yield* as(jo.token, (client) =>
      client.combatants.update({
        params: { ...params, combatantId: tamsin.id },
        payload: { visibility: "shared" },
      }),
    );
    yield* place(params, tamsin.id, 1, 2);
    yield* place(params, goblin.id, 6, 0);
    yield* as(jo.token, (client) =>
      client.runs.setInitiative({
        params,
        payload: { entries: order.map((row) => ({ combatantId: row.id, initiative: 10 })) },
      }),
    );
    yield* as(jo.token, (client) => client.runs.begin({ params, payload: {} }));
    yield* as(jo.token, (client) =>
      client.runs.update({ params, payload: { activeCombatantId: tamsin.id, mapShown: true } }),
    );
    return { level, fight, params, tamsin: tamsin.id, goblin: goblin.id };
  });

interface Params {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly runId: EncounterRunId;
}

/** The DM puts a token on a square. */
const place = (params: Params, combatantId: CombatantId, column: number, row: number) =>
  Effect.flatMap(Fixture, ({ jo }) =>
    as(jo.token, (client) =>
      client.combatants.move({
        params: { ...params, combatantId },
        payload: { position: { column, row } },
      }),
    ),
  );

/** The player's table, decoded. */
const tableOf = Effect.flatMap(Fixture, ({ ilse, table }) =>
  as(ilse.token, (client) => client.table.read({ params: { campaignId: table } })),
);

/** The player's table as it went over the wire. */
const rawTable = Effect.flatMap(Fixture, ({ ilse, table }) =>
  wire(ilse.token, `/campaigns/${table}/table`),
);

const levelOf = (read: PlayerLiveTable | null) => {
  const level = read?.fight?.board?.level;
  expect(level).toBeDefined();
  expect(level).not.toBeNull();
  return level!;
};

const tokenIds = (read: PlayerLiveTable | null) =>
  (read?.fight?.board?.tokens ?? []).map((token) => token.combatantId);

const eventsOf = (runId: string, kind: string) =>
  sql(
    (sql) => sql<{ readonly visibility: string }>`
      select visibility from session_event
      where encounter_run_id = ${runId} and kind = ${kind}
      order by seq
    `,
  );

const openDoor = (params: Params) =>
  Effect.flatMap(Fixture, ({ jo }) =>
    as(jo.token, (client) =>
      client.runs.updateDoor({
        params: { ...params, wallId: DOOR },
        payload: { doorState: "open" },
      }),
    ),
  );

const WEST = [0, 1, 2, 3, 4].flatMap((row) => [0, 1, 2, 3].map((column) => at(column, row)));

describeLayer("party-vision", shared, (it) => {
  describe("the party sees from its player characters", () => {
    it.effect("writes what the party sees at the fight's start and with every move", () =>
      Effect.gen(function* () {
        const { params } = yield* aFight();
        const rows = yield* sql(
          (sql) => sql<{ readonly party_sees: ReadonlyArray<number> | null }>`
            select party_sees from encounter_run_board where run_id = ${params.runId}
          `,
        );
        // Tamsin in the west room with the door shut: the west room, all of it.
        expect([...(rows[0]?.party_sees ?? [])]).toEqual(WEST);
      }),
    );

    it.effect("sees in the dark by the character's darkvision, and not by an allied NPC's", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const { level, params } = yield* aFight("dark");
        // An ally on the far side of the west room is no viewer.
        const ally = yield* as(jo.token, (client) =>
          client.combatants.create({
            params,
            payload: { displayName: "Hireling", kind: "npc", side: "party", visibility: "shared" },
          }),
        );
        yield* place(params, ally.id, 3, 4);
        const board = yield* as(jo.token, (client) => client.runs.board({ params }));
        const layout = runLevelLayout(board!, board!.level!);
        const sees = levelOf(yield* tableOf).sees;
        // The torch is lit: what darkvision 60 ft adds to it, from (1, 2) alone.
        expect(sees).toEqual(
          partyVision(layout, [{ square: { column: 1, row: 2 }, darkvision: 60 }], {
            revealed: new Set(),
          }),
        );
        expect(sees).toEqual(WEST);
        expect(level.ambient).toBe("dark");
      }),
    );
  });

  describe("the player's level is narrowed in SQL", () => {
    it.effect("sends no square the party has not seen, on the raw wire", () =>
      Effect.gen(function* () {
        yield* aFight();
        const raw = yield* rawTable;
        expect(raw.status).toBe(200);
        const body = JSON.parse(raw.body) as {
          readonly fight: {
            readonly board: {
              readonly level: {
                readonly seen: ReadonlyArray<number>;
                readonly sees: ReadonlyArray<number>;
                readonly floor: ReadonlyArray<number>;
                readonly walls: ReadonlyArray<Record<string, unknown>>;
                readonly props: ReadonlyArray<Record<string, unknown>>;
                readonly lights: ReadonlyArray<Record<string, unknown>>;
                readonly regions: ReadonlyArray<Record<string, unknown>>;
              };
            };
          };
        };
        const level = body.fight.board.level;
        expect(Object.keys(level).sort()).toEqual(
          ["ambient", "floor", "lights", "props", "regions", "seen", "sees", "walls"].sort(),
        );
        expect(level.seen).toEqual(WEST);
        // One floor value per seen square, and none of the east room's planks.
        expect(level.floor).toEqual(WEST.map(() => 1));
        // The east room's torch, the west room's unlit lamp, the DM's crate and
        // the secret trap are not on the wire at all.
        for (const absent of [TORCH_EAST, LAMP_UNLIT, CRATE_DM, TRAP]) {
          expect(raw.body).not.toContain(absent);
        }
        for (const word of ["dmOnly", "revealed", "secret", '"lit"']) {
          expect(raw.body).not.toContain(word);
        }
        expect(level.props.map((prop) => prop.id)).toEqual([BARREL_WEST]);
        expect(level.lights).toEqual([]);
        // The mud, clipped to the west room's square of it.
        expect(level.regions).toEqual([{ id: MUD, kind: "difficult", squares: [at(3, 0)] }]);
      }),
    );

    it.effect("sends an unrevealed secret door as a plain wall, and a revealed one as itself", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const { fight, params } = yield* aFight();
        const raw = yield* rawTable;
        expect(raw.body).not.toContain("secretDoor");
        const walls = levelOf(yield* tableOf).walls;
        expect(walls.find((wall) => wall.id === SECRET)).toEqual({
          id: SECRET,
          x1: 4,
          y1: 3,
          x2: 4,
          y2: 4,
          kind: "wall",
          doorState: null,
          low: false,
        });
        expect(walls.find((wall) => wall.id === DOOR)?.doorState).toBe("closed");

        yield* as(jo.token, (client) =>
          client.runs.updateDoor({
            params: { ...params, wallId: SECRET },
            payload: { revealed: true },
          }),
        );
        const found = levelOf(yield* tableOf).walls.find((wall) => wall.id === SECRET);
        expect(found).toMatchObject({ kind: "secretDoor", doorState: "closed" });
        // The door's own line stays the DM's; the table is rung without it.
        expect((yield* eventsOf(fight.id, "board-door-updated")).at(-1)?.visibility).toBe("dm");
        expect((yield* eventsOf(fight.id, "board-vision-updated")).at(-1)?.visibility).toBe(
          "shared",
        );
      }),
    );
  });

  describe("tokens show where the party sees", () => {
    it.effect("hides a creature out of sight, and shows it once a party member sees it", () =>
      Effect.gen(function* () {
        const { ilse, table } = yield* Fixture;
        const { params, tamsin, goblin } = yield* aFight();
        const before = yield* tableOf;
        expect(tokenIds(before)).toEqual([tamsin]);
        // Out of sight is out of the order too, as under fog.
        expect(before?.fight?.order.map((row) => row.combatantId)).not.toContain(goblin);

        // The door opens: the east room's middle row comes into view, the
        // goblin's corner does not.
        yield* openDoor(params);
        const opened = yield* tableOf;
        expect(levelOf(opened).sees).toContain(at(6, 2));
        expect(levelOf(opened).lights.map((light) => light.id)).toEqual([TORCH_EAST]);
        expect(tokenIds(opened)).toEqual([tamsin]);

        // Tamsin walks through the door on her own turn, and sees it.
        yield* as(ilse.token, (client) =>
          client.table.move({
            params: { campaignId: table, runId: params.runId, combatantId: tamsin },
            payload: { position: { column: 5, row: 2 } },
          }),
        );
        const through = yield* tableOf;
        expect(tokenIds(through).sort()).toEqual([tamsin, goblin].sort());
        expect(through?.fight?.order.map((row) => row.combatantId)).toContain(goblin);
      }),
    );

    it.effect("rings the table, without a shared line, when a creature walks out of sight", () =>
      Effect.gen(function* () {
        const { fight, params, tamsin, goblin } = yield* aFight();
        yield* openDoor(params);
        yield* place(params, goblin, 6, 2);
        expect(tokenIds(yield* tableOf).sort()).toEqual([tamsin, goblin].sort());
        const rung = (yield* eventsOf(fight.id, "board-vision-updated")).length;

        // Round the corner, out of the doorway's line.
        yield* place(params, goblin, 6, 0);
        expect(tokenIds(yield* tableOf)).toEqual([tamsin]);
        expect((yield* eventsOf(fight.id, "combatant-moved")).at(-1)?.visibility).toBe("dm");
        const after = yield* eventsOf(fight.id, "board-vision-updated");
        expect(after).toHaveLength(rung + 1);
        expect(after.at(-1)?.visibility).toBe("shared");
      }),
    );
  });

  describe("what the party has seen", () => {
    it.effect("widens when a door opens, and keeps what was seen when the party moves on", () =>
      Effect.gen(function* () {
        const { params, tamsin } = yield* aFight();
        const shut = levelOf(yield* tableOf);
        expect(shut.sees).not.toContain(at(6, 2));
        yield* openDoor(params);
        const open = levelOf(yield* tableOf);
        expect(open.sees).toContain(at(6, 2));
        expect(open.sees.length).toBeGreaterThan(shut.sees.length);

        yield* place(params, tamsin, 6, 1);
        const moved = levelOf(yield* tableOf);
        // The west room's far corner is out of sight now, and still explored.
        expect(moved.sees).not.toContain(at(0, 0));
        expect(moved.seen).toContain(at(0, 0));
        expect(moved.seen).toEqual(expect.arrayContaining([...WEST, at(6, 2)]));
        // Its floor still comes with it, one value per seen square.
        expect(moved.floor).toHaveLength(moved.seen.length);
      }),
    );

    it.effect("shares a door's and a light's line only once the party has seen them", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const { fight, params } = yield* aFight();
        const snuff = (lit: boolean) =>
          as(jo.token, (client) =>
            client.runs.updateLight({
              params: { ...params, lightId: TORCH_EAST },
              payload: { lit },
            }),
          );
        // A torch in a room nobody has seen: the DM's own line.
        yield* snuff(false);
        yield* snuff(true);
        yield* openDoor(params);
        yield* snuff(false);
        expect((yield* eventsOf(fight.id, "board-light-updated")).map((e) => e.visibility)).toEqual(
          ["dm", "dm", "shared"],
        );
        // The door touches the room the party stands in.
        expect((yield* eventsOf(fight.id, "board-door-updated")).map((e) => e.visibility)).toEqual([
          "shared",
        ]);
      }),
    );
  });

  describe("only the table reads it", () => {
    it.effect("is NotFound to a stranger", () =>
      Effect.gen(function* () {
        const { bo, table } = yield* Fixture;
        const { params } = yield* aFight();
        expect(
          yield* refusal(bo.token, (client) =>
            client.table.read({ params: { campaignId: table as CampaignId } }),
          ),
        ).toBe("NotFound");
        expect(yield* refusal(bo.token, (client) => client.runs.board({ params }))).toBe(
          "NotFound",
        );
      }),
    );
  });
});
