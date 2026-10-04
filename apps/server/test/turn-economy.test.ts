import { describe, expect } from "@effect/vitest";
import {
  type Combatant,
  type CombatantId,
  type CombatantTurn,
  type DiagonalRule,
  type EncounterRun,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { applicationOver, servicesOver } from "../src/app.js";
import { type Person, aCharacterAt, admittedTo, aPerson } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **This turn's spending, on the fight's own row** (`0086_turn_economy.ts`):
 * the DM's ticks (`Combatants.turn`), the feet a move counts while its mover
 * is up (`Combatants.move`), the fresh turn the server gives whoever the
 * marker lands on (`freshTurn`), and the campaign's diagonal rule the count
 * is measured under.
 *
 * Over the real application and Postgres, with the people minted the shipped
 * way (`support/actors.ts`): a player admitted through a real invitation with
 * a shared seat, another table's creator, and a stranger.
 */
const database = migratedDatabase("taverns_test_turn_economy");
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

/** A read as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  const rook = yield* aPerson("Rook");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const rooksTable = (yield* as(rook.token, (client) =>
    client.campaigns.create({ payload: { name: "Rook's Rest", visibility: "shared" } }),
  )).id;

  const player = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, player, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" });

  const archerId = (yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
    }),
  )).id;

  return { jo, ilse, stranger, rook, table, rooksTable, archerId };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "turn-economy.test/Fixture",
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

const diagonals = (rule: DiagonalRule) =>
  Effect.gen(function* () {
    const { jo, table } = yield* Fixture;
    yield* as(jo.token, (client) =>
      client.campaigns.update({ params: { campaignId: table }, payload: { diagonalRule: rule } }),
    );
  });

/**
 * A fight on the night, still rolling initiative: Tamsin and two archers, each
 * encounter played once (`playthroughOf`), so every fight is its own.
 */
const rolling = (sessionId: SessionId) =>
  Effect.gen(function* () {
    const { jo, table, archerId } = yield* Fixture;
    const encounterId = (yield* as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: {
          name: "Ambush in the reeds",
          visibility: "shared",
          ready: true,
          creatures: [{ creatureId: archerId, count: 2 }],
        },
      }),
    )).id;
    const fight = yield* as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId },
        payload: { encounterId, visibility: "shared" },
      }),
    );
    const params = { campaignId: table, sessionId, runId: fight.id };
    const seeded = yield* as(jo.token, (client) => client.combatants.list({ params }));
    const tamsin = seeded.find((row) => row.kind === "pc")!;
    const [first, second] = seeded.filter((row) => row.kind === "npc");
    // Tamsin, then one archer, then the other: the order every test walks.
    yield* as(jo.token, (client) =>
      client.runs.setInitiative({
        params,
        payload: {
          entries: [
            { combatantId: tamsin.id, initiative: 20 },
            { combatantId: first!.id, initiative: 15 },
            { combatantId: second!.id, initiative: 10 },
          ],
        },
      }),
    );
    return { fight, params, tamsin, archer: first!, other: second! };
  });

type Fight = Effect.Success<ReturnType<typeof rolling>>;
type Params = Fight["params"];

/** The same fight, round 1 begun: Tamsin is up. */
const underWay = (sessionId: SessionId) =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    const fight = yield* rolling(sessionId);
    yield* as(jo.token, (client) => client.runs.begin({ params: fight.params, payload: {} }));
    return fight;
  });

const rowsOf = (params: Params) =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    const rows = yield* as(jo.token, (client) => client.combatants.list({ params }));
    return new Map(rows.map((row) => [row.id, row]));
  });

/** What the runner's *This turn* block reads off a row. */
const spent = (row: Combatant | undefined) =>
  row === undefined
    ? undefined
    : {
        actionUsed: row.actionUsed,
        bonusUsed: row.bonusUsed,
        reactionUsed: row.reactionUsed,
        feetMoved: row.feetMoved,
      };

const unspent = { actionUsed: false, bonusUsed: false, reactionUsed: false, feetMoved: 0 };

const tick = (who: Person, params: Params, combatant: Combatant, payload: CombatantTurn) =>
  attempt(who.token, (client) =>
    client.combatants.turn({ params: { ...params, combatantId: combatant.id }, payload }),
  );

const move = (
  params: Params,
  combatant: Combatant,
  position: { readonly column: number; readonly row: number } | null,
) =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    return yield* as(jo.token, (client) =>
      client.combatants.move({
        params: { ...params, combatantId: combatant.id },
        payload: { position },
      }),
    );
  });

const nextTurn = (params: Params) =>
  Effect.gen(function* () {
    const { jo } = yield* Fixture;
    return yield* as(jo.token, (client) => client.runs.nextTurn({ params, payload: {} }));
  });

interface UpdatedEvent {
  readonly combatant_id: CombatantId | null;
  readonly visibility: string;
  readonly payload: Record<string, unknown>;
}

const updatesIn = (runId: EncounterRun["id"]) =>
  sql(
    (sql) => sql<UpdatedEvent>`
      select combatant_id, visibility, payload from session_event
      where encounter_run_id = ${runId} and kind = 'combatant-updated'
      order by seq
    `,
  );

describeLayer("turn-economy", shared, (it) => {
  describe("the DM's ticks", () => {
    it.effect("marks and unmarks each one, leaving what it does not name", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const session = yield* night;
        const { fight, params, tamsin } = yield* underWay(session);
        expect(spent((yield* rowsOf(params)).get(tamsin.id))).toEqual(unspent);

        const marked = yield* tick(jo, params, tamsin, { actionUsed: true, bonusUsed: true });
        expect(marked).toMatchObject({ ok: true, value: { actionUsed: true, bonusUsed: true } });
        const unmarked = yield* tick(jo, params, tamsin, { bonusUsed: false, reactionUsed: true });
        expect(unmarked.ok && spent(unmarked.value)).toEqual({
          actionUsed: true,
          bonusUsed: false,
          reactionUsed: true,
          feetMoved: 0,
        });

        // One line a write, each the DM's alone whatever the row's visibility.
        const log = yield* updatesIn(fight.id);
        expect(log.map((event) => [event.combatant_id, event.visibility, event.payload])).toEqual([
          [tamsin.id, "dm", { actionUsed: true, bonusUsed: true }],
          [tamsin.id, "dm", { bonusUsed: false, reactionUsed: true }],
        ]);
        yield* endNight(session);
      }),
    );

    it.effect("applies a repeated requestId once, and writes nothing for an empty tick", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const session = yield* night;
        const { fight, params, archer } = yield* underWay(session);
        const requestId = crypto.randomUUID();

        yield* tick(jo, params, archer, { reactionUsed: true, requestId });
        const again = yield* tick(jo, params, archer, { reactionUsed: false, requestId });
        expect(again).toMatchObject({ ok: true, value: { reactionUsed: true } });
        expect(yield* tick(jo, params, archer, {})).toMatchObject({
          ok: true,
          value: { reactionUsed: true },
        });
        expect(yield* updatesIn(fight.id)).toHaveLength(1);
        yield* endNight(session);
      }),
    );

    it.effect("answers a player, another table's DM and a stranger NotFound", () =>
      Effect.gen(function* () {
        const { ilse, rook, stranger, rooksTable } = yield* Fixture;
        const session = yield* night;
        const { fight, params, tamsin } = yield* underWay(session);
        // Ilse's own character's row is no more hers to tick than a monster's.
        for (const who of [ilse, rook, stranger]) {
          expect(yield* tick(who, params, tamsin, { actionUsed: true })).toEqual({
            ok: false,
            tag: "NotFound",
          });
        }
        expect(
          yield* tick(rook, { ...params, campaignId: rooksTable }, tamsin, { actionUsed: true }),
        ).toEqual({ ok: false, tag: "NotFound" });
        expect(spent((yield* rowsOf(params)).get(tamsin.id))).toEqual(unspent);
        expect(yield* updatesIn(fight.id)).toEqual([]);
        yield* endNight(session);
      }),
    );

    it.effect("does not reach another fight's combatant through this fight's path", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const first = yield* night;
        const earlier = yield* underWay(first);
        yield* endNight(first);

        const second = yield* night;
        const { params } = yield* underWay(second);
        expect(yield* tick(jo, params, earlier.tamsin, { actionUsed: true })).toEqual({
          ok: false,
          tag: "NotFound",
        });
        const untouched = yield* sql(
          (sql) => sql<{ readonly action_used: boolean }>`
            select action_used from combatant where id = ${earlier.tamsin.id}
          `,
        );
        expect(untouched[0]?.action_used).toBe(false);
        yield* endNight(second);
      }),
    );
  });

  describe("a fresh turn for whoever comes up", () => {
    it.effect("clears the incoming creature's row on Next turn, and nobody else's", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const session = yield* night;
        const { params, tamsin, archer, other } = yield* underWay(session);
        yield* tick(jo, params, tamsin, { actionUsed: true });
        // Every token starts on the board: off it first, so this is a put-down.
        yield* move(params, tamsin, null);
        yield* move(params, tamsin, { column: 0, row: 0 });
        yield* move(params, tamsin, { column: 5, row: 0 });
        // Spent on somebody else's turn: the archer's reaction, the other's bonus.
        yield* tick(jo, params, archer, { reactionUsed: true, actionUsed: true });
        yield* tick(jo, params, other, { reactionUsed: true });

        const run = yield* nextTurn(params);
        expect(run.activeCombatantId).toBe(archer.id);
        const rows = yield* rowsOf(params);
        expect(spent(rows.get(archer.id))).toEqual(unspent);
        // Tamsin's turn is over, not restarted; the other's reaction is still spent.
        expect(spent(rows.get(tamsin.id))).toMatchObject({ actionUsed: true, feetMoved: 25 });
        expect(spent(rows.get(other.id))).toMatchObject({ reactionUsed: true });

        // Round over: Tamsin comes round again and starts fresh.
        yield* nextTurn(params);
        const wrapped = yield* nextTurn(params);
        expect(wrapped).toMatchObject({ activeCombatantId: tamsin.id, round: 2 });
        const after = yield* rowsOf(params);
        expect(spent(after.get(tamsin.id))).toEqual(unspent);
        expect(spent(after.get(other.id))).toEqual(unspent);
        yield* endNight(session);
      }),
    );

    it.effect("clears the first up when the round starts", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const session = yield* night;
        const { params, tamsin, archer } = yield* rolling(session);
        // Ticked while rolling: nothing stops it, and nothing counts it as a turn.
        yield* tick(jo, params, tamsin, { actionUsed: true });
        yield* tick(jo, params, archer, { reactionUsed: true });

        const run = yield* as(jo.token, (client) => client.runs.begin({ params, payload: {} }));
        expect(run.activeCombatantId).toBe(tamsin.id);
        const rows = yield* rowsOf(params);
        expect(spent(rows.get(tamsin.id))).toEqual(unspent);
        expect(spent(rows.get(archer.id))).toMatchObject({ reactionUsed: true });
        yield* endNight(session);
      }),
    );

    it.effect("clears whoever the DM puts the marker on, but not a marker left where it is", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const session = yield* night;
        const { params, tamsin, other } = yield* underWay(session);
        yield* tick(jo, params, tamsin, { bonusUsed: true });
        yield* tick(jo, params, other, { reactionUsed: true });

        // *Make it their turn* on whoever is already up restarts nothing.
        yield* as(jo.token, (client) =>
          client.runs.update({ params, payload: { activeCombatantId: tamsin.id } }),
        );
        expect(spent((yield* rowsOf(params)).get(tamsin.id))).toMatchObject({ bonusUsed: true });

        yield* as(jo.token, (client) =>
          client.runs.update({ params, payload: { activeCombatantId: other.id } }),
        );
        const rows = yield* rowsOf(params);
        expect(spent(rows.get(other.id))).toEqual(unspent);
        expect(spent(rows.get(tamsin.id))).toMatchObject({ bonusUsed: true });
        yield* endNight(session);
      }),
    );

    it.effect("clears the next one up when whoever was up leaves the fight", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const session = yield* night;
        const { params, tamsin, archer } = yield* underWay(session);
        yield* tick(jo, params, archer, { reactionUsed: true });

        yield* as(jo.token, (client) =>
          client.combatants.remove({ params: { ...params, combatantId: tamsin.id } }),
        );
        const run = yield* as(jo.token, (client) => client.runs.findById({ params }));
        expect(run.activeCombatantId).toBe(archer.id);
        expect(spent((yield* rowsOf(params)).get(archer.id))).toEqual(unspent);
        yield* endNight(session);
      }),
    );
  });

  describe("feet moved", () => {
    for (const [rule, feet] of [
      ["five", 20],
      ["alternating", 30],
    ] as const) {
      it.effect(`counts a move by whoever is up under the ${rule} rule`, () =>
        Effect.gen(function* () {
          const session = yield* night;
          yield* diagonals(rule);
          const { params, tamsin } = yield* underWay(session);
          const { jo } = yield* Fixture;
          const board = yield* as(jo.token, (client) => client.runs.board({ params }));
          expect(board?.feetPerCell).toBe(5);

          // Putting the token down walks nowhere.
          // Every token starts on the board: off it first, so this is a put-down.
          yield* move(params, tamsin, null);
          yield* move(params, tamsin, { column: 0, row: 0 });
          expect((yield* move(params, tamsin, { column: 4, row: 4 })).feetMoved).toBe(feet);
          // Three squares straight on is fifteen feet under either rule, added on.
          const further = yield* move(params, tamsin, { column: 7, row: 4 });
          expect(further.feetMoved).toBe(feet + 15);
          // Taking it off walks nowhere either.
          expect((yield* move(params, tamsin, null)).feetMoved).toBe(feet + 15);
          yield* diagonals("five");
          yield* endNight(session);
        }),
      );
    }

    it.effect("counts nothing for a creature that is not up", () =>
      Effect.gen(function* () {
        const session = yield* night;
        const { params, archer } = yield* underWay(session);
        // Every token starts on the board: off it first, so this is a put-down.
        yield* move(params, archer, null);
        yield* move(params, archer, { column: 0, row: 0 });
        expect((yield* move(params, archer, { column: 5, row: 0 })).feetMoved).toBe(0);
        yield* endNight(session);
      }),
    );

    it.effect("counts nothing while initiative is being rolled", () =>
      Effect.gen(function* () {
        const session = yield* night;
        const { params, tamsin } = yield* rolling(session);
        // Every token starts on the board: off it first, so this is a put-down.
        yield* move(params, tamsin, null);
        yield* move(params, tamsin, { column: 0, row: 0 });
        expect((yield* move(params, tamsin, { column: 5, row: 0 })).feetMoved).toBe(0);
        yield* endNight(session);
      }),
    );
  });

  describe("the creator's alone", () => {
    it.effect("reaches no player's table or recap", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        const session = yield* night;
        const { params, tamsin, archer, other } = yield* underWay(session);
        for (const row of [tamsin, archer, other]) {
          yield* as(jo.token, (client) =>
            client.combatants.update({
              params: { ...params, combatantId: row.id },
              payload: { visibility: "shared" },
            }),
          );
        }
        yield* tick(jo, params, tamsin, { actionUsed: true });
        // Every token starts on the board: off it first, so this is a put-down.
        yield* move(params, tamsin, null);
        yield* move(params, tamsin, { column: 0, row: 0 });
        yield* move(params, tamsin, { column: 3, row: 0 });

        const tableRead = yield* wire(ilse.token, `/campaigns/${table}/table`);
        expect(tableRead.status).toBe(200);
        // The rows are there, so the absence is the narrowing and not an empty fight.
        expect(tableRead.body).toContain('"Tamsin"');
        for (const key of ["actionUsed", "bonusUsed", "reactionUsed", "feetMoved"]) {
          expect(tableRead.body).not.toContain(key);
        }

        yield* endNight(session);
        const recap = yield* wire(
          ilse.token,
          `/campaigns/${table}/sessions/${session}/recap/player`,
        );
        expect(recap.status).toBe(200);
        expect(recap.body).toContain('"Tamsin"');
        expect(recap.body).not.toContain("feetMoved");
        expect(recap.body).not.toContain("actionUsed");
      }),
    );
  });

  describe("a resumed fight", () => {
    it.effect("picks the turn up where it was", () =>
      Effect.gen(function* () {
        const { jo, table } = yield* Fixture;
        const first = yield* night;
        const { fight, params, tamsin } = yield* underWay(first);
        yield* tick(jo, params, tamsin, { actionUsed: true });
        // Every token starts on the board: off it first, so this is a put-down.
        yield* move(params, tamsin, null);
        yield* move(params, tamsin, { column: 0, row: 0 });
        yield* move(params, tamsin, { column: 4, row: 0 });
        yield* endNight(first);

        const second = yield* night;
        const resumed = yield* as(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: second },
            payload: { continuedFrom: fight.id },
          }),
        );
        const rows = yield* as(jo.token, (client) =>
          client.combatants.list({
            params: { campaignId: table, sessionId: second, runId: resumed.id },
          }),
        );
        expect(spent(rows.find((row) => row.kind === "pc"))).toEqual({
          actionUsed: true,
          bonusUsed: false,
          reactionUsed: false,
          feetMoved: 20,
        });
        yield* endNight(second);
      }),
    );
  });

  describe("the campaign's diagonal rule", () => {
    it.effect("starts at five, is the creator's to set, and every member reads it", () =>
      Effect.gen(function* () {
        const { jo, ilse, table, rook } = yield* Fixture;
        const fresh = yield* as(jo.token, (client) =>
          client.campaigns.create({ payload: { name: "Fresh" } }),
        );
        expect(fresh.diagonalRule).toBe("five");

        yield* diagonals("alternating");
        const read = yield* as(ilse.token, (client) =>
          client.campaigns.findById({ params: { campaignId: table } }),
        );
        expect(read.diagonalRule).toBe("alternating");

        for (const who of [ilse, rook]) {
          expect(
            yield* attempt(who.token, (client) =>
              client.campaigns.update({
                params: { campaignId: table },
                payload: { diagonalRule: "five" },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
        }
        const still = yield* as(jo.token, (client) =>
          client.campaigns.findById({ params: { campaignId: table } }),
        );
        expect(still.diagonalRule).toBe("alternating");
        yield* diagonals("five");
      }),
    );

    it.effect("refuses a rule that is not one, in the table itself", () =>
      Effect.gen(function* () {
        const { table } = yield* Fixture;
        const refused = yield* Effect.flatMap(
          SqlClient.SqlClient,
          (sql) => sql`update campaign set diagonal_rule = 'euclid' where id = ${table}`,
        ).pipe(
          Effect.flip,
          // The driver's error, which names the constraint, is the innermost cause.
          Effect.map((error) => {
            const seen: Array<string> = [];
            for (let at: unknown = error; at !== null && at !== undefined;) {
              seen.push(String((at as { readonly constraint?: unknown }).constraint ?? at));
              at = (at as { readonly cause?: unknown }).cause;
            }
            return seen.join("\n");
          }),
        );
        expect(refused).toContain("campaign_diagonal_rule_check");
      }),
    );
  });
});
