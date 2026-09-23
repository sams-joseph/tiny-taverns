import { Effect, type Layer, ManagedRuntime, Option, Stream } from "effect";
import { afterAll, describe, expect, it } from "vitest";
import { ObjectStorage, StorageKey, StorageNotFound } from "../../src/storage/ObjectStorage.js";

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
  describe(`ObjectStorage contract: ${name}`, () => {
    const runtime = ManagedRuntime.make(layer);
    afterAll(() => runtime.dispose());

    const run = <A, X>(effect: Effect.Effect<A, X, ObjectStorage>) => runtime.runPromise(effect);

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

    it("returns the bytes and content type it was given", async () => {
      const key = scope()("portraits/original.png");

      await run(put(key, bytes("a portrait"), "image/png"));

      const object = await run(read(key));
      expect(object.contentType).toBe("image/png");
      expect(object.size).toBe(10);
      expect(new TextDecoder().decode(object.body)).toBe("a portrait");
    });

    it("streams an object larger than one chunk intact", async () => {
      const key = scope()("large.bin");
      const body = new Uint8Array(300 * 1024).map((_, index) => index % 251);

      await run(put(key, body, "application/octet-stream"));

      const object = await run(read(key));
      expect(object.size).toBe(body.byteLength);
      expect(object.body).toEqual(body);
    });

    it("stores an empty object", async () => {
      const key = scope()("empty");

      await run(put(key, new Uint8Array(0), "text/plain"));

      const object = await run(read(key));
      expect(object.size).toBe(0);
      expect(object.body.byteLength).toBe(0);
    });

    it("keeps what was stored when the caller reuses its buffer", async () => {
      const key = scope()("copied");
      const body = bytes("before");

      await run(put(key, body, "text/plain"));
      body.set(bytes("after!"));

      expect(new TextDecoder().decode((await run(read(key))).body)).toBe("before");
    });

    it("answers a missing key with StorageNotFound naming it", async () => {
      const key = scope()("never-written");

      const error = await run(Effect.flip(read(key)));

      expect(error).toBeInstanceOf(StorageNotFound);
      expect(error).toMatchObject({ _tag: "StorageNotFound", key });
    });

    it("reports metadata through head, and None for a missing key", async () => {
      const key = scope()("card.webp");

      expect(await run(head(key))).toEqual(Option.none());
      await run(put(key, bytes("card"), "image/webp"));
      expect(await run(head(key))).toEqual(Option.some({ contentType: "image/webp", size: 4 }));
    });

    it("replaces an object, bytes and content type together", async () => {
      const key = scope()("replaced");

      await run(put(key, bytes("first"), "text/plain"));
      await run(put(key, bytes("second, longer"), "application/json"));

      const object = await run(read(key));
      expect(object.contentType).toBe("application/json");
      expect(object.size).toBe(14);
      expect(new TextDecoder().decode(object.body)).toBe("second, longer");
    });

    it("holds an object at a key and at a longer key beneath it", async () => {
      const key = scope();

      await run(put(key("a"), bytes("parent"), "text/plain"));
      await run(put(key("a/b"), bytes("child"), "text/plain"));

      expect(new TextDecoder().decode((await run(read(key("a")))).body)).toBe("parent");
      expect(new TextDecoder().decode((await run(read(key("a/b")))).body)).toBe("child");
    });

    it("deletes one object, and deleting it again succeeds", async () => {
      const key = scope();
      await run(put(key("gone"), bytes("x"), "text/plain"));
      await run(put(key("kept"), bytes("y"), "text/plain"));

      await run(remove(key("gone")));
      await run(remove(key("gone")));
      await run(remove(key("never-written")));

      expect(await run(head(key("gone")))).toEqual(Option.none());
      expect(Option.isSome(await run(head(key("kept"))))).toBe(true);
    });

    it("deletes everything under a prefix at any depth, and nothing beside it", async () => {
      const key = scope();
      const under = ["p/one", "p/two/deeper", "p/two/deeper/still"];
      const beside = ["p", "pp/one", "p.other/one", "q/one"];
      for (const path of [...under, ...beside]) {
        await run(put(key(path), bytes(path), "text/plain"));
      }

      await run(removePrefix(key("p")));

      for (const path of under) expect(await run(head(key(path)))).toEqual(Option.none());
      // The object at the prefix itself is not under it, and a key that merely
      // starts with the same characters is a different branch.
      for (const path of beside) expect(Option.isSome(await run(head(key(path))))).toBe(true);
    });

    it("deletes a prefix idempotently, including one that holds nothing", async () => {
      const key = scope();
      await run(put(key("p/one"), bytes("x"), "text/plain"));

      await run(removePrefix(key("p")));
      await run(removePrefix(key("p")));
      await run(removePrefix(key("nothing/here")));

      expect(await run(head(key("p/one")))).toEqual(Option.none());
    });

    it("stores again under a prefix that was deleted", async () => {
      const key = scope();
      await run(put(key("p/one"), bytes("x"), "text/plain"));
      await run(removePrefix(key("p")));

      await run(put(key("p/one"), bytes("again"), "text/plain"));

      expect(new TextDecoder().decode((await run(read(key("p/one")))).body)).toBe("again");
    });
  });
