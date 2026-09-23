import { NodeHttpServer } from "@effect/platform-node";
import {
  Actor,
  type Campaign,
  type CampaignId,
  CurrentActor,
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
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { ImageRecords } from "../src/repo/Images.js";
import { Memberships } from "../src/repo/Memberships.js";
import { ObjectStorage, StorageKey } from "../src/storage/ObjectStorage.js";
import { aGroupMemberAt, admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { MODERATION_TEXT, scriptedImages } from "./support/imageModel.js";

/**
 * **Hob draws a campaign's cover once, after it is made, and whoever can read
 * the campaign can see it** — the second kind of Hob-drawn image, over the same
 * worker, signer and records as a character's portrait (`portraits.test.ts`).
 *
 * Over the real application: the real handlers, the real worker, `sharp`, the
 * memory storage adapter and Postgres. Only the image endpoint is scripted
 * (`support/imageModel.ts`), so no request here leaves the process.
 */

const OPENAI = "https://api.openai.com/v1";
const MODEL = "gpt-image-2.5-flare";
const SECRET = Redacted.make("campaign-image-test-secret");
/**
 * Room for everything Jo draws here: the worlds Jo founds draw covers of their
 * own, against the same budget (`shared-world-images.test.ts`).
 */
const PER_ACCOUNT = 8;

const images = scriptedImages({ apiUrl: OPENAI, model: MODEL });

/** The clock image URLs are minted and checked against. */
let now = Date.now();

const database = migratedDatabase("taverns_test_campaign_images");
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
  readonly stored_bytes: number | null;
}

const recordOf = (campaignId: CampaignId) =>
  sql((sql) => sql<Record>`select * from campaign_image where campaign_id = ${campaignId}`).then(
    (rows) => rows[0],
  );

const stored = (key: string) =>
  run(Effect.flatMap(ObjectStorage, (objects) => objects.head(StorageKey(key)))).then(
    Option.isSome,
  );

const FILES = ["original.png", "card.webp", "full.webp"];

const standalone = (
  who: Person,
  name: string,
  extra: { readonly partyName?: string; readonly description?: string } = {},
) => as(who.token, (client) => client.campaigns.create({ payload: { name, ...extra } }));

const findAs = (who: Person, campaignId: CampaignId) =>
  attempt(who.token, (client) => client.campaigns.findById({ params: { campaignId } }));

let jo: Person;
let ilse: Person;
let stranger: Person;

beforeAll(async () => {
  jo = await person("Jo");
  ilse = await person("Ilse");
  stranger = await person("Bo");
}, 60_000);

describe("the standalone create draws one cover", () => {
  let campaign: Campaign;
  let requestsBefore: number;

  beforeAll(async () => {
    requestsBefore = images.requests().length;
    campaign = await standalone(jo, "The Salt Road", {
      partyName: "The Iron Crows",
      description: "Caravans cross white salt flats between glass storms.",
    });
    await settled();
  }, 60_000);

  it("answers the create with the drawing state, and the draw finishes ready", async () => {
    expect(images.requests().length - requestsBefore).toBe(1);
    expect(campaign.imagePending).toBe(true);
    expect(campaign.image).toBeNull();

    const record = await recordOf(campaign.id);
    expect(record?.state).toBe("ready");
    expect(record?.failure).toBeNull();
    expect(record?.model).toBe(MODEL);
    expect(record?.account_id).toBe(jo.actor.accountId);
    // The description the create form wrote is the scene; the name colours it.
    expect(record?.prompt).toContain(
      "fantasy adventure. Caravans cross white salt flats between glass storms.",
    );
    expect(record?.prompt).toContain("called The Salt Road");
    expect(record?.prompt).toContain("known as The Iron Crows");
    expect(record?.prompt).toContain("Wide landscape composition");
    expect(record?.input_tokens).toBe(57);
    expect(record?.original_type).toBe("image/png");
    expect(record?.storage_prefix).toBe(
      `campaign-images/${jo.actor.accountId}/${campaign.id}/${record!.id}`,
    );
    for (const file of FILES) {
      expect(await stored(`${record!.storage_prefix}/${file}`)).toBe(true);
    }
  });

  it("asks for a landscape at the cover's size", async () => {
    const record = await recordOf(campaign.id);
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

  it("signs both sizes on the creator's reads, and serves 3:2 WebP through them", async () => {
    const found = await as(jo.token, (client) =>
      client.campaigns.findById({ params: { campaignId: campaign.id } }),
    );
    expect(found.imagePending).toBe(false);
    const listed = await as(jo.token, (client) => client.campaigns.list());
    const mine = await as(jo.token, (client) => client.me.campaigns());
    expect(listed.find((entry) => entry.id === campaign.id)?.image).toEqual(found.image);
    expect(mine.find((entry) => entry.campaign.id === campaign.id)?.campaign.image).toEqual(
      found.image,
    );

    const sharp = (await import("sharp")).default;
    for (const [path, width, height] of [
      [found.image!.cardUrl, 768, 512],
      [found.image!.fullUrl, 1536, 1024],
    ] as const) {
      expect(path).toMatch(/^\/campaign-images\/[0-9a-f-]+\/(card|full)\?e=\d+&s=/);
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
        client.campaigns.findById({ params: { campaignId: campaign.id } }),
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
      cardUrl.replace(/campaign-images\/[^/]+/, "campaign-images/not-a-uuid"),
      // A campaign's signature on the portrait route, and a portrait-kind
      // signature for this id on the campaign route: the kind is signed too.
      cardUrl.replace("/campaign-images/", "/portraits/"),
      signedPath(SECRET, "character", imageId, "card", now).replace(
        "/portraits/",
        "/campaign-images/",
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

  it("is drawn once: an edit draws nothing, and a second start finds the record", async () => {
    const before = images.requests().length;
    await as(jo.token, (client) =>
      client.campaigns.update({
        params: { campaignId: campaign.id },
        payload: {
          name: "The Salt Road, Revised",
          partyName: "The Crows",
          description: "A different pitch entirely.",
        },
      }),
    );
    const again = await run(
      Effect.flatMap(ImageRecords, (records) =>
        records.start("campaign", campaign.id, {
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
      client.campaigns.archive({ params: { campaignId: campaign.id } }),
    );
    expect(archived.image).not.toBeNull();
    const shelf = await as(jo.token, (client) => client.me.archivedCampaigns());
    expect(shelf.find((entry) => entry.campaign.id === campaign.id)?.campaign.image).not.toBeNull();
    const restored = await as(jo.token, (client) =>
      client.campaigns.restore({ params: { campaignId: campaign.id }, payload: {} }),
    );
    expect(restored.image).not.toBeNull();
    expect((await recordOf(campaign.id))?.state).toBe("ready");
  });
});

describe("the Shared World's create draws one cover too", () => {
  it("starts the draw from `POST /worlds/:worldId/campaigns`", async () => {
    const world = await as(jo.token, (client) =>
      client.sharedWorlds.create({ payload: { name: "The Reach" } }),
    );
    // The world draws a cover of its own; let it land before counting.
    await settled();
    const before = images.requests().length;
    const campaign = await as(jo.token, (client) =>
      client.sharedWorlds.createCampaign({
        params: { worldId: world.id },
        payload: { name: "Rime" },
      }),
    );
    expect(campaign.imagePending).toBe(true);
    await settled();
    expect(images.requests().length - before).toBe(1);
    const record = await recordOf(campaign.id);
    expect(record?.state).toBe("ready");
    expect(record?.prompt).toContain("called Rime");
  });
});

describe("who sees a cover is who reads the campaign", () => {
  let campaignId: CampaignId;
  let worldId: SharedWorldId;
  let cardUrl: string;
  let bystander: Actor;

  const readsOf = (actor: Actor) =>
    run(
      Effect.gen(function* () {
        const campaigns = yield* Campaigns;
        const memberships = yield* Memberships;
        const groups = yield* Groups;
        return {
          found: yield* Effect.result(campaigns.findById(campaignId)),
          listed: yield* campaigns.list,
          mine: yield* memberships.mine("live"),
          directory: yield* Effect.result(groups.campaigns(worldId)),
        };
      }).pipe(Effect.provideService(CurrentActor, actor)),
    );

  beforeAll(async () => {
    const world = await as(jo.token, (client) =>
      client.sharedWorlds.create({ payload: { name: "The Marches" } }),
    );
    worldId = world.id;
    const campaign = await as(jo.token, (client) =>
      client.sharedWorlds.createCampaign({
        params: { worldId },
        payload: { name: "The Drowned King" },
      }),
    );
    campaignId = campaign.id;
    await settled();
    await run(admittedTo(campaignId, ilse.actor, "Ilse"));
    bystander = await run(aGroupMemberAt(campaignId, "Wren"));
    cardUrl = (
      await as(jo.token, (client) => client.campaigns.findById({ params: { campaignId } }))
    ).image!.cardUrl;
  }, 60_000);

  it("gives a player the cover exactly when the campaign is shared with them", async () => {
    // `dm` visibility: the player reads no campaign, so gets no URL.
    const hidden = await findAs(ilse, campaignId);
    expect(hidden).toEqual({ ok: false, tag: "NotFound" });
    const theirs = await as(ilse.token, (client) => client.me.campaigns());
    expect(JSON.stringify(theirs)).not.toContain("/campaign-images/");

    await as(jo.token, (client) =>
      client.campaigns.update({ params: { campaignId }, payload: { visibility: "shared" } }),
    );
    const seen = await findAs(ilse, campaignId);
    expect(seen.ok && seen.value.image?.cardUrl).toMatch(/^\/campaign-images\//);
    const listed = await as(ilse.token, (client) => client.me.campaigns());
    const url = listed.find((entry) => entry.campaign.id === campaignId)?.campaign.image?.cardUrl;
    expect(url).toMatch(/^\/campaign-images\//);
    expect((await load(url!)).status).toBe(200);
  });

  it("gives a Shared World member who does not play the card, and never the cover", async () => {
    const reads = await readsOf(bystander);
    expect(reads.found._tag).toBe("Failure");
    expect(reads.listed.some((campaign) => campaign.id === campaignId)).toBe(false);
    expect(reads.mine.some((entry) => entry.campaign.id === campaignId)).toBe(false);
    // The directory card names the campaign and carries no picture.
    const directory = reads.directory._tag === "Success" ? reads.directory.success : [];
    expect(directory.some((card) => card.id === campaignId)).toBe(true);
    expect(JSON.stringify(reads)).not.toContain("/campaign-images/");
  });

  it("gives a stranger nothing, and a URL they never received still needs its signature", async () => {
    expect(await findAs(stranger, campaignId)).toEqual({ ok: false, tag: "NotFound" });
    const reads = await readsOf(stranger.actor);
    expect(JSON.stringify(reads)).not.toContain("/campaign-images/");
    const unsigned = cardUrl.replace(/\?.*$/, "");
    expect((await load(unsigned)).status).toBe(404);
  });

  it("lets only the creator start the draw", async () => {
    // With the record gone, the player's start finds no campaign it may draw,
    // and the creator's finds its own.
    await sql((sql) => sql`delete from campaign_image where campaign_id = ${campaignId}`);
    const start = (actor: Actor) =>
      run(
        Effect.flatMap(ImageRecords, (records) =>
          records.start("campaign", campaignId, {
            prompt: undefined,
            model: MODEL,
            limits: { perAccountPerDay: 100, perDay: 100 },
          }),
        ).pipe(Effect.provideService(CurrentActor, actor)),
      );
    await start(ilse.actor);
    await start(bystander);
    await start(stranger.actor);
    expect(await recordOf(campaignId)).toBeUndefined();
    await start(jo.actor);
    expect((await recordOf(campaignId))?.failure).toBe("skipped");
  });
});

describe("when there is no cover", () => {
  it("skips a campaign with nothing to draw from, and says so on the record", async () => {
    const before = images.requests().length;
    const campaign = await standalone(stranger, "  ");
    await settled();
    expect(campaign.imagePending).toBe(false);
    expect(campaign.image).toBeNull();
    expect(images.requests().length).toBe(before);
    const record = await recordOf(campaign.id);
    expect(record?.state).toBe("failed");
    expect(record?.failure).toBe("skipped");
    expect(record?.prompt).toBeNull();
  });

  it("records a moderation refusal and puts no provider text anywhere", async () => {
    images.next({ kind: "refused" });
    const campaign = await standalone(stranger, "Red Harvest");
    await settled();
    const record = await recordOf(campaign.id);
    expect(record?.failure).toBe("refused");
    const read = await as(stranger.token, (client) =>
      client.campaigns.findById({ params: { campaignId: campaign.id } }),
    );
    expect(read.image).toBeNull();
    expect(read.imagePending).toBe(false);
    expect(JSON.stringify(read)).not.toContain("secret-provider-words");
    expect(JSON.stringify(record)).not.toContain(MODERATION_TEXT);
  });

  it("records a provider failure as provider", async () => {
    images.next({ kind: "error", status: 500 });
    const campaign = await standalone(stranger, "Low Tide");
    await settled();
    expect((await recordOf(campaign.id))?.failure).toBe("provider");
  });

  it("records a draw that outlives the job timeout as timeout, and queues its files", async () => {
    // A worker of its own with a timeout a test can wait for, over an endpoint
    // that never answers, as `portraits.test.ts` does for a character.
    const hanging = scriptedImages({ apiUrl: OPENAI, model: MODEL });
    hanging.next({ kind: "hang" });
    const pip = await person("Pip");
    const campaign = await as(pip.token, (client) =>
      client.campaigns.create({ payload: { name: "Slow Water" } }),
    );
    await settled();
    // The shared worker drew it; forget that, so the slow worker can start one.
    await sql((sql) => sql`delete from campaign_image where campaign_id = ${campaign.id}`);

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
          const answered = yield* worker.drawCampaign(campaign);
          expect(answered.imagePending).toBe(true);
          yield* worker.idle;
        }),
      ).pipe(Effect.provideService(CurrentActor, pip.actor)),
    );

    expect(hanging.requests()).toHaveLength(1);
    expect(hanging.requests()[0]?.size).toBe("1536x1024");
    const record = await recordOf(campaign.id);
    expect(record?.failure).toBe("timeout");
    const queued = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record!.storage_prefix}
      `,
    );
    expect(queued[0]?.count).toBe(1);
  });

  it("spends one daily budget across portraits and covers", async () => {
    // A fresh account: its portraits and its covers count against the same
    // per-account limit, so the cover after PER_ACCOUNT - 1 portraits and one
    // cover is capped.
    const bram = await person("Bram");
    const first = await standalone(bram, "Bram's Table");
    await settled();
    for (let index = 0; index < PER_ACCOUNT - 1; index += 1) {
      await as(bram.token, (client) =>
        client.me.createCharacter({
          params: { campaignId: first.id },
          payload: { name: `Bram ${String(index)}`, race: "Halfling" },
        }),
      );
    }
    await settled();
    const before = images.requests().length;
    const over = await standalone(bram, "One Table Too Many");
    await settled();
    expect(over.imagePending).toBe(false);
    expect(images.requests().length).toBe(before);
    const record = await recordOf(over.id);
    expect(record?.failure).toBe("capped");
    expect(record?.prompt).toContain("One Table Too Many");
  });
});

describe("deleting a campaign", () => {
  it("queues its cover's files through the outbox, and the drain removes them", async () => {
    // The product never deletes a campaign — it archives — so the row goes the
    // way any future delete or cascade would take it.
    const campaign = await standalone(jo, "Brief Candle");
    await settled();
    const record = (await recordOf(campaign.id))!;
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(true);

    await sql((sql) => sql`delete from campaign where id = ${campaign.id}`);
    expect(await recordOf(campaign.id)).toBeUndefined();
    await run(Effect.flatMap(HobImages, (worker) => worker.drainDeletions));
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(false);
    const queued = await sql(
      (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record.storage_prefix}
      `,
    );
    expect(queued[0]?.count).toBe(0);
  });

  it("leaves no files behind when the campaign is deleted mid-draw", async () => {
    const release = await run(Deferred.make<void>());
    images.next({ kind: "held", release });
    const campaign = await standalone(ilse, "Gone Before Dawn");
    const record = (await recordOf(campaign.id))!;
    expect(record.state).toBe("generating");

    await sql((sql) => sql`delete from campaign where id = ${campaign.id}`);
    await run(Deferred.succeed(release, undefined));
    await settled();
    await run(Effect.flatMap(HobImages, (worker) => worker.drainDeletions));
    for (const file of FILES) expect(await stored(`${record.storage_prefix}/${file}`)).toBe(false);
  });

  it("marks a cover a dead process left behind interrupted, beside the portraits", async () => {
    const campaign = await standalone(ilse, "Stale Lantern");
    await settled();
    await sql(
      (sql) => sql`
        update campaign_image set
          state = 'generating', failure = null, finished_at = null,
          created_at = now() - interval '10 minutes'
        where campaign_id = ${campaign.id}
      `,
    );
    const swept = await run(Effect.flatMap(HobImages, (worker) => worker.sweep));
    expect(swept).toBe(1);
    expect((await recordOf(campaign.id))?.failure).toBe("interrupted");
  });
});
