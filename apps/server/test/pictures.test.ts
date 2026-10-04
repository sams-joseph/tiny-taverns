import { expect } from "@effect/vitest";
import {
  type CampaignId,
  type ImageSubject,
  type ImageUploadApply,
  type ImageUploadType,
  TavernsApi,
} from "@taverns/api";
import { Context, Deferred, Effect, Layer, Option, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { SqlClient } from "effect/sql";
import sharp from "sharp";
import { applicationOver, servicesOver } from "../src/app.js";
import { HobImages } from "../src/images/HobImages.js";
import { ImageUrls } from "../src/images/ImageUrls.js";
import { UPLOADS_PER_ACCOUNT_PER_DAY } from "../src/images/ImageUploads.js";
import { ImageRecords } from "../src/repo/Images.js";
import { ObjectStorage, StorageKey } from "../src/storage/ObjectStorage.js";
import { UploadUrls } from "../src/storage/UploadUrls.js";
import { type Person, aPerson, admittedTo } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { scriptedImages } from "./support/imageModel.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **A person's own picture replaces Hob's, and only the subject's owner can
 * put one there or take it off.**
 *
 * Over the real application: the `pictures` endpoints, the server's own
 * signed `PUT /uploads` (the memory adapter presigns nothing), `sharp`, the
 * worker and Postgres. Every refusal is driven with an account minted the
 * shipped way, never with raw SQL.
 */

const OPENAI = "https://api.openai.com/v1";
const MODEL = "gpt-image-2.5-flare";
const SECRET = Redacted.make("pictures-test-secret");

const images = scriptedImages({ apiUrl: OPENAI, model: MODEL });

const database = migratedDatabase("taverns_test_pictures");
const storage = ObjectStorage.memory;
const services = servicesOver(
  database,
  undefined,
  undefined,
  undefined,
  storage,
  ImageUrls.layer(SECRET),
  HobImages.layer({
    generation: Option.some({ limits: { perAccountPerDay: 100, perDay: 1000 }, concurrency: 2 }),
    storageOn: true,
  }).pipe(Layer.provide(images.layer)),
  UploadUrls.layer(Option.some(SECRET)),
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

const as = <A, E>(who: Person, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(who.token), call).pipe(Effect.orDie);

/** The failure's tag, or `ok`. */
const outcome = <A, E extends { readonly _tag: string }>(
  who: Person,
  call: (client: Client) => Effect.Effect<A, E>,
) =>
  Effect.flatMap(clientFor(who.token), call).pipe(
    Effect.as("ok"),
    Effect.catch((error: unknown) =>
      Effect.succeed(
        typeof error === "object" && error !== null && "_tag" in error
          ? String(error._tag)
          : "unknown",
      ),
    ),
  );

const sql = <A>(query: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.flatMap(SqlClient.SqlClient, query).pipe(Effect.orDie);

const settled = Effect.flatMap(HobImages, (worker) => worker.idle);
const drained = Effect.flatMap(HobImages, (worker) => worker.drainDeletions);

const stored = (key: string) =>
  Effect.flatMap(ObjectStorage, (objects) => objects.head(StorageKey(key))).pipe(
    Effect.orDie,
    Effect.map(Option.isSome),
  );

/** Fetch a signed picture path as an `<img>` does, and decode it. */
const picture = (path: string) =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(path);
    expect(response.status).toBe(200);
    const bytes = Buffer.from(yield* response.arrayBuffer);
    const { width, height } = yield* Effect.promise(() => sharp(bytes).metadata());
    const { dominant } = yield* Effect.promise(() => sharp(bytes).stats());
    return { width, height, red: dominant.r > dominant.b };
  }).pipe(Effect.orDie);

/**
 * A 400 × 200 PNG, red on its left quarter and blue elsewhere, so a crop can
 * be told by its colour: a centred cut of the whole is blue.
 */
const halves = Effect.promise(
  async () =>
    new Uint8Array(
      await sharp({ create: { width: 400, height: 200, channels: 3, background: "#0000ff" } })
        .composite([
          {
            input: await sharp({
              create: { width: 100, height: 200, channels: 3, background: "#ff0000" },
            })
              .png()
              .toBuffer(),
            left: 0,
            top: 0,
          },
        ])
        .png()
        .toBuffer(),
    ),
);

const RIGHT_SQUARE = { x: 0.5, y: 0, width: 0.5, height: 1 };
/** 100 × 100 from the red quarter; a centred square of the whole is blue. */
const RED_SQUARE = { x: 0, y: 0.25, width: 0.25, height: 0.5 };

/** Ask for a ticket, send the bytes where it says, and answer the upload's id. */
const sendUpload = (
  who: Person,
  subject: ImageSubject,
  subjectId: string,
  bytes: Uint8Array,
  contentType: ImageUploadType = "image/png",
) =>
  Effect.gen(function* () {
    const ticket = yield* as(who, (client) =>
      client.pictures.createUpload({
        payload: { subject, subjectId, contentType, contentLength: bytes.byteLength },
      }),
    );
    const response = yield* HttpClient.execute(
      HttpClientRequest.put(ticket.url).pipe(
        HttpClientRequest.setHeaders(ticket.headers),
        HttpClientRequest.bodyUint8Array(bytes, contentType),
      ),
    ).pipe(Effect.orDie);
    expect(response.status).toBe(204);
    return ticket;
  });

const apply = (who: Person, uploadId: string, payload: ImageUploadApply) =>
  outcome(who, (client) => client.pictures.applyUpload({ params: { uploadId }, payload }));

/** Upload `bytes` and make them the subject's pictures. */
const upload = (
  who: Person,
  subject: ImageSubject,
  subjectId: string,
  bytes: Uint8Array,
  payload: ImageUploadApply,
) =>
  Effect.gen(function* () {
    const ticket = yield* sendUpload(who, subject, subjectId, bytes);
    expect(yield* apply(who, ticket.uploadId, payload)).toBe("ok");
    return ticket;
  });

const recordOf = (table: string, column: string, subjectId: string) =>
  sql(
    (sql) =>
      sql<{
        readonly id: string;
        readonly state: string;
        readonly failure: string | null;
        readonly source: string;
        readonly prompt: string | null;
        readonly storage_prefix: string;
        readonly width: number | null;
      }>`select * from ${sql(table)} where ${sql(column)} = ${subjectId}`,
  );

const campaignOf = (who: Person, name: string, description?: string) =>
  as(who, (client) =>
    client.campaigns.create({ payload: { name, ...(description ? { description } : {}) } }),
  ).pipe(Effect.tap(() => settled));

const makeFixture = Effect.gen(function* () {
  const jo = yield* aPerson("Jo");
  const ilse = yield* aPerson("Ilse");
  const bo = yield* aPerson("Bo");
  const campaign = yield* campaignOf(jo, "The Salt Road", "Caravans cross white salt flats.");
  yield* admittedTo(campaign.id, ilse.actor, "Ilse");
  const red = yield* halves;
  return { jo, ilse, bo, campaignId: campaign.id as CampaignId, red };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "pictures.test/Fixture",
) {}

describeLayer(
  "pictures",
  Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application)),
  (it) => {
    it.effect("replace a campaign's drawn cover with the creator's crop of an upload", () =>
      Effect.gen(function* () {
        const { jo, campaignId, red } = yield* Fixture;
        const drawn = (yield* recordOf("campaign_image", "campaign_id", campaignId))[0]!;
        expect(drawn.source).toBe("drawn");

        // The top-left 150 × 100, at 3:2: two thirds red.
        const ticket = yield* upload(jo, "campaign", campaignId, red, {
          images: [{ kind: "campaign", crop: { x: 0, y: 0, width: 0.375, height: 0.5 } }],
        });

        const [record, ...others] = yield* recordOf("campaign_image", "campaign_id", campaignId);
        expect(others).toEqual([]);
        expect(record).toMatchObject({ state: "ready", source: "upload", prompt: null });
        expect(record!.id).not.toBe(drawn.id);

        const campaign = yield* as(jo, (client) =>
          client.campaigns.findById({ params: { campaignId } }),
        );
        expect(yield* picture(campaign.image!.cardUrl)).toEqual({
          width: 768,
          height: 512,
          red: true,
        });

        yield* drained;
        // The drawn files and the raw upload are gone; the new picture's stay.
        expect(yield* stored(`${drawn.storage_prefix}/card.webp`)).toBe(false);
        expect(yield* stored(`uploads/${jo.actor.accountId}/${ticket.uploadId}/source`)).toBe(
          false,
        );
        expect(yield* stored(`${record!.storage_prefix}/original.webp`)).toBe(true);
        expect(yield* stored(`${record!.storage_prefix}/card.webp`)).toBe(true);
      }),
    );

    it.effect("fill a character's portrait and banner from one file, each its own crop", () =>
      Effect.gen(function* () {
        const { ilse, red } = yield* Fixture;
        const character = yield* as(ilse, (client) =>
          client.me.createCoreCharacter({ payload: { name: "Marta Vell" } }),
        );
        yield* settled;

        yield* upload(ilse, "character", character.id, red, {
          images: [
            { kind: "character", crop: RED_SQUARE },
            { kind: "characterBanner", crop: { x: 0, y: 0.25, width: 1, height: 0.5 } },
          ],
        });

        const owned = yield* as(ilse, (client) => client.me.characters());
        const read = owned.find((entry) => entry.character.id === character.id)!.character;
        expect(yield* picture(read.portrait!.thumbUrl)).toEqual({
          width: 160,
          height: 160,
          red: true,
        });
        const banner = yield* picture(read.banner!.cardUrl);
        expect([banner.width, banner.height]).toEqual([768, 384]);
      }),
    );

    it.effect("refuse everyone but the subject's owner, as NotFound", () =>
      Effect.gen(function* () {
        const { jo, ilse, bo, campaignId, red } = yield* Fixture;
        const request = {
          subject: "campaign" as const,
          subjectId: campaignId,
          contentType: "image/png" as const,
          contentLength: red.byteLength,
        };

        // A player at the table and a stranger cannot picture the campaign.
        for (const who of [ilse, bo]) {
          expect(
            yield* outcome(who, (client) => client.pictures.createUpload({ payload: request })),
          ).toBe("NotFound");
          expect(
            yield* outcome(who, (client) =>
              client.pictures.remove({ params: { subject: "campaign", subjectId: campaignId } }),
            ),
          ).toBe("NotFound");
        }

        // Nor apply the creator's ticket, even holding its id.
        const ticket = yield* sendUpload(jo, "campaign", campaignId, red);
        expect(yield* apply(bo, ticket.uploadId, { images: [{ kind: "campaign" }] })).toBe(
          "NotFound",
        );
        expect(yield* apply(ilse, ticket.uploadId, { images: [{ kind: "campaign" }] })).toBe(
          "NotFound",
        );
        // An unknown subject and a malformed id are the same answer.
        expect(
          yield* outcome(jo, (client) =>
            client.pictures.createUpload({
              payload: { ...request, subjectId: crypto.randomUUID() },
            }),
          ),
        ).toBe("NotFound");
        expect(yield* apply(jo, "not-an-id", { images: [{ kind: "campaign" }] })).toBe("NotFound");
      }),
    );

    it.effect("apply a ticket once, and only to the pictures its subject shows", () =>
      Effect.gen(function* () {
        const { jo, campaignId, red } = yield* Fixture;
        const ticket = yield* sendUpload(jo, "campaign", campaignId, red);

        expect(yield* apply(jo, ticket.uploadId, { images: [{ kind: "character" }] })).toBe(
          "UploadRejected",
        );
        expect(
          yield* apply(jo, ticket.uploadId, {
            images: [{ kind: "campaign" }, { kind: "campaign" }],
          }),
        ).toBe("UploadRejected");
        expect(yield* apply(jo, ticket.uploadId, { images: [{ kind: "campaign" }] })).toBe("ok");
        expect(yield* apply(jo, ticket.uploadId, { images: [{ kind: "campaign" }] })).toBe(
          "NotFound",
        );
      }),
    );

    it.effect("refuse a ticket whose file never arrived, or is not a picture", () =>
      Effect.gen(function* () {
        const { jo, campaignId } = yield* Fixture;
        const notSent = yield* as(jo, (client) =>
          client.pictures.createUpload({
            payload: {
              subject: "campaign",
              subjectId: campaignId,
              contentType: "image/png",
              contentLength: 64,
            },
          }),
        );
        expect(yield* apply(jo, notSent.uploadId, { images: [{ kind: "campaign" }] })).toBe(
          "UploadRejected",
        );

        const text = new TextEncoder().encode("<svg onload=alert(1)>not a picture</svg>");
        const garbage = yield* sendUpload(jo, "campaign", campaignId, text);
        expect(yield* apply(jo, garbage.uploadId, { images: [{ kind: "campaign" }] })).toBe(
          "UploadRejected",
        );
      }),
    );

    it.effect(
      "replace a picture while its draw is still running, and the draw stores nothing",
      () =>
        Effect.gen(function* () {
          const { jo, red } = yield* Fixture;
          const release = yield* Deferred.make<void>();
          images.next({ kind: "held", release });
          const before = images.requests().length;
          const campaign = yield* as(jo, (client) =>
            client.campaigns.create({ payload: { name: "Glass Storms", description: "A storm." } }),
          );
          yield* images.sent(before + 1);

          yield* upload(jo, "campaign", campaign.id, red, { images: [{ kind: "campaign" }] });
          yield* Deferred.succeed(release, undefined);
          yield* settled;

          const rows = yield* recordOf("campaign_image", "campaign_id", campaign.id);
          expect(rows.map((row) => [row.state, row.source])).toEqual([["ready", "upload"]]);
        }),
    );

    it.effect(
      "remove a picture for good: no redraw on the NPC's next edit, but an upload restores",
      () =>
        Effect.gen(function* () {
          const { jo, campaignId, red } = yield* Fixture;
          const npc = yield* as(jo, (client) =>
            client.npcs.create({
              params: { campaignId },
              payload: { name: "Ferro", role: "The ferryman" },
            }),
          );
          yield* settled;
          const drawn = (yield* recordOf("npc_image", "npc_id", npc.id))[0]!;
          expect(drawn.state).toBe("ready");

          yield* as(jo, (client) =>
            client.pictures.remove({ params: { subject: "npc", subjectId: npc.id } }),
          );
          const removed = yield* as(jo, (client) =>
            client.npcs.findById({ params: { campaignId, npcId: npc.id } }),
          );
          expect(removed.image).toBeNull();
          expect(removed.banner).toBeNull();
          expect((yield* recordOf("npc_image", "npc_id", npc.id))[0]).toMatchObject({
            state: "failed",
            failure: "removed",
          });
          yield* drained;
          expect(yield* stored(`${drawn.storage_prefix}/thumb.webp`)).toBe(false);

          const requests = images.requests().length;
          yield* as(jo, (client) =>
            client.npcs.update({
              params: { campaignId, npcId: npc.id },
              payload: { role: "The ferryman, who knows the tolls" },
            }),
          );
          yield* settled;
          expect(images.requests().length).toBe(requests);

          yield* upload(jo, "npc", npc.id, red, { images: [{ kind: "npc", crop: RIGHT_SQUARE }] });
          const restored = yield* as(jo, (client) =>
            client.npcs.findById({ params: { campaignId, npcId: npc.id } }),
          );
          expect(restored.image).not.toBeNull();
        }),
    );

    it.effect("put an uploaded battle map under a grid across its whole width, uncropped", () =>
      Effect.gen(function* () {
        const { jo, campaignId, red } = yield* Fixture;
        const encounter = yield* as(jo, (client) =>
          client.encounters.create({ params: { campaignId }, payload: { name: "The ford" } }),
        );
        yield* settled;
        const map = yield* as(jo, (client) =>
          client.battleMaps.find({ params: { campaignId, encounterId: encounter.id } }),
        );

        const cropped = yield* sendUpload(jo, "battleMap", map.id, red);
        expect(
          yield* apply(jo, cropped.uploadId, {
            images: [{ kind: "battleMap", crop: RIGHT_SQUARE }],
          }),
        ).toBe("UploadRejected");

        yield* upload(jo, "battleMap", map.id, red, { images: [{ kind: "battleMap" }] });
        const after = yield* as(jo, (client) =>
          client.battleMaps.find({ params: { campaignId, encounterId: encounter.id } }),
        );
        expect([after.image?.width, after.image?.height]).toEqual([400, 200]);
        expect(after.alignment).toEqual({
          cellPx: 400 / after.columns,
          offsetXPx: 0,
          offsetYPx: 0,
        });
      }),
    );

    it.effect("limit the tickets one account takes in a day", () =>
      Effect.gen(function* () {
        const busy = yield* aPerson("Busy");
        const campaign = yield* campaignOf(busy, "Busy's table");
        const ask = outcome(busy, (client) =>
          client.pictures.createUpload({
            payload: {
              subject: "campaign",
              subjectId: campaign.id,
              contentType: "image/png",
              contentLength: 10,
            },
          }),
        );
        for (let taken = 0; taken < UPLOADS_PER_ACCOUNT_PER_DAY; taken++) {
          expect(yield* ask).toBe("ok");
        }
        expect(yield* ask).toBe("RateLimited");
      }),
    );

    it.effect("expire a ticket nobody applied, and delete its file", () =>
      Effect.gen(function* () {
        const { jo, campaignId, red } = yield* Fixture;
        const ticket = yield* sendUpload(jo, "campaign", campaignId, red);
        const source = `uploads/${jo.actor.accountId}/${ticket.uploadId}/source`;
        expect(yield* stored(source)).toBe(true);

        yield* sql(
          (sql) =>
            sql`update image_upload set expires_at = now() - interval '1 second' where id = ${ticket.uploadId}`,
        );
        yield* Effect.flatMap(ImageRecords, (records) => records.expireUploads);
        yield* drained;

        expect(yield* stored(source)).toBe(false);
        expect(yield* apply(jo, ticket.uploadId, { images: [{ kind: "campaign" }] })).toBe(
          "NotFound",
        );
      }),
    );
  },
  { timeout: "60 seconds" },
);
