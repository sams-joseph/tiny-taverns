import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { afterAll, describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, FileSystem, Layer, Logger, Option, Result } from "effect";
import { type Dirent, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storageFromConfig } from "../src/app.js";
import * as FileSystemStorage from "../src/storage/FileSystemStorage.js";
import {
  MAX_KEY_LENGTH,
  ObjectStorage,
  StorageError,
  StorageKey,
  StorageUnavailable,
} from "../src/storage/ObjectStorage.js";
import { objectStorageContract } from "./support/objectStorageContract.js";

/**
 * The cloud storage adapter seam: the key every adapter accepts, the contract
 * every adapter passes, and what the server does when none is configured.
 */

const node = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** The file-system adapter over a temporary directory removed with its scope. */
const temporaryFileSystemStorage = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "taverns-storage-" });
    return FileSystemStorage.layer({ root });
  }),
).pipe(Layer.provide(node));

objectStorageContract("memory", ObjectStorage.memory);
objectStorageContract("filesystem", temporaryFileSystemStorage);

describe("a storage key", () => {
  it.each([
    "portraits/0b5c/9a1e/original.png",
    "a",
    "a/b.c/d_e-f",
    ".hidden/x",
    "x".repeat(MAX_KEY_LENGTH),
  ])("accepts %s", (key) => {
    expect(Result.isSuccess(StorageKey.result(key))).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["a leading slash", "/etc/passwd"],
    ["a trailing slash", "a/"],
    ["an empty segment", "a//b"],
    ["a parent segment", "a/../b"],
    ["only a parent", ".."],
    ["a current segment", "./a"],
    ["a backslash", "a\\b"],
    ["a space", "a b"],
    ["a non-ASCII letter", "café"],
    ["the adapter's reserved @", "a/@meta.json"],
    ["a colon", "c:/x"],
    ["too long", "x".repeat(MAX_KEY_LENGTH + 1)],
  ])("refuses %s", (_, key) => {
    expect(Result.isFailure(StorageKey.result(key))).toBe(true);
    expect(() => StorageKey(key)).toThrow();
  });
});

describe("the file-system adapter", () => {
  const roots: Array<string> = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });
  const freshRoot = () => {
    const root = mkdtempSync(join(tmpdir(), "taverns-storage-"));
    roots.push(root);
    return root;
  };
  const over = <A, E>(root: string, effect: Effect.Effect<A, E, ObjectStorage>) =>
    effect.pipe(Effect.provide(FileSystemStorage.layer({ root }).pipe(Layer.provide(node))));
  /** Every file under `root`, relative to it. */
  const files = (root: string) =>
    (readdirSync(root, { recursive: true, withFileTypes: true }) as Array<Dirent>)
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
      .sort();

  it.effect("creates its root directory when it is missing", () =>
    Effect.gen(function* () {
      const root = join(freshRoot(), "not", "yet");

      yield* over(
        root,
        ObjectStorage.use((storage) => storage.head(StorageKey("x"))),
      );

      expect(readdirSync(root)).toEqual([]);
    }),
  );

  it.effect("reads the content type back from disk, so it survives a restart", () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const key = StorageKey("portraits/a/original.webp");

      yield* over(
        root,
        ObjectStorage.use((s) => s.put(key, new Uint8Array([1, 2]), "image/webp")),
      );

      // A second layer over the same directory is a second process, as far as
      // the adapter can tell.
      expect(
        yield* over(
          root,
          ObjectStorage.use((s) => s.head(key)),
        ),
      ).toEqual(Option.some({ contentType: "image/webp", size: 2 }));
    }),
  );

  it.effect("leaves no staged file behind, and one data file per object after a replace", () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const key = StorageKey("a/b");

      yield* over(
        root,
        Effect.gen(function* () {
          const storage = yield* ObjectStorage;
          yield* storage.put(key, new Uint8Array([1]), "text/plain");
          yield* storage.put(key, new Uint8Array([2]), "text/plain");
        }),
      );

      const written = files(root);
      expect(written.filter((file) => file.includes("@tmp-"))).toEqual([]);
      expect(written).toHaveLength(2);
      expect(written).toContain(join("a", "b", "@meta.json"));
      expect(written.every((file) => file.startsWith(join("a", "b", "@")))).toBe(true);
    }),
  );

  it.effect("refuses a forged key that would leave the root, and writes nothing outside it", () =>
    Effect.gen(function* () {
      const parent = freshRoot();
      const root = join(parent, "root");
      const forged = ["../escaped", "a/../../escaped", "/tmp/escaped", "a/@meta.json"];

      for (const key of forged) {
        const error = yield* over(
          root,
          Effect.flip(
            ObjectStorage.use((s) => s.put(key as StorageKey, new Uint8Array([1]), "text/plain")),
          ),
        );
        expect(error).toBeInstanceOf(StorageError);
      }

      expect(readdirSync(parent)).toEqual(["root"]);
      expect(files(root)).toEqual([]);
    }),
  );

  it.effect("keeps the provider's text out of its message", () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const key = StorageKey("a/b");
      yield* over(
        root,
        ObjectStorage.use((s) => s.put(key, new Uint8Array([1]), "text/plain")),
      );
      // Corrupt the metadata so the read fails inside the adapter.
      writeFileSync(join(root, "a", "b", "@meta.json"), "not json");

      const error = yield* over(root, Effect.flip(ObjectStorage.use((s) => s.get(key))));

      expect(error).toBeInstanceOf(StorageError);
      expect(error.message).toBe("Object storage could not get a/b.");
      expect(error.message).not.toContain(root);
    }),
  );
});

describe("with no storage configured", () => {
  it.effect("answers every operation with StorageUnavailable", () =>
    Effect.gen(function* () {
      const key = StorageKey("a");
      const errors = yield* Effect.gen(function* () {
        const storage = yield* ObjectStorage;
        return yield* Effect.all(
          [
            Effect.flip(storage.put(key, new Uint8Array(), "text/plain")),
            Effect.flip(storage.get(key)),
            Effect.flip(storage.head(key)),
            Effect.flip(storage.delete(key)),
            Effect.flip(storage.deletePrefix(key)),
          ],
          { concurrency: 1 },
        );
      }).pipe(Effect.provide(ObjectStorage.unavailable));

      for (const error of errors) expect(error).toBeInstanceOf(StorageUnavailable);
    }),
  );
});

/**
 * The boot line, as `env-file.test.ts` pins it for hosted sign-in: one line in
 * either mode, so a variable set where the server does not look is obvious.
 */
const boot = (env: Record<string, string>) =>
  Effect.gen(function* () {
    const lines: Array<string> = [];
    const capture = Logger.make<unknown, void>(({ message }) => {
      lines.push(Array.isArray(message) ? message.map(String).join(" ") : String(message));
    });
    const exit = yield* Effect.exit(
      ObjectStorage.use((storage) => storage.head(StorageKey("probe"))).pipe(
        Effect.provide(storageFromConfig),
        Effect.provide(Logger.layer([capture])),
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
      ),
    );
    return { lines, exit };
  });

describe("what the server says at boot about storage", () => {
  it.effect("says OFF when STORAGE_DRIVER is unset, and storage is unavailable", () =>
    Effect.gen(function* () {
      const { lines, exit } = yield* boot({});

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("Storage is OFF");
      expect(lines[0]).toContain("apps/server/.env.local");
      expect(exit._tag).toBe("Failure");
      expect(JSON.stringify(exit)).toContain("StorageUnavailable");
    }),
  );

  it.effect("says ON and where, for the filesystem driver", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(join(tmpdir(), "taverns-storage-"));
      try {
        const { lines, exit } = yield* boot({
          STORAGE_DRIVER: "filesystem",
          STORAGE_FS_ROOT: root,
        });

        expect(lines).toEqual([`Storage is ON: driver filesystem at ${root}.`]);
        expect(exit._tag).toBe("Success");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }),
  );

  it.effect("refuses to boot on a driver it does not know, rather than meaning OFF", () =>
    Effect.gen(function* () {
      const { lines, exit } = yield* boot({ STORAGE_DRIVER: "s4" });

      expect(lines).toEqual([]);
      expect(exit._tag).toBe("Failure");
      expect(JSON.stringify(exit)).not.toContain("StorageUnavailable");
      expect(String(exit)).toContain("STORAGE_DRIVER");
    }),
  );
});
