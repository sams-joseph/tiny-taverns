import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  type Combatant,
  type CombatantId,
  type CreatureId,
  CurrentActor,
  type EncounterId,
  type EncounterRun,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Invites } from "../src/repo/Invites.js";
import { aCharacterAt, admittedTo, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";

/**
 * **A token on the fight's board: put down, moved and taken off by the DM
 * alone, against the fight's own grid** (`0064_combatant_positions.ts`,
 * `Combatants.move`).
 *
 * Over the real application and Postgres. Every token starts off the board;
 * a square is checked against the grid the fight was started on; a repeated
 * `requestId` applies once; the move is contained by the run in its path; and
 * a resumed fight keeps its tokens where they stood. No player read carries a
 * position until the DM shows the map (`player-board.test.ts` is that side),
 * so the player's table and recap are read raw for it.
 *
 * The people are minted the shipped way (`support/actors.ts`): a player
 * admitted through a real invitation with a shared seat, a member whose
 * invitation was withdrawn, another table's creator, and a stranger.
 */
const database = migratedDatabase("taverns_test_combatant_moves");
const services = servicesOver(database);

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(services),
    Layer.provideMerge(database),
  ),
);
afterAll(() => runtime.dispose());

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });
type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  runtime.runPromise(Effect.flatMap(clientFor(token), call).pipe(Effect.orDie));

/** The same call, answering the failure's tag rather than dying on it. */
const attempt = <A, E extends { readonly _tag: string }>(
  token: string,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  runtime.runPromise(
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
    ),
  );

const run = <A, E>(
  effect: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Services<typeof runtime>>,
) => runtime.runPromise(effect.pipe(Effect.orDie));

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie));

/** A request as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, method: "GET" | "POST", path: string, body?: unknown) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const request =
        method === "GET"
          ? HttpClientRequest.get(path)
          : HttpClientRequest.post(path).pipe(HttpClientRequest.bodyJsonUnsafe(body));
      const response = yield* HttpClient.execute(
        request.pipe(HttpClientRequest.bearerToken(token)),
      );
      return { status: response.status, body: yield* response.text };
    }).pipe(Effect.orDie),
  );

interface Person {
  readonly token: string;
  readonly actor: Actor;
}

const person = async (name: string): Promise<Person> => {
  const issued = await run(Effect.flatMap(Accounts, (accounts) => accounts.issue(name)));
  return {
    token: issued.token,
    actor: new Actor({ accountId: issued.accountId, scope: { _tag: "account" } }),
  };
};

interface MovedEvent {
  readonly combatant_id: CombatantId | null;
  readonly visibility: string;
  readonly payload: { readonly from: unknown; readonly to: unknown };
}

const movesIn = (runId: EncounterRun["id"]) =>
  sql(
    (sql) => sql<MovedEvent>`
      select combatant_id, visibility, payload from session_event
      where encounter_run_id = ${runId} and kind = 'combatant-moved'
      order by seq
    `,
  );

let jo: Person;
let ilse: Person;
let stranger: Person;
let rook: Person;
let withdrawn: Person;
let table: CampaignId;
let rooksTable: CampaignId;
let archerId: CreatureId;
let nights = 0;

const night = async () => {
  nights += 1;
  const session = await as(jo.token, (client) =>
    client.sessions.create({
      params: { campaignId: table },
      payload: { number: nights, visibility: "shared" },
    }),
  );
  await as(jo.token, (client) =>
    client.campaigns.update({
      params: { campaignId: table },
      payload: { currentSessionId: session.id },
    }),
  );
  return session.id;
};

/**
 * The ambush, written afresh for each fight: an encounter is played once
 * (`playthroughOf` in `repo/EncounterRuns.ts`), so every fight in this file is
 * its own encounter's one playthrough.
 */
const anAmbush = async (): Promise<EncounterId> =>
  (
    await as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: {
          name: "Ambush in the reeds",
          visibility: "shared",
          ready: true,
          creatures: [{ creatureId: archerId, count: 2 }],
        },
      }),
    )
  ).id;

const fightOn = async (sessionId: SessionId) => {
  const encounterId = await anAmbush();
  const fight = await as(jo.token, (client) =>
    client.runs.start({
      params: { campaignId: table, sessionId },
      payload: { encounterId, visibility: "shared" },
    }),
  );
  const params = { campaignId: table, sessionId, runId: fight.id };
  const order = await as(jo.token, (client) => client.combatants.list({ params }));
  return { fight, params, order };
};

const endNight = (sessionId: SessionId) =>
  as(jo.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId },
      payload: { endedAt: DateTime.nowUnsafe() },
    }),
  );

type Params = Awaited<ReturnType<typeof fightOn>>["params"];

const move = (
  who: Person,
  params: Params,
  combatant: Combatant,
  position: { readonly column: number; readonly row: number } | null,
  requestId?: string,
) =>
  attempt(who.token, (client) =>
    client.combatants.move({
      params: { ...params, combatantId: combatant.id },
      payload: requestId === undefined ? { position } : { position, requestId },
    }),
  );

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
  rook = await person("Rook");
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
  rooksTable = (
    await as(rook.token, (client) =>
      client.campaigns.create({ payload: { name: "Rook's Rest", visibility: "shared" } }),
    )
  ).id;

  const player = await run(admittedTo(table, ilse.actor, "Ilse"));
  await run(
    aCharacterAt(table, player, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" }),
  );
  // `aGroupMemberAt`'s path — admitted by a real invitation, then withdrawn —
  // for an account this file holds a token for.
  withdrawn = await person("Withdrawn");
  await run(
    Effect.gen(function* () {
      const invites = yield* Invites;
      const proof = yield* asDm(jo.actor, table);
      const issued = yield* invites.createForCampaign(proof, { label: "Withdrawn" });
      yield* Effect.provideService(invites.redeem(issued.token), CurrentActor, withdrawn.actor);
      yield* invites.revokeForCampaign(proof, issued.invite.id);
    }),
  );

  archerId = (
    await as(jo.token, (client) =>
      client.library.create({
        payload: { name: "Goblin Archer", type: "Humanoid", cr: "1/4", ac: 15, hp: 7 },
      }),
    )
  ).id;
}, 60_000);

describe("a token starts off the board", () => {
  it("seeds every combatant unplaced, the party and the roster alike", async () => {
    const session = await night();
    const { fight, order } = await fightOn(session);
    expect(order.length).toBe(3);
    for (const combatant of order) expect(combatant.position).toBeNull();
    expect(await movesIn(fight.id)).toEqual([]);
    await endNight(session);
  });
});

describe("the DM moves a token", () => {
  it("puts it down, moves it and takes it off, and the list reads each back", async () => {
    const session = await night();
    const { fight, params, order } = await fightOn(session);
    const archer = order.find((row) => row.kind === "npc")!;

    const placed = await move(jo, params, archer, { column: 0, row: 0 });
    expect(placed).toMatchObject({ ok: true, value: { position: { column: 0, row: 0 } } });
    const moved = await move(jo, params, archer, { column: 5, row: 3 });
    expect(moved).toMatchObject({ ok: true, value: { position: { column: 5, row: 3 } } });

    const listed = await as(jo.token, (client) => client.combatants.list({ params }));
    expect(listed.find((row) => row.id === archer.id)?.position).toEqual({ column: 5, row: 3 });
    // Nobody else moved.
    expect(listed.filter((row) => row.position !== null)).toHaveLength(1);

    const off = await move(jo, params, archer, null);
    expect(off).toMatchObject({ ok: true, value: { position: null } });

    // One line per move, saying where from and where to.
    const log = await movesIn(fight.id);
    expect(log.map((event) => [event.combatant_id, event.payload])).toEqual([
      [archer.id, { from: null, to: { column: 0, row: 0 } }],
      [archer.id, { from: { column: 0, row: 0 }, to: { column: 5, row: 3 } }],
      [archer.id, { from: { column: 5, row: 3 }, to: null }],
    ]);
    await endNight(session);
  });

  it("refuses a square past the fight's own board, and a fight with no board", async () => {
    const session = await night();
    const { fight, params, order } = await fightOn(session);
    const archer = order.find((row) => row.kind === "npc")!;
    const board = await as(jo.token, (client) => client.runs.board({ params }));
    const last = { column: board!.columns - 1, row: board!.rows - 1 };

    expect(await move(jo, params, archer, last)).toMatchObject({ ok: true });
    for (const square of [
      { column: board!.columns, row: 0 },
      { column: 0, row: board!.rows },
    ]) {
      expect(await move(jo, params, archer, square)).toEqual({ ok: false, tag: "Conflict" });
    }
    // Refused, so it stayed where it was.
    const after = await as(jo.token, (client) => client.combatants.list({ params }));
    expect(after.find((row) => row.id === archer.id)?.position).toEqual(last);

    // Outside any board at all, or not a square: the contract refuses it
    // before the repository is asked.
    const path = `/campaigns/${table}/sessions/${session}/runs/${fight.id}/combatants/${archer.id}/move`;
    for (const position of [
      { column: -1, row: 0 },
      { column: 0, row: 200 },
      { column: 1.5, row: 0 },
      { column: 1 },
    ]) {
      expect((await wire(jo.token, "POST", path, { position })).status).toBe(400);
    }

    // With no board there is nowhere to put a token, and taking one off still works.
    await sql((sql) => sql`delete from encounter_run_board where run_id = ${fight.id}`);
    expect(await move(jo, params, archer, { column: 0, row: 0 })).toEqual({
      ok: false,
      tag: "Conflict",
    });
    expect(await move(jo, params, archer, null)).toMatchObject({
      ok: true,
      value: { position: null },
    });
    await endNight(session);
  });

  it("refuses half a square in the table itself", async () => {
    const session = await night();
    const { order } = await fightOn(session);
    const refused = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`update combatant set board_column = 2 where id = ${order[0]!.id}`,
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
      ),
    );
    expect(refused).toContain("combatant_board_position_whole");
    await endNight(session);
  });

  it("applies a repeated requestId once, and answers the state it made", async () => {
    const session = await night();
    const { fight, params, order } = await fightOn(session);
    const archer = order.find((row) => row.kind === "npc")!;
    const requestId = crypto.randomUUID();

    const first = await move(jo, params, archer, { column: 2, row: 2 }, requestId);
    const again = await move(jo, params, archer, { column: 7, row: 7 }, requestId);
    expect(first).toMatchObject({ ok: true, value: { position: { column: 2, row: 2 } } });
    expect(again).toMatchObject({ ok: true, value: { position: { column: 2, row: 2 } } });
    expect(await movesIn(fight.id)).toHaveLength(1);
    await endNight(session);
  });
});

describe("the move is the DM's, and contained by the run in its path", () => {
  it("answers a player, a withdrawn member, another table's DM and a stranger NotFound", async () => {
    const session = await night();
    const { fight, params, order } = await fightOn(session);
    const archer = order.find((row) => row.kind === "npc")!;
    for (const who of [ilse, withdrawn, rook, stranger]) {
      expect(await move(who, params, archer, { column: 1, row: 1 })).toEqual({
        ok: false,
        tag: "NotFound",
      });
    }
    // Another table's creator naming this fight under their own table.
    expect(
      await move(rook, { ...params, campaignId: rooksTable }, archer, { column: 1, row: 1 }),
    ).toEqual({ ok: false, tag: "NotFound" });
    expect(await movesIn(fight.id)).toEqual([]);
    await endNight(session);
  });

  it("does not reach another fight's combatant through this fight's path", async () => {
    const first = await night();
    const earlier = await fightOn(first);
    await endNight(first);

    const second = await night();
    const { params } = await fightOn(second);
    const elsewhere = earlier.order.find((row) => row.kind === "npc")!;
    expect(await move(jo, params, elsewhere, { column: 1, row: 1 })).toEqual({
      ok: false,
      tag: "NotFound",
    });
    // Nor a fight named under the wrong night.
    expect(
      await move(jo, { ...params, sessionId: first }, elsewhere, { column: 1, row: 1 }),
    ).toEqual({ ok: false, tag: "NotFound" });
    const untouched = await sql(
      (sql) => sql<{ readonly board_column: number | null }>`
        select board_column from combatant where id = ${elsewhere.id}
      `,
    );
    expect(untouched[0]?.board_column).toBeNull();
    await endNight(second);
  });
});

describe("a resumed fight", () => {
  it("keeps every token where it stood, and the unplaced ones off the board", async () => {
    const first = await night();
    const { fight, params, order } = await fightOn(first);
    const [one, two] = order.filter((row) => row.kind === "npc");
    await move(jo, params, one!, { column: 4, row: 1 });
    await move(jo, params, two!, { column: 6, row: 9 });
    await endNight(first);

    const second = await night();
    const resumed = await as(jo.token, (client) =>
      client.runs.resume({
        params: { campaignId: table, sessionId: second },
        payload: { continuedFrom: fight.id },
      }),
    );
    const after = await as(jo.token, (client) =>
      client.combatants.list({
        params: { campaignId: table, sessionId: second, runId: resumed.id },
      }),
    );
    const squares = (rows: ReadonlyArray<Combatant>) =>
      rows.map((row) => JSON.stringify(row.position)).sort();
    expect(squares(after)).toEqual(['{"column":4,"row":1}', '{"column":6,"row":9}', "null"].sort());
    await endNight(second);
  });
});

describe("no player read carries a position while the map is not shown", () => {
  it("leaves the player's table and recap without one, and shares no move's line", async () => {
    const session = await night();
    const { fight, params, order } = await fightOn(session);
    const [shown, hidden] = order.filter((row) => row.kind === "npc");
    for (const row of order) {
      if (row.id === hidden!.id) continue;
      await as(jo.token, (client) =>
        client.combatants.update({
          params: { ...params, combatantId: row.id },
          payload: { visibility: "shared" },
        }),
      );
    }
    for (const [index, row] of order.entries()) {
      await move(jo, params, row, { column: index, row: index });
    }

    const tableRead = await wire(ilse.token, "GET", `/campaigns/${table}/table`);
    expect(tableRead.status).toBe(200);
    const live = JSON.parse(tableRead.body) as { readonly fight: { readonly order: unknown[] } };
    // The shared rows are there, so their absence of a position is the
    // narrowing and not an empty fight.
    expect(live.fight.order).toHaveLength(2);
    expect(tableRead.body).not.toContain('"position"');
    expect(tableRead.body).not.toContain('"column"');

    await endNight(session);
    const recap = await wire(
      ilse.token,
      "GET",
      `/campaigns/${table}/sessions/${session}/recap/player`,
    );
    expect(recap.status).toBe(200);
    expect(recap.body).toContain(shown!.displayName);
    expect(recap.body).not.toContain('"position"');
    expect(recap.body).not.toContain('"column"');

    // The log line is shared only where a player's board shows the token,
    // and no board is shown: the fight is shared, the map is not.
    const log = await movesIn(fight.id);
    expect(log).toHaveLength(3);
    expect(log.every((event) => event.visibility === "dm")).toBe(true);
  });
});
