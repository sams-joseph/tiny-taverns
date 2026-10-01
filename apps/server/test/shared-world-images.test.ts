import { describe, expect } from "@effect/vitest";
import { type Actor, CurrentActor, type SharedWorldId, TavernsApi } from "@taverns/api";
import { Context, Deferred, Effect, Layer, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { applicationOver, servicesOver } from "../src/app.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls, expiryFor, signedPath } from "../src/images/ImageUrls.js";
import { Groups } from "../src/repo/Groups.js";
import { ImageRecords } from "../src/repo/Images.js";
import { Invites } from "../src/repo/Invites.js";
import { ObjectStorage, StorageKey } from "../src/storage/ObjectStorage.js";
import { type Person, aGroupMemberAt, aPerson, admittedTo, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { MODERATION_TEXT, requested, scriptedImages } from "./support/imageModel.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

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
}

const recordOf = (worldId: SharedWorldId) =>
  sql((sql) => sql<Record>`select * from shared_world_image where group_id = ${worldId}`).pipe(
    Effect.map((rows) => rows[0]),
  );

const stored = (key: string) =>
  Effect.flatMap(ObjectStorage, (objects) => objects.head(StorageKey(key))).pipe(
    Effect.orDie,
    Effect.map(Option.isSome),
  );

const FILES = ["original.png", "card.webp", "full.webp"];

const found = (who: Person, name: string) =>
  as(who.token, (client) => client.sharedWorlds.create({ payload: { name } }));

/** Starts the one draw of a world as this actor, with nothing to draw from. */
const startAs = (actor: Actor, worldId: SharedWorldId) =>
  Effect.flatMap(ImageRecords, (records) =>
    records.start("sharedWorld", worldId, {
      prompt: undefined,
      model: MODEL,
      limits: { perAccountPerDay: 100, perDay: 100 },
    }),
  ).pipe(Effect.provideService(CurrentActor, actor), Effect.orDie);

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const stranger = yield* aPerson("Bo");
  return { jo, ilse, stranger };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "shared-world-images.test/Fixture",
) {}

const shared = Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application));

const makeFounding = Effect.gen(function* () {
  const { jo } = yield* Fixture;
  const requestsBefore = images.requests().length;
  const world = yield* found(jo, "The Salt Company");
  yield* settled;
  return { world, requestsBefore };
});

/** The world Jo founded, and the request count before it. */
class Founding extends Context.Service<Founding, Effect.Success<typeof makeFounding>>()(
  "shared-world-images.test/Founding",
) {}

const makeWorldTable = Effect.gen(function* () {
  const { jo, ilse } = yield* Fixture;
  const world = yield* found(jo, "The Marches");
  const worldId = world.id;
  const campaign = yield* as(jo.token, (client) =>
    client.sharedWorlds.createCampaign({
      params: { worldId },
      payload: { name: "The Drowned King" },
    }),
  );
  const campaignId = campaign.id;
  yield* settled;
  const player = yield* admittedTo(campaignId, ilse.actor, "Ilse");
  const bystander = yield* aGroupMemberAt(campaignId, "Wren");
  const cardUrl = (yield* as(jo.token, (client) =>
    client.sharedWorlds.findById({ params: { worldId } }),
  )).image!.cardUrl;
  return { worldId, campaignId, cardUrl, player, bystander };
});

/** A campaign in a Shared World of Jo's, with a player and a bystander. */
class WorldTable extends Context.Service<WorldTable, Effect.Success<typeof makeWorldTable>>()(
  "shared-world-images.test/WorldTable",
) {}

const readsOf = (actor: Actor, worldId: SharedWorldId) =>
  Effect.gen(function* () {
    const groups = yield* Groups;
    return {
      found: yield* Effect.result(groups.findById(worldId)),
      mine: yield* groups.mine,
    };
  }).pipe(Effect.provideService(CurrentActor, actor), Effect.orDie);

describeLayer("shared-world-images", shared, (it) => {
  it.layer(Layer.effect(Founding)(makeFounding))(
    "founding a Shared World draws one cover",
    (it) => {
      it.effect("answers the create with the drawing state, and the draw finishes ready", () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const { world, requestsBefore } = yield* Founding;
          expect(images.requests().length - requestsBefore).toBe(1);
          expect(world.imagePending).toBe(true);
          expect(world.image).toBeNull();

          const record = yield* recordOf(world.id);
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
            expect(yield* stored(`${record!.storage_prefix}/${file}`)).toBe(true);
          }
        }),
      );

      it.effect("asks for a landscape at the cover's size", () =>
        Effect.gen(function* () {
          const { world } = yield* Founding;
          const record = yield* recordOf(world.id);
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

      it.effect("signs both sizes on the owner's reads, and serves 3:2 WebP through them", () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const { world } = yield* Founding;
          const read = yield* as(jo.token, (client) =>
            client.sharedWorlds.findById({ params: { worldId: world.id } }),
          );
          expect(read.imagePending).toBe(false);
          const listed = yield* as(jo.token, (client) => client.sharedWorlds.list());
          expect(
            listed.find((entry) => entry.sharedWorld.id === world.id)?.sharedWorld.image,
          ).toEqual(read.image);

          const sharp = (yield* Effect.promise(() => import("sharp"))).default;
          for (const [path, width, height] of [
            [read.image!.cardUrl, 768, 512],
            [read.image!.fullUrl, 1536, 1024],
          ] as const) {
            expect(path).toMatch(/^\/shared-world-images\/[0-9a-f-]+\/(card|full)\?e=\d+&s=/);
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
            const { world } = yield* Founding;
            const { cardUrl, fullUrl } = (yield* as(jo.token, (client) =>
              client.sharedWorlds.findById({ params: { worldId: world.id } }),
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

      it.effect("is drawn once: a rename draws nothing, and a second start finds the record", () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const { world } = yield* Founding;
          const before = images.requests().length;
          const renamed = yield* as(jo.token, (client) =>
            client.sharedWorlds.update({
              params: { worldId: world.id },
              payload: {
                name: "The Salt Company, Reformed",
                description: "Now a guild of smugglers.",
              },
            }),
          );
          expect(renamed.image).not.toBeNull();
          const again = yield* Effect.flatMap(ImageRecords, (records) =>
            records.start("sharedWorld", world.id, {
              prompt: "again",
              model: MODEL,
              limits: { perAccountPerDay: 100, perDay: 100 },
            }),
          ).pipe(Effect.provideService(CurrentActor, jo.actor), Effect.orDie);
          yield* settled;
          expect(again).toBeUndefined();
          expect(images.requests().length).toBe(before);
        }),
      );

      it.effect("keeps the cover through archive and restore, on the archived shelf too", () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const { world } = yield* Founding;
          const archived = yield* as(jo.token, (client) =>
            client.sharedWorlds.archive({ params: { worldId: world.id } }),
          );
          expect(archived.image).not.toBeNull();
          const shelf = yield* as(jo.token, (client) => client.sharedWorlds.archived());
          expect(shelf.find((entry) => entry.id === world.id)?.image).not.toBeNull();
          const restored = yield* as(jo.token, (client) =>
            client.sharedWorlds.restore({ params: { worldId: world.id }, payload: {} }),
          );
          expect(restored.image).not.toBeNull();
          expect((yield* recordOf(world.id))?.state).toBe("ready");
        }),
      );
    },
  );

  describe("promoting a campaign's context draws one cover too", () => {
    it.effect("starts the draw from `POST /campaigns/:campaignId/shared-world`, once", () =>
      Effect.gen(function* () {
        const { ilse } = yield* Fixture;
        const campaign = yield* as(ilse.token, (client) =>
          client.campaigns.create({ payload: { name: "Lanterns" } }),
        );
        yield* settled;
        // A hidden context is not a Shared World, so it has no cover to draw, and
        // its creator's start finds nothing.
        yield* startAs(ilse.actor, campaign.contextId);
        expect(yield* recordOf(campaign.contextId)).toBeUndefined();

        const before = images.requests().length;
        const world = yield* as(ilse.token, (client) =>
          client.campaigns.promoteSharedWorld({
            params: { campaignId: campaign.id },
            payload: {
              name: "The Lantern Coast",
              description: "Cliffs lit by a thousand lanterns.",
            },
          }),
        );
        expect(world.id).toBe(campaign.contextId);
        expect(world.imagePending).toBe(true);
        yield* settled;
        expect(images.requests().length - before).toBe(1);
        const record = yield* recordOf(world.id);
        expect(record?.state).toBe("ready");
        expect(record?.account_id).toBe(ilse.actor.accountId);
        expect(record?.prompt).toContain("fantasy world. Cliffs lit by a thousand lanterns.");
        expect(record?.prompt).toContain("called The Lantern Coast");
      }),
    );

    it.effect("draws nothing when a campaign connects to, or moves between, existing worlds", () =>
      Effect.gen(function* () {
        const { ilse } = yield* Fixture;
        const home = yield* found(ilse, "Home Waters");
        const away = yield* found(ilse, "Far Waters");
        const campaign = yield* as(ilse.token, (client) =>
          client.campaigns.create({ payload: { name: "Crossing" } }),
        );
        yield* settled;
        const before = images.requests().length;
        const connected = yield* as(ilse.token, (client) =>
          client.campaigns.connectSharedWorld({
            params: { campaignId: campaign.id },
            payload: { worldId: home.id },
          }),
        );
        const moved = yield* as(ilse.token, (client) =>
          client.campaigns.moveSharedWorld({
            params: { campaignId: campaign.id },
            payload: { worldId: away.id },
          }),
        );
        yield* settled;
        expect(images.requests().length).toBe(before);
        // The answers are ordinary world reads, so they carry each world's cover.
        expect(connected.image?.cardUrl).toMatch(/^\/shared-world-images\//);
        expect(moved.image?.cardUrl).toMatch(/^\/shared-world-images\//);
      }),
    );
  });

  it.layer(Layer.effect(WorldTable)(makeWorldTable))(
    "who sees a cover is who reads the world",
    (it) => {
      it.effect(
        "gives every member the cover: a player at one of its tables, and one who plays nowhere",
        () =>
          Effect.gen(function* () {
            const { worldId, player, bystander } = yield* WorldTable;
            for (const member of [player, bystander]) {
              const reads = yield* readsOf(member, worldId);
              expect(reads.found._tag).toBe("Success");
              const read = reads.found._tag === "Success" ? reads.found.success : undefined;
              expect(read?.image?.cardUrl).toMatch(/^\/shared-world-images\//);
              const listed = reads.mine.find((entry) => entry.sharedWorld.id === worldId);
              expect(listed?.isOwner).toBe(false);
              expect(listed?.sharedWorld.image?.fullUrl).toMatch(/^\/shared-world-images\//);
              expect((yield* load(read!.image!.cardUrl)).status).toBe(200);
            }
          }),
      );

      it.effect(
        "gives a stranger nothing, and a URL they never received still needs its signature",
        () =>
          Effect.gen(function* () {
            const { stranger } = yield* Fixture;
            const { worldId, cardUrl } = yield* WorldTable;
            const reads = yield* readsOf(stranger.actor, worldId);
            expect(reads.found._tag).toBe("Failure");
            expect(JSON.stringify(reads)).not.toContain("/shared-world-images/");
            const unsigned = cardUrl.replace(/\?.*$/, "");
            expect((yield* load(unsigned)).status).toBe(404);
          }),
      );

      it.effect("puts no cover on the name-only references to the world", () =>
        Effect.gen(function* () {
          const { jo } = yield* Fixture;
          const { worldId, campaignId } = yield* WorldTable;
          // A campaign row names its world as `{ id, name }` — a pointer, not the
          // world — and an invitation's preview, which a person who is not yet a
          // member reads, names it by name alone. Neither carries the picture.
          const rows = yield* as(jo.token, (client) => client.me.campaigns());
          expect(rows.find((entry) => entry.campaign.id === campaignId)?.sharedWorld?.id).toBe(
            worldId,
          );
          expect(JSON.stringify(rows)).not.toContain("/shared-world-images/");

          const preview = yield* Effect.gen(function* () {
            const invites = yield* Invites;
            const proof = yield* asDm(jo.actor, campaignId);
            const issued = yield* invites.createForCampaign(proof, { label: "Someone new" });
            return yield* invites.preview(issued.token);
          }).pipe(Effect.orDie);
          expect(JSON.stringify(preview)).toContain("The Marches");
          expect(JSON.stringify(preview)).not.toContain("/shared-world-images/");
        }),
      );

      it.effect("lets only the owner start the draw", () =>
        Effect.gen(function* () {
          const { jo, stranger } = yield* Fixture;
          const { worldId, player, bystander } = yield* WorldTable;
          // With the record gone, a member's start finds no world it may draw, and
          // the owner's finds their own.
          yield* sql((sql) => sql`delete from shared_world_image where group_id = ${worldId}`);
          yield* startAs(player, worldId);
          yield* startAs(bystander, worldId);
          yield* startAs(stranger.actor, worldId);
          expect(yield* recordOf(worldId)).toBeUndefined();
          yield* startAs(jo.actor, worldId);
          expect((yield* recordOf(worldId))?.failure).toBe("skipped");
        }),
      );
    },
  );

  describe("when there is no cover", () => {
    it.effect("skips a world with nothing to draw from, and says so on the record", () =>
      Effect.gen(function* () {
        const { stranger } = yield* Fixture;
        const before = images.requests().length;
        const world = yield* found(stranger, "  ");
        yield* settled;
        expect(world.imagePending).toBe(false);
        expect(world.image).toBeNull();
        expect(images.requests().length).toBe(before);
        const record = yield* recordOf(world.id);
        expect(record?.state).toBe("failed");
        expect(record?.failure).toBe("skipped");
        expect(record?.prompt).toBeNull();
      }),
    );

    it.effect("records a moderation refusal and puts no provider text anywhere", () =>
      Effect.gen(function* () {
        const { stranger } = yield* Fixture;
        images.next({ kind: "refused" });
        const world = yield* found(stranger, "Red Harvest");
        yield* settled;
        const record = yield* recordOf(world.id);
        expect(record?.failure).toBe("refused");
        const read = yield* as(stranger.token, (client) =>
          client.sharedWorlds.findById({ params: { worldId: world.id } }),
        );
        expect(read.image).toBeNull();
        expect(read.imagePending).toBe(false);
        expect(JSON.stringify(record)).not.toContain(MODERATION_TEXT);
      }),
    );

    it.effect("records a provider failure as provider", () =>
      Effect.gen(function* () {
        const { stranger } = yield* Fixture;
        images.next({ kind: "error", status: 500 });
        const world = yield* found(stranger, "Low Tide");
        yield* settled;
        expect((yield* recordOf(world.id))?.failure).toBe("provider");
      }),
    );

    it.effect("records a draw that outlives the job timeout as timeout, and queues its files", () =>
      Effect.gen(function* () {
        // A worker of its own with a timeout a test can wait for, over an endpoint
        // that never answers, as `campaign-images.test.ts` does for a campaign.
        const hanging = scriptedImages({ apiUrl: OPENAI, model: MODEL });
        hanging.next({ kind: "hang" });
        const pip = yield* aPerson("Pip");
        const world = yield* found(pip, "Slow Water");
        yield* settled;
        // The shared worker drew it; forget that, so the slow worker can start one.
        yield* sql((sql) => sql`delete from shared_world_image where group_id = ${world.id}`);

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
          const answered = yield* worker.drawSharedWorld(world);
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
        const record = yield* recordOf(world.id);
        expect(record?.failure).toBe("timeout");
        const queued = yield* sql(
          (sql) => sql<{ readonly count: number }>`
        select count(*)::int as count from storage_deletion where prefix = ${record!.storage_prefix}
      `,
        );
        expect(queued[0]?.count).toBe(1);
      }),
    );

    it.effect("spends one daily budget across campaigns' covers and worlds'", () =>
      Effect.gen(function* () {
        // A fresh account: a campaign cover and its worlds' covers count against
        // the same per-account limit, so the world after PER_ACCOUNT draws is capped.
        const bram = yield* aPerson("Bram");
        yield* as(bram.token, (client) =>
          client.campaigns.create({ payload: { name: "Bram's Table" } }),
        );
        for (let index = 0; index < PER_ACCOUNT - 1; index += 1) {
          yield* found(bram, `Bram's World ${String(index)}`);
        }
        yield* settled;
        const before = images.requests().length;
        const over = yield* found(bram, "One World Too Many");
        yield* settled;
        expect(over.imagePending).toBe(false);
        expect(images.requests().length).toBe(before);
        const record = yield* recordOf(over.id);
        expect(record?.failure).toBe("capped");
        expect(record?.prompt).toContain("One World Too Many");
      }),
    );
  });

  describe("deleting a Shared World", () => {
    it.effect("queues its cover's files through the outbox, and the drain removes them", () =>
      Effect.gen(function* () {
        const { jo } = yield* Fixture;
        // Through the owner's permanent delete, the one product path that deletes
        // an explicit world's row.
        const world = yield* found(jo, "Brief Candle");
        yield* settled;
        const record = (yield* recordOf(world.id))!;
        for (const file of FILES) {
          expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(true);
        }
        const spent = sql(
          (sql) => sql<{ readonly count: number }>`
          select count(*)::int as count from image_spend where account_id = ${record.account_id}
        `,
        ).pipe(Effect.map((rows) => rows[0]!.count));
        const spentBefore = yield* spent;

        yield* as(jo.token, (client) =>
          client.sharedWorlds.deletePermanently({ params: { worldId: world.id } }),
        );
        // The day's budget is a ledger the delete does not touch.
        expect(yield* spent).toBe(spentBefore);
        expect(yield* recordOf(world.id)).toBeUndefined();
        yield* Effect.flatMap(HobImages, (worker) => worker.drainDeletions);
        for (const file of FILES) {
          expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(false);
        }
        const queued = yield* sql(
          (sql) => sql<{ readonly count: number }>`
          select count(*)::int as count from storage_deletion where prefix = ${record.storage_prefix}
        `,
        );
        expect(queued[0]?.count).toBe(0);
      }),
    );

    it.effect("leaves no files behind when the world is deleted mid-draw", () =>
      Effect.gen(function* () {
        const release = yield* Deferred.make<void>();
        images.next({ kind: "held", release });
        // A fresh account, well inside the daily budget.
        const world = yield* found(yield* aPerson("Tam"), "Gone Before Dawn");
        const record = (yield* recordOf(world.id))!;
        expect(record.state).toBe("generating");

        yield* sql((sql) => sql`delete from play_group where id = ${world.id}`);
        yield* Deferred.succeed(release, undefined);
        yield* settled;
        yield* Effect.flatMap(HobImages, (worker) => worker.drainDeletions);
        for (const file of FILES) {
          expect(yield* stored(`${record.storage_prefix}/${file}`)).toBe(false);
        }
      }),
    );

    it.effect("marks a cover a dead process left behind interrupted, beside the other kinds", () =>
      Effect.gen(function* () {
        const world = yield* found(yield* aPerson("Sal"), "Stale Lantern");
        yield* settled;
        yield* sql(
          (sql) => sql`
          update shared_world_image set
            state = 'generating', failure = null, finished_at = null,
            created_at = now() - interval '10 minutes',
            updated_at = now() - interval '10 minutes'
          where group_id = ${world.id}
        `,
        );
        const swept = yield* Effect.flatMap(HobImages, (worker) => worker.sweep);
        expect(swept).toBe(1);
        expect((yield* recordOf(world.id))?.failure).toBe("interrupted");
      }),
    );
  });
});
