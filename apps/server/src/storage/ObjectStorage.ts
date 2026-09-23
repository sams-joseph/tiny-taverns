import { Brand, Context, Data, Effect, Layer, Option, Ref, Stream } from "effect";

/**
 * The cloud storage adapter: bytes under opaque keys, with nothing about who
 * hosts them.
 *
 * Every provider (a local directory today, S3, R2 or GCS later) is one
 * implementation of this service, selected by `STORAGE_DRIVER` in `app.ts`.
 * The interface names no bucket, region, endpoint or URL, and no provider error
 * text reaches a caller's error channel: an adapter maps its failures onto the
 * three errors below and keeps the original only as `cause`, for logs.
 *
 * A new adapter implements this shape, registers its driver in
 * `storageFromConfig`, and passes `test/support/objectStorageContract.ts`
 * unchanged. `docs/internals/storage.md` has the steps.
 */

/**
 * An object key: slash-separated segments of `A-Z a-z 0-9 . _ -`, never `.` or
 * `..`, no empty segment, no leading or trailing slash, at most 512 characters.
 *
 * Branded so a key is checked where it is minted, once, and every adapter
 * receives only keys that are portable to all of them. The alphabet is the one
 * every object store and file system accepts without escaping, and it leaves
 * `@` free for the file-system adapter's own bookkeeping names.
 *
 * `StorageKey(raw)` throws on an invalid key, which is right for keys the
 * server builds from ids; `StorageKey.result` is there for anything else.
 */
export type StorageKey = string & Brand.Brand<"StorageKey">;

const SEGMENT = /^[A-Za-z0-9._-]+$/;
export const MAX_KEY_LENGTH = 512;

export const StorageKey = Brand.make<StorageKey>((key) => {
  if (key.length === 0) return "a storage key cannot be empty";
  if (key.length > MAX_KEY_LENGTH) {
    return `a storage key is at most ${MAX_KEY_LENGTH} characters`;
  }
  for (const segment of key.split("/")) {
    if (segment === "") return "a storage key has no empty segment or leading/trailing slash";
    if (segment === "." || segment === "..") return "a storage key has no `.` or `..` segment";
    if (!SEGMENT.test(segment)) return "a storage key segment uses only A-Z a-z 0-9 . _ -";
  }
  return true;
});

/** What is stored beside the bytes. `size` is in bytes. */
export interface ObjectMetadata {
  readonly contentType: string;
  readonly size: number;
}

/**
 * A read. The metadata is known before the body is consumed, so a route can
 * set `Content-Type` and `Content-Length` before it streams.
 */
export interface StoredObject extends ObjectMetadata {
  readonly body: Stream.Stream<Uint8Array, StorageError>;
}

/** No object under this key. */
export class StorageNotFound extends Data.TaggedError("StorageNotFound")<{
  readonly key: StorageKey;
}> {}

/**
 * The provider failed. `message` is ours and names only the operation and the
 * key; whatever the provider said is `cause`, which is for logs and never for
 * the wire.
 */
export class StorageError extends Data.TaggedError("StorageError")<{
  readonly operation: "put" | "get" | "head" | "delete" | "deletePrefix" | "open";
  readonly key: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** No storage is configured on this server (`STORAGE_DRIVER` is unset). */
export class StorageUnavailable extends Data.TaggedError("StorageUnavailable")<{
  readonly message: string;
}> {}

export class ObjectStorage extends Context.Service<
  ObjectStorage,
  {
    /** Store `body` under `key`, replacing whatever was there. */
    readonly put: (
      key: StorageKey,
      body: Uint8Array,
      contentType: string,
    ) => Effect.Effect<void, StorageError | StorageUnavailable>;
    /** The object and its metadata, or `StorageNotFound`. */
    readonly get: (
      key: StorageKey,
    ) => Effect.Effect<StoredObject, StorageNotFound | StorageError | StorageUnavailable>;
    /** The metadata alone; `None` when nothing is stored under `key`. */
    readonly head: (
      key: StorageKey,
    ) => Effect.Effect<Option.Option<ObjectMetadata>, StorageError | StorageUnavailable>;
    /** Remove one object. Removing a missing key succeeds. */
    readonly delete: (key: StorageKey) => Effect.Effect<void, StorageError | StorageUnavailable>;
    /**
     * Remove every object whose key starts with `prefix/`, at any depth.
     * Idempotent. An object stored at `prefix` itself is not under it and
     * stays, as does `prefixed/…`: the boundary is a segment, not a string.
     */
    readonly deletePrefix: (
      prefix: StorageKey,
    ) => Effect.Effect<void, StorageError | StorageUnavailable>;
  }
>()("ObjectStorage") {
  /**
   * No storage is configured. Every operation is a declared
   * `StorageUnavailable`, so a feature that needs storage can say so instead
   * of failing somewhere inside a provider call.
   */
  static readonly unavailable: Layer.Layer<ObjectStorage> = Layer.sync(this)(() => {
    const off = Effect.fail(
      new StorageUnavailable({
        message:
          "No object storage is configured. Set STORAGE_DRIVER in apps/server/.env.local " +
          "(see .env.example) and restart the server.",
      }),
    );
    return {
      put: () => off,
      get: () => off,
      head: () => off,
      delete: () => off,
      deletePrefix: () => off,
    };
  });

  /**
   * An in-process adapter, for tests that need storage without a disk. Each
   * build of the layer is a fresh, empty store.
   */
  static readonly memory: Layer.Layer<ObjectStorage> = Layer.effect(this)(
    Effect.gen(function* () {
      const objects = yield* Ref.make(
        new Map<string, { readonly contentType: string; readonly bytes: Uint8Array }>(),
      );
      return {
        put: (key, body, contentType) =>
          Ref.update(objects, (map) =>
            // Copied, so a caller reusing its buffer cannot change what was stored.
            new Map(map).set(key, { contentType, bytes: body.slice() }),
          ),
        get: (key) =>
          Effect.flatMap(Ref.get(objects), (map) => {
            const object = map.get(key);
            return object === undefined
              ? Effect.fail(new StorageNotFound({ key }))
              : Effect.succeed({
                  contentType: object.contentType,
                  size: object.bytes.byteLength,
                  body: Stream.succeed(object.bytes.slice()),
                });
          }),
        head: (key) =>
          Effect.map(Ref.get(objects), (map) =>
            Option.map(Option.fromUndefinedOr(map.get(key)), (object) => ({
              contentType: object.contentType,
              size: object.bytes.byteLength,
            })),
          ),
        delete: (key) =>
          Ref.update(objects, (map) => {
            const next = new Map(map);
            next.delete(key);
            return next;
          }),
        deletePrefix: (prefix) =>
          Ref.update(
            objects,
            (map) => new Map([...map].filter(([key]) => !key.startsWith(`${prefix}/`))),
          ),
      };
    }),
  );
}
