import { expect } from "@effect/vitest";
import { Effect, Layer, Option, Redacted, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { applicationOver, servicesOver } from "../src/app.js";
import { ObjectStorage, StorageKey } from "../src/storage/ObjectStorage.js";
import { UploadUrls } from "../src/storage/UploadUrls.js";
import { migratedDatabase } from "./support/database.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **`PUT /uploads` over the real application**: no bearer token, a signed URL
 * minted by `UploadUrls`, and the memory adapter, which presigns nothing, so
 * the bytes come to this server. The signature's every refusal is pinned in
 * `upload-urls.test.ts`; this file pins that the route is mounted, reads the
 * raw body, and answers as the contract says.
 */

const SECRET = Redacted.make("uploads-route-secret");

const database = migratedDatabase("taverns_test_uploads");
const storage = ObjectStorage.memory;
const services = servicesOver(
  database,
  undefined,
  undefined,
  undefined,
  storage,
  undefined,
  undefined,
  UploadUrls.layer(Option.some(SECRET)),
);

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(services),
);

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

const signFor = (key: StorageKey) =>
  Effect.flatMap(UploadUrls, (uploads) =>
    uploads.sign(key, {
      contentType: "image/png",
      contentLength: PNG.byteLength,
      expiresInSeconds: 900,
    }),
  ).pipe(Effect.orDie);

const put = (url: string, body: Uint8Array, contentType: string) =>
  HttpClient.execute(
    HttpClientRequest.put(url).pipe(HttpClientRequest.bodyUint8Array(body, contentType)),
  ).pipe(Effect.orDie);

const freshKey = () => StorageKey(`uploads/account/${crypto.randomUUID()}/source`);

describeLayer("PUT /uploads", application, (it) => {
  it.effect("stores the signed bytes with no Authorization, and answers 204", () =>
    Effect.gen(function* () {
      const key = freshKey();
      const signed = yield* signFor(key);

      const response = yield* put(signed!.url, PNG, "image/png");

      expect(response.status).toBe(204);
      const object = yield* Effect.flatMap(ObjectStorage, (storage) => storage.get(key)).pipe(
        Effect.orDie,
      );
      expect(object.contentType).toBe("image/png");
      const chunks = yield* Stream.runCollect(object.body).pipe(Effect.orDie);
      expect(Buffer.concat(chunks)).toEqual(Buffer.from(PNG));
    }),
  );

  it.effect("answers a wrong content type, a longer body or a bad signature with 404", () =>
    Effect.gen(function* () {
      const key = freshKey();
      const signed = yield* signFor(key);
      const forged = new URL(signed!.url, "http://api.test");
      forged.searchParams.set("s", "A".repeat(43));

      const statuses = [
        (yield* put(signed!.url, PNG, "text/html")).status,
        (yield* put(signed!.url, new Uint8Array([...PNG, 0]), "image/png")).status,
        (yield* put(`${forged.pathname}${forged.search}`, PNG, "image/png")).status,
      ];

      expect(statuses).toEqual([404, 404, 404]);
      expect(yield* Effect.flatMap(ObjectStorage, (storage) => storage.head(key))).toEqual(
        Option.none(),
      );
    }),
  );
});
