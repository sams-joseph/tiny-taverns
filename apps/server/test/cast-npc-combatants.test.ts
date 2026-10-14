import { describe, expect } from "@effect/vitest";
import { type CampaignId, type NpcId, type SessionId, TavernsApi } from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { aCharacterAt, admittedTo, aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A member of the Cast in a fight as itself** (`0101_cast_npc_combatants.ts`):
 * a roster line names the NPC and the stat block it fights as, `start` seeds a
 * combatant that points at the NPC and carries its name and its sheet's
 * numbers, and nothing a player reads follows the pointer.
 *
 * Over the real application and Postgres, with the people minted the shipped
 * way (`support/actors.ts`): the DM, a player admitted by a real invitation
 * with a shared seat, and another table's DM. The NPC is kept hidden from the
 * table and its private material and prep carry sentinels, which the player's
 * table, recap and encounters are read raw for.
 */
const database = migratedDatabase("taverns_test_cast_npc_combatants");
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

/** The same call, answering the failure's tag rather than dying on it. */
const attempt = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(token), call).pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catch((error: unknown) =>
      Effect.succeed({
        ok: false as const,
        tag:
          typeof error === "object" && error !== null && "_tag" in error
            ? String(error._tag)
            : "unknown",
      }),
    ),
  );

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

/** A GET as it goes over the wire: the status and the body, undecoded. */
const raw = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

const SECRET = "SENTINEL-SILDAR-SERVES-THE-BLACK-SPIDER";
const INSTRUCTIONS = "SENTINEL-PLAY-HIM-AS-A-LIAR";
const WHEREABOUTS = "SENTINEL-HIDING-IN-THE-MILL-CELLAR";
const SENTINELS = [SECRET, INSTRUCTIONS, WHEREABOUTS];
const leaked = (text: string) => SENTINELS.filter((sentinel) => text.includes(sentinel));

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const rook = yield* aPerson("Rook");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "Phandalin", visibility: "shared" } }),
  )).id;
  const rooksTable = (yield* as(rook.token, (client) =>
    client.campaigns.create({ payload: { name: "Rook's Rest", visibility: "shared" } }),
  )).id;
  const player = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, player, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" });

  // A Library Veteran, so the roster mints the campaign's instance of it.
  const veteranId = (yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Veteran", type: "Humanoid", cr: "3", ac: 17, hp: 58 },
    }),
  )).id;
  const goblinId = (yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Goblin", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
    }),
  )).id;

  const npc = (name: string, campaignId: CampaignId, token: string) =>
    as(token, (client) =>
      client.npcs.create({
        params: { campaignId },
        payload: {
          name,
          role: "Hired sword",
          privateMaterial: { secrets: SECRET, instructions: INSTRUCTIONS },
        },
      }),
    );
  const sildar = yield* npc("Sildar Hallwinter", table, jo.token);
  yield* as(jo.token, (client) =>
    client.npcs.updatePrep({
      params: { campaignId: table, npcId: sildar.id },
      payload: { attitude: "friendly", whereabouts: WHEREABOUTS },
    }),
  );
  // His own numbers: armour and hit points the Veteran's block does not have.
  yield* as(jo.token, (client) =>
    client.npcs.putSheet({
      params: { campaignId: table, npcId: sildar.id },
      payload: {
        level: 5,
        className: "Fighter",
        ac: 18,
        hpMax: 44,
        sheet: { abilities: [], traits: [] },
      },
    }),
  );
  const sheetless = yield* npc("Toblen Stonehill", table, jo.token);
  const elsewhere = yield* npc("Rook's Captain", rooksTable, rook.token);
  return { jo, ilse, rook, table, veteranId, goblinId, sildar, sheetless, elsewhere };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "cast-npc-combatants.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

let nights = 0;

const night = Effect.gen(function* () {
  const { jo, table } = yield* Fixture;
  nights += 1;
  const number = nights;
  const session = yield* as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number, visibility: "shared" },
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
  Effect.gen(function* () {
    const { jo, table } = yield* Fixture;
    yield* as(jo.token, (client) =>
      client.sessions.update({
        params: { campaignId: table, sessionId },
        payload: { endedAt: DateTime.nowUnsafe() },
      }),
    );
  });

/** An encounter with Sildar fighting as a Veteran on the party's side, and goblins against it. */
const anAmbush = (name: string, npcId: NpcId) =>
  Effect.gen(function* () {
    const { jo, table, veteranId, goblinId } = yield* Fixture;
    return yield* as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: {
          name,
          visibility: "shared",
          ready: true,
          creatures: [
            { creatureId: goblinId, count: 2 },
            { creatureId: veteranId, npcId, count: 1, side: "party" },
          ],
        },
      }),
    );
  });

describeLayer("cast-npc-combatants", shared, (it) => {
  describe("a roster line names a member of the Cast", () => {
    it.effect("as itself, fighting as a creature that a line of its own may name too", () =>
      Effect.gen(function* () {
        const { jo, table, veteranId, sildar } = yield* Fixture;
        const encounter = yield* anAmbush("Cragmaw hideout", sildar.id);
        const params = { campaignId: table, encounterId: encounter.id };
        const lines = yield* as(jo.token, (client) => client.encounterCreatures.list({ params }));
        const cast = lines.find((line) => line.npc !== null)!;
        expect(cast).toMatchObject({
          name: "Veteran",
          count: 1,
          side: "party",
          npc: { id: sildar.id, name: "Sildar Hallwinter", archived: false },
        });
        // Three plain Veterans beside him: their own line, on the copy he fights as.
        const veterans = yield* as(jo.token, (client) =>
          client.encounterCreatures.create({
            params,
            payload: { creatureId: veteranId, count: 3 },
          }),
        );
        expect(veterans).toMatchObject({ npc: null, count: 3, creatureId: cast.creatureId });
        expect(encounter.creatureCount).toBe(3);

        // He is in it once, and he is one.
        expect(
          yield* attempt(jo.token, (client) =>
            client.encounterCreatures.create({
              params,
              payload: { creatureId: veteranId, npcId: sildar.id },
            }),
          ),
        ).toMatchObject({ ok: false, tag: "Conflict" });
        expect(
          yield* attempt(jo.token, (client) =>
            client.encounterCreatures.update({
              params: { ...params, encounterCreatureId: cast.id },
              payload: { count: 2 },
            }),
          ),
        ).toMatchObject({ ok: false, tag: "Conflict" });
        expect(
          (yield* raw(jo.token, `/campaigns/${table}/encounters/${encounter.id}/creatures`)).status,
        ).toBe(200);
      }),
    );

    it.effect("refuses an NPC of another table, and an archived one, as not there", () =>
      Effect.gen(function* () {
        const { jo, table, veteranId, sheetless, elsewhere } = yield* Fixture;
        const encounter = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table },
            payload: { name: "Nobody yet", visibility: "dm" },
          }),
        );
        const params = { campaignId: table, encounterId: encounter.id };
        const add = (npcId: NpcId) =>
          attempt(jo.token, (client) =>
            client.encounterCreatures.create({ params, payload: { creatureId: veteranId, npcId } }),
          );
        expect(yield* add(elsewhere.id)).toMatchObject({ ok: false, tag: "NotFound" });
        yield* as(jo.token, (client) =>
          client.npcs.archive({ params: { campaignId: table, npcId: sheetless.id }, payload: {} }),
        );
        expect(yield* add(sheetless.id)).toMatchObject({ ok: false, tag: "NotFound" });
        yield* as(jo.token, (client) =>
          client.npcs.restore({ params: { campaignId: table, npcId: sheetless.id }, payload: {} }),
        );
        expect(yield* add(sheetless.id)).toMatchObject({ ok: true });
      }),
    );
  });

  describe("a fight seeds it", () => {
    it.effect("with its name, its sheet's numbers and its line's side, and resume keeps it", () =>
      Effect.gen(function* () {
        const { jo, table, sildar } = yield* Fixture;
        const session = yield* night;
        const encounter = yield* anAmbush("The Triboar trail", sildar.id);
        const fight = yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table, sessionId: session },
            payload: { encounterId: encounter.id, visibility: "shared" },
          }),
        );
        const runParams = { campaignId: table, sessionId: session, runId: fight.id };
        const order = yield* as(jo.token, (client) =>
          client.combatants.list({ params: runParams }),
        );
        const him = order.find((row) => row.npcId === sildar.id)!;
        expect(him).toMatchObject({
          displayName: "Sildar Hallwinter",
          kind: "npc",
          side: "party",
          ac: 18,
          hpMax: 44,
          hpCurrent: 44,
          subtitle: "Humanoid",
        });
        expect(him.creatureId).not.toBeNull();
        expect(order.filter((row) => row.npcId === null && row.kind === "npc")).toHaveLength(2);

        // The night ends with the fight on the table, which carries it; picked
        // up on the next, it is the same NPC.
        yield* endNight(session);
        const next = yield* night;
        const resumed = yield* as(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: next },
            payload: { continuedFrom: fight.id },
          }),
        );
        const again = yield* as(jo.token, (client) =>
          client.combatants.list({
            params: { campaignId: table, sessionId: next, runId: resumed.id },
          }),
        );
        expect(again.find((row) => row.displayName === "Sildar Hallwinter")?.npcId).toBe(sildar.id);
        yield* endNight(next);
      }),
    );

    it.effect("takes the stat block's numbers for an NPC with no sheet", () =>
      Effect.gen(function* () {
        const { jo, table, sheetless, veteranId } = yield* Fixture;
        const session = yield* night;
        const encounter = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table },
            payload: {
              name: "A brawl at the Stonehill",
              visibility: "shared",
              ready: true,
              creatures: [{ creatureId: veteranId, npcId: sheetless.id, count: 1 }],
            },
          }),
        );
        const fight = yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table, sessionId: session },
            payload: { encounterId: encounter.id, visibility: "shared" },
          }),
        );
        const order = yield* as(jo.token, (client) =>
          client.combatants.list({
            params: { campaignId: table, sessionId: session, runId: fight.id },
          }),
        );
        expect(order.find((row) => row.npcId === sheetless.id)).toMatchObject({
          displayName: "Toblen Stonehill",
          side: "foes",
          ac: 17,
          hpMax: 58,
        });
        yield* endNight(session);
      }),
    );
  });

  describe("what a player reads", () => {
    it.effect("is the combatant's own snapshot, and not one byte of the NPC behind it", () =>
      Effect.gen(function* () {
        const { jo, ilse, table, sildar } = yield* Fixture;
        const session = yield* night;
        const encounter = yield* anAmbush("The Cragmaw road", sildar.id);
        const fight = yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table, sessionId: session },
            payload: { encounterId: encounter.id, visibility: "shared" },
          }),
        );
        const runParams = { campaignId: table, sessionId: session, runId: fight.id };
        const order = yield* as(jo.token, (client) =>
          client.combatants.list({ params: runParams }),
        );
        // The DM shares every row; the NPC itself stays hidden from the table.
        for (const row of order) {
          yield* as(jo.token, (client) =>
            client.combatants.update({
              params: { ...runParams, combatantId: row.id },
              payload: { visibility: "shared" },
            }),
          );
        }
        yield* as(jo.token, (client) =>
          client.encounterCreatures.list({
            params: { campaignId: table, encounterId: encounter.id },
          }),
        ).pipe(
          Effect.flatMap((lines) =>
            Effect.forEach(lines, (line) =>
              as(jo.token, (client) =>
                client.encounterCreatures.update({
                  params: {
                    campaignId: table,
                    encounterId: encounter.id,
                    encounterCreatureId: line.id,
                  },
                  payload: { visibility: "shared" },
                }),
              ),
            ),
          ),
        );

        const table_ = yield* raw(ilse.token, `/campaigns/${table}/table`);
        expect(table_.status).toBe(200);
        expect(table_.body).toContain("Sildar Hallwinter");
        expect(leaked(table_.body)).toEqual([]);
        expect(table_.body).not.toContain('"npcId"');
        expect(table_.body).not.toContain(sildar.id);
        expect(table_.body).not.toContain('"side"');

        const encounters = yield* raw(ilse.token, `/campaigns/${table}/player-encounters`);
        expect(encounters.status).toBe(200);
        expect(leaked(encounters.body)).toEqual([]);
        expect(encounters.body).not.toContain("Sildar");
        expect(encounters.body).not.toContain(sildar.id);

        // The NPC is hidden from the table: a player cannot find it by its id.
        expect(
          (yield* raw(ilse.token, `/campaigns/${table}/npcs/${sildar.id}/player`)).status,
        ).toBe(404);

        yield* as(jo.token, (client) => client.runs.end({ params: runParams, payload: {} }));
        const recap = yield* raw(
          ilse.token,
          `/campaigns/${table}/sessions/${session}/recap/player`,
        );
        expect(recap.status).toBe(200);
        expect(recap.body).toContain("Sildar Hallwinter");
        expect(leaked(recap.body)).toEqual([]);
        expect(recap.body).not.toContain('"npcId"');
        expect(recap.body).not.toContain(sildar.id);
        yield* endNight(session);
      }),
    );
  });

  describe("deleting the NPC", () => {
    it.effect("takes its roster lines and leaves its combatant standing, pointing at nobody", () =>
      Effect.gen(function* () {
        const { jo, table, veteranId } = yield* Fixture;
        const doomed = yield* as(jo.token, (client) =>
          client.npcs.create({ params: { campaignId: table }, payload: { name: "Glasstaff" } }),
        );
        const session = yield* night;
        const encounter = yield* as(jo.token, (client) =>
          client.encounters.create({
            params: { campaignId: table },
            payload: {
              name: "Tresendar Manor",
              visibility: "shared",
              ready: true,
              creatures: [{ creatureId: veteranId, npcId: doomed.id, count: 1 }],
            },
          }),
        );
        const fight = yield* as(jo.token, (client) =>
          client.runs.start({
            params: { campaignId: table, sessionId: session },
            payload: { encounterId: encounter.id, visibility: "shared" },
          }),
        );
        // No endpoint deletes a campaign NPC yet; the key's rule is what is held here.
        yield* sql((sql) => sql`delete from npc where id = ${doomed.id}`);
        const lines = yield* as(jo.token, (client) =>
          client.encounterCreatures.list({
            params: { campaignId: table, encounterId: encounter.id },
          }),
        );
        expect(lines).toEqual([]);
        const order = yield* as(jo.token, (client) =>
          client.combatants.list({
            params: { campaignId: table, sessionId: session, runId: fight.id },
          }),
        );
        expect(order.find((row) => row.displayName === "Glasstaff")).toMatchObject({
          npcId: null,
          kind: "npc",
        });
        yield* endNight(session);
      }),
    );
  });
});
