import { describe, expect } from "@effect/vitest";
import {
  Actor,
  type Combatant,
  CurrentActor,
  type EncounterId,
  type EncounterRun,
  type EncounterRunUpdate,
  type PlayerLiveTable,
  type RollCreate,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { Context, DateTime, Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Invites } from "../src/repo/Invites.js";
import { aCharacterAt, admittedTo, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **The fight's board on a player's table: shown only while the fight is
 * shared, the DM has turned on *Share map* and the reader holds a seat; with
 * the board's size and scale, never the level's description; and with a token only for
 * a row the player's order already holds, and none for a monster while the DM
 * hides hostile tokens** (`0067_run_map_sharing.ts`, `repo/PlayerTable.ts`).
 *
 * Over the real application: the real handlers and Postgres. The wire is read
 * raw wherever a leak is the question, because the derived client decodes into
 * the narrow schema and would drop a field the server should never have sent.
 *
 * The people are minted the shipped way (`support/actors.ts`): a player
 * admitted through a real invitation with a seat the creator shared, a member
 * with no seat, a member whose invitation was withdrawn, and a stranger.
 */

const database = migratedDatabase("taverns_test_player_board");
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
const wire = (token: string, path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.execute(
      HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
    );
    return { status: response.status, body: yield* response.text };
  }).pipe(Effect.orDie);

interface Person {
  readonly token: string;
  readonly actor: Actor;
}

const person = (name: string) =>
  Effect.gen(function* () {
    const issued = yield* Effect.flatMap(Accounts, (accounts) => accounts.issue(name));
    return {
      token: issued.token,
      actor: new Actor({ accountId: issued.accountId, scope: { _tag: "account" } }),
    } satisfies Person;
  });

/** The DM's prose on the encounter's level: planted, so its absence can be looked for. */
const SETTING = "SETTING-A-SECRET-DOOR behind the reeds";

const makeFixture = Effect.gen(function* () {
  const jo = yield* person("Jo");
  const ilse = yield* person("Ilse");
  const unseated = yield* person("Unseated");
  const stranger = yield* person("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  const elsewhere = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "Salt and Sixpence", visibility: "shared" } }),
  )).id;

  // The creator's own seat, so the table answers them too.
  yield* aCharacterAt(table, jo.actor, { name: "Jo's Cleric", hpMax: 20 });
  const player = yield* admittedTo(table, ilse.actor, "Ilse");
  yield* aCharacterAt(table, player, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" });
  yield* admittedTo(table, unseated.actor, "Unseated");
  // `aGroupMemberAt`'s path — admitted by a real invitation, then withdrawn —
  // for an account this file holds a token for.
  const withdrawn = yield* person("Withdrawn");
  yield* Effect.gen(function* () {
    const invites = yield* Invites;
    const proof = yield* asDm(jo.actor, table);
    const issued = yield* invites.createForCampaign(proof, { label: "Withdrawn" });
    yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, withdrawn.actor);
    yield* invites.revokeForCampaign(proof, issued.invite.id);
  });

  const archerId = (yield* as(jo.token, (client) =>
    client.library.create({
      payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
    }),
  )).id;
  const secret = (yield* as(jo.token, (client) =>
    client.encounters.create({
      params: { campaignId: table },
      payload: {
        name: "NAME-THE-DMS-OWN",
        setting: SETTING,
        creatures: [{ creatureId: archerId, count: 2 }],
      },
    }),
  )).id;
  const talk = (yield* as(jo.token, (client) =>
    client.encounters.create({
      params: { campaignId: table },
      payload: {
        name: "Parley at the ford",
        kind: "social",
        setting: SETTING,
        visibility: "shared",
        ready: true,
        creatures: [{ creatureId: archerId, count: 2 }],
      },
    }),
  )).id;
  return { jo, ilse, unseated, withdrawn, stranger, table, elsewhere, archerId, secret, talk };
}).pipe(Effect.orDie);

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "player-board.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

let nights = 0;

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

const endNight = (sessionId: SessionId) =>
  Effect.flatMap(Fixture, ({ jo, table }) =>
    as(jo.token, (client) =>
      client.sessions.update({
        params: { campaignId: table, sessionId },
        payload: { endedAt: DateTime.nowUnsafe() },
      }),
    ),
  );

/**
 * The ambush, written afresh for each fight on its own level: an encounter is
 * played once (`playthroughOf` in `repo/EncounterRuns.ts`), so every fight on
 * it here is a different encounter's one playthrough.
 */
const anAmbush = () =>
  Effect.gen(function* () {
    const { jo, table, archerId } = yield* Fixture;
    const ambush = yield* as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: {
          name: "Ambush in the reeds",
          setting: SETTING,
          visibility: "shared",
          ready: true,
          creatures: [{ creatureId: archerId, count: 2 }],
        },
      }),
    );
    return ambush.id;
  });

/**
 * A shared fight on the ambush (or `encounterId`) with every row shared but one
 * archer, the player's token and both archers' put down, and nothing else set.
 */
const fightOn = (sessionId: SessionId, encounterId?: EncounterId) =>
  Effect.gen(function* () {
    const { jo, table } = yield* Fixture;
    const onTable = encounterId ?? (yield* anAmbush());
    const fight = yield* as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId },
        payload: { encounterId: onTable, visibility: "shared" },
      }),
    );
    const params = { campaignId: table, sessionId, runId: fight.id };
    const order = yield* as(jo.token, (client) => client.combatants.list({ params }));
    const pc = order.find((row) => row.displayName === "Tamsin")!;
    const [archer, lurker] = order.filter((row) => row.kind === "npc");
    for (const row of [pc, archer!]) {
      yield* as(jo.token, (client) =>
        client.combatants.update({
          params: { ...params, combatantId: row.id },
          payload: { visibility: "shared" },
        }),
      );
    }
    for (const [row, square] of [
      [pc, { column: 1, row: 2 }],
      [archer!, { column: 3, row: 4 }],
      [lurker!, { column: 5, row: 6 }],
    ] as const) {
      yield* as(jo.token, (client) =>
        client.combatants.move({
          params: { ...params, combatantId: row.id },
          payload: { position: square },
        }),
      );
    }
    return { fight, params, pc, archer: archer!, lurker: lurker! };
  });

type Params = Effect.Success<ReturnType<typeof fightOn>>["params"];

const set = (params: Params, payload: EncounterRunUpdate) =>
  Effect.flatMap(Fixture, ({ jo }) =>
    as(jo.token, (client) => client.runs.update({ params, payload })),
  );

const tableOf = (who: Person) =>
  Effect.flatMap(Fixture, ({ table }) =>
    as(who.token, (client) => client.table.read({ params: { campaignId: table } })),
  );

const rawTableOf = (who: Person) =>
  Effect.flatMap(Fixture, ({ table }) => wire(who.token, `/campaigns/${table}/table`));

const tokensOf = (read: PlayerLiveTable | null) =>
  (read?.fight?.board?.tokens ?? []).map((token) => [token.combatantId, token.position]);

const eventsOf = (runId: EncounterRun["id"], kind: string) =>
  sql(
    (sql) => sql<{ readonly combatant_id: Combatant["id"] | null; readonly visibility: string }>`
      select combatant_id, visibility from session_event
      where encounter_run_id = ${runId} and kind = ${kind}
      order by seq
    `,
  );

const makeShown = Effect.gen(function* () {
  const session = yield* night();
  const { fight, params, pc, archer, lurker } = yield* fightOn(session);
  const shown = yield* set(params, { mapShown: true });
  expect(shown.mapShown).toBe(true);
  yield* Effect.addFinalizer(() => endNight(session));
  return { session, fight, params, pc, archer, lurker };
});

class Shown extends Context.Service<Shown, Effect.Success<typeof makeShown>>()(
  "player-board.test/Shown",
) {}

describeLayer("player-board", shared, (it) => {
  describe("before the DM shows the map", () => {
    it.effect(
      "puts no board on the table, and no position anywhere, while the fight is shared",
      () =>
        Effect.gen(function* () {
          const { ilse } = yield* Fixture;
          const session = yield* night();
          const { fight } = yield* fightOn(session);
          expect(fight.mapShown).toBe(false);
          expect(fight.hostileTokensHidden).toBe(false);

          const read = yield* tableOf(ilse);
          expect(read?.fight?.id).toBe(fight.id);
          expect(read?.fight?.board).toBeNull();
          const raw = yield* rawTableOf(ilse);
          expect(raw.body).toContain('"board":null');
          for (const leak of ['"position"', '"column"', "SETTING-A-SECRET"]) {
            expect(raw.body).not.toContain(leak);
          }
          // No move left a shared line: nobody could see one.
          const moves = yield* eventsOf(fight.id, "combatant-moved");
          expect(moves).toHaveLength(3);
          expect(moves.every((event) => event.visibility === "dm")).toBe(true);
          yield* endNight(session);
        }),
    );
  });

  it.layer(Layer.effect(Shown)(makeShown))("once the DM shows the map", (it) => {
    describe("its acts", () => {
      /** The DM's own roll, filed as the runner files one: theirs alone. */
      const dmRoll = (payload: Partial<RollCreate>) =>
        Effect.flatMap(Fixture, ({ jo, table }) =>
          as(jo.token, (client) =>
            client.rolls.create({
              params: { campaignId: table },
              payload: {
                label: "DM-ROLL-LABEL",
                notation: "1d20+4",
                dice: [16],
                kept: [16],
                modifier: 4,
                total: 4242,
                mode: "normal",
                visibility: "dm",
                ...payload,
              },
            }),
          ),
        );
      const actsOf = (read: PlayerLiveTable | null) => read?.fight?.acts ?? [];
      const madeLine = (rollId: string) =>
        sql(
          (sql) => sql<{ readonly visibility: string; readonly payload: unknown }>`
            select visibility, payload from session_event
            where kind = 'roll-made' and payload ->> 'rollId' = ${rollId}
          `,
        );

      it.effect(
        "draws the DM's attack between two creatures the player sees, and rings their table with its id alone",
        () =>
          Effect.gen(function* () {
            const { pc, archer } = yield* Shown;
            const { ilse } = yield* Fixture;
            const shot = yield* dmRoll({
              kind: "attack",
              combatantId: archer.id,
              targetCombatantId: pc.id,
              targetAc: 16,
              outcome: "hit",
              delivery: "ranged-weapon",
              damageType: "piercing",
            });
            expect(shot.visibility).toBe("dm");
            expect(actsOf(yield* tableOf(ilse))).toContainEqual({
              kind: "strike",
              id: shot.id,
              from: archer.id,
              to: pc.id,
              delivery: "ranged-weapon",
              damageType: "piercing",
              outcome: "hit",
            });
            // The wire carries the act, and nothing of the roll behind it.
            const raw = JSON.stringify(yield* rawTableOf(ilse));
            expect(raw).not.toContain("DM-ROLL-LABEL");
            expect(raw).not.toContain("4242");
            // Its line rings the table, and says no more than which roll.
            expect(yield* madeLine(shot.id)).toEqual([
              { visibility: "shared", payload: { rollId: shot.id } },
            ]);
          }),
      );

      it.effect(
        "draws nothing of an attack by a creature the player cannot see, and rings nobody",
        () =>
          Effect.gen(function* () {
            const { pc, lurker } = yield* Shown;
            const { ilse } = yield* Fixture;
            const unseen = yield* dmRoll({
              kind: "attack",
              combatantId: lurker.id,
              targetCombatantId: pc.id,
              delivery: "melee-weapon",
            });
            expect(actsOf(yield* tableOf(ilse)).map((act) => act.id)).not.toContain(unseen.id);
            expect((yield* madeLine(unseen.id))[0]?.visibility).toBe("dm");
          }),
      );

      it.effect(
        "draws an area wherever it went, naming its creature only when the player sees it",
        () =>
          Effect.gen(function* () {
            const { archer, lurker } = yield* Shown;
            const { ilse } = yield* Fixture;
            const area = { shape: "sphere", feet: 10, origin: { column: 2, row: 3 } } as const;
            const seen = yield* dmRoll({ kind: "damage", combatantId: archer.id, area });
            const hidden = yield* dmRoll({ kind: "damage", combatantId: lurker.id, area });
            const acts = actsOf(yield* tableOf(ilse));
            expect(acts.find((act) => act.id === seen.id)).toMatchObject({
              kind: "blast",
              from: archer.id,
              area,
            });
            expect(acts.find((act) => act.id === hidden.id)).toMatchObject({
              kind: "blast",
              from: null,
              area,
            });
          }),
      );

      it.effect(
        "unsays an attack once fog covers a creature in it, and draws none off the map",
        () =>
          Effect.gen(function* () {
            const { params, pc, archer } = yield* Shown;
            const { jo, ilse } = yield* Fixture;
            const shot = yield* dmRoll({
              kind: "attack",
              combatantId: archer.id,
              targetCombatantId: pc.id,
              delivery: "ranged-weapon",
            });
            yield* as(jo.token, (client) =>
              client.runs.updateFog({ params, payload: { hide: [{ column: 3, row: 4 }] } }),
            );
            expect(actsOf(yield* tableOf(ilse)).map((act) => act.id)).not.toContain(shot.id);
            yield* as(jo.token, (client) =>
              client.runs.updateFog({ params, payload: { reveal: [{ column: 3, row: 4 }] } }),
            );
            expect(actsOf(yield* tableOf(ilse)).map((act) => act.id)).toContain(shot.id);

            yield* set(params, { mapShown: false });
            expect(actsOf(yield* tableOf(ilse))).toEqual([]);
            yield* set(params, { mapShown: true });
          }),
      );
    });

    it.effect("shows the fight's own size and scale", () =>
      Effect.gen(function* () {
        const { params } = yield* Shown;
        const { jo, ilse } = yield* Fixture;
        const board = yield* as(jo.token, (client) => client.runs.board({ params }));
        const read = yield* tableOf(ilse);
        expect(read?.fight?.board).toMatchObject({
          columns: board!.columns,
          rows: board!.rows,
          feetPerCell: board!.feetPerCell,
        });
      }),
    );

    it.effect("puts a token only for a row in the player's order that the DM has put down", () =>
      Effect.gen(function* () {
        const { params, pc, archer, lurker } = yield* Shown;
        const { jo, ilse } = yield* Fixture;
        const read = yield* tableOf(ilse);
        const order = read!.fight!.order.map((row) => row.combatantId);
        expect(order).toContain(pc.id);
        expect(order).toContain(archer.id);
        // The hidden archer has no row, so no token, though it stands on the board.
        expect(order).not.toContain(lurker.id);
        expect(tokensOf(read).sort()).toEqual(
          [
            [pc.id, { column: 1, row: 2 }],
            [archer.id, { column: 3, row: 4 }],
          ].sort(),
        );

        // Taken off the board, it has no token; its row stays.
        yield* as(jo.token, (client) =>
          client.combatants.move({
            params: { ...params, combatantId: archer.id },
            payload: { position: null },
          }),
        );
        const after = yield* tableOf(ilse);
        expect(after!.fight!.order.map((row) => row.combatantId)).toContain(archer.id);
        expect(tokensOf(after)).toEqual([[pc.id, { column: 1, row: 2 }]]);
        yield* as(jo.token, (client) =>
          client.combatants.move({
            params: { ...params, combatantId: archer.id },
            payload: { position: { column: 3, row: 4 } },
          }),
        );
      }),
    );

    it.effect("never carries the level's description or its id", () =>
      Effect.gen(function* () {
        const { lurker } = yield* Shown;
        const { ilse } = yield* Fixture;
        const raw = yield* rawTableOf(ilse);
        expect(raw.status).toBe(200);
        for (const leak of [
          '"setting"',
          '"description"',
          "SETTING-A-SECRET",
          '"levelId"',
          lurker.id,
        ]) {
          expect(raw.body).not.toContain(leak);
        }
        expect(Object.keys(JSON.parse(raw.body).fight.board).sort()).toEqual(
          ["area", "columns", "feetPerCell", "fog", "rows", "tokens"].sort(),
        );
      }),
    );

    it.effect(
      "hides every monster's token while hostile tokens are hidden, and keeps their rows",
      () =>
        Effect.gen(function* () {
          const { fight, params, pc, archer } = yield* Shown;
          const { jo, ilse } = yield* Fixture;
          const hidden = yield* set(params, { hostileTokensHidden: true });
          expect(hidden.hostileTokensHidden).toBe(true);
          const read = yield* tableOf(ilse);
          expect(read!.fight!.order.map((row) => row.combatantId)).toContain(archer.id);
          expect(tokensOf(read)).toEqual([[pc.id, { column: 1, row: 2 }]]);
          expect((yield* rawTableOf(ilse)).body).not.toContain('"column":3');

          // A monster's move is the DM's line while it is hidden; the party's is shared.
          yield* as(jo.token, (client) =>
            client.combatants.move({
              params: { ...params, combatantId: archer.id },
              payload: { position: { column: 7, row: 7 } },
            }),
          );
          yield* as(jo.token, (client) =>
            client.combatants.move({
              params: { ...params, combatantId: pc.id },
              payload: { position: { column: 2, row: 2 } },
            }),
          );
          const moves = (yield* eventsOf(fight.id, "combatant-moved")).slice(-2);
          expect(moves).toEqual([
            { combatant_id: archer.id, visibility: "dm" },
            { combatant_id: pc.id, visibility: "shared" },
          ]);

          yield* set(params, { hostileTokensHidden: false });
          expect(tokensOf(yield* tableOf(ilse)).sort()).toEqual(
            [
              [pc.id, { column: 2, row: 2 }],
              [archer.id, { column: 7, row: 7 }],
            ].sort(),
          );
        }),
    );

    it.effect(
      "keeps a creature on the party's side on the board while hostile tokens are hidden",
      () =>
        Effect.gen(function* () {
          const { params, pc, archer } = yield* Shown;
          const { jo, ilse } = yield* Fixture;
          const turn = (side: "party" | "foes") =>
            as(jo.token, (client) =>
              client.combatants.update({
                params: { ...params, combatantId: archer.id },
                payload: { side },
              }),
            );
          yield* turn("party");
          yield* set(params, { hostileTokensHidden: true });
          const read = yield* tableOf(ilse);
          expect(
            tokensOf(read)
              .map(([id]) => id)
              .sort(),
          ).toEqual([pc.id, archer.id].sort());
          // The side itself is the creator's: the player's wire never spells it.
          expect((yield* rawTableOf(ilse)).body).not.toContain('"side"');
          yield* set(params, { hostileTokensHidden: false });
          yield* turn("foes");
        }),
    );

    it.effect("logs each switch as a shared line while the fight is shared", () =>
      Effect.gen(function* () {
        const { fight, params } = yield* Shown;
        const before = (yield* eventsOf(fight.id, "run-updated")).length;
        yield* set(params, { hostileTokensHidden: true });
        yield* set(params, { hostileTokensHidden: false });
        const after = (yield* eventsOf(fight.id, "run-updated")).slice(before);
        expect(after.map((event) => event.visibility)).toEqual(["shared", "shared"]);
      }),
    );

    it.effect("goes with the fight's Share, and comes back as the DM left it", () =>
      Effect.gen(function* () {
        const { fight, params, pc } = yield* Shown;
        const { jo, ilse } = yield* Fixture;
        yield* set(params, { visibility: "dm" });
        expect((yield* tableOf(ilse))?.fight).toBeNull();
        // The creator, seated at their own table, still reads the unshared fight;
        // the board is the fight's Share's all the same, and so is a move's line.
        expect((yield* tableOf(jo))?.fight?.board).toBeNull();
        yield* as(jo.token, (client) =>
          client.combatants.move({
            params: { ...params, combatantId: pc.id },
            payload: { position: { column: 2, row: 3 } },
          }),
        );
        expect((yield* eventsOf(fight.id, "combatant-moved")).at(-1)?.visibility).toBe("dm");
        yield* set(params, { visibility: "shared" });
        expect((yield* tableOf(ilse))?.fight?.board).not.toBeNull();

        yield* set(params, { mapShown: false });
        expect((yield* tableOf(ilse))?.fight?.board).toBeNull();
        yield* set(params, { mapShown: true });
        expect((yield* tableOf(ilse))?.fight?.board).not.toBeNull();
      }),
    );

    it.effect("is the DM's switch: a player cannot turn it", () =>
      Effect.gen(function* () {
        const { params } = yield* Shown;
        const { jo, ilse } = yield* Fixture;
        expect(
          yield* attempt(ilse.token, (client) =>
            client.runs.update({ params, payload: { mapShown: false, hostileTokensHidden: true } }),
          ),
        ).toEqual({ ok: false, tag: "NotFound" });
        const still = yield* as(jo.token, (client) => client.runs.findById({ params }));
        expect([still.mapShown, still.hostileTokensHidden]).toEqual([true, false]);
      }),
    );

    it.effect(
      "answers a member with no seat nothing, and a withdrawn member and a stranger NotFound",
      () =>
        Effect.gen(function* () {
          const { unseated, withdrawn, stranger, table } = yield* Fixture;
          expect(yield* tableOf(unseated)).toBeNull();
          for (const who of [withdrawn, stranger]) {
            expect(
              yield* attempt(who.token, (client) =>
                client.table.read({ params: { campaignId: table } }),
              ),
            ).toEqual({ ok: false, tag: "NotFound" });
            const raw = yield* rawTableOf(who);
            expect(raw.status).toBe(404);
          }
        }),
    );
  });

  describe("a fight on an encounter the players may not read", () => {
    it.effect("shows the board without naming the encounter", () =>
      Effect.gen(function* () {
        const { ilse, secret } = yield* Fixture;
        const session = yield* night();
        const { params } = yield* fightOn(session, secret);
        yield* set(params, { mapShown: true });
        const read = yield* tableOf(ilse);
        expect(read?.fight?.encounterId).toBeNull();
        expect(read?.fight?.board).not.toBeNull();
        const raw = yield* rawTableOf(ilse);
        expect(raw.body).not.toContain("NAME-THE-DMS-OWN");
        expect(raw.body).not.toContain(secret);
        expect(raw.body).not.toContain("SETTING-A-SECRET");
        yield* endNight(session);
      }),
    );
  });

  describe("a conversation", () => {
    it.effect("shows no board until it turns into a fight", () =>
      Effect.gen(function* () {
        const { jo, ilse, talk } = yield* Fixture;
        const session = yield* night();
        const { fight, params } = yield* fightOn(session, talk);
        expect(fight.mode).toBe("social");
        yield* set(params, { mapShown: true });
        const before = yield* rawTableOf(ilse);
        expect(before.body).toContain('"board":null');
        expect(before.body).not.toContain('"position"');

        yield* as(jo.token, (client) => client.runs.escalate({ params, payload: {} }));
        expect((yield* tableOf(ilse))?.fight?.board?.tokens.length).toBeGreaterThan(0);
        yield* endNight(session);
      }),
    );
  });

  describe("a resumed fight", () => {
    it.effect("keeps the map's two switches as the DM left them", () =>
      Effect.gen(function* () {
        const { jo, ilse, table } = yield* Fixture;
        const first = yield* night();
        const { fight, params } = yield* fightOn(first);
        yield* set(params, { mapShown: true, hostileTokensHidden: true });
        yield* endNight(first);

        const second = yield* night();
        const resumed = yield* as(jo.token, (client) =>
          client.runs.resume({
            params: { campaignId: table, sessionId: second },
            payload: { continuedFrom: fight.id },
          }),
        );
        expect([resumed.mapShown, resumed.hostileTokensHidden]).toEqual([true, true]);
        const read = yield* tableOf(ilse);
        expect(read?.fight?.id).toBe(resumed.id);
        expect(read?.fight?.board?.tokens.map((token) => token.position)).toEqual([
          { column: 1, row: 2 },
        ]);
        yield* endNight(second);
      }),
    );
  });
});
