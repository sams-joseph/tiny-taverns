import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  type Combatant,
  type CreatureId,
  CurrentActor,
  type EncounterId,
  type EncounterRun,
  type EncounterRunUpdate,
  type PlayerLiveTable,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls, signedPath } from "../src/images/ImageUrls.js";
import { Invites } from "../src/repo/Invites.js";
import { ImageRecords } from "../src/repo/Images.js";
import { ObjectStorage } from "../src/storage/ObjectStorage.js";
import { aCharacterAt, admittedTo, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedImages } from "./support/imageModel.js";

/**
 * **The fight's board on a player's table: shown only while the fight is
 * shared, the DM has turned on *Share map* and the reader holds a seat; with
 * the grid and Hob's picture, never the setting line; and with a token only for
 * a row the player's order already holds, and none for a monster while the DM
 * hides hostile tokens** (`0067_run_map_sharing.ts`, `repo/PlayerTable.ts`).
 *
 * Over the real application: the real handlers, the real image worker and
 * signer, and Postgres. The image endpoint is scripted
 * (`support/imageModel.ts`), so no request leaves the process. The wire is read
 * raw wherever a leak is the question, because the derived client decodes into
 * the narrow schema and would drop a field the server should never have sent.
 *
 * The people are minted the shipped way (`support/actors.ts`): a player
 * admitted through a real invitation with a seat the creator shared, a member
 * with no seat, a member whose invitation was withdrawn, and a stranger.
 */

const SECRET = Redacted.make("player-board-test-secret");
const images = scriptedImages({ apiUrl: "https://api.openai.com/v1", model: "gpt-image-x" });

/** The clock image URLs are minted and checked against. */
const now = Date.now();

const database = migratedDatabase("taverns_test_player_board");
const services = servicesOver(
  database,
  undefined,
  undefined,
  undefined,
  ObjectStorage.memory,
  ImageUrls.layer(SECRET, () => now),
  HobImages.layer({
    generation: Option.some({ limits: { perAccountPerDay: 12, perDay: 100 }, concurrency: 2 }),
    storageOn: true,
  }).pipe(Layer.provide(images.layer)),
);

const runtime = ManagedRuntime.make(
  applicationOver(services, { quiet: true }).pipe(
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provideMerge(ImageRecords.layer),
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

/** Wait for every drawing job to finish. */
const settled = () => runtime.runPromise(Effect.flatMap(HobImages, (worker) => worker.idle));

/** A GET as it goes over the wire: the status and the body, undecoded. */
const wire = (token: string, path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.get(path).pipe(HttpClientRequest.bearerToken(token)),
      );
      return { status: response.status, body: yield* response.text };
    }).pipe(Effect.orDie),
  );

/** Fetch a path as an `<img>` does: no bearer. */
const load = (path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.get(path);
      return response.status;
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

/** The DM's prose on the map: planted, so its absence can be looked for. */
const SETTING = "SETTING-A-SECRET-DOOR behind the reeds";

let jo: Person;
let ilse: Person;
let unseated: Person;
let withdrawn: Person;
let stranger: Person;
let table: CampaignId;
let elsewhere: CampaignId;
let archerId: CreatureId;
let secret: EncounterId;
let talk: EncounterId;
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

const endNight = (sessionId: SessionId) =>
  as(jo.token, (client) =>
    client.sessions.update({
      params: { campaignId: table, sessionId },
      payload: { endedAt: DateTime.nowUnsafe() },
    }),
  );

/**
 * The ambush, written afresh for each fight with its map drawn: an encounter is
 * played once (`playthroughOf` in `repo/EncounterRuns.ts`), so every fight on
 * it here is a different encounter's one playthrough.
 */
const anAmbush = async (): Promise<EncounterId> => {
  const ambush = await as(jo.token, (client) =>
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
  await settled();
  return ambush.id;
};

/**
 * A shared fight on the ambush (or `encounterId`) with every row shared but one
 * archer, the player's token and both archers' put down, and nothing else set.
 */
const fightOn = async (sessionId: SessionId, encounterId?: EncounterId) => {
  const onTable = encounterId ?? (await anAmbush());
  const fight = await as(jo.token, (client) =>
    client.runs.start({
      params: { campaignId: table, sessionId },
      payload: { encounterId: onTable, visibility: "shared" },
    }),
  );
  const params = { campaignId: table, sessionId, runId: fight.id };
  const order = await as(jo.token, (client) => client.combatants.list({ params }));
  const pc = order.find((row) => row.displayName === "Tamsin")!;
  const [archer, lurker] = order.filter((row) => row.kind === "npc");
  for (const row of [pc, archer!]) {
    await as(jo.token, (client) =>
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
    await as(jo.token, (client) =>
      client.combatants.move({
        params: { ...params, combatantId: row.id },
        payload: { position: square },
      }),
    );
  }
  return { fight, params, pc, archer: archer!, lurker: lurker! };
};

type Params = Awaited<ReturnType<typeof fightOn>>["params"];

const set = (params: Params, payload: EncounterRunUpdate) =>
  as(jo.token, (client) => client.runs.update({ params, payload }));

const tableOf = (who: Person) =>
  as(who.token, (client) => client.table.read({ params: { campaignId: table } }));

const rawTableOf = (who: Person) => wire(who.token, `/campaigns/${table}/table`);

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

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  unseated = await person("Unseated");
  stranger = await person("Bo");
  table = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
    )
  ).id;
  elsewhere = (
    await as(jo.token, (client) =>
      client.campaigns.create({ payload: { name: "Salt and Sixpence", visibility: "shared" } }),
    )
  ).id;

  // The creator's own seat, so the table answers them too.
  await run(aCharacterAt(table, jo.actor, { name: "Jo's Cleric", hpMax: 20 }));
  const player = await run(admittedTo(table, ilse.actor, "Ilse"));
  await run(
    aCharacterAt(table, player, { name: "Tamsin", hpMax: 30 }, { seatVisibility: "shared" }),
  );
  await run(admittedTo(table, unseated.actor, "Unseated"));
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
  secret = (
    await as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: table },
        payload: {
          name: "NAME-THE-DMS-OWN",
          setting: SETTING,
          creatures: [{ creatureId: archerId, count: 2 }],
        },
      }),
    )
  ).id;
  talk = (
    await as(jo.token, (client) =>
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
    )
  ).id;
  await settled();
}, 60_000);

describe("before the DM shows the map", () => {
  it("puts no board on the table, and no position anywhere, while the fight is shared", async () => {
    const session = await night();
    const { fight } = await fightOn(session);
    expect(fight.mapShown).toBe(false);
    expect(fight.hostileTokensHidden).toBe(false);

    const read = await tableOf(ilse);
    expect(read?.fight?.id).toBe(fight.id);
    expect(read?.fight?.board).toBeNull();
    const raw = await rawTableOf(ilse);
    expect(raw.body).toContain('"board":null');
    for (const leak of ['"position"', '"column"', "battle-map-images", "SETTING-A-SECRET"]) {
      expect(raw.body).not.toContain(leak);
    }
    // No move left a shared line: nobody could see one.
    const moves = await eventsOf(fight.id, "combatant-moved");
    expect(moves).toHaveLength(3);
    expect(moves.every((event) => event.visibility === "dm")).toBe(true);
    await endNight(session);
  });
});

describe("once the DM shows the map", () => {
  let session: SessionId;
  let fight: EncounterRun;
  let params: Params;
  let pc: Combatant;
  let archer: Combatant;
  let lurker: Combatant;

  beforeAll(async () => {
    session = await night();
    ({ fight, params, pc, archer, lurker } = await fightOn(session));
    const shown = await set(params, { mapShown: true });
    expect(shown.mapShown).toBe(true);
  }, 60_000);

  afterAll(() => endNight(session));

  it("shows the fight's own grid and Hob's picture", async () => {
    const board = await as(jo.token, (client) => client.runs.board({ params }));
    const read = await tableOf(ilse);
    expect(board?.image).not.toBeNull();
    expect(read?.fight?.board).toMatchObject({
      grid: board!.grid,
      columns: board!.columns,
      rows: board!.rows,
      feetPerCell: board!.feetPerCell,
      alignment: board!.alignment,
    });
    expect(read?.fight?.board?.image).toEqual(board!.image);
  });

  it("puts a token only for a row in the player's order that the DM has put down", async () => {
    const read = await tableOf(ilse);
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
    await as(jo.token, (client) =>
      client.combatants.move({
        params: { ...params, combatantId: archer.id },
        payload: { position: null },
      }),
    );
    const after = await tableOf(ilse);
    expect(after!.fight!.order.map((row) => row.combatantId)).toContain(archer.id);
    expect(tokensOf(after)).toEqual([[pc.id, { column: 1, row: 2 }]]);
    await as(jo.token, (client) =>
      client.combatants.move({
        params: { ...params, combatantId: archer.id },
        payload: { position: { column: 3, row: 4 } },
      }),
    );
  });

  it("never carries the setting line, the map's id or whether a picture is pending", async () => {
    const board = await as(jo.token, (client) => client.runs.board({ params }));
    const raw = await rawTableOf(ilse);
    expect(raw.status).toBe(200);
    for (const leak of [
      '"setting"',
      "SETTING-A-SECRET",
      '"mapId"',
      board!.mapId!,
      '"imagePending"',
      lurker.id,
    ]) {
      expect(raw.body).not.toContain(leak);
    }
    expect(Object.keys(JSON.parse(raw.body).fight.board).sort()).toEqual(
      ["alignment", "columns", "feetPerCell", "grid", "image", "rows", "tokens"].sort(),
    );
  });

  it("signs a picture that opens, and that no other kind's route opens", async () => {
    const image = (await tableOf(ilse))!.fight!.board!.image!;
    for (const path of [image.cardUrl, image.fullUrl]) {
      expect(path).toMatch(/^\/battle-map-images\/[0-9a-f-]+\/(card|full)\?e=\d+&s=/);
      expect(await load(path)).toBe(200);
    }
    const imageId = new URL(image.cardUrl, "http://x").pathname.split("/")[2]!;
    for (const path of [
      image.cardUrl.replace("/battle-map-images/", "/campaign-images/"),
      image.cardUrl.replace("/battle-map-images/", "/portraits/"),
      signedPath(SECRET, "campaign", imageId, "card", now).replace(
        "/campaign-images/",
        "/battle-map-images/",
      ),
    ]) {
      expect(await load(path), path).toBe(404);
    }
  });

  it("hides every monster's token while hostile tokens are hidden, and keeps their rows", async () => {
    const hidden = await set(params, { hostileTokensHidden: true });
    expect(hidden.hostileTokensHidden).toBe(true);
    const read = await tableOf(ilse);
    expect(read!.fight!.order.map((row) => row.combatantId)).toContain(archer.id);
    expect(tokensOf(read)).toEqual([[pc.id, { column: 1, row: 2 }]]);
    expect((await rawTableOf(ilse)).body).not.toContain('"column":3');

    // A monster's move is the DM's line while it is hidden; the party's is shared.
    await as(jo.token, (client) =>
      client.combatants.move({
        params: { ...params, combatantId: archer.id },
        payload: { position: { column: 7, row: 7 } },
      }),
    );
    await as(jo.token, (client) =>
      client.combatants.move({
        params: { ...params, combatantId: pc.id },
        payload: { position: { column: 2, row: 2 } },
      }),
    );
    const moves = (await eventsOf(fight.id, "combatant-moved")).slice(-2);
    expect(moves).toEqual([
      { combatant_id: archer.id, visibility: "dm" },
      { combatant_id: pc.id, visibility: "shared" },
    ]);

    await set(params, { hostileTokensHidden: false });
    expect(tokensOf(await tableOf(ilse)).sort()).toEqual(
      [
        [pc.id, { column: 2, row: 2 }],
        [archer.id, { column: 7, row: 7 }],
      ].sort(),
    );
  });

  it("logs each switch as a shared line while the fight is shared", async () => {
    const before = (await eventsOf(fight.id, "run-updated")).length;
    await set(params, { hostileTokensHidden: true });
    await set(params, { hostileTokensHidden: false });
    const after = (await eventsOf(fight.id, "run-updated")).slice(before);
    expect(after.map((event) => event.visibility)).toEqual(["shared", "shared"]);
  });

  it("goes with the fight's Share, and comes back as the DM left it", async () => {
    await set(params, { visibility: "dm" });
    expect((await tableOf(ilse))?.fight).toBeNull();
    // The creator, seated at their own table, still reads the unshared fight;
    // the board is the fight's Share's all the same, and so is a move's line.
    expect((await tableOf(jo))?.fight?.board).toBeNull();
    await as(jo.token, (client) =>
      client.combatants.move({
        params: { ...params, combatantId: pc.id },
        payload: { position: { column: 2, row: 3 } },
      }),
    );
    expect((await eventsOf(fight.id, "combatant-moved")).at(-1)?.visibility).toBe("dm");
    await set(params, { visibility: "shared" });
    expect((await tableOf(ilse))?.fight?.board).not.toBeNull();

    await set(params, { mapShown: false });
    expect((await tableOf(ilse))?.fight?.board).toBeNull();
    await set(params, { mapShown: true });
    expect((await tableOf(ilse))?.fight?.board).not.toBeNull();
  });

  it("is the DM's switch: a player cannot turn it", async () => {
    expect(
      await attempt(ilse.token, (client) =>
        client.runs.update({ params, payload: { mapShown: false, hostileTokensHidden: true } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });
    const still = await as(jo.token, (client) => client.runs.findById({ params }));
    expect([still.mapShown, still.hostileTokensHidden]).toEqual([true, false]);
  });

  it("answers a member with no seat nothing, and a withdrawn member and a stranger NotFound", async () => {
    expect(await tableOf(unseated)).toBeNull();
    for (const who of [withdrawn, stranger]) {
      expect(
        await attempt(who.token, (client) => client.table.read({ params: { campaignId: table } })),
      ).toEqual({ ok: false, tag: "NotFound" });
      const raw = await rawTableOf(who);
      expect(raw.status).toBe(404);
      expect(raw.body).not.toContain("battle-map-images");
    }
  });

  it("reaches no other table's map through the board's pointer", async () => {
    const other = await as(jo.token, (client) =>
      client.encounters.create({
        params: { campaignId: elsewhere },
        payload: { name: "Across the water", setting: "A drowned chapel" },
      }),
    );
    await settled();
    const theirs = await as(jo.token, (client) =>
      client.battleMaps.find({ params: { campaignId: elsewhere, encounterId: other.id } }),
    );
    expect(theirs.image).not.toBeNull();
    const ours = await sql(
      (sql) => sql<{ readonly map_id: string }>`
        select map_id from encounter_run_board where run_id = ${fight.id}
      `,
    );
    // A state the product cannot reach — the board is copied from this
    // table's own encounter — written so the read's own containment is tested.
    await sql(
      (sql) => sql`update encounter_run_board set map_id = ${theirs.id} where run_id = ${fight.id}`,
    );
    const read = await tableOf(ilse);
    expect(read?.fight?.board).not.toBeNull();
    expect(read?.fight?.board?.image).toBeNull();
    await sql(
      (sql) =>
        sql`update encounter_run_board set map_id = ${ours[0]!.map_id} where run_id = ${fight.id}`,
    );
    expect((await tableOf(ilse))?.fight?.board?.image).not.toBeNull();
  });
});

describe("a fight on an encounter the players may not read", () => {
  it("shows the board without naming the encounter", async () => {
    const session = await night();
    const { params } = await fightOn(session, secret);
    await set(params, { mapShown: true });
    const read = await tableOf(ilse);
    expect(read?.fight?.encounterId).toBeNull();
    expect(read?.fight?.board?.image).not.toBeNull();
    const raw = await rawTableOf(ilse);
    expect(raw.body).not.toContain("NAME-THE-DMS-OWN");
    expect(raw.body).not.toContain(secret);
    expect(raw.body).not.toContain("SETTING-A-SECRET");
    await endNight(session);
  });
});

describe("a conversation", () => {
  it("shows no board until it turns into a fight", async () => {
    const session = await night();
    const { fight, params } = await fightOn(session, talk);
    expect(fight.mode).toBe("social");
    await set(params, { mapShown: true });
    const before = await rawTableOf(ilse);
    expect(before.body).toContain('"board":null');
    expect(before.body).not.toContain('"position"');

    await as(jo.token, (client) => client.runs.escalate({ params, payload: {} }));
    expect((await tableOf(ilse))?.fight?.board?.tokens.length).toBeGreaterThan(0);
    await endNight(session);
  });
});

describe("a resumed fight", () => {
  it("keeps the map's two switches as the DM left them", async () => {
    const first = await night();
    const { fight, params } = await fightOn(first);
    await set(params, { mapShown: true, hostileTokensHidden: true });
    await endNight(first);

    const second = await night();
    const resumed = await as(jo.token, (client) =>
      client.runs.resume({
        params: { campaignId: table, sessionId: second },
        payload: { continuedFrom: fight.id },
      }),
    );
    expect([resumed.mapShown, resumed.hostileTokensHidden]).toEqual([true, true]);
    const read = await tableOf(ilse);
    expect(read?.fight?.id).toBe(resumed.id);
    expect(read?.fight?.board?.tokens.map((token) => token.position)).toEqual([
      { column: 1, row: 2 },
    ]);
    await endNight(second);
  });
});
