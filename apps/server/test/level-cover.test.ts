import { describe, expect } from "@effect/vitest";
import {
  type CharacterId,
  type CombatantId,
  LEVEL_MATERIALS,
  LevelPartId,
  type RollCreate,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, admittedTo, aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A seated player's own attack on a level applies cover**, by the rule the
 * DM's runner and a kept Hob turn read (`LevelRules.ts`), over the fight's
 * copy of the level: half cover adds 2 to the AC the server resolves the
 * to-hit against, and a target with total cover from the attacker is refused
 * in words, writing nothing (`Rolls.create`).
 *
 * Over the real application and Postgres, through the client derived from the
 * contract, with people minted the shipped way: Jo creates the table, Ilse
 * (Tamsin) and Pell (Rook) are admitted through real invitations, and Bo is a
 * stranger.
 *
 * The level, ten squares by five:
 *
 *     a solid wall down x = 5 from the top to y = 3;
 *     a crate on (3,1);
 *     Tamsin on (1,1), the kobold on (4,1) behind the crate (half cover);
 *     the goblin on (7,1), past the wall from Tamsin (total cover);
 *     Rook on (7,3), in the open below the goblin, who sees it for the party.
 */

const database = migratedDatabase("taverns_test_level_cover");
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

const part = (n: number) =>
  Schema.decodeSync(LevelPartId)(`1e7e4000-0000-4000-8000-${String(n).padStart(12, "0")}`);

const FLAGSTONE = LEVEL_MATERIALS.indexOf("flagstone");

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const pell = yield* aPerson("Pell");
  const bo = yield* aPerson("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Walled Yard", visibility: "shared" } }),
  )).id;
  const tamsin = yield* aCharacterAt(
    table,
    yield* admittedTo(table, ilse.actor, "Ilse"),
    { name: "Tamsin", hpMax: 30 },
    { seatVisibility: "shared" },
  );
  const rook = yield* aCharacterAt(
    table,
    yield* admittedTo(table, pell.actor, "Pell"),
    { name: "Rook", hpMax: 30 },
    { seatVisibility: "shared" },
  );

  const made = yield* as(jo.token, (client) =>
    client.libraryLevels.create({ payload: { name: "Yard", columns: 10, rows: 5 } }),
  );
  const level = yield* as(jo.token, (client) =>
    client.libraryLevels.save({
      params: { levelId: made.id },
      payload: {
        name: "Yard",
        description: null,
        columns: 10,
        rows: 5,
        feetPerCell: 5,
        ambient: "bright",
        floor: Array.from({ length: 50 }, () => FLAGSTONE),
        walls: [
          { id: part(1), x1: 5, y1: 0, x2: 5, y2: 3, kind: "wall", doorState: null, low: false },
        ],
        props: [
          {
            id: part(2),
            kind: "crate",
            x: 3,
            y: 1,
            rotation: 0,
            blocksMovement: null,
            blocksSight: null,
            cover: null,
            difficult: null,
            dmOnly: false,
          },
        ],
        lights: [],
        regions: [],
        version: made.version,
      },
    }),
  );

  const session = yield* as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number: 1, visibility: "shared" },
    }),
  );
  yield* as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: session.id },
    }),
  );
  const encounter = yield* as(jo.token, (client) =>
    client.encounters.create({
      params: { campaignId: table },
      payload: { name: "In the yard", visibility: "shared", ready: true, levelId: level.id },
    }),
  );
  const fight = yield* as(jo.token, (client) =>
    client.runs.start({
      params: { campaignId: table, sessionId: session.id },
      payload: { encounterId: encounter.id, visibility: "shared" },
    }),
  );
  const params = { campaignId: table, sessionId: session.id, runId: fight.id };
  const add = (displayName: string, ac: number) =>
    as(jo.token, (client) =>
      client.combatants.create({
        params,
        payload: { displayName, ac, kind: "npc", visibility: "shared" },
      }),
    );
  const goblin = yield* add("Goblin", 13);
  const kobold = yield* add("Kobold", 12);
  const rows = yield* as(jo.token, (client) => client.combatants.list({ params }));
  const rowOf = (characterId: CharacterId) => rows.find((row) => row.characterId === characterId)!;
  const tamsinRow = rowOf(tamsin.character.id);
  const rookRow = rowOf(rook.character.id);
  // Out of the way first, so nobody's square is taken, then where the case puts them.
  for (const [id, column, row] of [
    [tamsinRow.id, 0, 4],
    [rookRow.id, 1, 4],
    [goblin.id, 2, 4],
    [kobold.id, 3, 4],
    [tamsinRow.id, 1, 1],
    [rookRow.id, 7, 3],
    [goblin.id, 7, 1],
    [kobold.id, 4, 1],
  ] as const) {
    yield* as(jo.token, (client) =>
      client.combatants.move({
        params: { ...params, combatantId: id },
        payload: { position: { column, row } },
      }),
    );
  }
  for (const id of [tamsinRow.id, rookRow.id]) {
    yield* as(jo.token, (client) =>
      client.combatants.update({
        params: { ...params, combatantId: id },
        payload: { visibility: "shared" },
      }),
    );
  }
  return {
    jo,
    ilse,
    pell,
    bo,
    table,
    params,
    tamsin: { character: tamsin.character.id, row: tamsinRow.id },
    rook: { character: rook.character.id, row: rookRow.id },
    goblin: goblin.id,
    kobold: kobold.id,
  };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "level-cover.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

let requests = 0;

/** An attack's to-hit: a d20 of `d20` and `total` all told, from `from` at `at`. */
const swing = (
  characterId: CharacterId,
  from: CombatantId,
  at: CombatantId,
  d20: number,
  total: number,
  over: Partial<RollCreate> = {},
): RollCreate => ({
  characterId,
  label: "Shortbow",
  notation: `1d20+${String(total - d20)}`,
  dice: [d20],
  kept: [d20],
  modifier: total - d20,
  total,
  mode: "normal",
  kind: "attack",
  combatantId: from,
  targetCombatantId: at,
  delivery: "ranged-weapon",
  requestId: `cover-${String((requests += 1))}`,
  ...over,
});

describeLayer("level-cover", shared, (it) => {
  describe("a seated player's own attack on a level", () => {
    it.effect("adds half cover to the AC the server resolves it against", () =>
      Effect.gen(function* () {
        const f = yield* Fixture;
        // 10 + 3 = 13 hits the kobold's bare 12, and misses 14 behind the crate.
        const shot = yield* as(f.ilse.token, (client) =>
          client.rolls.create({
            params: { campaignId: f.table },
            payload: swing(f.tamsin.character, f.tamsin.row, f.kobold, 10, 13, {
              outcome: "hit",
              targetAc: 12,
            }),
          }),
        );
        expect(shot).toMatchObject({ outcome: "miss", targetAc: null });
        const asDm = yield* as(f.jo.token, (client) =>
          client.rolls.findById({
            params: { campaignId: f.table, sessionId: f.params.sessionId, rollId: shot.id },
          }),
        );
        expect(asDm).toMatchObject({ targetAc: 14, outcome: "miss" });
      }),
    );

    it.effect("refuses a target with total cover from them, in words, and writes nothing", () =>
      Effect.gen(function* () {
        const f = yield* Fixture;
        const before = yield* as(f.jo.token, (client) =>
          client.rolls.list({
            params: { campaignId: f.table, sessionId: f.params.sessionId },
            query: { limit: 100 },
          }),
        );
        for (const payload of [
          swing(f.tamsin.character, f.tamsin.row, f.goblin, 18, 23),
          // Its damage, aimed at the same creature, is no better.
          swing(f.tamsin.character, f.tamsin.row, f.goblin, 4, 6, {
            kind: "damage",
            notation: "1d6+2",
          }),
        ]) {
          const refused = yield* failure(f.ilse.token, (client) =>
            client.rolls.create({ params: { campaignId: f.table }, payload }),
          );
          expect(refused).toEqual({
            tag: "Conflict",
            message:
              "That creature has total cover from you: nothing you aim reaches it past the walls.",
          });
        }
        const after = yield* as(f.jo.token, (client) =>
          client.rolls.list({
            params: { campaignId: f.table, sessionId: f.params.sessionId },
            query: { limit: 100 },
          }),
        );
        expect(after.length).toBe(before.length);
      }),
    );

    it.effect("is each attacker's own: another player in the open hits the bare AC", () =>
      Effect.gen(function* () {
        const f = yield* Fixture;
        // Rook, below the goblin with nothing between: 10 + 3 hits its 13.
        const shot = yield* as(f.pell.token, (client) =>
          client.rolls.create({
            params: { campaignId: f.table },
            payload: swing(f.rook.character, f.rook.row, f.goblin, 10, 13),
          }),
        );
        expect(shot.outcome).toBe("hit");
        const asDm = yield* as(f.jo.token, (client) =>
          client.rolls.findById({
            params: { campaignId: f.table, sessionId: f.params.sessionId, rollId: shot.id },
          }),
        );
        expect(asDm.targetAc).toBe(13);
      }),
    );

    it.effect("is NotFound from somebody else's row, and to a stranger", () =>
      Effect.gen(function* () {
        const f = yield* Fixture;
        // Pell cannot swing from Tamsin's square to dodge Rook's cover.
        const borrowed = yield* failure(f.pell.token, (client) =>
          client.rolls.create({
            params: { campaignId: f.table },
            payload: swing(f.rook.character, f.tamsin.row, f.kobold, 10, 13),
          }),
        );
        expect(borrowed.tag).toBe("NotFound");
        const stranger = yield* failure(f.bo.token, (client) =>
          client.rolls.create({
            params: { campaignId: f.table },
            payload: swing(f.tamsin.character, f.tamsin.row, f.goblin, 10, 13),
          }),
        );
        expect(stranger.tag).toBe("NotFound");
      }),
    );
  });
});
