import { expect } from "@effect/vitest";
import { Effect, type Layer, Option, Stream } from "effect";
import { ObjectStorage, StorageKey, StorageNotFound } from "../../src/storage/ObjectStorage.js";
import { describeLayer } from "./suite.js";

/**
 * What every `ObjectStorage` adapter must do, as one suite any adapter runs.
 *
 * A new provider calls this with a layer that builds it, and passes it without
 * edits: that is what makes the provider swappable. The layer is built once
 * for the whole suite, and every test writes under a fresh prefix of its own,
 * so a provider that is expensive to stand up (a real bucket) pays for it once
 * and the tests still cannot see each other.
 *
 * Only behaviour the interface promises belongs here. Anything true of one
 * adapter's layout on disk or on the wire goes in that adapter's own tests.
 */
export const objectStorageContract = <E>(name: string, layer: Layer.Layer<ObjectStorage, E>) =>
  describeLayer(`ObjectStorage contract: ${name}`, layer, (it) => {
    /** A key under this test's own prefix. */
    const scope = () => {
      const base = `contract-${crypto.randomUUID()}`;
      return (path = "") => StorageKey(path === "" ? base : `${base}/${path}`);
    };

    const bytes = (text: string) => new TextEncoder().encode(text);

    /** The whole object, body collected. */
    const read = (key: StorageKey) =>
      Effect.gen(function* () {
        const object = yield* ObjectStorage.use((storage) => storage.get(key));
        const chunks = yield* Stream.runCollect(object.body);
        const body = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return { contentType: object.contentType, size: object.size, body };
      });

    const put = (key: StorageKey, body: Uint8Array, contentType: string) =>
      ObjectStorage.use((storage) => storage.put(key, body, contentType));
    const head = (key: StorageKey) => ObjectStorage.use((storage) => storage.head(key));
    const remove = (key: StorageKey) => ObjectStorage.use((storage) => storage.delete(key));
    const removePrefix = (prefix: StorageKey) =>
      ObjectStorage.use((storage) => storage.deletePrefix(prefix));

    it.effect("returns the bytes and content type it was given", () =>
      Effect.gen(function* () {
        const key = scope()("portraits/original.png");

        yield* put(key, bytes("a portrait"), "image/png");

        const object = yield* read(key);
        expect(object.contentType).toBe("image/png");
        expect(object.size).toBe(10);
        expect(new TextDecoder().decode(object.body)).toBe("a portrait");
      }),
    );

    it.effect("streams an object larger than one chunk intact", () =>
      Effect.gen(function* () {
        const key = scope()("large.bin");
        const body = new Uint8Array(300 * 1024).map((_, index) => index % 251);

        yield* put(key, body, "application/octet-stream");

        const object = yield* read(key);
        expect(object.size).toBe(body.byteLength);
        expect(object.body).toEqual(body);
      }),
    );

    it.effect("stores an empty object", () =>
      Effect.gen(function* () {
        const key = scope()("empty");

        yield* put(key, new Uint8Array(0), "text/plain");

        const object = yield* read(key);
        expect(object.size).toBe(0);
        expect(object.body.byteLength).toBe(0);
      }),
    );

    it.effect("keeps what was stored when the caller reuses its buffer", () =>
      Effect.gen(function* () {
        const key = scope()("copied");
        const body = bytes("before");

        yield* put(key, body, "text/plain");
        body.set(bytes("after!"));

        expect(new TextDecoder().decode((yield* read(key)).body)).toBe("before");
      }),
    );

    it.effect("answers a missing key with StorageNotFound naming it", () =>
      Effect.gen(function* () {
        const key = scope()("never-written");

        const error = yield* Effect.flip(read(key));

        expect(error).toBeInstanceOf(StorageNotFound);
        expect(error).toMatchObject({ _tag: "StorageNotFound", key });
      }),
    );

    it.effect("reports metadata through head, and None for a missing key", () =>
      Effect.gen(function* () {
        const key = scope()("card.webp");

        expect(yield* head(key)).toEqual(Option.none());
        yield* put(key, bytes("card"), "image/webp");
        expect(yield* head(key)).toEqual(Option.some({ contentType: "image/webp", size: 4 }));
      }),
    );

    it.effect("replaces an object, bytes and content type together", () =>
      Effect.gen(function* () {
        const key = scope()("replaced");

        yield* put(key, bytes("first"), "text/plain");
        yield* put(key, bytes("second, longer"), "application/json");

        const object = yield* read(key);
        expect(object.contentType).toBe("application/json");
        expect(object.size).toBe(14);
        expect(new TextDecoder().decode(object.body)).toBe("second, longer");
      }),
    );

    it.effect("holds an object at a key and at a longer key beneath it", () =>
      Effect.gen(function* () {
        const key = scope();

        yield* put(key("a"), bytes("parent"), "text/plain");
        yield* put(key("a/b"), bytes("child"), "text/plain");

        expect(new TextDecoder().decode((yield* read(key("a"))).body)).toBe("parent");
        expect(new TextDecoder().decode((yield* read(key("a/b"))).body)).toBe("child");
      }),
    );

    it.effect("deletes one object, and deleting it again succeeds", () =>
      Effect.gen(function* () {
        const key = scope();
        yield* put(key("gone"), bytes("x"), "text/plain");
        yield* put(key("kept"), bytes("y"), "text/plain");

        yield* remove(key("gone"));
        yield* remove(key("gone"));
        yield* remove(key("never-written"));

        expect(yield* head(key("gone"))).toEqual(Option.none());
        expect(Option.isSome(yield* head(key("kept")))).toBe(true);
      }),
    );

    it.effect("deletes everything under a prefix at any depth, and nothing beside it", () =>
      Effect.gen(function* () {
        const key = scope();
        const under = ["p/one", "p/two/deeper", "p/two/deeper/still"];
        const beside = ["p", "pp/one", "p.other/one", "q/one"];
        for (const path of [...under, ...beside]) {
          yield* put(key(path), bytes(path), "text/plain");
        }

        yield* removePrefix(key("p"));

        for (const path of under) expect(yield* head(key(path))).toEqual(Option.none());
        // The object at the prefix itself is not under it, and a key that merely
        // starts with the same characters is a different branch.
        for (const path of beside) expect(Option.isSome(yield* head(key(path)))).toBe(true);
      }),
    );

    it.effect("deletes a prefix idempotently, including one that holds nothing", () =>
      Effect.gen(function* () {
        const key = scope();
        yield* put(key("p/one"), bytes("x"), "text/plain");

        yield* removePrefix(key("p"));
        yield* removePrefix(key("p"));
        yield* removePrefix(key("nothing/here"));

        expect(yield* head(key("p/one"))).toEqual(Option.none());
      }),
    );

    it.effect("stores again under a prefix that was deleted", () =>
      Effect.gen(function* () {
        const key = scope();
        yield* put(key("p/one"), bytes("x"), "text/plain");
        yield* removePrefix(key("p"));

        yield* put(key("p/one"), bytes("again"), "text/plain");

        expect(new TextDecoder().decode((yield* read(key("p/one"))).body)).toBe("again");
      }),
    );
  });
