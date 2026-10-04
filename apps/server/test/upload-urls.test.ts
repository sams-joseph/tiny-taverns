import { expect } from "@effect/vitest";
import { Effect, Layer, Option, Redacted, Stream } from "effect";
import { signedPath } from "../src/images/ImageUrls.js";
import {
  ObjectStorage,
  type SignedUpload,
  StorageKey,
  type UploadTerms,
} from "../src/storage/ObjectStorage.js";
import { MAX_UPLOAD_BYTES, type UploadRequest, UploadUrls } from "../src/storage/UploadUrls.js";
import { describeLayer } from "./support/suite.js";

/**
 * **An upload URL stores exactly the bytes it was signed for, and nothing
 * else.** The server's own signed `PUT` over the memory adapter, which takes no
 * presigned URL of its own; the route is a thin wrapper over `receive`, driven
 * over HTTP in `uploads.test.ts`.
 */

const SECRET = Redacted.make("upload-test-secret");
let now = Date.UTC(2026, 9, 3, 12);

const KEY = StorageKey("uploads/account/upload-1/source");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6]);
const TERMS: UploadTerms = {
  contentType: "image/png",
  contentLength: PNG.byteLength,
  expiresInSeconds: 900,
};

const withSecret = UploadUrls.layer(Option.some(SECRET), () => now).pipe(
  Layer.provideMerge(ObjectStorage.memory),
);

const sign = (key = KEY, terms = TERMS) =>
  Effect.flatMap(UploadUrls, (uploads) => uploads.sign(key, terms)).pipe(Effect.orDie);

/** The request a browser makes for `signed`, with `overrides` on top. */
const requestFor = (
  signed: SignedUpload,
  body: ReadonlyArray<Uint8Array> = [PNG],
  overrides: Partial<UploadRequest> = {},
): UploadRequest => {
  const query = Object.fromEntries(new URL(signed.url, "http://api.test").searchParams);
  return {
    ...query,
    contentType: signed.headers["content-type"],
    contentLength: String(body.reduce((total, chunk) => total + chunk.byteLength, 0)),
    body: Stream.fromIterable(body),
    ...overrides,
  };
};

const receive = (request: UploadRequest) =>
  Effect.flatMap(UploadUrls, (uploads) => uploads.receive(request));

const stored = (key = KEY) =>
  Effect.flatMap(ObjectStorage, (storage) => storage.head(key)).pipe(Effect.orDie);

/** Which tests leave the shared store empty; every test signs a fresh key. */
const freshKey = () => StorageKey(`uploads/account/${crypto.randomUUID()}/source`);

describeLayer("an upload URL from this server", withSecret, (it) => {
  it.effect("is a relative PUT carrying the signed content type", () =>
    Effect.gen(function* () {
      const signed = yield* sign();

      expect(signed?.method).toBe("PUT");
      expect(signed?.url.startsWith("/uploads?")).toBe(true);
      expect(signed?.headers).toEqual({ "content-type": "image/png" });
    }),
  );

  it.effect("stores exactly the signed bytes under the signed key", () =>
    Effect.gen(function* () {
      const key = freshKey();
      const signed = yield* sign(key);

      // Split across chunks, as a socket delivers it.
      yield* receive(requestFor(signed!, [PNG.slice(0, 3), PNG.slice(3)]));

      expect(yield* stored(key)).toEqual(
        Option.some({ contentType: "image/png", size: PNG.byteLength }),
      );
      const object = yield* Effect.flatMap(ObjectStorage, (storage) => storage.get(key)).pipe(
        Effect.orDie,
      );
      const chunks = yield* Stream.runCollect(object.body).pipe(Effect.orDie);
      expect(Buffer.concat(chunks)).toEqual(Buffer.from(PNG));
    }),
  );

  it.effect("accepts a request that sends no Content-Length", () =>
    Effect.gen(function* () {
      const key = freshKey();
      const signed = yield* sign(key);

      yield* receive(requestFor(signed!, [PNG], { contentLength: undefined }));

      expect(Option.isSome(yield* stored(key))).toBe(true);
    }),
  );

  const refusals: ReadonlyArray<readonly [string, (signed: SignedUpload) => UploadRequest]> = [
    ["a longer body", (signed) => requestFor(signed, [PNG, new Uint8Array([7])])],
    [
      "a longer body that claims the signed length",
      (signed) =>
        requestFor(signed, [PNG, new Uint8Array([7])], { contentLength: String(PNG.byteLength) }),
    ],
    ["a shorter body", (signed) => requestFor(signed, [PNG.slice(1)])],
    ["another content type", (signed) => requestFor(signed, [PNG], { contentType: "text/html" })],
    ["no content type", (signed) => requestFor(signed, [PNG], { contentType: undefined })],
    ["a missing signature", (signed) => requestFor(signed, [PNG], { s: undefined })],
    ["an altered signature", (signed) => ({ ...requestFor(signed), s: "A".repeat(43) })],
    [
      "another key under the same signature",
      (signed) => ({ ...requestFor(signed), k: "uploads/account/someone-else/source" }),
    ],
    ["a key outside the storage alphabet", (signed) => ({ ...requestFor(signed), k: "../escape" })],
    [
      "a larger signed length",
      (signed) => ({ ...requestFor(signed), n: String(PNG.byteLength + 1) }),
    ],
    [
      "another signed content type",
      (signed) => ({ ...requestFor(signed, [PNG], { contentType: "text/html" }), t: "text/html" }),
    ],
    ["a later expiry", (signed) => ({ ...requestFor(signed), e: "99999999999" })],
  ];

  for (const [name, request] of refusals) {
    it.effect(`refuses ${name} as NotFound, and stores nothing`, () =>
      Effect.gen(function* () {
        const key = freshKey();
        const signed = yield* sign(key);

        const error = yield* Effect.flip(receive(request(signed!)));

        expect(error._tag).toBe("NotFound");
        expect(yield* stored(key)).toEqual(Option.none());
      }),
    );
  }

  it.effect("refuses an expired URL", () =>
    Effect.gen(function* () {
      const key = freshKey();
      const signed = yield* sign(key);

      now += (TERMS.expiresInSeconds + 1) * 1000;
      const error = yield* Effect.flip(receive(requestFor(signed!)));
      now -= (TERMS.expiresInSeconds + 1) * 1000;

      expect(error._tag).toBe("NotFound");
      expect(yield* stored(key)).toEqual(Option.none());
    }),
  );

  it.effect("cannot be opened by an image URL's signature", () =>
    Effect.gen(function* () {
      const key = freshKey();
      const signed = yield* sign(key);
      const image = new URL(signedPath(SECRET, "character", key, "full", now), "http://api.test");

      const error = yield* Effect.flip(
        receive({ ...requestFor(signed!), s: image.searchParams.get("s") ?? "" }),
      );

      expect(error._tag).toBe("NotFound");
    }),
  );

  it.effect("refuses to sign more than the route will hold", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        sign(freshKey(), { ...TERMS, contentLength: MAX_UPLOAD_BYTES + 1 }),
      );

      expect(exit._tag).toBe("Failure");
    }),
  );
});

describeLayer(
  "an upload URL with no secret",
  UploadUrls.layer(Option.none()).pipe(Layer.provideMerge(ObjectStorage.memory)),
  (it) => {
    it.effect("is not minted, and the route accepts nothing", () =>
      Effect.gen(function* () {
        expect(yield* sign()).toBeNull();

        const error = yield* Effect.flip(
          receive({
            k: KEY,
            t: "image/png",
            n: String(PNG.byteLength),
            e: "99999999999",
            s: "x",
            contentType: "image/png",
            contentLength: undefined,
            body: Stream.succeed(PNG),
          }),
        );
        expect(error._tag).toBe("NotFound");
      }),
    );
  },
);

/** A provider that presigns its own `PUT`, the way an S3 adapter will. */
const PRESIGNED: SignedUpload = {
  url: "https://bucket.example/uploads/account/upload-1/source?X-Amz-Signature=abc",
  method: "PUT",
  headers: { "content-type": "image/png" },
};
const presigning = Layer.effect(ObjectStorage)(
  Effect.map(ObjectStorage, (memory) => ({
    ...memory,
    signUpload: () => Effect.succeed(Option.some(PRESIGNED)),
  })),
).pipe(Layer.provide(ObjectStorage.memory));

describeLayer(
  "an upload URL over a provider that presigns",
  UploadUrls.layer(Option.some(SECRET)).pipe(Layer.provideMerge(presigning)),
  (it) => {
    it.effect("is the provider's own", () =>
      Effect.gen(function* () {
        expect(yield* sign()).toEqual(PRESIGNED);
      }),
    );
  },
);
