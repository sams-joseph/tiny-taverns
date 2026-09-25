import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type BattleMap,
  type CampaignId,
  CurrentActor,
  type Encounter,
  type EncounterCreate,
  type EncounterId,
  type EncounterRunId,
  type HobEvent,
  type SessionId,
  TavernsApi,
} from "@taverns/api";
import { DateTime, Effect, Layer, ManagedRuntime, Option, Redacted, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls, signedPath } from "../src/images/ImageUrls.js";
import { Creatures } from "../src/repo/Creatures.js";
import { ImageRecords } from "../src/repo/Images.js";
import { ObjectStorage, StorageKey } from "../src/storage/ObjectStorage.js";
import { aCharacterAt, aGroupMemberAt, admittedTo, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedImages } from "./support/imageModel.js";
import { type Round, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";

/**
 * **Every encounter has one battle map, and Hob draws its picture once, as the
 * encounter is made, from its setting line or, without one, its name, tags and
 * roster types — for the creator's eyes only.** The
 * fifth kind of Hob-drawn image, over the same worker, signer, records and
 * daily ledger as the portraits and covers (`npc-images.test.ts`).
 *
 * Over the real application: the real handlers, the real worker, `sharp`, the
 * memory storage adapter and Postgres. The image endpoint and Hob's model are
 * scripted (`support/imageModel.ts`, `support/model.ts`), so no request here
 * leaves the process.
 */

const OPENAI = "https://api.openai.com/v1";
const MODEL = "gpt-image-2.5-flare";
const SECRET = Redacted.make("battle-map-test-secret");
const PER_ACCOUNT = 12;

const images = scriptedImages({ apiUrl: OPENAI, model: MODEL });

/**
 * Hob's script, filled in once the creature it names exists: the model is
 * read round by round, so a round pushed before the ask is the one it plays.
 */
const rounds: Array<Round> = [];
const chat = scriptedModel({ model: "scripted-local", maxTokens: 512, rounds });

/** The clock image URLs are minted and checked against. */
const now = Date.now();

const database = migratedDatabase("taverns_test_battle_maps");
const urls = ImageUrls.layer(SECRET, () => now);
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(chat.layer)),
  undefined,
  ObjectStorage.memory,
  urls,
  HobImages.layer({
    generation: Option.some({
      limits: { perAccountPerDay: PER_ACCOUNT, perDay: 100 },
      concurrency: 2,
    }),
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

/** Fetch a path as an `<img>` does. */
const load = (path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.get(path);
      const bytes = new Uint8Array(yield* response.arrayBuffer);
      return { status: response.status, bytes };
    }).pipe(Effect.orDie),
  );

/** A PATCH the derived client would refuse to encode, sent as it stands. */
const rawPatch = (token: string, path: string, body: unknown) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.execute(
        HttpClientRequest.patch(path).pipe(
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.bodyJsonUnsafe(body),
        ),
      );
      return response.status;
    }).pipe(Effect.orDie),
  );

interface Record {
  readonly id: string;
  readonly campaign_id: string;
  readonly account_id: string;
  readonly state: string;
  readonly failure: string | null;
  readonly prompt: string | null;
  readonly model: string | null;
  readonly storage_prefix: string;
}

const recordOf = (mapId: string) =>
  sql((sql) => sql<Record>`select * from battle_map_image where map_id = ${mapId}`).then(
    (rows) => rows[0],
  );

const spentBy = (who: Person) =>
  sql(
    (sql) => sql<{ readonly count: number }>`
      select count(*)::int as count from image_spend where account_id = ${who.actor.accountId}
    `,
  ).then((rows) => rows[0]?.count ?? 0);

const stored = (key: string) =>
  run(Effect.flatMap(ObjectStorage, (objects) => objects.head(StorageKey(key)))).then(
    Option.isSome,
  );

const FILES = ["original.png", "card.webp", "full.webp"];

/** The requests that asked for a battle map, told apart from covers by the prompt. */
const mapRequests = () =>
  images.requests().filter((request) => String(request.prompt).startsWith("Top-down battle map"));

const campaignOf = (who: Person, name: string) =>
  as(who.token, (client) => client.campaigns.create({ payload: { name } })).then(
    async (campaign) => {
      await settled();
      return campaign.id;
    },
  );

const encounterAt = (who: Person, campaignId: CampaignId, payload: EncounterCreate) =>
  as(who.token, (client) => client.encounters.create({ params: { campaignId }, payload }));

const mapOf = (who: Person, campaignId: CampaignId, encounterId: EncounterId) =>
  as(who.token, (client) => client.battleMaps.find({ params: { campaignId, encounterId } }));

const REEDS: EncounterCreate = {
  name: "Ambush in the reeds",
  tags: ["Marsh", "Night"],
  setting: "A boardwalk over black water, reed beds on both sides and a sunken barge",
};

let jo: Person;
let ilse: Person;
let stranger: Person;
let table: CampaignId;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
  table = await campaignOf(jo, "The Salt Road");
}, 60_000);

describe("making an encounter draws its battle map once", () => {
  let encounter: Encounter;
  let map: BattleMap;
  let requestsBefore: number;

  beforeAll(async () => {
    requestsBefore = mapRequests().length;
    encounter = await encounterAt(jo, table, REEDS);
    await settled();
    map = await mapOf(jo, table, encounter.id);
  }, 60_000);

  it("draws one picture at the cover's size, billed to the creator, and ends ready", async () => {
    expect(mapRequests().length - requestsBefore).toBe(1);
    const record = await recordOf(map.id);
    expect(record?.state).toBe("ready");
    expect(record?.account_id).toBe(jo.actor.accountId);
    expect(record?.campaign_id).toBe(table);
    expect(record?.storage_prefix).toBe(
      `battle-map-images/${jo.actor.accountId}/${map.id}/${record!.id}`,
    );
    for (const file of FILES) {
      expect(await stored(`${record!.storage_prefix}/${file}`)).toBe(true);
    }
    const body = mapRequests().find((request) => request.prompt === record?.prompt);
    expect(body?.size).toBe("1536x1024");
    expect(body?.model).toBe(MODEL);
  });

  it("draws top-down, with no grid and no creatures, from the setting line", async () => {
    const prompt = (await recordOf(map.id))!.prompt!;
    expect(prompt).toContain("A boardwalk over black water, reed beds on both sides");
    expect(prompt).toContain("Ambush in the reeds");
    expect(prompt).toContain("Marsh, Night");
    expect(prompt.toLowerCase()).toContain("top-down");
    expect(prompt.toLowerCase()).toContain("no grid");
    expect(prompt.toLowerCase()).toContain("no creatures");
  });

  it("answers the creator's map read with the board and the signed picture", async () => {
    expect(map.encounterId).toBe(encounter.id);
    expect(map.campaignId).toBe(table);
    expect(map.setting).toBe(REEDS.setting);
    expect(map.grid).toBe("square");
    expect([map.columns, map.rows, map.feetPerCell]).toEqual([24, 16, 5]);
    expect(map.alignment).toEqual({ cellPx: 64, offsetXPx: 0, offsetYPx: 0 });
    expect(map.imagePending).toBe(false);
    // The scripted provider answers a 1 × 1 picture: the original's size is
    // what the grid is measured in.
    expect([map.image?.width, map.image?.height]).toEqual([1, 1]);

    const sharp = (await import("sharp")).default;
    for (const path of [map.image!.cardUrl, map.image!.fullUrl]) {
      expect(path).toMatch(/^\/battle-map-images\/[0-9a-f-]+\/(card|full)\?e=\d+&s=/);
      const response = await load(path);
      expect(response.status).toBe(200);
      // Never cropped: a square answer stays square inside the 3:2 box.
      const metadata = await sharp(response.bytes).metadata();
      expect(metadata.width).toBe(metadata.height);
    }
  });

  it("refuses a URL signed for another kind or tampered with", async () => {
    const url = new URL(map.image!.cardUrl, "http://x");
    const imageId = url.pathname.split("/")[2]!;
    const signature = url.searchParams.get("s")!;
    const cases = [
      map.image!.cardUrl.replace(signature, `${signature.slice(0, -2)}AA`),
      map.image!.cardUrl.replace("/card?", "/full?"),
      map.image!.cardUrl.replace("/battle-map-images/", "/campaign-images/"),
      signedPath(SECRET, "campaign", imageId, "card", now).replace(
        "/campaign-images/",
        "/battle-map-images/",
      ),
      map.image!.cardUrl.replace(/\?.*$/, ""),
    ];
    for (const path of cases) expect((await load(path)).status, path).toBe(404);
  });

  it("gives a new encounter no map field: the map is its own read", () => {
    expect(JSON.stringify(encounter)).not.toContain("battle-map-images");
    expect(JSON.stringify(encounter)).not.toContain("boardwalk");
  });

  it("is drawn once: editing the setting line redraws nothing", async () => {
    const before = mapRequests().length;
    await as(jo.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: encounter.id },
        payload: { setting: "  A drier boardwalk  " },
      }),
    );
    await settled();
    expect(mapRequests().length).toBe(before);
    const edited = await mapOf(jo, table, encounter.id);
    expect(edited.setting).toBe("A drier boardwalk");
    expect(edited.image).toEqual(map.image);

    await as(jo.token, (client) =>
      client.encounters.update({
        params: { campaignId: table, encounterId: encounter.id },
        payload: { setting: null },
      }),
    );
    expect((await mapOf(jo, table, encounter.id)).setting).toBeNull();
  });
});

describe("Hob's accepted encounter", () => {
  it("draws its map from the setting Hob wrote, never from the roster", async () => {
    const croaker = await run(
      Effect.flatMap(Creatures, (creatures) =>
        creatures.libraryCreate({
          name: "Bullywug Croaker",
          type: "humanoid",
          size: "Medium",
          cr: "1/4",
          ac: 15,
          hp: 11,
        }),
      ).pipe(Effect.provideService(CurrentActor, jo.actor)),
    );
    rounds.push(
      toolCallChunks("proposeEncounter", {
        name: "Song in the reeds",
        tags: ["Marsh"],
        setting: "A flooded causeway between two stone huts",
        creatures: [{ creatureId: croaker.id, count: 3 }],
      }),
      textChunks("There you are."),
    );
    const events = await run(
      Effect.gen(function* () {
        const hob = yield* Hob;
        const stream = yield* hob.ask(table, { text: "A fight in the marsh." });
        return Array.from(yield* Stream.runCollect(stream)) as ReadonlyArray<HobEvent>;
      }).pipe(Effect.provideService(CurrentActor, jo.actor)),
    );
    const began = events.find((event) => event.event === "began");
    if (began?.event !== "began") throw new Error("no began event");
    const proposed = events.find((event) => event.event === "proposal");
    expect(proposed?.event === "proposal" && proposed.data.proposal).toMatchObject({
      target: "encounter",
      setting: "A flooded causeway between two stone huts",
    });

    const before = mapRequests().length;
    const accepted = await as(jo.token, (client) =>
      client.hob.accept({
        params: { campaignId: table, threadId: began.data.threadId, turnId: began.data.turnId },
        payload: {},
      }),
    );
    if (accepted.accepted !== "encounter") throw new Error("accepted something else");
    await settled();

    expect(mapRequests().length - before).toBe(1);
    const map = await mapOf(jo, table, accepted.encounter.id);
    expect(map.setting).toBe("A flooded causeway between two stone huts");
    expect(map.image).not.toBeNull();
    const prompt = (await recordOf(map.id))!.prompt!;
    expect(prompt).toContain("A flooded causeway between two stone huts");
    expect(prompt).not.toContain("Bullywug");
    expect(prompt).not.toContain("Croaker");
  });
});

describe("an encounter with only a name", () => {
  it("still draws once, from its name and tags, and counts against the day", async () => {
    const before = mapRequests().length;
    const spent = await spentBy(jo);
    const encounter = await encounterAt(jo, table, { name: "Goblin ambush", tags: ["Road"] });
    await settled();
    expect(mapRequests().length - before).toBe(1);
    expect(await spentBy(jo)).toBe(spent + 1);
    const map = await mapOf(jo, table, encounter.id);
    expect(map.setting).toBeNull();
    expect(map.image).not.toBeNull();
    expect([map.grid, map.columns, map.rows]).toEqual(["square", 24, 16]);
    const prompt = (await recordOf(map.id))!.prompt!;
    expect(prompt).toContain("a fight called Goblin ambush");
    expect(prompt).toContain("Its feel: Road.");
    expect(prompt.toLowerCase()).toContain("no creatures");
    // The form's create carries no roster, so there are no types to read.
    expect(prompt).not.toContain("would be found");
  });

  it("reads the types on Hob's accepted roster, never the creatures' names", async () => {
    const hag = await run(
      Effect.flatMap(Creatures, (creatures) =>
        creatures.libraryCreate({
          name: "Mirelight Hag",
          type: "Fey",
          size: "Medium",
          cr: "2",
          ac: 14,
          hp: 40,
        }),
      ).pipe(Effect.provideService(CurrentActor, jo.actor)),
    );
    rounds.push(
      toolCallChunks("proposeEncounter", {
        name: "Lights on the water",
        creatures: [{ creatureId: hag.id, count: 1 }],
      }),
      textChunks("There you are."),
    );
    const events = await run(
      Effect.gen(function* () {
        const hob = yield* Hob;
        const stream = yield* hob.ask(table, { text: "Something eerie." });
        return Array.from(yield* Stream.runCollect(stream)) as ReadonlyArray<HobEvent>;
      }).pipe(Effect.provideService(CurrentActor, jo.actor)),
    );
    const began = events.find((event) => event.event === "began");
    if (began?.event !== "began") throw new Error("no began event");

    const before = mapRequests().length;
    const accepted = await as(jo.token, (client) =>
      client.hob.accept({
        params: { campaignId: table, threadId: began.data.threadId, turnId: began.data.turnId },
        payload: {},
      }),
    );
    if (accepted.accepted !== "encounter") throw new Error("accepted something else");
    await settled();

    expect(mapRequests().length - before).toBe(1);
    const map = await mapOf(jo, table, accepted.encounter.id);
    const prompt = (await recordOf(map.id))!.prompt!;
    expect(prompt).toContain("a fight called Lights on the water");
    expect(prompt).toContain("where fey creatures would be found");
    expect(prompt).not.toContain("Mirelight");
    expect(prompt).not.toContain("Hag");
  });
});

describe("when there is no picture", () => {
  it("records a refusal and still keeps the board", async () => {
    const bram = await person("Bram");
    const own = await campaignOf(bram, "Bram's Table");
    images.next({ kind: "refused" });
    const encounter = await encounterAt(bram, own, { name: "Red", setting: "A butcher's yard" });
    await settled();
    const map = await mapOf(bram, own, encounter.id);
    expect(map.image).toBeNull();
    expect((await recordOf(map.id))?.failure).toBe("refused");
  });

  it("spends the one daily budget covers and portraits spend, and is capped with them", async () => {
    // A fresh account: its cover and its maps count against one per-account
    // limit, so the map after the cover and PER_ACCOUNT - 1 maps is capped.
    const tam = await person("Tam");
    const own = await campaignOf(tam, "Tam's Table");
    for (let index = 0; index < PER_ACCOUNT - 1; index += 1) {
      await encounterAt(tam, own, { name: `Fight ${String(index)}`, setting: "A cave mouth" });
    }
    await settled();
    expect(await spentBy(tam)).toBe(PER_ACCOUNT);
    const before = mapRequests().length;
    const over = await encounterAt(tam, own, { name: "One more", setting: "A cold hillside" });
    await settled();
    expect(mapRequests().length).toBe(before);
    const map = await mapOf(tam, own, over.id);
    expect(map.image).toBeNull();
    const record = await recordOf(map.id);
    expect(record?.failure).toBe("capped");
    expect(record?.prompt).toContain("A cold hillside");
  });
});

describe("deleting an encounter", () => {
  it("deletes its map, queues and drains the picture's files, and keeps the spend", async () => {
    const vale = await person("Vale");
    const own = await campaignOf(vale, "Vale's Table");
    const encounter = await encounterAt(vale, own, { name: "Brief", setting: "A narrow bridge" });
    await settled();
    const map = await mapOf(vale, own, encounter.id);
    const record = (await recordOf(map.id))!;
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(true);
    const spent = await spentBy(vale);

    await as(vale.token, (client) =>
      client.encounters.remove({ params: { campaignId: own, encounterId: encounter.id } }),
    );
    expect(await recordOf(map.id)).toBeUndefined();
    const maps = await sql(
      (sql) => sql`select id from battle_map where encounter_id = ${encounter.id}`,
    );
    expect(maps).toHaveLength(0);
    expect(
      await attempt(vale.token, (client) =>
        client.battleMaps.find({ params: { campaignId: own, encounterId: encounter.id } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });

    await run(Effect.flatMap(HobImages, (worker) => worker.drainDeletions));
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(false);
    // The draw was paid for; deleting the encounter gives nothing back.
    expect(await spentBy(vale)).toBe(spent);
  });
});

describe("deleting a campaign permanently", () => {
  it("takes its encounters' maps and pictures, queues the files, and keeps the spend", async () => {
    const rue = await person("Rue");
    const doomed = await campaignOf(rue, "Doomed Table");
    const encounter = await encounterAt(rue, doomed, { name: "Last", setting: "A burning jetty" });
    await settled();
    const map = await mapOf(rue, doomed, encounter.id);
    const record = (await recordOf(map.id))!;
    expect(record.state).toBe("ready");
    const spent = await spentBy(rue);

    await as(rue.token, (client) =>
      client.campaigns.deletePermanently({ params: { campaignId: doomed } }),
    );
    const left = await sql(
      (sql) => sql<{ readonly maps: number; readonly images: number }>`
        select
          (select count(*)::int from battle_map where campaign_id = ${doomed}) as maps,
          (select count(*)::int from battle_map_image where campaign_id = ${doomed}) as images
      `,
    );
    expect(left[0]).toEqual({ maps: 0, images: 0 });
    const queued = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record.storage_prefix}
      `,
    );
    expect(queued[0]?.count).toBe(1);
    await run(Effect.flatMap(HobImages, (worker) => worker.drainDeletions));
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(false);
    expect(await spentBy(rue)).toBe(spent);
  });
});

describe("the grid", () => {
  let encounterId: EncounterId;

  beforeAll(async () => {
    encounterId = (await encounterAt(jo, table, { name: "The yard" })).id;
    await settled();
  }, 60_000);

  it("is changed in place by the creator, and read back", async () => {
    const updated = await as(jo.token, (client) =>
      client.battleMaps.update({
        params: { campaignId: table, encounterId },
        payload: {
          grid: "none",
          columns: 20,
          rows: 12,
          feetPerCell: 10,
          alignment: { cellPx: 76.8, offsetXPx: 12.5, offsetYPx: 0 },
        },
      }),
    );
    expect(updated.grid).toBe("none");
    expect([updated.columns, updated.rows, updated.feetPerCell]).toEqual([20, 12, 10]);
    expect(updated.alignment).toEqual({ cellPx: 76.8, offsetXPx: 12.5, offsetYPx: 0 });
    expect(await mapOf(jo, table, encounterId)).toEqual(updated);

    // A partial patch leaves the rest alone.
    const squared = await as(jo.token, (client) =>
      client.battleMaps.update({
        params: { campaignId: table, encounterId },
        payload: { grid: "square" },
      }),
    );
    expect([squared.grid, squared.columns, squared.alignment.cellPx]).toEqual(["square", 20, 76.8]);
  });

  it("refuses an offset of a square or more, a hex grid and an empty board", async () => {
    const path = `/campaigns/${table}/encounters/${encounterId}/map`;
    for (const body of [
      { alignment: { cellPx: 64, offsetXPx: 64, offsetYPx: 0 } },
      { alignment: { cellPx: 64, offsetXPx: 0, offsetYPx: -1 } },
      { alignment: { cellPx: 64 } },
      { grid: "hex" },
      { columns: 0 },
      { rows: 201 },
      { feetPerCell: 0 },
    ]) {
      expect(await rawPatch(jo.token, path, body), JSON.stringify(body)).toBe(400);
    }
    expect((await mapOf(jo, table, encounterId)).columns).toBe(20);
  });

  it("is refused by the table's own checks too", async () => {
    const outside = await runtime.runPromise(
      Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`
          update battle_map set offset_x_px = cell_px where encounter_id = ${encounterId}
        `,
      ).pipe(Effect.result),
    );
    expect(outside._tag).toBe("Failure");
  });
});

describe("one map per encounter, in its own campaign", () => {
  it("refuses a second map for an encounter, and a map filed under another campaign", async () => {
    const encounter = await encounterAt(jo, table, { name: "Keyed" });
    const other = await campaignOf(jo, "Elsewhere");
    const insert = (campaignId: CampaignId) =>
      runtime.runPromise(
        Effect.flatMap(
          SqlClient.SqlClient,
          (sql) => sql`
            insert into battle_map (encounter_id, campaign_id)
            values (${encounter.id}, ${campaignId})
          `,
        ).pipe(Effect.result),
      );
    expect((await insert(table))._tag).toBe("Failure");
    expect((await insert(other))._tag).toBe("Failure");
  });
});

describe("the map is the creator's alone", () => {
  let shown: Encounter;
  let player: Actor;
  let bystander: Actor;

  beforeAll(async () => {
    await as(jo.token, (client) =>
      client.campaigns.update({ params: { campaignId: table }, payload: { visibility: "shared" } }),
    );
    shown = await encounterAt(jo, table, {
      ...REEDS,
      name: "Shown to the table",
      setting: "SETTING-A-SECRET-DOOR in the east wall",
      visibility: "shared",
      ready: true,
    });
    await settled();
    player = await run(admittedTo(table, ilse.actor, "Ilse"));
    bystander = await run(aGroupMemberAt(table, "Wren"));
  }, 60_000);

  it("answers a player, a Shared World member and a stranger NotFound on every map endpoint", async () => {
    const params = { campaignId: table, encounterId: shown.id };
    for (const who of [ilse, stranger]) {
      expect(await attempt(who.token, (client) => client.battleMaps.find({ params }))).toEqual({
        ok: false,
        tag: "NotFound",
      });
      expect(
        await attempt(who.token, (client) =>
          client.battleMaps.update({ params, payload: { grid: "none" } }),
        ),
      ).toEqual({ ok: false, tag: "NotFound" });
    }
    // The proof the map reads require: the player and the member cannot get one.
    for (const actor of [player, bystander]) {
      const proof = await runtime.runPromise(Effect.result(asDm(actor, table)));
      expect(proof._tag).toBe("Failure");
    }
    expect((await mapOf(jo, table, shown.id)).grid).toBe("square");
  });

  it("puts no map, setting or picture on a player's reads of a shared encounter", async () => {
    const found = await as(ilse.token, (client) =>
      client.playerEncounters.find({ params: { campaignId: table, encounterId: shown.id } }),
    );
    const listed = await as(ilse.token, (client) =>
      client.playerEncounters.list({ params: { campaignId: table } }),
    );
    expect(listed.map((entry) => entry.id)).toContain(shown.id);
    for (const read of [found, listed]) {
      const text = JSON.stringify(read);
      expect(text).not.toContain("battle-map-images");
      expect(text).not.toContain("SETTING-A-SECRET-DOOR");
    }
  });

  it("puts no map on the live player table while the fight is shared", async () => {
    await run(aCharacterAt(table, ilse.actor, { name: "Ilse's Ranger" }));
    const session = await as(jo.token, (client) =>
      client.sessions.create({
        params: { campaignId: table },
        payload: { number: 1, title: "At the ford", visibility: "shared" },
      }),
    );
    await as(jo.token, (client) =>
      client.campaigns.update({
        params: { campaignId: table },
        payload: { currentSessionId: session.id },
      }),
    );
    await as(jo.token, (client) =>
      client.runs.start({
        params: { campaignId: table, sessionId: session.id },
        payload: { encounterId: shown.id, visibility: "shared" },
      }),
    );
    const read = await as(ilse.token, (client) =>
      client.table.read({ params: { campaignId: table } }),
    );
    expect(read?.fight).not.toBeNull();
    const text = JSON.stringify(read);
    expect(text).not.toContain("battle-map-images");
    expect(text).not.toContain("SETTING-A-SECRET-DOOR");
  });
});

/**
 * **A fight keeps its board** (`0058_encounter_run_boards.ts`): `start` copies
 * the encounter's grid onto the run, `resume` copies the predecessor's, and the
 * picture is read through the map. The runner reads it; no player path does.
 */
describe("a fight keeps its board", () => {
  let kit: Person;
  let own: CampaignId;
  let pier: Encounter;
  let map: BattleMap;
  let sessionNumber = 0;

  const night = async () => {
    sessionNumber += 1;
    return as(kit.token, (client) =>
      client.sessions.create({
        params: { campaignId: own },
        payload: { number: sessionNumber, visibility: "shared" },
      }),
    );
  };

  const startOn = (sessionId: SessionId, encounterId: EncounterId) =>
    as(kit.token, (client) =>
      client.runs.start({
        params: { campaignId: own, sessionId },
        payload: { encounterId, visibility: "shared" },
      }),
    );

  const boardOf = (sessionId: SessionId, runId: EncounterRunId) =>
    as(kit.token, (client) => client.runs.board({ params: { campaignId: own, sessionId, runId } }));

  const regrid = (encounterId: EncounterId) =>
    as(kit.token, (client) =>
      client.battleMaps.update({
        params: { campaignId: own, encounterId },
        payload: { columns: 12, rows: 8, alignment: { cellPx: 128, offsetXPx: 3, offsetYPx: 4 } },
      }),
    );

  beforeAll(async () => {
    kit = await person("Kit");
    own = await campaignOf(kit, "Kit's Table");
    await as(kit.token, (client) =>
      client.campaigns.update({ params: { campaignId: own }, payload: { visibility: "shared" } }),
    );
    pier = await encounterAt(kit, own, {
      name: "On the pier",
      setting: "SETTING-A-ROTTEN-PIER over a grey harbour",
      visibility: "shared",
    });
    await settled();
    map = await mapOf(kit, own, pier.id);
    expect(map.image).not.toBeNull();
  }, 60_000);

  it("copies the encounter's grid and names its map when the fight starts", async () => {
    const session = await night();
    const fight = await startOn(session.id, pier.id);
    const board = await boardOf(session.id, fight.id);
    expect(board).toMatchObject({
      mapId: map.id,
      setting: map.setting,
      grid: map.grid,
      columns: map.columns,
      rows: map.rows,
      feetPerCell: map.feetPerCell,
      alignment: map.alignment,
      imagePending: false,
    });
    expect(board?.image).toEqual(map.image);
    await as(kit.token, (client) =>
      client.runs.end({
        params: { campaignId: own, sessionId: session.id, runId: fight.id },
        payload: {},
      }),
    );
  });

  it("keeps its grid when the encounter's grid changes mid-fight; the next fight takes the new one", async () => {
    const encounter = await encounterAt(kit, own, { name: "The loft" });
    await settled();
    const before = await mapOf(kit, own, encounter.id);
    const session = await night();
    const fight = await startOn(session.id, encounter.id);

    const edited = await regrid(encounter.id);
    expect(edited.columns).toBe(12);

    const board = await boardOf(session.id, fight.id);
    expect([board?.columns, board?.rows, board?.alignment]).toEqual([
      before.columns,
      before.rows,
      before.alignment,
    ]);
    expect(board?.mapId).toBe(before.id);

    await as(kit.token, (client) =>
      client.runs.end({
        params: { campaignId: own, sessionId: session.id, runId: fight.id },
        payload: {},
      }),
    );
    const next = await startOn(session.id, encounter.id);
    const nextBoard = await boardOf(session.id, next.id);
    expect([nextBoard?.columns, nextBoard?.rows, nextBoard?.alignment]).toEqual([
      12,
      8,
      { cellPx: 128, offsetXPx: 3, offsetYPx: 4 },
    ]);
    await as(kit.token, (client) =>
      client.runs.end({
        params: { campaignId: own, sessionId: session.id, runId: next.id },
        payload: {},
      }),
    );
  });

  it("carries the predecessor's board to a resumed fight, not the map as it stands", async () => {
    const encounter = await encounterAt(kit, own, { name: "The long night" });
    await settled();
    const first = await night();
    const fight = await startOn(first.id, encounter.id);
    const played = await boardOf(first.id, fight.id);
    await as(kit.token, (client) =>
      client.sessions.update({
        params: { campaignId: own, sessionId: first.id },
        payload: { endedAt: DateTime.nowUnsafe() },
      }),
    );
    await regrid(encounter.id);

    const second = await night();
    const resumed = await as(kit.token, (client) =>
      client.runs.resume({
        params: { campaignId: own, sessionId: second.id },
        payload: { continuedFrom: fight.id },
      }),
    );
    expect(resumed.continuedFrom).toBe(fight.id);
    expect(await boardOf(second.id, resumed.id)).toEqual(played);
    await as(kit.token, (client) =>
      client.runs.end({
        params: { campaignId: own, sessionId: second.id, runId: resumed.id },
        payload: {},
      }),
    );
  });

  it("shows the picture Hob finishes after the fight began", async () => {
    const encounter = await encounterAt(kit, own, {
      name: "Quick start",
      setting: "A lamplit alley between warehouses",
    });
    const session = await night();
    // Started before the draw is waited for; whether it had landed by then is
    // the worker's race, and either way the board ends with the picture.
    const fight = await startOn(session.id, encounter.id);
    await settled();
    const board = await boardOf(session.id, fight.id);
    const drawn = await mapOf(kit, own, encounter.id);
    expect(drawn.image).not.toBeNull();
    expect(board?.image).toEqual(drawn.image);
    expect(board?.imagePending).toBe(false);
    await as(kit.token, (client) =>
      client.runs.end({
        params: { campaignId: own, sessionId: session.id, runId: fight.id },
        payload: {},
      }),
    );
  });

  it("survives its encounter's delete: the grid stays, the map and picture go, the runner still runs", async () => {
    const doomed = await encounterAt(kit, own, {
      name: "Doomed",
      setting: "A collapsing rope bridge",
    });
    await settled();
    const session = await night();
    const fight = await startOn(session.id, doomed.id);
    const played = await boardOf(session.id, fight.id);
    expect(played?.image).not.toBeNull();

    await as(kit.token, (client) =>
      client.encounters.remove({ params: { campaignId: own, encounterId: doomed.id } }),
    );

    const params = { campaignId: own, sessionId: session.id, runId: fight.id };
    const board = await boardOf(session.id, fight.id);
    expect(board).toMatchObject({
      mapId: null,
      setting: null,
      image: null,
      imagePending: false,
      grid: played?.grid,
      columns: played?.columns,
      rows: played?.rows,
      alignment: played?.alignment,
    });
    const stillOn = await as(kit.token, (client) => client.runs.findById({ params }));
    expect(stillOn.encounterId).toBeNull();
    expect(stillOn.endedAt).toBeNull();
    const rows = await as(kit.token, (client) => client.combatants.list({ params }));
    if (rows.length > 0) {
      await as(kit.token, (client) =>
        client.runs.setInitiative({
          params,
          payload: { entries: rows.map((row) => ({ combatantId: row.id, initiative: 10 })) },
        }),
      );
    }
    await as(kit.token, (client) => client.runs.begin({ params, payload: {} }));
    await as(kit.token, (client) =>
      client.runs.nextTurn({ params, payload: { requestId: crypto.randomUUID() } }),
    );
    await as(kit.token, (client) => client.runs.end({ params, payload: {} }));
  });

  it("answers null for a fight with no board", async () => {
    const encounter = await encounterAt(kit, own, { name: "Boardless" });
    const session = await night();
    const fight = await startOn(session.id, encounter.id);
    await sql((sql) => sql`delete from encounter_run_board where run_id = ${fight.id}`);
    expect(await boardOf(session.id, fight.id)).toBeNull();
    await as(kit.token, (client) =>
      client.runs.end({
        params: { campaignId: own, sessionId: session.id, runId: fight.id },
        payload: {},
      }),
    );
  });

  it("is the creator's alone: a player and a stranger get NotFound, and the player's table carries no board", async () => {
    const player = await person("Pip");
    await run(admittedTo(own, player.actor, "Pip"));
    await run(aCharacterAt(own, player.actor, { name: "Pip's Rogue" }));
    const session = await night();
    await as(kit.token, (client) =>
      client.campaigns.update({
        params: { campaignId: own },
        payload: { currentSessionId: session.id },
      }),
    );
    const fight = await startOn(session.id, pier.id);
    const params = { campaignId: own, sessionId: session.id, runId: fight.id };
    for (const who of [player, stranger]) {
      expect(await attempt(who.token, (client) => client.runs.board({ params }))).toEqual({
        ok: false,
        tag: "NotFound",
      });
    }
    // Another creator's run id under this table's path is not this table's board.
    expect(
      await attempt(jo.token, (client) =>
        client.runs.board({ params: { ...params, campaignId: table } }),
      ),
    ).toEqual({ ok: false, tag: "NotFound" });

    const read = await as(player.token, (client) =>
      client.table.read({ params: { campaignId: own } }),
    );
    expect(read?.fight?.id).toBe(fight.id);
    // The player's table is exactly what it was before fights kept boards.
    expect(Object.keys(read!.fight!).sort()).toEqual(
      ["encounterId", "id", "order", "phase", "round", "seats", "upNext"].sort(),
    );
    const text = JSON.stringify(read);
    expect(text).not.toContain("battle-map-images");
    expect(text).not.toContain("SETTING-A-ROTTEN-PIER");
    expect(text).not.toContain(map.id);
  });
});
