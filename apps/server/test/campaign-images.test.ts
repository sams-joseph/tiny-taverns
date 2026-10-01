import { describe, expect } from "@effect/vitest";
import {
  type Actor,
  type CampaignId,
  CurrentActor,
  type SharedWorldId,
  TavernsApi,
} from "@taverns/api";
import { Context, Deferred, Effect, Layer, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { applicationOver, servicesOver } from "../src/app.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls, expiryFor, signedPath } from "../src/images/ImageUrls.js";
import { Campaigns } from "../src/repo/Campaigns.js";
import { Groups } from "../src/repo/Groups.js";
import { ImageRecords } from "../src/repo/Images.js";
import { Memberships } from "../src/repo/Memberships.js";
import { ObjectStorage, StorageKey } from "../src/storage/ObjectStorage.js";
import { type Person, aGroupMemberAt, aPerson, admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { MODERATION_TEXT, requested, scriptedImages } from "./support/imageModel.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

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

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(ImageRecords.layer),
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

/** Wait for every drawing job to finish. */
const settled = Effect.flatMap(HobImages, (worker) => worker.idle);

/** Fetch a signed path without any credential, as an `<img>` does. */
const load = (path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(path);
    const bytes = new Uint8Array(yield* response.arrayBuffer);
    return { status: response.status, headers: response.headers, bytes };
  }).pipe(Effect.orDie);

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
  sql((sql) => sql<Record>`select * from campaign_image where campaign_id = ${campaignId}`).pipe(
    Effect.map((rows) => rows[0]),
  );

const stored = (key: string) =>
  Effect.flatMap(ObjectStorage, (objects) => objects.head(StorageKey(key))).pipe(
    Effect.orDie,
    Effect.map(Option.isSome),
  );

const FILES = ["original.png", "card.webp", "full.webp"];

const standalone = (
  who: Person,
  name: string,
  extra: { readonly partyName?: string; readonly description?: string } = {},
) => as(who.token, (client) => client.campaigns.create({ payload: { name, ...extra } }));

const findAs = (who: Person, campaignId: CampaignId) =>
  attempt(who.token, (client) => client.campaigns.findById({ params: { campaignId } }));

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  return { jo, ilse, stranger };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "campaign-images.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const makeCover = Effect.gen(function* () {
  const { jo } = yield* Fixture;
  const requestsBefore = images.requests().length;
  const campaign = yield* standalone(jo, "The Salt Road", {
    partyName: "The Iron Crows",
    description: "Caravans cross white salt flats between glass storms.",
  });
  yield* settled;
  return { campaign, requestsBefore };
});

/** The campaign the standalone create made, and the request count before it. */
class Cover extends Context.Service<Cover, Effect.Success<typeof makeCover>>()(
  "campaign-images.test/Cover",
) {}

const makeWorldTable = Effect.gen(function* () {
  const { jo, ilse } = yield* Fixture;
  const world = yield* as(jo.token, (client) =>
    client.sharedWorlds.create({ payload: { name: "The Marches" } }),
  );
  const worldId = world.id;
  const campaign = yield* as(jo.token, (client) =>
    client.sharedWorlds.createCampaign({
      params: { worldId },
      payload: { name: "The Drowned King" },
    }),
  );
  const campaignId = campaign.id;
  yield* settled;
  yield* admittedTo(campaignId, ilse.actor, "Ilse");
  const bystander = yield* aGroupMemberAt(campaignId, "Wren");
  const cardUrl = (yield* as(jo.token, (client) =>
    client.campaigns.findById({ params: { campaignId } }),
  )).image!.cardUrl;
  return { campaignId, worldId, cardUrl, bystander };
});

/** A campaign in a Shared World of Jo's, with a player and a bystander. */
class WorldTable extends Context.Service<WorldTable, Effect.Success<typeof makeWorldTable>>()(
  "campaign-images.test/WorldTable",
) {}

const readsOf = (actor: Actor, campaignId: CampaignId, worldId: SharedWorldId) =>
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
  }).pipe(Effect.provideService(CurrentActor, actor), Effect.orDie);

describeLayer("campaign-images", shared, (it) => {
  it.layer(Layer.effect(Cover)(makeCover))("the standalone create draws one cover", (it) => {
    it.effect("answers the create with the drawing state, and the draw finishes ready", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const { campaign, requestsBefore } = yield* Cover;
        expect(images.requests().length - requestsBefore).toBe(1);
        expect(campaign.imagePending).toBe(true);
        expect(campaign.image).toBeNull();

        const record = yield* recordOf(campaign.id);
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
          expect(yield* stored(`${record!.storage_prefix}/${file}`)).toBe(true);
        }
      }),
    );

    it.effect("asks for a landscape at the cover's size", () =>
      Effect.gen(function* () {
        const { campaign } = yield* Cover;
        const record = yield* recordOf(campaign.id);
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
      }),
    );

    it.effect("signs both sizes on the creator's reads, and serves 3:2 WebP through them", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const { campaign } = yield* Cover;
        const found = yield* as(jo.token, (client) =>
          client.campaigns.findById({ params: { campaignId: campaign.id } }),
        );
        expect(found.imagePending).toBe(false);
        const listed = yield* as(jo.token, (client) => client.campaigns.list());
        const mine = yield* as(jo.token, (client) => client.me.campaigns());
        expect(listed.find((entry) => entry.id === campaign.id)?.image).toEqual(found.image);
        expect(mine.find((entry) => entry.campaign.id === campaign.id)?.campaign.image).toEqual(
          found.image,
        );

        const sharp = (yield* Effect.promise(() => import("sharp"))).default;
        for (const [path, width, height] of [
          [found.image!.cardUrl, 768, 512],
          [found.image!.fullUrl, 1536, 1024],
        ] as const) {
          expect(path).toMatch(/^\/campaign-images\/[0-9a-f-]+\/(card|full)\?e=\d+&s=/);
          const response = yield* load(path);
          expect(response.status).toBe(200);
          expect(response.headers["content-type"]).toBe("image/webp");
          expect(response.headers["cache-control"]).toMatch(/^private, max-age=\d+, immutable$/);
          expect(response.headers["x-content-type-options"]).toBe("nosniff");
          expect(response.headers["content-security-policy"]).toBe("default-src 'none'");
          const metadata = yield* Effect.promise(() => sharp(response.bytes).metadata());
          expect([metadata.format, metadata.width, metadata.height]).toEqual([
            "webp",
            width,
            height,
          ]);
        }
      }),
    );

    it.effect(
      "refuses a forged, altered, other-size, other-kind or expired URL with the same 404",
      () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const { campaign } = yield* Cover;
          const { cardUrl, fullUrl } = (yield* as(jo.token, (client) =>
            client.campaigns.findById({ params: { campaignId: campaign.id } }),
          )).image!;
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
          for (const path of cases) expect((yield* load(path)).status, path).toBe(404);

          const before = now;
          now = expiryFor(before) * 1000 + 1;
          yield* Effect.gen(function* () {
            expect((yield* load(cardUrl)).status).toBe(404);
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                now = before;
              }),
            ),
          );
        }),
    );

    it.effect("is drawn once: an edit draws nothing, and a second start finds the record", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const { campaign } = yield* Cover;
        const before = images.requests().length;
        yield* as(jo.token, (client) =>
          client.campaigns.update({
            params: { campaignId: campaign.id },
            payload: {
              name: "The Salt Road, Revised",
              partyName: "The Crows",
              description: "A different pitch entirely.",
            },
          }),
        );
        const again = yield* Effect.orDie(
          Effect.flatMap(ImageRecords, (records) =>
            records.start("campaign", campaign.id, {
              prompt: "again",
              model: MODEL,
              limits: { perAccountPerDay: 100, perDay: 100 },
            }),
          ).pipe(Effect.provideService(CurrentActor, jo.actor)),
        );
        yield* settled;
        expect(again).toBeUndefined();
        expect(images.requests().length).toBe(before);
      }),
    );

    it.effect("keeps the cover through archive and restore, on the archived shelf too", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const { campaign } = yield* Cover;
        const archived = yield* as(jo.token, (client) =>
          client.campaigns.archive({ params: { campaignId: campaign.id } }),
        );
        expect(archived.image).not.toBeNull();
        const shelf = yield* as(jo.token, (client) => client.me.archivedCampaigns());
        expect(
          shelf.find((entry) => entry.campaign.id === campaign.id)?.campaign.image,
        ).not.toBeNull();
        const restored = yield* as(jo.token, (client) =>
          client.campaigns.restore({ params: { campaignId: campaign.id }, payload: {} }),
        );
        expect(restored.image).not.toBeNull();
        expect((yield* recordOf(campaign.id))?.state).toBe("ready");
      }),
    );
  });

  describe("the Shared World's create draws one cover too", () => {
    it.effect("starts the draw from `POST /worlds/:worldId/campaigns`", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        const world = yield* as(jo.token, (client) =>
          client.sharedWorlds.create({ payload: { name: "The Reach" } }),
        );
        // The world draws a cover of its own; let it land before counting.
        yield* settled;
        const before = images.requests().length;
        const campaign = yield* as(jo.token, (client) =>
          client.sharedWorlds.createCampaign({
            params: { worldId: world.id },
            payload: { name: "Rime" },
          }),
        );
        expect(campaign.imagePending).toBe(true);
        yield* settled;
        expect(images.requests().length - before).toBe(1);
        const record = yield* recordOf(campaign.id);
        expect(record?.state).toBe("ready");
        expect(record?.prompt).toContain("called Rime");
      }),
    );
  });

  it.layer(Layer.effect(WorldTable)(makeWorldTable))(
    "who sees a cover is who reads the campaign",
    (it) => {
      it.effect("gives a player the cover exactly when the campaign is shared with them", () =>
        Effect.gen(function* () {
          const { jo, ilse } = yield* Fixture;
          const { campaignId } = yield* WorldTable;
          // `dm` visibility: the player reads no campaign, so gets no URL.
          const hidden = yield* findAs(ilse, campaignId);
          expect(hidden).toEqual({ ok: false, tag: "NotFound" });
          const theirs = yield* as(ilse.token, (client) => client.me.campaigns());
          expect(JSON.stringify(theirs)).not.toContain("/campaign-images/");

          yield* as(jo.token, (client) =>
            client.campaigns.update({ params: { campaignId }, payload: { visibility: "shared" } }),
          );
          const seen = yield* findAs(ilse, campaignId);
          expect(seen.ok && seen.value.image?.cardUrl).toMatch(/^\/campaign-images\//);
          const listed = yield* as(ilse.token, (client) => client.me.campaigns());
          const url = listed.find((entry) => entry.campaign.id === campaignId)?.campaign.image
            ?.cardUrl;
          expect(url).toMatch(/^\/campaign-images\//);
          expect((yield* load(url!)).status).toBe(200);
        }),
      );

      it.effect("gives a Shared World member who does not play the card, and never the cover", () =>
        Effect.gen(function* () {
          const { campaignId, worldId, bystander } = yield* WorldTable;
          const reads = yield* readsOf(bystander, campaignId, worldId);
          expect(reads.found._tag).toBe("Failure");
          expect(reads.listed.some((campaign) => campaign.id === campaignId)).toBe(false);
          expect(reads.mine.some((entry) => entry.campaign.id === campaignId)).toBe(false);
          // The directory card names the campaign and carries no picture.
          const directory = reads.directory._tag === "Success" ? reads.directory.success : [];
          expect(directory.some((card) => card.id === campaignId)).toBe(true);
          expect(JSON.stringify(reads)).not.toContain("/campaign-images/");
        }),
      );

      it.effect(
        "gives a stranger nothing, and a URL they never received still needs its signature",
        () =>
          Effect.gen(function* () {
            const { stranger } = yield* Fixture;
            const { campaignId, worldId, cardUrl } = yield* WorldTable;
            expect(yield* findAs(stranger, campaignId)).toEqual({ ok: false, tag: "NotFound" });
            const reads = yield* readsOf(stranger.actor, campaignId, worldId);
            expect(JSON.stringify(reads)).not.toContain("/campaign-images/");
            const unsigned = cardUrl.replace(/\?.*$/, "");
            expect((yield* load(unsigned)).status).toBe(404);
          }),
      );

      it.effect("lets only the creator start the draw", () =>
        Effect.gen(function* () {
          // With the record gone, the player's start finds no campaign it may draw,
          // and the creator's finds its own.
          const { jo, ilse, stranger } = yield* Fixture;
          const { campaignId, bystander } = yield* WorldTable;
          yield* sql((sql) => sql`delete from campaign_image where campaign_id = ${campaignId}`);
          const start = (actor: Actor) =>
            Effect.orDie(
              Effect.flatMap(ImageRecords, (records) =>
                records.start("campaign", campaignId, {
                  prompt: undefined,
                  model: MODEL,
                  limits: { perAccountPerDay: 100, perDay: 100 },
                }),
              ).pipe(Effect.provideService(CurrentActor, actor)),
            );
          yield* start(ilse.actor);
          yield* start(bystander);
          yield* start(stranger.actor);
          expect(yield* recordOf(campaignId)).toBeUndefined();
          yield* start(jo.actor);
          expect((yield* recordOf(campaignId))?.failure).toBe("skipped");
        }),
      );
    },
  );

  describe("when there is no cover", () => {
    it.effect("skips a campaign with nothing to draw from, and says so on the record", () =>
      Effect.gen(function* () {
        const { stranger } = yield* Fixture;
        const before = images.requests().length;
        const campaign = yield* standalone(stranger, "  ");
        yield* settled;
        expect(campaign.imagePending).toBe(false);
        expect(campaign.image).toBeNull();
        expect(images.requests().length).toBe(before);
        const record = yield* recordOf(campaign.id);
        expect(record?.state).toBe("failed");
        expect(record?.failure).toBe("skipped");
        expect(record?.prompt).toBeNull();
      }),
    );

    it.effect("records a moderation refusal and puts no provider text anywhere", () =>
      Effect.gen(function* () {
        const { stranger } = yield* Fixture;
        images.next({ kind: "refused" });
        const campaign = yield* standalone(stranger, "Red Harvest");
        yield* settled;
        const record = yield* recordOf(campaign.id);
        expect(record?.failure).toBe("refused");
        const read = yield* as(stranger.token, (client) =>
          client.campaigns.findById({ params: { campaignId: campaign.id } }),
        );
        expect(read.image).toBeNull();
        expect(read.imagePending).toBe(false);
        expect(JSON.stringify(read)).not.toContain("secret-provider-words");
        expect(JSON.stringify(record)).not.toContain(MODERATION_TEXT);
      }),
    );

    it.effect("records a provider failure as provider", () =>
      Effect.gen(function* () {
        const { stranger } = yield* Fixture;
        images.next({ kind: "error", status: 500 });
        const campaign = yield* standalone(stranger, "Low Tide");
        yield* settled;
        expect((yield* recordOf(campaign.id))?.failure).toBe("provider");
      }),
    );

    it.effect("records a draw that outlives the job timeout as timeout, and queues its files", () =>
      Effect.gen(function* () {
        // A worker of its own with a timeout a test can wait for, over an endpoint
        // that never answers, as `portraits.test.ts` does for a character.
        const hanging = scriptedImages({ apiUrl: OPENAI, model: MODEL });
        hanging.next({ kind: "hang" });
        const pip = yield* aPerson("Pip");
        const campaign = yield* as(pip.token, (client) =>
          client.campaigns.create({ payload: { name: "Slow Water" } }),
        );
        yield* settled;
        // The shared worker drew it; forget that, so the slow worker can start one.
        yield* sql((sql) => sql`delete from campaign_image where campaign_id = ${campaign.id}`);

        // On the test clock, so the budget runs out when the test says and no sooner.
        yield* Effect.gen(function* () {
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
          yield* requested(hanging, worker, 1);
          yield* TestClock.adjust("200 millis");
          yield* worker.idle;
        }).pipe(
          Effect.scoped,
          Effect.provide(TestClock.layer()),
          Effect.provideService(CurrentActor, pip.actor),
          Effect.orDie,
        );

        expect(hanging.requests()).toHaveLength(1);
        expect(hanging.requests()[0]?.size).toBe("1536x1024");
        const record = yield* recordOf(campaign.id);
        expect(record?.failure).toBe("timeout");
        const queued = yield* sql(
          (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record!.storage_prefix}
      `,
        );
        expect(queued[0]?.count).toBe(1);
      }),
    );

    it.effect("spends one daily budget across portraits and covers", () =>
      Effect.gen(function* () {
        // A fresh account: its portraits and its covers count against the same
        // per-account limit, so the cover after PER_ACCOUNT - 1 portraits and one
        // cover is capped.
        const bram = yield* aPerson("Bram");
        const first = yield* standalone(bram, "Bram's Table");
        yield* settled;
        for (let index = 0; index < PER_ACCOUNT - 1; index += 1) {
          yield* as(bram.token, (client) =>
            client.me.createCharacter({
              params: { campaignId: first.id },
              payload: { name: `Bram ${String(index)}`, race: "Halfling" },
            }),
          );
        }
        yield* settled;
        const before = images.requests().length;
        const over = yield* standalone(bram, "One Table Too Many");
        yield* settled;
        expect(over.imagePending).toBe(false);
        expect(images.requests().length).toBe(before);
        const record = yield* recordOf(over.id);
        expect(record?.failure).toBe("capped");
        expect(record?.prompt).toContain("One Table Too Many");
      }),
    );
  });

  describe("deleting a campaign", () => {
    it.effect("queues its cover's files through the outbox, and the drain removes them", () =>
      Effect.gen(function* () {
        // Through the creator's permanent delete, the one product path that
        // deletes a campaign row.
        const { jo } = yield* Fixture;
        const campaign = yield* standalone(jo, "Brief Candle");
        yield* settled;
        const record = (yield* recordOf(campaign.id))!;
        for (const file of FILES)
          expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(true);
        const spent = () =>
          sql(
            (sql) => sql<{ readonly count: number }>`
          select count(*)::int as count from image_spend where account_id = ${record.account_id}
        `,
          ).pipe(Effect.map((rows) => rows[0]!.count));
        const spentBefore = yield* spent();

        yield* as(jo.token, (client) =>
          client.campaigns.deletePermanently({ params: { campaignId: campaign.id } }),
        );
        // The day's budget is a ledger the delete does not touch.
        expect(yield* spent()).toBe(spentBefore);
        expect(yield* recordOf(campaign.id)).toBeUndefined();
        yield* Effect.flatMap(HobImages, (worker) => worker.drainDeletions);
        for (const file of FILES)
          expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(false);
        const queued = yield* sql(
          (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record.storage_prefix}
      `,
        );
        expect(queued[0]?.count).toBe(0);
      }),
    );

    it.effect("leaves no files behind when the campaign is deleted mid-draw", () =>
      Effect.gen(function* () {
        const { ilse } = yield* Fixture;
        const release = yield* Deferred.make<void>();
        images.next({ kind: "held", release });
        const campaign = yield* standalone(ilse, "Gone Before Dawn");
        const record = (yield* recordOf(campaign.id))!;
        expect(record.state).toBe("generating");

        yield* sql((sql) => sql`delete from campaign where id = ${campaign.id}`);
        yield* Deferred.succeed(release, undefined);
        yield* settled;
        yield* Effect.flatMap(HobImages, (worker) => worker.drainDeletions);
        for (const file of FILES)
          expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(false);
      }),
    );

    it.effect("marks a cover a dead process left behind interrupted, beside the portraits", () =>
      Effect.gen(function* () {
        const { ilse } = yield* Fixture;
        const campaign = yield* standalone(ilse, "Stale Lantern");
        yield* settled;
        yield* sql(
          (sql) => sql`
        update campaign_image set
          state = 'generating', failure = null, finished_at = null,
          created_at = now() - interval '10 minutes',
          updated_at = now() - interval '10 minutes'
        where campaign_id = ${campaign.id}
      `,
        );
        const swept = yield* Effect.flatMap(HobImages, (worker) => worker.sweep);
        expect(swept).toBe(1);
        expect((yield* recordOf(campaign.id))?.failure).toBe("interrupted");
      }),
    );
  });
});
