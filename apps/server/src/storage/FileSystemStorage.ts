import { Effect, FileSystem, Layer, Option, Path, Schema, Stream } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ObjectStorage, StorageError, StorageKey, StorageNotFound } from "./ObjectStorage.js";

/**
 * The local adapter: `ObjectStorage` over Effect's `FileSystem`, rooted at one
 * directory.
 *
 * ### Layout
 *
 * Each key is a directory, `<root>/<key>/`, holding the object's own files:
 *
 * - `@meta.json`: `{ contentType, size, data }`. Its presence is what makes the
 *   object exist.
 * - `@data-<uuid>`: the bytes, named by `data` above.
 *
 * A directory per key, rather than a file per key, is what lets `a/b` and
 * `a/b/c` both hold objects, as they can in every object store; a plain file at
 * `a/b` could not also be the directory `a/b/`. `@` is outside the `StorageKey`
 * alphabet, so the object's own files never collide with a longer key's
 * directory, and `deletePrefix` can tell the two apart by name.
 *
 * ### Atomicity
 *
 * `put` writes the bytes to a fresh `@data-<uuid>`, then writes the metadata to
 * a temporary name and renames it over `@meta.json`. The rename is the commit:
 * a reader sees the old object or the new one, never new bytes under old
 * metadata, and never a half-written file. The previous data file is removed
 * after the commit. A crash or a lost race between two writers of one key can
 * leave an unreferenced `@data-*` behind; that is a leak in a development
 * directory, not a wrong answer. A read racing an overwrite of the same key can
 * fail with `StorageError` when its data file is removed underneath it.
 *
 * Emptied directories are left in place. Removing them would race a
 * concurrent `put` that has just created one.
 */

const META = "@meta.json";
const DATA = /^@data-[0-9a-f-]+$/;

const Meta = Schema.fromJsonString(
  Schema.Struct({ contentType: Schema.String, size: Schema.Number, data: Schema.String }),
);

const isNotFound = (error: PlatformError): boolean => error.reason._tag === "NotFound";

export const layer = (options: {
  readonly root: string;
}): Layer.Layer<ObjectStorage, StorageError, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(ObjectStorage)(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(options.root);

      const failed = (operation: StorageError["operation"], key: string) => (cause: unknown) =>
        new StorageError({
          operation,
          key,
          message: `Object storage could not ${operation} ${key}.`,
          cause,
        });

      yield* fs
        .makeDirectory(root, { recursive: true })
        .pipe(Effect.mapError(failed("open", root)));

      /**
       * The directory for a key. `StorageKey` already refuses every traversal
       * shape, and the check runs again here so a string cast to the brand
       * cannot name a path outside the root, or one of an object's own `@`
       * files, either.
       */
      const directoryOf = (
        operation: StorageError["operation"],
        key: StorageKey,
      ): Effect.Effect<string, StorageError> => {
        const directory = path.join(root, ...key.split("/"));
        const relative = path.relative(root, directory);
        return StorageKey.is(key) && !relative.startsWith("..") && !path.isAbsolute(relative)
          ? Effect.succeed(directory)
          : Effect.fail(failed(operation, key)("not a storage key"));
      };

      /** The committed metadata, or `None`. */
      const readMeta = (operation: StorageError["operation"], key: StorageKey) =>
        Effect.gen(function* () {
          const directory = yield* directoryOf(operation, key);
          const text = yield* fs.readFileString(path.join(directory, META)).pipe(
            Effect.map(Option.some),
            Effect.catchIf(isNotFound, () => Effect.succeedNone),
            Effect.mapError(failed(operation, key)),
          );
          if (Option.isNone(text)) return Option.none();
          const meta = yield* Schema.decodeUnknownEffect(Meta)(text.value).pipe(
            Effect.mapError(failed(operation, key)),
          );
          if (!DATA.test(meta.data)) {
            return yield* Effect.fail(failed(operation, key)("metadata names no data file"));
          }
          return Option.some({ ...meta, file: path.join(directory, meta.data) });
        });

      return {
        put: (key, body, contentType) =>
          Effect.gen(function* () {
            const directory = yield* directoryOf("put", key);
            const previous = yield* readMeta("put", key);
            const id = crypto.randomUUID();
            const data = `@data-${id}`;
            const staged = path.join(directory, `@tmp-${id}`);

            yield* Effect.gen(function* () {
              yield* fs.makeDirectory(directory, { recursive: true });
              yield* fs.writeFile(path.join(directory, data), body);
              yield* fs.writeFileString(
                staged,
                JSON.stringify({ contentType, size: body.byteLength, data }),
              );
              yield* fs.rename(staged, path.join(directory, META));
            }).pipe(
              Effect.onError(() =>
                Effect.ignore(
                  Effect.all([
                    fs.remove(staged, { force: true }),
                    fs.remove(path.join(directory, data), { force: true }),
                  ]),
                ),
              ),
              Effect.mapError(failed("put", key)),
            );

            if (Option.isSome(previous)) {
              yield* fs
                .remove(previous.value.file, { force: true })
                .pipe(Effect.mapError(failed("put", key)));
            }
          }),

        get: (key) =>
          Effect.flatMap(readMeta("get", key), (meta) =>
            Option.match(meta, {
              onNone: () => Effect.fail(new StorageNotFound({ key })),
              onSome: ({ contentType, size, file }) =>
                Effect.succeed({
                  contentType,
                  size,
                  body: fs.stream(file).pipe(Stream.mapError(failed("get", key))),
                }),
            }),
          ),

        head: (key) =>
          Effect.map(
            readMeta("head", key),
            Option.map(({ contentType, size }) => ({ contentType, size })),
          ),

        delete: (key) =>
          Effect.gen(function* () {
            const directory = yield* directoryOf("delete", key);
            const meta = yield* readMeta("delete", key);
            if (Option.isNone(meta)) return;
            // The metadata first: once it is gone the object is gone, whatever
            // happens to the bytes after.
            yield* fs
              .remove(path.join(directory, META), { force: true })
              .pipe(
                Effect.andThen(fs.remove(meta.value.file, { force: true })),
                Effect.mapError(failed("delete", key)),
              );
          }),

        deletePrefix: (prefix) =>
          Effect.gen(function* () {
            const directory = yield* directoryOf("deletePrefix", prefix);
            const entries = yield* fs.readDirectory(directory).pipe(
              Effect.catchIf(isNotFound, () => Effect.succeed<ReadonlyArray<string>>([])),
              Effect.mapError(failed("deletePrefix", prefix)),
            );
            // Every entry that is not `@…` is the directory of a longer key.
            // The object stored at `prefix` itself is not under it, and stays.
            yield* Effect.forEach(
              entries.filter((entry) => !entry.startsWith("@")),
              (entry) => fs.remove(path.join(directory, entry), { recursive: true, force: true }),
              { discard: true },
            ).pipe(Effect.mapError(failed("deletePrefix", prefix)));
          }),
      };
    }),
  );
