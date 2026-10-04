import { NotFound } from "@taverns/api";
import { Context, Effect, Layer, Option, Redacted, Stream } from "effect";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  ObjectStorage,
  type SignedUpload,
  type StorageError,
  StorageKey,
  type StorageUnavailable,
  type UploadTerms,
} from "./ObjectStorage.js";

/**
 * Where the browser sends an uploaded file's bytes: straight to the provider
 * when the adapter can presign a `PUT` (`ObjectStorage.signUpload`), and
 * otherwise to this server's own `PUT /uploads`, signed here.
 *
 * ### The server's route is a presigned `PUT` too
 *
 * It is stateless, the way a provider's is: the signature covers the key, the
 * content type, the exact length and the expiry, so the route needs no row to
 * know what it may write. Whoever mints the URL (a later step that has checked
 * who owns the subject) is the only access decision; the route checks only
 * that the request is the one that was signed. Every way of being wrong,
 * whether forged, expired, the wrong type or the wrong length, is the same
 * `NotFound`, as on the image routes.
 *
 * ### What is signed
 *
 * `["upload", key, contentType, length, expiry]` as JSON, under
 * `PORTRAIT_URL_SECRET`. The image routes sign `{tag}:{imageId}:…`, which
 * never begins with `[`, so a signature minted for one can never open the
 * other.
 *
 * ### The bytes are held in memory
 *
 * The route reads at most the signed length before it stores anything, so a
 * body longer than the signature allows is refused at the first byte past it.
 * `MAX_UPLOAD_BYTES` bounds what can be signed at all.
 */

/** The most any one upload may be: the route buffers the body before `put`. */
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

/** What the upload route was asked; every field is the plain string the wire carried. */
export interface UploadRequest {
  readonly k?: string | undefined;
  readonly t?: string | undefined;
  readonly n?: string | undefined;
  readonly e?: string | undefined;
  readonly s?: string | undefined;
  /** The request's `Content-Type` header. */
  readonly contentType: string | undefined;
  /** The request's `Content-Length` header, when it sent one. */
  readonly contentLength: string | undefined;
  readonly body: Stream.Stream<Uint8Array, unknown>;
}

const signatureOf = (
  secret: Redacted.Redacted,
  key: string,
  contentType: string,
  length: string,
  expiry: string,
): string =>
  createHmac("sha256", Redacted.value(secret))
    .update(JSON.stringify(["upload", key, contentType, length, expiry]))
    .digest("base64url");

/** `/uploads?k=…&t=…&n=…&e=…&s=…`, relative to the API root. */
export const signedUploadPath = (
  secret: Redacted.Redacted,
  key: StorageKey,
  terms: UploadTerms,
  nowMillis: number,
): string => {
  const expiry = String(Math.floor(nowMillis / 1000) + terms.expiresInSeconds);
  const length = String(terms.contentLength);
  const query = new URLSearchParams({
    k: key,
    t: terms.contentType,
    n: length,
    e: expiry,
    s: signatureOf(secret, key, terms.contentType, length, expiry),
  });
  return `/uploads?${query.toString()}`;
};

/**
 * The checked terms of a live, correctly signed upload, or `undefined` for
 * every way of being wrong. The request's own `Content-Type` must be the
 * signed one, and a `Content-Length`, when sent, the signed length.
 */
export const verifyUpload = (
  secret: Redacted.Redacted,
  request: Omit<UploadRequest, "body">,
  nowMillis: number,
):
  | { readonly key: StorageKey; readonly contentType: string; readonly length: number }
  | undefined => {
  const { k, t, n, e, s } = request;
  if (k === undefined || t === undefined || n === undefined || e === undefined) return;
  if (s === undefined || !StorageKey.is(k)) return;
  if (!/^\d{1,9}$/.test(n) || !/^\d{1,12}$/.test(e)) return;
  if (Number(e) <= Math.floor(nowMillis / 1000)) return;
  const expected = Buffer.from(signatureOf(secret, k, t, n, e));
  const given = Buffer.from(s);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return;
  if (request.contentType?.trim().toLowerCase() !== t.toLowerCase()) return;
  if (request.contentLength !== undefined && request.contentLength !== n) return;
  return { key: k, contentType: t, length: Number(n) };
};

export class UploadUrls extends Context.Service<
  UploadUrls,
  {
    /**
     * Where the browser should send `terms.contentLength` bytes to store them
     * at `key`: the provider's presigned `PUT`, or this server's. `null` when
     * neither can sign (an adapter that declines, and no URL secret).
     */
    readonly sign: (
      key: StorageKey,
      terms: UploadTerms,
    ) => Effect.Effect<SignedUpload | null, StorageError | StorageUnavailable>;
    /** The server's upload route: a checked signature, then exactly the signed bytes stored. */
    readonly receive: (request: UploadRequest) => Effect.Effect<void, NotFound>;
  }
>()("UploadUrls") {
  /**
   * @param secret `PORTRAIT_URL_SECRET`; without it this server signs and
   *   accepts nothing of its own, and only a provider's presigned `PUT` works.
   */
  static readonly layer = (
    secret: Option.Option<Redacted.Redacted>,
    now: () => number = Date.now,
  ): Layer.Layer<UploadUrls, never, ObjectStorage> =>
    Layer.effect(this)(
      Effect.gen(function* () {
        const storage = yield* ObjectStorage;
        return {
          sign: (key, terms) =>
            Effect.gen(function* () {
              if (
                !Number.isSafeInteger(terms.contentLength) ||
                terms.contentLength < 0 ||
                terms.contentLength > MAX_UPLOAD_BYTES
              ) {
                return yield* Effect.die(
                  new RangeError(`an upload is 0 to ${MAX_UPLOAD_BYTES} bytes`),
                );
              }
              const presigned = yield* storage.signUpload(key, terms);
              if (Option.isSome(presigned)) return presigned.value;
              if (Option.isNone(secret)) return null;
              return {
                url: signedUploadPath(secret.value, key, terms, now()),
                method: "PUT",
                headers: { "content-type": terms.contentType },
              } satisfies SignedUpload;
            }),

          receive: (request) =>
            Effect.gen(function* () {
              const missing = new NotFound({ resource: "upload", id: request.k ?? "" });
              if (Option.isNone(secret)) return yield* missing;
              const checked = verifyUpload(secret.value, request, now());
              if (checked === undefined) return yield* missing;

              const body = new Uint8Array(checked.length);
              let received = 0;
              yield* request.body.pipe(
                Stream.mapError(() => missing),
                Stream.runForEach((chunk) => {
                  if (received + chunk.byteLength > checked.length) return Effect.fail(missing);
                  body.set(chunk, received);
                  received += chunk.byteLength;
                  return Effect.void;
                }),
              );
              if (received !== checked.length) return yield* missing;

              yield* storage.put(checked.key, body, checked.contentType).pipe(
                Effect.catchTags({
                  StorageError: (error) => Effect.die(error),
                  StorageUnavailable: (error) => Effect.die(error),
                }),
              );
            }),
        };
      }),
    );
}
