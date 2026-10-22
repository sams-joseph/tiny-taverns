import { describe, expect } from "@effect/vitest";
import {
  LEVEL_MATERIALS,
  type Level,
  type LevelSave,
  PROP_KINDS,
  type LevelPropKind,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { textArray } from "../src/repo/rows.js";
import { aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A level is its owner's alone, and a save is the whole document or
 * nothing.**
 *
 * Over the real application and Postgres, through the client derived from the
 * contract: the owner makes, lists, reads, saves and deletes a level; a
 * second account, minted the shipped way, is `NotFound` at every one of those
 * and moves nothing; a save at a stale version is a `Conflict` and writes
 * nothing. Round the API, the tables refuse a part off the board and a floor
 * of the wrong length.
 */

const database = migratedDatabase("taverns_test_levels");
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

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const wren = yield* aPerson("Wren");
  return { jo, wren };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "levels.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const part = (n: number) => `1e7e1000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A small crypt: a 6 × 4 board with a door, an altar, a torch and a trap. */
const crypt = (level: Level): LevelSave => ({
  name: "  The Crypt  ",
  description: "Damp stone under the chapel.",
  columns: 6,
  rows: 4,
  feetPerCell: 5,
  ambient: "dark",
  floor: Array.from({ length: 24 }, (_, square) => (square < 6 ? 0 : 1)),
  walls: [
    { id: part(1), x1: 0, y1: 1, x2: 6, y2: 1, kind: "wall", doorState: null, low: false },
    { id: part(2), x1: 2.5, y1: 1, x2: 3.5, y2: 1, kind: "door", doorState: "closed", low: false },
  ],
  props: [
    {
      id: part(3),
      kind: "altar",
      x: 5,
      y: 2,
      // Turned: 1 across and 2 down, so it fits in the last column.
      rotation: 1,
      blocksMovement: null,
      blocksSight: null,
      cover: "threeQuarters",
      difficult: null,
      dmOnly: false,
    },
  ],
  lights: [
    { id: part(4), x: 0.5, y: 3.5, bright: 20, dim: 20, tone: "fire", flicker: true, lit: true },
  ],
  regions: [{ id: part(5), kind: "trap", squares: [13, 14], secret: true }],
  version: level.version,
});

describeLayer("levels", shared, (it) => {
  describe("the Library shelf is the owner's alone", () => {
    it.effect("makes an empty level of void, lists it, and reads it whole", () =>
      Effect.gen(function* () {
        const { jo, wren } = yield* Fixture;
        const made = yield* as(jo.token, (client) =>
          client.libraryLevels.create({ payload: { name: " Bridge ", columns: 3, rows: 2 } }),
        );
        expect(made.name).toBe("Bridge");
        expect(made.description).toBeNull();
        expect(made.feetPerCell).toBe(5);
        expect(made.ambient).toBe("bright");
        expect(made.floor).toEqual([0, 0, 0, 0, 0, 0]);
        expect([made.walls, made.props, made.lights, made.regions]).toEqual([[], [], [], []]);
        expect(made.version).toBe(1);
        expect(made.origin).toBe("authored");

        const shelf = yield* as(jo.token, (client) => client.libraryLevels.list());
        const listed = shelf.find((level) => level.id === made.id);
        expect(listed).toMatchObject({ name: "Bridge", columns: 3, rows: 2, wallCount: 0 });
        expect(
          (yield* as(wren.token, (client) => client.libraryLevels.list())).map((l) => l.id),
        ).not.toContain(made.id);

        const read = yield* as(jo.token, (client) =>
          client.libraryLevels.findById({ params: { levelId: made.id } }),
        );
        expect(read.floor).toEqual(made.floor);
      }),
    );

    it.effect("saves the whole document, in order, and bumps the version", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const made = yield* as(jo.token, (client) =>
          client.libraryLevels.create({ payload: { name: "Crypt", columns: 10, rows: 10 } }),
        );
        const document = crypt(made);
        const saved = yield* as(jo.token, (client) =>
          client.libraryLevels.save({ params: { levelId: made.id }, payload: document }),
        );
        expect(saved.version).toBe(2);
        expect(saved.name).toBe("The Crypt");
        expect([saved.columns, saved.rows, saved.ambient]).toEqual([6, 4, "dark"]);
        expect(saved.floor).toEqual(document.floor);
        expect(saved.walls).toEqual(document.walls);
        expect(saved.props).toEqual(document.props);
        expect(saved.lights).toEqual(document.lights);
        expect(saved.regions).toEqual(document.regions);

        const shelf = yield* as(jo.token, (client) => client.libraryLevels.list());
        expect(shelf.find((level) => level.id === made.id)).toMatchObject({
          wallCount: 2,
          propCount: 1,
          lightCount: 1,
          regionCount: 1,
        });

        // A second save replaces the parts rather than adding to them.
        const emptied = yield* as(jo.token, (client) =>
          client.libraryLevels.save({
            params: { levelId: made.id },
            payload: { ...document, walls: [], description: " ", version: saved.version },
          }),
        );
        expect(emptied.walls).toEqual([]);
        expect(emptied.description).toBeNull();
        expect(emptied.props).toEqual(document.props);
        expect(emptied.version).toBe(3);
      }),
    );

    it.effect("refuses a stale version with a Conflict and writes nothing", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const made = yield* as(jo.token, (client) =>
          client.libraryLevels.create({ payload: { name: "Ford", columns: 6, rows: 4 } }),
        );
        const saved = yield* as(jo.token, (client) =>
          client.libraryLevels.save({ params: { levelId: made.id }, payload: crypt(made) }),
        );
        const stale = yield* refusal(jo.token, (client) =>
          client.libraryLevels.save({
            params: { levelId: made.id },
            payload: { ...crypt(made), name: "Overwritten", walls: [], version: made.version },
          }),
        );
        expect(stale).toBe("Conflict");
        const after = yield* as(jo.token, (client) =>
          client.libraryLevels.findById({ params: { levelId: made.id } }),
        );
        expect(after.name).toBe("The Crypt");
        expect(after.version).toBe(saved.version);
        expect(after.walls).toHaveLength(2);
      }),
    );

    it.effect("is NotFound to anybody else at every endpoint, and they move nothing", () =>
      Effect.gen(function* () {
        const { jo, wren } = yield* Fixture;
        const made = yield* as(jo.token, (client) =>
          client.libraryLevels.create({ payload: { name: "Jo's Keep", columns: 6, rows: 4 } }),
        );
        const params = { levelId: made.id };
        const read = yield* refusal(wren.token, (client) =>
          client.libraryLevels.findById({ params }),
        );
        const save = yield* refusal(wren.token, (client) =>
          client.libraryLevels.save({ params, payload: { ...crypt(made), name: "Mine now" } }),
        );
        const erase = yield* refusal(wren.token, (client) =>
          client.libraryLevels.remove({ params }),
        );
        expect([read, save, erase]).toEqual(["NotFound", "NotFound", "NotFound"]);

        const still = yield* as(jo.token, (client) => client.libraryLevels.findById({ params }));
        expect([still.name, still.version]).toEqual(["Jo's Keep", 1]);
      }),
    );

    it.effect("deletes the level and every part of it", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const sql = yield* SqlClient.SqlClient;
        const made = yield* as(jo.token, (client) =>
          client.libraryLevels.create({ payload: { name: "Doomed", columns: 6, rows: 4 } }),
        );
        yield* as(jo.token, (client) =>
          client.libraryLevels.save({ params: { levelId: made.id }, payload: crypt(made) }),
        );
        yield* as(jo.token, (client) =>
          client.libraryLevels.remove({ params: { levelId: made.id } }),
        );

        const gone = yield* refusal(jo.token, (client) =>
          client.libraryLevels.findById({ params: { levelId: made.id } }),
        );
        expect(gone).toBe("NotFound");
        const left = yield* sql<{ readonly parts: number }>`
          select (
            (select count(*) from level_wall where level_id = ${made.id})
            + (select count(*) from level_prop where level_id = ${made.id})
            + (select count(*) from level_light where level_id = ${made.id})
            + (select count(*) from level_region where level_id = ${made.id})
          )::int as parts
        `;
        expect(left[0]!.parts).toBe(0);
      }),
    );
  });

  describe("the tables keep everything on the board", () => {
    /** A 4 × 3 level of Jo's, straight into the table, and its id. */
    const aBoard = Effect.gen(function* () {
      const { jo } = yield* Fixture;
      const made = yield* as(jo.token, (client) =>
        client.libraryLevels.create({ payload: { name: "Board", columns: 4, rows: 3 } }),
      );
      return made.id;
    });

    const refused = <A, E, R>(statement: Effect.Effect<A, E, R>) =>
      statement.pipe(Effect.exit, Effect.map((exit) => exit._tag));

    it.effect("refuses an off-board wall, prop or light, and a wall that is a door", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const id = yield* aBoard;
        const wall = (x2: number, kind = "wall", doorState: string | null = null) =>
          refused(sql`
            insert into level_wall
              (level_id, id, ordinal, board_columns, board_rows, x1, y1, x2, y2, kind, door_state)
            values (${id}, gen_random_uuid(), 0, 4, 3, 0, 0, ${x2}, 0, ${kind}, ${doorState})
          `);
        expect(yield* wall(4)).toBe("Success");
        expect(yield* wall(4.5)).toBe("Failure");
        expect(yield* wall(1.25)).toBe("Failure");
        expect(yield* wall(2, "door")).toBe("Failure");
        expect(yield* wall(2, "wall", "open")).toBe("Failure");
        expect(yield* wall(2, "secretDoor", "locked")).toBe("Success");

        // A part cannot claim a board of another size than its level's.
        expect(
          yield* refused(sql`
            insert into level_wall
              (level_id, id, ordinal, board_columns, board_rows, x1, y1, x2, y2, kind)
            values (${id}, gen_random_uuid(), 0, 9, 9, 0, 0, 8, 0, 'wall')
          `),
        ).toBe("Failure");

        const prop = (kind: LevelPropKind, x: number, y: number, rotation: number) =>
          refused(sql`
            insert into level_prop
              (level_id, id, ordinal, board_columns, board_rows, kind, x, y, rotation)
            values (${id}, gen_random_uuid(), 0, 4, 3, ${kind}, ${x}, ${y}, ${rotation})
          `);
        // A bed is 1 across and 2 down; turned, 2 across and 1 down.
        expect(yield* prop("bed", 3, 1, 0)).toBe("Success");
        expect(yield* prop("bed", 3, 2, 0)).toBe("Failure");
        expect(yield* prop("bed", 3, 1, 1)).toBe("Failure");
        expect(yield* prop("bed", 2, 2, 1)).toBe("Success");
        expect(yield* prop("crate", -1, 0, 0)).toBe("Failure");

        const light = (x: number, bright: number) =>
          refused(sql`
            insert into level_light
              (level_id, id, ordinal, board_columns, board_rows, x, y, bright, dim, tone)
            values (${id}, gen_random_uuid(), 0, 4, 3, ${x}, 1.5, ${bright}, 0, 'fire')
          `);
        expect(yield* light(3.9, 20)).toBe("Success");
        expect(yield* light(4.1, 20)).toBe("Failure");
        expect(yield* light(1, 125)).toBe("Failure");

        const region = (squares: string) =>
          refused(sql`
            insert into level_region
              (level_id, id, ordinal, board_columns, board_rows, kind, squares)
            values (${id}, gen_random_uuid(), 0, 4, 3, 'difficult', ${squares}::integer[])
          `);
        expect(yield* region("{0,11}")).toBe("Success");
        expect(yield* region("{12}")).toBe("Failure");
        expect(yield* region("{}")).toBe("Failure");
      }),
    );

    it.effect("refuses a floor of the wrong length or an unknown material", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const id = yield* aBoard;
        const floor = (values: string) =>
          refused(sql`update level set floor = ${values}::smallint[] where id = ${id}`);
        const top = LEVEL_MATERIALS.length - 1;
        expect(yield* floor(`{${Array(12).fill(top).join(",")}}`)).toBe("Success");
        expect(yield* floor(`{${Array(11).fill(0).join(",")}}`)).toBe("Failure");
        expect(yield* floor(`{${Array(12).fill(top + 1).join(",")}}`)).toBe("Failure");
        expect(yield* floor(`{${[-1, ...Array(11).fill(0)].join(",")}}`)).toBe("Failure");
      }),
    );

    it.effect("takes every prop kind in the kit, with the kit's footprint", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const id = yield* aBoard;
        const placed = yield* sql<{ readonly kind: string }>`
          insert into level_prop
            (level_id, id, ordinal, board_columns, board_rows, kind, x, y, rotation)
          select ${id}, gen_random_uuid(), 0, 4, 3, kind, 0, 0, 0
          from unnest(${textArray(Object.keys(PROP_KINDS))}) as kind
          returning kind
        `;
        expect(placed).toHaveLength(Object.keys(PROP_KINDS).length);
        const sizes = yield* sql<{ readonly kind: string; readonly size: ReadonlyArray<number> }>`
          select kind, level_prop_size(kind) as size
          from unnest(${textArray(Object.keys(PROP_KINDS))}) as kind
        `;
        expect(Object.fromEntries(sizes.map((row) => [row.kind, row.size]))).toEqual(
          Object.fromEntries(
            Object.entries(PROP_KINDS).map(([kind, spec]) => [kind, [spec.width, spec.height]]),
          ),
        );
      }),
    );
  });
});
