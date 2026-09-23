import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type CampaignId,
  CurrentActor,
  type SharedWorld,
  type SharedWorldId,
  TavernsApi,
} from "@taverns/api";
import { Context, Deferred, Effect, Layer, ManagedRuntime, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { SqlClient } from "effect/unstable/sql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls, expiryFor, signedPath } from "../src/images/ImageUrls.js";
import { Groups } from "../src/repo/Groups.js";
import { ImageRecords } from "../src/repo/Images.js";
import { Invites } from "../src/repo/Invites.js";
import { ObjectStorage, StorageKey } from "../src/storage/ObjectStorage.js";
import { aGroupMemberAt, admittedTo, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { MODERATION_TEXT, scriptedImages } from "./support/imageModel.js";

/**
 * **Hob draws a Shared World's cover once, after the world is made, and every
 * member of the world can see it** — the third kind of Hob-drawn image, over
 * the same worker, signer and records as a character's portrait and a
 * campaign's cover (`campaign-images.test.ts`).
 *
 * A world is made two ways, and both draw: founding one (`POST /worlds`) and
 * promoting a standalone campaign's hidden context into one
 * (`POST /campaigns/:campaignId/shared-world`).
 *
 * Over the real application: the real handlers, the real worker, `sharp`, the
 * memory storage adapter and Postgres. Only the image endpoint is scripted
 * (`support/imageModel.ts`), so no request here leaves the process.
 */

const OPENAI = "https://api.openai.com/v1";
const MODEL = "gpt-image-2.5-flare";
const SECRET = Redacted.make("shared-world-image-test-secret");
const PER_ACCOUNT = 4;

const images = scriptedImages({ apiUrl: OPENAI, model: MODEL });

/** The clock image URLs are minted and checked against. */
let now = Date.now();

const database = migratedDatabase("taverns_test_shared_world_images");
const urls = ImageUrls.layer(SECRET, () => now);
const services = servicesOver(
  database,
  undefined,
  undefined,
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

/** Fetch a signed path without any credential, as an `<img>` does. */
const load = (path: string) =>
  runtime.runPromise(
    Effect.gen(function* () {
      const response = yield* HttpClient.get(path);
      const bytes = new Uint8Array(yield* response.arrayBuffer);
      return { status: response.status, headers: response.headers, bytes };
    }).pipe(Effect.orDie),
  );

interface Record {
  readonly id: string;
  readonly account_id: string;
  readonly state: string;
  readonly failure: string | null;
  readonly prompt: string | null;
  readonly model: string | null;
  readonly input_tokens: number | null;
  readonly storage_prefix: string;
  readonly original_type: string | null;
}

const recordOf = (worldId: SharedWorldId) =>
  sql((sql) => sql<Record>`select * from shared_world_image where group_id = ${worldId}`).then(
    (rows) => rows[0],
  );

const stored = (key: string) =>
  run(Effect.flatMap(ObjectStorage, (objects) => objects.head(StorageKey(key)))).then(
    Option.isSome,
  );

const FILES = ["original.png", "card.webp", "full.webp"];

const found = (who: Person, name: string) =>
  as(who.token, (client) => client.sharedWorlds.create({ payload: { name } }));

/** Starts the one draw of a world as this actor, with nothing to draw from. */
const startAs = (actor: Actor, worldId: SharedWorldId) =>
  run(
    Effect.flatMap(ImageRecords, (records) =>
      records.start("sharedWorld", worldId, {
        prompt: undefined,
        model: MODEL,
        limits: { perAccountPerDay: 100, perDay: 100 },
      }),
    ).pipe(Effect.provideService(CurrentActor, actor)),
  );

let jo: Person;
let ilse: Person;
let stranger: Person;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
}, 60_000);

describe("founding a Shared World draws one cover", () => {
  let world: SharedWorld;
  let requestsBefore: number;

  beforeAll(async () => {
    requestsBefore = images.requests().length;
    world = await found(jo, "The Salt Company");
    await settled();
  }, 60_000);

  it("answers the create with the drawing state, and the draw finishes ready", async () => {
    expect(images.requests().length - requestsBefore).toBe(1);
    expect(world.imagePending).toBe(true);
    expect(world.image).toBeNull();

    const record = await recordOf(world.id);
    expect(record?.state).toBe("ready");
    expect(record?.failure).toBeNull();
    expect(record?.model).toBe(MODEL);
    expect(record?.account_id).toBe(jo.actor.accountId);
    expect(record?.prompt).toContain("fantasy world called The Salt Company");
    expect(record?.prompt).toContain("Wide landscape composition");
    expect(record?.input_tokens).toBe(57);
    expect(record?.original_type).toBe("image/png");
    expect(record?.storage_prefix).toBe(
      `shared-world-images/${jo.actor.accountId}/${world.id}/${record!.id}`,
    );
    for (const file of FILES) {
      expect(await stored(`${record!.storage_prefix}/${file}`)).toBe(true);
    }
  });

  it("asks for a landscape at the cover's size", async () => {
    const record = await recordOf(world.id);
    const body = images.requests().find((request) => request.prompt === record?.prompt);
    expect(body).toEqual({
      model: MODEL,
      prompt: record?.prompt,
      n: 1,
      size: "1536x1024",
      output_format: "png",
      quality: "medium",
      moderation: "auto",
    });
  });

  it("signs both sizes on the owner's reads, and serves 3:2 WebP through them", async () => {
    const read = await as(jo.token, (client) =>
      client.sharedWorlds.findById({ params: { worldId: world.id } }),
    );
    expect(read.imagePending).toBe(false);
    const listed = await as(jo.token, (client) => client.sharedWorlds.list());
    expect(listed.find((entry) => entry.sharedWorld.id === world.id)?.sharedWorld.image).toEqual(
      read.image,
    );

    const sharp = (await import("sharp")).default;
    for (const [path, width, height] of [
      [read.image!.cardUrl, 768, 512],
      [read.image!.fullUrl, 1536, 1024],
    ] as const) {
      expect(path).toMatch(/^\/shared-world-images\/[0-9a-f-]+\/(card|full)\?e=\d+&s=/);
      const response = await load(path);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("image/webp");
      expect(response.headers["cache-control"]).toMatch(/^private, max-age=\d+, immutable$/);
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["content-security-policy"]).toBe("default-src 'none'");
      const metadata = await sharp(response.bytes).metadata();
      expect([metadata.format, metadata.width, metadata.height]).toEqual(["webp", width, height]);
    }
  });

  it("refuses a forged, altered, other-size, other-kind or expired URL with the same 404", async () => {
    const { cardUrl, fullUrl } = (
      await as(jo.token, (client) =>
        client.sharedWorlds.findById({ params: { worldId: world.id } }),
      )
    ).image!;
    const url = new URL(cardUrl, "http://x");
    const signature = url.searchParams.get("s")!;
    const imageId = url.pathname.split("/")[2]!;
    const cases = [
      cardUrl.replace(signature, `${signature.slice(0, -2)}AA`),
      cardUrl.replace(/s=[^&]+/, ""),
      cardUrl.replace(/e=\d+/, `e=${String(Number(url.searchParams.get("e")) + 1)}`),
      // A signature for one size does not open another, or a size the kind lacks.
      cardUrl.replace("/card?", "/full?"),
      fullUrl.replace("/full?", "/thumb?"),
      cardUrl.replace("/card?", "/original?"),
      cardUrl.replace(/shared-world-images\/[^/]+/, "shared-world-images/not-a-uuid"),
      // This world's signature on the other kinds' routes, and their kinds'
      // signatures for this id on this route: the kind is signed too, and the
      // campaign kind has exactly this kind's sizes.
      cardUrl.replace("/shared-world-images/", "/campaign-images/"),
      cardUrl.replace("/shared-world-images/", "/portraits/"),
      signedPath(SECRET, "campaign", imageId, "card", now).replace(
        "/campaign-images/",
        "/shared-world-images/",
      ),
      signedPath(SECRET, "character", imageId, "card", now).replace(
        "/portraits/",
        "/shared-world-images/",
      ),
    ];
    for (const path of cases) expect((await load(path)).status, path).toBe(404);

    const before = now;
    now = expiryFor(before) * 1000 + 1;
    try {
      expect((await load(cardUrl)).status).toBe(404);
    } finally {
      now = before;
    }
  });

  it("is drawn once: a rename draws nothing, and a second start finds the record", async () => {
    const before = images.requests().length;
    const renamed = await as(jo.token, (client) =>
      client.sharedWorlds.update({
        params: { worldId: world.id },
        payload: { name: "The Salt Company, Reformed", description: "Now a guild of smugglers." },
      }),
    );
    expect(renamed.image).not.toBeNull();
    const again = await run(
      Effect.flatMap(ImageRecords, (records) =>
        records.start("sharedWorld", world.id, {
          prompt: "again",
          model: MODEL,
          limits: { perAccountPerDay: 100, perDay: 100 },
        }),
      ).pipe(Effect.provideService(CurrentActor, jo.actor)),
    );
    await settled();
    expect(again).toBeUndefined();
    expect(images.requests().length).toBe(before);
  });

  it("keeps the cover through archive and restore, on the archived shelf too", async () => {
    const archived = await as(jo.token, (client) =>
      client.sharedWorlds.archive({ params: { worldId: world.id } }),
    );
    expect(archived.image).not.toBeNull();
    const shelf = await as(jo.token, (client) => client.sharedWorlds.archived());
    expect(shelf.find((entry) => entry.id === world.id)?.image).not.toBeNull();
    const restored = await as(jo.token, (client) =>
      client.sharedWorlds.restore({ params: { worldId: world.id }, payload: {} }),
    );
    expect(restored.image).not.toBeNull();
    expect((await recordOf(world.id))?.state).toBe("ready");
  });
});

describe("promoting a campaign's context draws one cover too", () => {
  it("starts the draw from `POST /campaigns/:campaignId/shared-world`, once", async () => {
    const campaign = await as(ilse.token, (client) =>
      client.campaigns.create({ payload: { name: "Lanterns" } }),
    );
    await settled();
    // A hidden context is not a Shared World, so it has no cover to draw, and
    // its creator's start finds nothing.
    await startAs(ilse.actor, campaign.contextId);
    expect(await recordOf(campaign.contextId)).toBeUndefined();

    const before = images.requests().length;
    const world = await as(ilse.token, (client) =>
      client.campaigns.promoteSharedWorld({
        params: { campaignId: campaign.id },
        payload: { name: "The Lantern Coast", description: "Cliffs lit by a thousand lanterns." },
      }),
    );
    expect(world.id).toBe(campaign.contextId);
    expect(world.imagePending).toBe(true);
    await settled();
    expect(images.requests().length - before).toBe(1);
    const record = await recordOf(world.id);
    expect(record?.state).toBe("ready");
    expect(record?.account_id).toBe(ilse.actor.accountId);
    expect(record?.prompt).toContain("fantasy world. Cliffs lit by a thousand lanterns.");
    expect(record?.prompt).toContain("called The Lantern Coast");
  });

  it("draws nothing when a campaign connects to, or moves between, existing worlds", async () => {
    const home = await found(ilse, "Home Waters");
    const away = await found(ilse, "Far Waters");
    const campaign = await as(ilse.token, (client) =>
      client.campaigns.create({ payload: { name: "Crossing" } }),
    );
    await settled();
    const before = images.requests().length;
    const connected = await as(ilse.token, (client) =>
      client.campaigns.connectSharedWorld({
        params: { campaignId: campaign.id },
        payload: { worldId: home.id },
      }),
    );
    const moved = await as(ilse.token, (client) =>
      client.campaigns.moveSharedWorld({
        params: { campaignId: campaign.id },
        payload: { worldId: away.id },
      }),
    );
    await settled();
    expect(images.requests().length).toBe(before);
    // The answers are ordinary world reads, so they carry each world's cover.
    expect(connected.image?.cardUrl).toMatch(/^\/shared-world-images\//);
    expect(moved.image?.cardUrl).toMatch(/^\/shared-world-images\//);
  });
});

describe("who sees a cover is who reads the world", () => {
  let worldId: SharedWorldId;
  let campaignId: CampaignId;
  let cardUrl: string;
  let player: Actor;
  let bystander: Actor;

  const readsOf = (actor: Actor) =>
    run(
      Effect.gen(function* () {
        const groups = yield* Groups;
        return {
          found: yield* Effect.result(groups.findById(worldId)),
          mine: yield* groups.mine,
        };
      }).pipe(Effect.provideService(CurrentActor, actor)),
    );

  beforeAll(async () => {
    const world = await found(jo, "The Marches");
    worldId = world.id;
    const campaign = await as(jo.token, (client) =>
      client.sharedWorlds.createCampaign({
        params: { worldId },
        payload: { name: "The Drowned King" },
      }),
    );
    campaignId = campaign.id;
    await settled();
    player = await run(admittedTo(campaignId, ilse.actor, "Ilse"));
    bystander = await run(aGroupMemberAt(campaignId, "Wren"));
    cardUrl = (
      await as(jo.token, (client) => client.sharedWorlds.findById({ params: { worldId } }))
    ).image!.cardUrl;
  }, 60_000);

  it("gives every member the cover: a player at one of its tables, and one who plays nowhere", async () => {
    for (const member of [player, bystander]) {
      const reads = await readsOf(member);
      expect(reads.found._tag).toBe("Success");
      const read = reads.found._tag === "Success" ? reads.found.success : undefined;
      expect(read?.image?.cardUrl).toMatch(/^\/shared-world-images\//);
      const listed = reads.mine.find((entry) => entry.sharedWorld.id === worldId);
      expect(listed?.isOwner).toBe(false);
      expect(listed?.sharedWorld.image?.fullUrl).toMatch(/^\/shared-world-images\//);
      expect((await load(read!.image!.cardUrl)).status).toBe(200);
    }
  });

  it("gives a stranger nothing, and a URL they never received still needs its signature", async () => {
    const reads = await readsOf(stranger.actor);
    expect(reads.found._tag).toBe("Failure");
    expect(JSON.stringify(reads)).not.toContain("/shared-world-images/");
    const unsigned = cardUrl.replace(/\?.*$/, "");
    expect((await load(unsigned)).status).toBe(404);
  });

  it("puts no cover on the name-only references to the world", async () => {
    // A campaign row names its world as `{ id, name }` — a pointer, not the
    // world — and an invitation's preview, which a person who is not yet a
    // member reads, names it by name alone. Neither carries the picture.
    const rows = await as(jo.token, (client) => client.me.campaigns());
    expect(rows.find((entry) => entry.campaign.id === campaignId)?.sharedWorld?.id).toBe(worldId);
    expect(JSON.stringify(rows)).not.toContain("/shared-world-images/");

    const preview = await run(
      Effect.gen(function* () {
        const invites = yield* Invites;
        const proof = yield* asDm(jo.actor, campaignId);
        const issued = yield* invites.createForCampaign(proof, { label: "Someone new" });
        return yield* invites.preview(issued.token);
      }),
    );
    expect(JSON.stringify(preview)).toContain("The Marches");
    expect(JSON.stringify(preview)).not.toContain("/shared-world-images/");
  });

  it("lets only the owner start the draw", async () => {
    // With the record gone, a member's start finds no world it may draw, and
    // the owner's finds their own.
    await sql((sql) => sql`delete from shared_world_image where group_id = ${worldId}`);
    await startAs(player, worldId);
    await startAs(bystander, worldId);
    await startAs(stranger.actor, worldId);
    expect(await recordOf(worldId)).toBeUndefined();
    await startAs(jo.actor, worldId);
    expect((await recordOf(worldId))?.failure).toBe("skipped");
  });
});

describe("when there is no cover", () => {
  it("skips a world with nothing to draw from, and says so on the record", async () => {
    const before = images.requests().length;
    const world = await found(stranger, "  ");
    await settled();
    expect(world.imagePending).toBe(false);
    expect(world.image).toBeNull();
    expect(images.requests().length).toBe(before);
    const record = await recordOf(world.id);
    expect(record?.state).toBe("failed");
    expect(record?.failure).toBe("skipped");
    expect(record?.prompt).toBeNull();
  });

  it("records a moderation refusal and puts no provider text anywhere", async () => {
    images.next({ kind: "refused" });
    const world = await found(stranger, "Red Harvest");
    await settled();
    const record = await recordOf(world.id);
    expect(record?.failure).toBe("refused");
    const read = await as(stranger.token, (client) =>
      client.sharedWorlds.findById({ params: { worldId: world.id } }),
    );
    expect(read.image).toBeNull();
    expect(read.imagePending).toBe(false);
    expect(JSON.stringify(record)).not.toContain(MODERATION_TEXT);
  });

  it("records a provider failure as provider", async () => {
    images.next({ kind: "error", status: 500 });
    const world = await found(stranger, "Low Tide");
    await settled();
    expect((await recordOf(world.id))?.failure).toBe("provider");
  });

  it("records a draw that outlives the job timeout as timeout, and queues its files", async () => {
    // A worker of its own with a timeout a test can wait for, over an endpoint
    // that never answers, as `campaign-images.test.ts` does for a campaign.
    const hanging = scriptedImages({ apiUrl: OPENAI, model: MODEL });
    hanging.next({ kind: "hang" });
    const pip = await person("Pip");
    const world = await found(pip, "Slow Water");
    await settled();
    // The shared worker drew it; forget that, so the slow worker can start one.
    await sql((sql) => sql`delete from shared_world_image where group_id = ${world.id}`);

    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const built = yield* Layer.build(
            HobImages.layer({
              generation: Option.some({
                limits: { perAccountPerDay: 100, perDay: 100 },
                concurrency: 1,
                timeout: "200 millis",
              }),
              storageOn: false,
            }).pipe(Layer.provide([ImageRecords.layer, ObjectStorage.memory, urls, hanging.layer])),
          );
          const worker = Context.get(built, HobImages);
          const answered = yield* worker.drawSharedWorld(world);
          expect(answered.imagePending).toBe(true);
          yield* worker.idle;
        }),
      ).pipe(Effect.provideService(CurrentActor, pip.actor)),
    );

    expect(hanging.requests()).toHaveLength(1);
    expect(hanging.requests()[0]?.size).toBe("1536x1024");
    const record = await recordOf(world.id);
    expect(record?.failure).toBe("timeout");
    const queued = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record!.storage_prefix}
      `,
    );
    expect(queued[0]?.count).toBe(1);
  });

  it("spends one daily budget across campaigns' covers and worlds'", async () => {
    // A fresh account: a campaign cover and its worlds' covers count against
    // the same per-account limit, so the world after PER_ACCOUNT draws is capped.
    const bram = await person("Bram");
    await as(bram.token, (client) =>
      client.campaigns.create({ payload: { name: "Bram's Table" } }),
    );
    for (let index = 0; index < PER_ACCOUNT - 1; index += 1) {
      await found(bram, `Bram's World ${String(index)}`);
    }
    await settled();
    const before = images.requests().length;
    const over = await found(bram, "One World Too Many");
    await settled();
    expect(over.imagePending).toBe(false);
    expect(images.requests().length).toBe(before);
    const record = await recordOf(over.id);
    expect(record?.failure).toBe("capped");
    expect(record?.prompt).toContain("One World Too Many");
  });
});

describe("deleting a Shared World", () => {
  it("queues its cover's files through the outbox, and the drain removes them", async () => {
    // Through the owner's permanent delete, the one product path that deletes
    // an explicit world's row.
    const world = await found(jo, "Brief Candle");
    await settled();
    const record = (await recordOf(world.id))!;
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(true);
    const spent = () =>
      sql(
        (sql) => sql<{ readonly count: number }>`
          select count(*)::int as count from image_spend where account_id = ${record.account_id}
        `,
      ).then((rows) => rows[0]!.count);
    const spentBefore = await spent();

    await as(jo.token, (client) =>
      client.sharedWorlds.deletePermanently({ params: { worldId: world.id } }),
    );
    // The day's budget is a ledger the delete does not touch.
    expect(await spent()).toBe(spentBefore);
    expect(await recordOf(world.id)).toBeUndefined();
    await run(Effect.flatMap(HobImages, (worker) => worker.drainDeletions));
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(false);
    const queued = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record.storage_prefix}
      `,
    );
    expect(queued[0]?.count).toBe(0);
  });

  it("leaves no files behind when the world is deleted mid-draw", async () => {
    const release = await run(Deferred.make<void>());
    images.next({ kind: "held", release });
    // A fresh account, well inside the daily budget.
    const world = await found(await person("Tam"), "Gone Before Dawn");
    const record = (await recordOf(world.id))!;
    expect(record.state).toBe("generating");

    await sql((sql) => sql`delete from play_group where id = ${world.id}`);
    await run(Deferred.succeed(release, undefined));
    await settled();
    await run(Effect.flatMap(HobImages, (worker) => worker.drainDeletions));
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(false);
  });

  it("marks a cover a dead process left behind interrupted, beside the other kinds", async () => {
    const world = await found(await person("Sal"), "Stale Lantern");
    await settled();
    await sql(
      (sql) => sql`
        update shared_world_image set
          state = 'generating', failure = null, finished_at = null,
          created_at = now() - interval '10 minutes'
        where group_id = ${world.id}
      `,
    );
    const swept = await run(Effect.flatMap(HobImages, (worker) => worker.sweep));
    expect(swept).toBe(1);
    expect((await recordOf(world.id))?.failure).toBe("interrupted");
  });
});
